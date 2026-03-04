"""Async HTTP client for the Company Brain API."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from typing import Any

import httpx
import httpx_sse

from app.models import ChatResponse, QueryResponse

logger = logging.getLogger(__name__)

_DEFAULT_TIMEOUT = httpx.Timeout(30.0, connect=5.0)
_MAX_RETRIES = 2
_RETRYABLE_STATUS = {429, 500, 502, 503, 504}


class APIError(Exception):
    """Raised when the Company Brain API returns an unexpected response.

    Attributes:
        status_code: HTTP status code, if available.
        detail: Error detail from the response body.
    """

    def __init__(self, message: str, status_code: int | None = None, detail: str = "") -> None:
        super().__init__(message)
        self.status_code = status_code
        self.detail = detail


class CompanyBrainClient:
    """Async client for all Company Brain API endpoints.

    Intended to be used as an async context manager so the underlying
    ``httpx.AsyncClient`` is properly closed after use.

    Example::

        async with CompanyBrainClient(base_url="http://localhost:8000", auth_token="tok") as client:
            response = await client.query("What is our leave policy?")
    """

    def __init__(self, base_url: str, auth_token: str = "") -> None:
        self._base_url = base_url.rstrip("/")
        self._auth_token = auth_token
        self._client: httpx.AsyncClient | None = None

    # ── Lifecycle ──────────────────────────────────────────────────────────────

    async def __aenter__(self) -> CompanyBrainClient:
        headers: dict[str, str] = {
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        if self._auth_token:
            headers["Authorization"] = f"Bearer {self._auth_token}"

        self._client = httpx.AsyncClient(
            base_url=self._base_url,
            timeout=_DEFAULT_TIMEOUT,
            headers=headers,
        )
        return self

    async def __aexit__(self, *_: object) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    # ── Private helpers ────────────────────────────────────────────────────────

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            raise RuntimeError("CompanyBrainClient must be used as an async context manager.")
        return self._client

    async def _post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        """POST with simple retry logic for transient server errors."""
        client = self._get_client()
        last_exc: Exception | None = None

        for attempt in range(_MAX_RETRIES + 1):
            try:
                response = await client.post(path, json=payload)
                if response.status_code in _RETRYABLE_STATUS and attempt < _MAX_RETRIES:
                    logger.warning(
                        "Retryable status %s from %s (attempt %d/%d)",
                        response.status_code,
                        path,
                        attempt + 1,
                        _MAX_RETRIES,
                    )
                    continue
                if response.status_code >= 400:
                    detail = ""
                    try:
                        detail = response.json().get("detail", "")
                    except Exception:
                        detail = response.text
                    raise APIError(
                        f"API request to {path} failed",
                        status_code=response.status_code,
                        detail=str(detail),
                    )
                return response.json()  # type: ignore[no-any-return]
            except httpx.TimeoutException as exc:
                last_exc = exc
                logger.warning("Timeout on %s (attempt %d/%d)", path, attempt + 1, _MAX_RETRIES)
            except httpx.RequestError as exc:
                last_exc = exc
                logger.warning(
                    "Request error on %s: %s (attempt %d/%d)",
                    path,
                    exc,
                    attempt + 1,
                    _MAX_RETRIES,
                )

        raise APIError(
            f"All {_MAX_RETRIES + 1} attempts to {path} failed",
            detail=str(last_exc),
        )

    async def _get(self, path: str) -> dict[str, Any]:
        """GET a single-object endpoint with simple retry logic for transient server errors."""
        client = self._get_client()
        last_exc: Exception | None = None

        for attempt in range(_MAX_RETRIES + 1):
            try:
                response = await client.get(path)
                if response.status_code in _RETRYABLE_STATUS and attempt < _MAX_RETRIES:
                    logger.warning(
                        "Retryable status %s from %s (attempt %d/%d)",
                        response.status_code,
                        path,
                        attempt + 1,
                        _MAX_RETRIES,
                    )
                    continue
                if response.status_code >= 400:
                    detail = ""
                    try:
                        detail = response.json().get("detail", "")
                    except Exception:
                        detail = response.text
                    raise APIError(
                        f"API request to {path} failed",
                        status_code=response.status_code,
                        detail=str(detail),
                    )
                return response.json()  # type: ignore[no-any-return]
            except httpx.TimeoutException as exc:
                last_exc = exc
                logger.warning("Timeout on %s (attempt %d/%d)", path, attempt + 1, _MAX_RETRIES)
            except httpx.RequestError as exc:
                last_exc = exc
                logger.warning(
                    "Request error on %s: %s (attempt %d/%d)",
                    path,
                    exc,
                    attempt + 1,
                    _MAX_RETRIES,
                )

        raise APIError(
            f"All {_MAX_RETRIES + 1} attempts to {path} failed",
            detail=str(last_exc),
        )

    async def _get_list(self, path: str) -> list[Any]:
        """GET a list endpoint with simple retry logic for transient server errors.

        Args:
            path: API path that returns a JSON array.

        Returns:
            Parsed list from the JSON response.

        Raises:
            APIError: When the API returns an error or times out after retries.
        """
        client = self._get_client()
        last_exc: Exception | None = None

        for attempt in range(_MAX_RETRIES + 1):
            try:
                response = await client.get(path)
                if response.status_code in _RETRYABLE_STATUS and attempt < _MAX_RETRIES:
                    logger.warning(
                        "Retryable status %s from %s (attempt %d/%d)",
                        response.status_code,
                        path,
                        attempt + 1,
                        _MAX_RETRIES,
                    )
                    continue
                if response.status_code >= 400:
                    detail = ""
                    try:
                        detail = response.json().get("detail", "")
                    except Exception:
                        detail = response.text
                    raise APIError(
                        f"API request to {path} failed",
                        status_code=response.status_code,
                        detail=str(detail),
                    )
                return response.json()  # type: ignore[no-any-return]
            except httpx.TimeoutException as exc:
                last_exc = exc
                logger.warning("Timeout on %s (attempt %d/%d)", path, attempt + 1, _MAX_RETRIES)
            except httpx.RequestError as exc:
                last_exc = exc
                logger.warning(
                    "Request error on %s: %s (attempt %d/%d)",
                    path,
                    exc,
                    attempt + 1,
                    _MAX_RETRIES,
                )

        raise APIError(
            f"All {_MAX_RETRIES + 1} attempts to {path} failed",
            detail=str(last_exc),
        )

    async def _stream_chat_inner(
        self,
        message: str,
        conversation_id: str | None,
        language: str | None,
    ) -> AsyncIterator[str]:
        """Internal async generator for SSE streaming."""
        client = self._get_client()
        payload: dict[str, Any] = {"message": message}
        if conversation_id:
            payload["conversation_id"] = conversation_id
        if language:
            payload["language"] = language

        try:
            async with httpx_sse.aconnect_sse(
                client, "POST", "/api/v1/chat/stream", json=payload
            ) as event_source:
                async for event in event_source.aiter_sse():
                    if event.data and event.data != "[DONE]":
                        yield event.data
        except httpx.RequestError as exc:
            raise APIError(
                "Streaming request to /api/v1/chat/stream failed",
                detail=str(exc),
            ) from exc

    # ── Public API ─────────────────────────────────────────────────────────────

    async def query(
        self,
        text: str,
        language: str | None = None,
    ) -> QueryResponse:
        """Send a one-shot knowledge query to the API.

        Args:
            text: The user's natural-language question.
            language: BCP-47 language code (``"en"``, ``"ja"``, ``"ko"``).

        Returns:
            Parsed ``QueryResponse`` with answer and sources.

        Raises:
            APIError: When the API returns an error or times out after retries.
        """
        payload: dict[str, Any] = {"query": text}
        if language:
            payload["language"] = language
        data = await self._post("/api/v1/knowledge/query", payload)
        return QueryResponse.model_validate(data)

    async def chat(
        self,
        message: str,
        conversation_id: str | None = None,
        language: str | None = None,
    ) -> ChatResponse:
        """Send a message in a multi-turn conversation.

        Args:
            message: The user's latest message.
            conversation_id: Existing conversation thread ID, or ``None`` to start
                a new one.
            language: Preferred response language (en, ja, ko).

        Returns:
            Parsed ``ChatResponse`` including the new ``conversation_id``.

        Raises:
            APIError: When the API returns an error or times out after retries.
        """
        payload: dict[str, Any] = {"message": message}
        if conversation_id:
            payload["conversation_id"] = conversation_id
        if language:
            payload["language"] = language
        data = await self._post("/api/v1/chat", payload)
        return ChatResponse.model_validate(data)

    async def stream_chat(
        self,
        message: str,
        conversation_id: str | None = None,
        language: str | None = None,
    ) -> AsyncIterator[str]:
        """Stream chat responses via SSE, yielding text chunks as they arrive.

        Connects to ``POST /api/v1/chat/stream`` and yields each ``data`` field
        from the server-sent event stream.

        Args:
            message: The user's latest message.
            conversation_id: Existing conversation thread ID, or ``None`` to start
                a new one.
            language: Preferred response language (en, ja, ko, tl).

        Yields:
            Text chunks from the streamed response.

        Raises:
            APIError: When the connection fails or the server returns an error.
        """
        return self._stream_chat_inner(message, conversation_id, language)

    async def get_harvest_sessions(self, target_user_id: str | None = None) -> list[dict[str, Any]]:
        """Get harvest sessions, optionally filtered by target user ID.

        Args:
            target_user_id: Optional system user UUID to filter sessions by.

        Returns:
            List of session summary dicts from the API.

        Raises:
            APIError: When the API returns an error or times out after retries.
        """
        path = "/api/v1/harvest/sessions"
        if target_user_id:
            path += f"?target_user_id={target_user_id}"
        return await self._get_list(path)

    async def get_user_by_telegram_id(self, telegram_id: int) -> dict[str, Any] | None:
        """Look up a system user by their Telegram ID.

        Args:
            telegram_id: Telegram user ID to look up.

        Returns:
            User detail dict if found, None if no user is linked.

        Raises:
            APIError: On unexpected API errors (not 404).
        """
        try:
            return await self._get(f"/api/v1/admin/users/by-telegram/{telegram_id}")
        except APIError as exc:
            if exc.status_code == 404:
                return None
            raise

    async def get_harvest_session_detail(self, session_id: str) -> dict[str, Any]:
        """Get full session detail with questions.

        Args:
            session_id: UUID string of the harvest session.

        Returns:
            Full session detail dict including questions list.

        Raises:
            APIError: When the API returns an error or times out after retries.
        """
        return await self._get(f"/api/v1/harvest/sessions/{session_id}")

    async def submit_harvest_answer(
        self,
        question_id: str,
        answer: str,
        source: str = "telegram",
    ) -> dict[str, Any]:
        """Submit an answer to a harvest question.

        Args:
            question_id: UUID string of the question being answered.
            answer: The answer text provided by the employee.
            source: Origin of the answer, defaults to ``"telegram"``.

        Returns:
            Confirmation dict with status and question_id.

        Raises:
            APIError: When the API returns an error or times out after retries.
        """
        return await self._post(
            "/api/v1/harvest/answer",
            {
                "question_id": question_id,
                "answer": answer,
                "source": source,
            },
        )

    async def pause_harvest_session(self, session_id: str) -> dict[str, Any]:
        """Pause an active harvest session.

        Args:
            session_id: UUID string of the session to pause.

        Returns:
            Confirmation dict with updated status.

        Raises:
            APIError: When the API returns an error or times out after retries.
        """
        return await self._post(f"/api/v1/harvest/sessions/{session_id}/pause", {})

    async def resume_harvest_session(self, session_id: str) -> dict[str, Any]:
        """Resume a paused harvest session.

        Args:
            session_id: UUID string of the session to resume.

        Returns:
            Confirmation dict with updated status.

        Raises:
            APIError: When the API returns an error or times out after retries.
        """
        return await self._post(f"/api/v1/harvest/sessions/{session_id}/resume", {})

    async def get_history(self, conversation_id: str) -> dict[str, Any]:
        """Fetch recent conversation history summary from the API.

        Args:
            conversation_id: The conversation to fetch history for.

        Returns:
            Raw dict from the API containing conversation summary.

        Raises:
            APIError: When the API returns an error or times out after retries.
        """
        return await self._get(f"/api/v1/chat/sessions/{conversation_id}")

    async def send_feedback(
        self,
        conversation_id: str,
        message_id: str,
        rating: str,
    ) -> None:
        """Record user feedback for a specific answer.

        Args:
            conversation_id: The conversation the feedback belongs to.
            message_id: Opaque ID of the individual message being rated.
            rating: ``"up"`` or ``"down"``.

        Raises:
            APIError: When the API returns an error or times out after retries.
        """
        await self._post(
            "/api/v1/chat/feedback",
            {
                "conversation_id": conversation_id,
                "message_id": message_id,
                "rating": rating,
            },
        )

    async def health(self) -> bool:
        """Check whether the API is reachable and healthy.

        Returns:
            ``True`` if the health endpoint responds with HTTP 200, ``False``
            otherwise.
        """
        client = self._get_client()
        try:
            response = await client.get("/health", timeout=5.0)
            return response.status_code == 200
        except (httpx.RequestError, httpx.TimeoutException):
            return False
