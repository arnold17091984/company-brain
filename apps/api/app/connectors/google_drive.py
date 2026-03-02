"""Google Drive connector – fetches Docs, Sheets, Slides, and PDFs via Drive API v3.

Authentication uses a service account.  The JSON key is stored in
``settings.google_service_account_key`` (raw JSON string or base64-encoded).
JWTs are constructed manually and exchanged for OAuth 2.0 access tokens so that
no additional Google SDK dependencies are required.
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import time
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from typing import Any

import httpx

from app.core.config import settings
from app.services.types import ConnectorType, RawDocument

logger = logging.getLogger(__name__)

# ── Constants ────────────────────────────────────────────────────────────────

_DRIVE_API = "https://www.googleapis.com/drive/v3"
_TOKEN_URL = "https://oauth2.googleapis.com/token"
_SCOPE = "https://www.googleapis.com/auth/drive.readonly"

# MIME types we can export/download
_EXPORTABLE_MIME: dict[str, str] = {
    "application/vnd.google-apps.document": "text/plain",
    "application/vnd.google-apps.spreadsheet": "text/csv",
    "application/vnd.google-apps.presentation": "text/plain",
}
_DIRECT_MIME: set[str] = {"application/pdf"}

# Google Drive API page size (max 1000)
_PAGE_SIZE = 200

# Maximum content size to ingest per file (5 MB of text)
_MAX_CONTENT_BYTES = 5 * 1024 * 1024


# ── JWT / token helpers ──────────────────────────────────────────────────────


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _make_jwt(service_account: dict[str, Any]) -> str:
    """Build a signed JWT for the service account (RS256).

    We avoid the ``cryptography`` / ``google-auth`` dependency by delegating
    the RSA signing to Python's ``ssl`` module via ``hashlib`` + ``rsa`` if
    available, or by falling back to ``cryptography`` if present.  In practice,
    ``cryptography`` is already a transitive dependency of many packages, so
    this is safe.
    """
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

    # Use cryptography library (available as a transitive dep via httpx/others)
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding

    private_key_pem = service_account["private_key"].encode()
    private_key = serialization.load_pem_private_key(private_key_pem, password=None)
    signature = private_key.sign(signing_input, padding.PKCS1v15(), hashes.SHA256())

    return f"{header}.{payload}.{_b64url(signature)}"


def _load_service_account() -> dict[str, Any]:
    """Decode and parse the service account key from settings."""
    raw = settings.google_service_account_key
    if not raw:
        raise RuntimeError("google_service_account_key is not configured")
    # Support both raw JSON and base64-encoded JSON
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return json.loads(base64.b64decode(raw))


# ── Connector class ──────────────────────────────────────────────────────────


class GoogleDriveConnector:
    """Fetches text content from Google Drive using service account credentials."""

    _access_token: str | None = None
    _token_expires_at: float = 0.0

    @property
    def connector_type(self) -> ConnectorType:
        return ConnectorType.GOOGLE_DRIVE

    # ── Internal auth ────────────────────────────────────────────────────────

    async def _get_access_token(self, client: httpx.AsyncClient) -> str:
        """Return a valid OAuth2 access token, refreshing when necessary."""
        if self._access_token and time.time() < self._token_expires_at - 60:
            return self._access_token

        service_account = _load_service_account()
        jwt = _make_jwt(service_account)

        resp = await client.post(
            _TOKEN_URL,
            data={
                "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                "assertion": jwt,
            },
        )
        resp.raise_for_status()
        token_data = resp.json()
        self._access_token = token_data["access_token"]
        self._token_expires_at = time.time() + token_data.get("expires_in", 3600)
        return self._access_token  # type: ignore[return-value]

    def _auth_headers(self, token: str) -> dict[str, str]:
        return {"Authorization": f"Bearer {token}"}

    # ── File listing ─────────────────────────────────────────────────────────

    async def _list_files(
        self,
        client: httpx.AsyncClient,
        token: str,
        since: datetime | None,
    ) -> AsyncIterator[dict[str, Any]]:
        """Yield file metadata pages from the Drive API."""
        mime_filter = " or ".join(
            f"mimeType='{m}'" for m in list(_EXPORTABLE_MIME) + list(_DIRECT_MIME)
        )
        query = f"trashed=false and ({mime_filter})"
        if since:
            ts = since.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
            query += f" and modifiedTime > '{ts}'"

        page_token: str | None = None
        while True:
            params: dict[str, Any] = {
                "q": query,
                "pageSize": _PAGE_SIZE,
                "fields": (
                    "nextPageToken,"
                    "files(id,name,mimeType,modifiedTime,webViewLink,"
                    "parents,description)"
                ),
            }
            if page_token:
                params["pageToken"] = page_token

            resp = await client.get(
                f"{_DRIVE_API}/files",
                headers=self._auth_headers(token),
                params=params,
            )
            resp.raise_for_status()
            data = resp.json()

            for file_meta in data.get("files", []):
                yield file_meta

            page_token = data.get("nextPageToken")
            if not page_token:
                break

    # ── Content export ───────────────────────────────────────────────────────

    async def _export_content(
        self,
        client: httpx.AsyncClient,
        token: str,
        file_id: str,
        mime_type: str,
    ) -> str:
        """Download or export a file's text content."""
        headers = self._auth_headers(token)

        if mime_type in _EXPORTABLE_MIME:
            export_mime = _EXPORTABLE_MIME[mime_type]
            resp = await client.get(
                f"{_DRIVE_API}/files/{file_id}/export",
                headers=headers,
                params={"mimeType": export_mime},
            )
        else:
            # Binary download (PDF) – limited value without OCR, store raw text
            resp = await client.get(
                f"{_DRIVE_API}/files/{file_id}",
                headers=headers,
                params={"alt": "media"},
            )

        resp.raise_for_status()
        content_bytes = resp.content[:_MAX_CONTENT_BYTES]

        try:
            return content_bytes.decode("utf-8", errors="replace")
        except Exception:
            return content_bytes.decode("latin-1", errors="replace")

    # ── Metadata helpers ─────────────────────────────────────────────────────

    async def _resolve_folder_metadata(
        self,
        client: httpx.AsyncClient,
        token: str,
        parent_ids: list[str],
    ) -> tuple[str, str | None]:
        """Return (access_level, department_slug) derived from parent folder names."""
        if not parent_ids:
            return "restricted", None

        try:
            resp = await client.get(
                f"{_DRIVE_API}/files/{parent_ids[0]}",
                headers=self._auth_headers(token),
                params={"fields": "name,id"},
            )
            resp.raise_for_status()
            folder_name: str = resp.json().get("name", "").lower()
        except Exception:
            return "restricted", None

        # Simple heuristic: "public" → open, known dept names → department slug
        if "public" in folder_name or "all staff" in folder_name:
            return "public", None
        if "confidential" in folder_name or "exec" in folder_name:
            return "confidential", None

        # Treat folder name as department slug
        slug = folder_name.replace(" ", "_").replace("-", "_")
        return "restricted", slug or None

    # ── Public interface ─────────────────────────────────────────────────────

    async def fetch_documents(
        self,
        *,
        since: datetime | None = None,
    ) -> AsyncIterator[RawDocument]:
        """Yield RawDocuments from Google Drive.

        Args:
            since: Only return files modified after this UTC timestamp.
        """
        async with httpx.AsyncClient(timeout=60.0) as client:
            token = await self._get_access_token(client)

            async for file_meta in self._list_files(client, token, since):
                file_id: str = file_meta["id"]
                mime_type: str = file_meta["mimeType"]
                title: str = file_meta.get("name", file_id)

                try:
                    content = await self._export_content(client, token, file_id, mime_type)
                except Exception as exc:
                    logger.warning("Failed to export Drive file %s: %s", file_id, exc)
                    continue

                if not content.strip():
                    logger.debug("Skipping empty Drive file %s", file_id)
                    continue

                parent_ids: list[str] = file_meta.get("parents", [])
                access_level, dept_slug = await self._resolve_folder_metadata(
                    client, token, parent_ids
                )

                content_hash = hashlib.sha256(content.encode()).hexdigest()

                yield RawDocument(
                    source_type=ConnectorType.GOOGLE_DRIVE,
                    source_id=file_id,
                    title=title,
                    content=content,
                    content_hash=content_hash,
                    url=file_meta.get("webViewLink", ""),
                    access_level=access_level,
                    department_slug=dept_slug,
                    metadata={
                        "mime_type": mime_type,
                        "modified_time": file_meta.get("modifiedTime"),
                        "parents": parent_ids,
                        "description": file_meta.get("description", ""),
                    },
                )

    async def health_check(self) -> bool:
        """Return True if the Drive API is reachable with current credentials."""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                token = await self._get_access_token(client)
                resp = await client.get(
                    f"{_DRIVE_API}/about",
                    headers=self._auth_headers(token),
                    params={"fields": "user"},
                )
                resp.raise_for_status()
                return True
        except Exception as exc:
            logger.error("Google Drive health check failed: %s", exc)
            return False
