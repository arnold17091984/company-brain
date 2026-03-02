"""Google Drive connector – fetches Docs, Sheets, and PDFs via Drive API v3.

Authentication is performed via a service account.  A signed JWT is exchanged
for a short-lived OAuth 2.0 access token (valid 1 hour) and cached in memory
so subsequent calls within the same connector instance do not re-authenticate.

The connector pages through all shared-drive files visible to the service
account, exports editable Google formats to plain text, and yields each file
as a :class:`~app.services.types.RawDocument`.

Rate-limit responses (HTTP 429 / 403 with ``rateLimitExceeded``) are retried
with truncated exponential back-off capped at 32 seconds.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import logging
import time
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from typing import Any

import httpx

from app.services.types import ConnectorType, RawDocument

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

_DRIVE_API = "https://www.googleapis.com/drive/v3"
_TOKEN_URL = "https://oauth2.googleapis.com/token"
_SCOPE = "https://www.googleapis.com/auth/drive.readonly"

# Google-native MIME types and their plain-text export equivalents.
_EXPORTABLE_MIME: dict[str, str] = {
    "application/vnd.google-apps.document": "text/plain",
    "application/vnd.google-apps.spreadsheet": "text/csv",
    "application/vnd.google-apps.presentation": "text/plain",
}

# Binary formats we download directly; text extraction happens downstream.
_DIRECT_MIME: set[str] = {"application/pdf"}

# Drive API page size (max 1,000 per the docs; 200 is a safe default).
_PAGE_SIZE = 200

# Hard cap per file: avoid ingesting enormous files in a single document.
_MAX_CONTENT_BYTES = 5 * 1024 * 1024  # 5 MB

# Exponential back-off: initial delay, multiplier, maximum delay (seconds).
_BACKOFF_INITIAL = 1.0
_BACKOFF_MULTIPLIER = 2.0
_BACKOFF_MAX = 32.0
_BACKOFF_MAX_RETRIES = 6

# Drive API fields requested for file listing.
_FILE_FIELDS = "id,name,mimeType,modifiedTime,webViewLink,owners,lastModifyingUser,size,parents"


# ── JWT / token helpers ───────────────────────────────────────────────────────


def _b64url(data: bytes) -> str:
    """URL-safe base64-encode *data* without padding."""
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _make_jwt(service_account: dict[str, Any]) -> str:
    """Build a signed RS256 JWT suitable for Google's token endpoint.

    Relies on the ``cryptography`` package, which is a transitive dependency
    of ``httpx`` and ``PyJWT[crypto]`` – already present in the project.

    Args:
        service_account: Parsed service account JSON key dictionary.

    Returns:
        Signed JWT string in the form ``header.payload.signature``.
    """
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding

    now = int(time.time())
    header = _b64url(json.dumps({"alg": "RS256", "typ": "JWT"}).encode())
    payload = _b64url(
        json.dumps(
            {
                "iss": service_account["client_email"],
                "scope": _SCOPE,
                "aud": _TOKEN_URL,
                "exp": now + 3600,
                "iat": now,
            }
        ).encode()
    )
    signing_input = f"{header}.{payload}".encode()

    private_key_pem: bytes = service_account["private_key"].encode()
    private_key = serialization.load_pem_private_key(private_key_pem, password=None)
    signature = private_key.sign(signing_input, padding.PKCS1v15(), hashes.SHA256())

    return f"{header}.{payload}.{_b64url(signature)}"


def _parse_credentials(credentials_json: str) -> dict[str, Any]:
    """Decode and parse a service account JSON string.

    Accepts both raw JSON and base64-encoded JSON to accommodate different
    secret injection patterns used in Railway / Docker environments.

    Args:
        credentials_json: Raw JSON string or base64-encoded JSON string
            representing the Google service account key file.

    Returns:
        Parsed service account dictionary.

    Raises:
        ValueError: If the string cannot be decoded as either format.
    """
    stripped = credentials_json.strip()
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        pass
    try:
        return json.loads(base64.b64decode(stripped))
    except Exception as exc:
        raise ValueError(
            "credentials_json is neither valid JSON nor valid base64-encoded JSON"
        ) from exc


# ── Retry helper ──────────────────────────────────────────────────────────────


def _is_rate_limit_error(exc: Exception) -> bool:
    """Return True when *exc* represents a retriable rate-limit condition."""
    if isinstance(exc, httpx.HTTPStatusError):
        if exc.response.status_code == 429:
            return True
        if exc.response.status_code == 403:
            # Google sometimes returns 403 with a rate-limit reason in the body.
            try:
                body = exc.response.json()
                errors: list[dict[str, Any]] = body.get("error", {}).get("errors", [])
                return any(
                    e.get("reason") in {"rateLimitExceeded", "userRateLimitExceeded"}
                    for e in errors
                )
            except Exception:
                return False
    return False


async def _request_with_backoff(
    client: httpx.AsyncClient,
    method: str,
    url: str,
    **kwargs: Any,
) -> httpx.Response:
    """Execute an HTTP request, retrying on rate-limit errors with back-off.

    Args:
        client: The ``httpx.AsyncClient`` to use.
        method: HTTP verb (``"GET"``, ``"POST"``, …).
        url: Target URL.
        **kwargs: Forwarded to ``client.request``.

    Returns:
        The successful :class:`httpx.Response`.

    Raises:
        httpx.HTTPStatusError: After all retries are exhausted or for
            non-retriable error responses.
    """
    delay = _BACKOFF_INITIAL
    for attempt in range(_BACKOFF_MAX_RETRIES + 1):
        resp = await client.request(method, url, **kwargs)
        try:
            resp.raise_for_status()
            return resp
        except httpx.HTTPStatusError as exc:
            if attempt < _BACKOFF_MAX_RETRIES and _is_rate_limit_error(exc):
                logger.warning(
                    "Rate limit hit for %s (attempt %d/%d), backing off %.1fs",
                    url,
                    attempt + 1,
                    _BACKOFF_MAX_RETRIES,
                    delay,
                )
                await asyncio.sleep(delay)
                delay = min(delay * _BACKOFF_MULTIPLIER, _BACKOFF_MAX)
                continue
            raise
    # Unreachable, but satisfies type checker.
    resp.raise_for_status()
    return resp  # pragma: no cover


# ── Metadata helpers ──────────────────────────────────────────────────────────


def _extract_owners(file_meta: dict[str, Any]) -> list[str]:
    """Return a list of owner email addresses from a Drive file metadata dict."""
    return [
        owner.get("emailAddress", "")
        for owner in file_meta.get("owners", [])
        if owner.get("emailAddress")
    ]


def _extract_last_modified_by(file_meta: dict[str, Any]) -> str:
    """Return the email of the user who last modified the file, or empty string."""
    modifier: dict[str, Any] = file_meta.get("lastModifyingUser") or {}
    return modifier.get("emailAddress", "")


# ── Connector class ───────────────────────────────────────────────────────────


class GoogleDriveConnector:
    """Fetches documents from Google Drive using a service account.

    The connector authenticates as a service account and lists all files
    visible to that account (typically a shared drive or files explicitly
    shared with the service account email).  Supported file types:

    - Google Docs  → exported as ``text/plain``
    - Google Sheets → exported as ``text/csv``
    - Google Slides → exported as ``text/plain``
    - PDF files    → downloaded as binary; text extraction happens downstream

    Other MIME types (images, videos, binaries) are silently skipped.

    Args:
        credentials_json: Raw JSON string (or base64-encoded JSON) of the
            Google service account key file.  If omitted or empty, falls back
            to ``settings.google_service_account_key``.

    Example::

        import json
        from app.core.config import settings

        connector = GoogleDriveConnector(settings.google_service_account_key)
        async for doc in await connector.fetch_documents():
            print(doc.title, doc.content_hash)
    """

    def __init__(self, credentials_json: str = "") -> None:
        if not credentials_json:
            from app.core.config import settings

            credentials_json = settings.google_service_account_key
        if not credentials_json:
            raise ValueError(
                "credentials_json must be provided or "
                "settings.google_service_account_key must be set"
            )
        self._service_account: dict[str, Any] = _parse_credentials(credentials_json)
        self._access_token: str | None = None
        self._token_expires_at: float = 0.0

    # ── Protocol property ─────────────────────────────────────────────────────

    @property
    def connector_type(self) -> ConnectorType:
        """Return the connector type identifier."""
        return ConnectorType.GOOGLE_DRIVE

    # ── Internal auth ─────────────────────────────────────────────────────────

    async def _get_access_token(self, client: httpx.AsyncClient) -> str:
        """Return a valid OAuth 2.0 access token, refreshing when expired.

        Tokens are cached on the instance for up to 55 minutes (the 1-hour
        Google expiry minus a 5-minute safety margin).

        Args:
            client: Shared ``httpx.AsyncClient`` for the current operation.

        Returns:
            A valid Bearer access token string.

        Raises:
            httpx.HTTPStatusError: If the token exchange request fails.
        """
        # 60-second safety margin before expiry.
        if self._access_token and time.time() < self._token_expires_at - 60:
            return self._access_token

        jwt = _make_jwt(self._service_account)
        resp = await _request_with_backoff(
            client,
            "POST",
            _TOKEN_URL,
            data={
                "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                "assertion": jwt,
            },
        )
        token_data: dict[str, Any] = resp.json()
        self._access_token = token_data["access_token"]
        self._token_expires_at = time.time() + token_data.get("expires_in", 3600)
        logger.debug("Obtained new Google Drive access token")
        return self._access_token  # type: ignore[return-value]

    def _auth_headers(self, token: str) -> dict[str, str]:
        return {"Authorization": f"Bearer {token}"}

    # ── File listing ──────────────────────────────────────────────────────────

    async def _list_files(
        self,
        client: httpx.AsyncClient,
        token: str,
        since: datetime | None,
    ) -> AsyncIterator[dict[str, Any]]:
        """Yield file metadata dicts from the Drive v3 ``files.list`` endpoint.

        Only files with supported MIME types are returned. Pages are iterated
        via ``nextPageToken`` until exhausted.

        Args:
            client: Shared ``httpx.AsyncClient``.
            token: Valid OAuth 2.0 access token.
            since: When provided, restricts results to files modified after
                this UTC datetime.

        Yields:
            Drive file metadata dictionaries containing the fields requested
            via ``_FILE_FIELDS``.
        """
        mime_filter = " or ".join(f"mimeType='{m}'" for m in (*_EXPORTABLE_MIME, *_DIRECT_MIME))
        query = f"trashed=false and ({mime_filter})"
        if since:
            ts = since.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
            query += f" and modifiedTime > '{ts}'"

        page_token: str | None = None

        while True:
            params: dict[str, Any] = {
                "q": query,
                "pageSize": _PAGE_SIZE,
                "fields": f"nextPageToken,files({_FILE_FIELDS})",
                "includeItemsFromAllDrives": "true",
                "supportsAllDrives": "true",
                "corpora": "allDrives",
            }
            if page_token:
                params["pageToken"] = page_token

            resp = await _request_with_backoff(
                client,
                "GET",
                f"{_DRIVE_API}/files",
                headers=self._auth_headers(token),
                params=params,
            )
            data: dict[str, Any] = resp.json()

            for file_meta in data.get("files", []):
                yield file_meta

            page_token = data.get("nextPageToken")
            if not page_token:
                break

    # ── Content export ────────────────────────────────────────────────────────

    async def _export_content(
        self,
        client: httpx.AsyncClient,
        token: str,
        file_id: str,
        mime_type: str,
    ) -> str:
        """Download or export a Drive file as a UTF-8 string.

        Google-native formats (Docs, Sheets, Slides) are exported to their
        plain-text equivalents.  PDFs are downloaded as binary and decoded
        to a string representation so the downstream chunker can decide
        whether to run OCR.

        Args:
            client: Shared ``httpx.AsyncClient``.
            token: Valid OAuth 2.0 access token.
            file_id: Drive file identifier.
            mime_type: MIME type of the file as reported by the Drive API.

        Returns:
            Decoded text content, capped at ``_MAX_CONTENT_BYTES`` bytes.

        Raises:
            httpx.HTTPStatusError: If the export/download request fails after
                all retries.
        """
        headers = self._auth_headers(token)

        if mime_type in _EXPORTABLE_MIME:
            export_mime = _EXPORTABLE_MIME[mime_type]
            resp = await _request_with_backoff(
                client,
                "GET",
                f"{_DRIVE_API}/files/{file_id}/export",
                headers=headers,
                params={"mimeType": export_mime},
            )
        else:
            # Binary download (PDF).
            resp = await _request_with_backoff(
                client,
                "GET",
                f"{_DRIVE_API}/files/{file_id}",
                headers=headers,
                params={"alt": "media"},
            )

        raw: bytes = resp.content[:_MAX_CONTENT_BYTES]
        return raw.decode("utf-8", errors="replace")

    # ── Public interface ──────────────────────────────────────────────────────

    async def fetch_documents(
        self,
        *,
        since: datetime | None = None,
    ) -> AsyncIterator[RawDocument]:
        """Fetch documents from Google Drive, yielding them as :class:`RawDocument`.

        Iterates through all Drive files visible to the service account that
        match the supported MIME types. For each file the content is exported
        to plain text, hashed, and wrapped in a ``RawDocument``.

        Files shared through a shared drive are treated as company-wide
        (``access_level="all"``).  The connector does not currently attempt
        to derive per-department access levels from folder hierarchy; that
        enrichment is left to the ingestion pipeline.

        Args:
            since: When provided, only files modified after this UTC timestamp
                are fetched (incremental sync).  ``None`` triggers a full sync
                of all accessible files.

        Yields:
            :class:`~app.services.types.RawDocument` instances, one per
            exported file.  Files that fail to export are skipped with a
            warning log; files with empty content are silently skipped.

        Raises:
            RuntimeError: If the service account key is missing or malformed.
            httpx.HTTPStatusError: On unrecoverable API errors (non-rate-limit
                4xx or 5xx after retries are exhausted).
        """
        async with httpx.AsyncClient(timeout=60.0) as client:
            token = await self._get_access_token(client)

            async for file_meta in self._list_files(client, token, since):
                file_id: str = file_meta["id"]
                mime_type: str = file_meta["mimeType"]
                title: str = file_meta.get("name") or file_id

                try:
                    content = await self._export_content(client, token, file_id, mime_type)
                except httpx.HTTPStatusError as exc:
                    logger.warning(
                        "Failed to export Drive file %s (%s): %s",
                        file_id,
                        title,
                        exc,
                    )
                    continue
                except Exception as exc:
                    logger.warning(
                        "Unexpected error exporting Drive file %s (%s): %s",
                        file_id,
                        title,
                        exc,
                    )
                    continue

                if not content.strip():
                    logger.debug("Skipping empty Drive file %s (%s)", file_id, title)
                    continue

                content_hash = hashlib.sha256(content.encode()).hexdigest()
                owners = _extract_owners(file_meta)
                last_modified_by = _extract_last_modified_by(file_meta)

                yield RawDocument(
                    source_type=ConnectorType.GOOGLE_DRIVE,
                    source_id=file_id,
                    title=title,
                    content=content,
                    content_hash=content_hash,
                    url=file_meta.get("webViewLink", ""),
                    # Docs in a shared drive are accessible to the whole company.
                    access_level="all",
                    metadata={
                        "mime_type": mime_type,
                        "owners": owners,
                        "last_modified_by": last_modified_by,
                        "last_modified": file_meta.get("modifiedTime", ""),
                        "size": file_meta.get("size"),
                        "parents": file_meta.get("parents", []),
                    },
                    fetched_at=datetime.now(tz=UTC),
                )

    async def health_check(self) -> bool:
        """Verify connectivity by listing a single Drive file.

        Returns:
            ``True`` when the Drive API is reachable and the service account
            can authenticate successfully.  ``False`` otherwise (errors are
            logged at ERROR level).
        """
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                token = await self._get_access_token(client)
                resp = await _request_with_backoff(
                    client,
                    "GET",
                    f"{_DRIVE_API}/files",
                    headers=self._auth_headers(token),
                    params={
                        "pageSize": 1,
                        "fields": "files(id)",
                        "supportsAllDrives": "true",
                        "includeItemsFromAllDrives": "true",
                    },
                )
                resp.raise_for_status()
                return True
        except Exception as exc:
            logger.error("Google Drive health check failed: %s", exc)
            return False
