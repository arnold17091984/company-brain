"""Integration tests for Company Brain API routes.

Covers happy paths and key error scenarios for:
- POST  /api/v1/auth/token
- GET   /api/v1/auth/me
- POST  /api/v1/chat
- GET   /api/v1/chat/sessions
- POST  /api/v1/knowledge/query
- GET   /api/v1/knowledge/sources
- GET   /api/v1/analytics/overview
- GET   /api/v1/analytics/departments

Design decisions
----------------
- All tests use ``httpx.AsyncClient`` with ``ASGITransport`` so the full
  ASGI middleware stack (including CORS) is exercised without a live server.
- The ``dev-token`` shortcut (APP_ENV=development, Bearer dev-token) is used
  for all endpoints that require authentication.  This avoids mocking Google
  JWKS and keeps each test focused on the route under test.
- The SQLAlchemy ``get_db`` dependency is overridden with an
  ``AsyncMock``-backed fake session factory so no database is needed.
- ``ClaudeService.generate`` and ``ClaudeService.stream`` are patched at the
  class level so the LLM is never called.
- The lifespan startup/shutdown (PostgreSQL ping, Redis, Qdrant) is bypassed
  by overriding ``app.state`` attributes directly before each test that needs
  them.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

BASE_URL = "http://test"
AUTH_HEADERS = {"Authorization": "Bearer dev-token"}
API = "/api/v1"

# ---------------------------------------------------------------------------
# Shared fake DB session
# ---------------------------------------------------------------------------


class _FakeResult:
    """Minimal SQLAlchemy result stub used across tests."""

    def __init__(self, rows: list[Any] | None = None, scalar: Any = None) -> None:
        self._rows = rows or []
        self._scalar = scalar

    def scalar_one(self) -> Any:
        return self._scalar

    def scalar_one_or_none(self) -> Any:
        return self._scalar

    def scalars(self) -> _FakeResult:
        return self

    def all(self) -> list[Any]:
        return self._rows


class _FakeSession:
    """Async SQLAlchemy session stub.

    ``execute_results`` is a queue of ``_FakeResult`` objects returned in
    FIFO order.  When the queue is exhausted every subsequent call returns
    an empty ``_FakeResult``.
    """

    def __init__(self, execute_results: list[_FakeResult] | None = None) -> None:
        self._results: list[_FakeResult] = list(execute_results or [])
        self.added: list[Any] = []
        self.committed = False
        self.flushed = False

    async def execute(self, _stmt: Any) -> _FakeResult:
        if self._results:
            return self._results.pop(0)
        return _FakeResult(rows=[], scalar=0)

    def add(self, obj: Any) -> None:
        self.added.append(obj)

    async def flush(self) -> None:
        self.flushed = True
        # Give ORM objects a synthetic UUID so callers can serialise them.
        for obj in self.added:
            if not getattr(obj, "id", None):
                obj.id = uuid.uuid4()

    async def commit(self) -> None:
        self.committed = True

    async def rollback(self) -> None:
        pass


def _make_db_override(session: _FakeSession | None = None):
    """Return a FastAPI dependency override for ``get_db``."""
    from app.core.database import get_db  # noqa: PLC0415

    _session = session or _FakeSession()

    async def _override():
        yield _session

    return get_db, _override


# ---------------------------------------------------------------------------
# Helper: build a pre-configured AsyncClient
# ---------------------------------------------------------------------------


async def _client(db_session: _FakeSession | None = None) -> AsyncClient:
    """Return an AsyncClient wired to the ASGI app with ``get_db`` overridden."""
    dep, override = _make_db_override(db_session)
    app.dependency_overrides[dep] = override
    return AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL)


# ---------------------------------------------------------------------------
# Auth: POST /api/v1/auth/token
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestAuthToken:
    async def test_dev_token_returns_200_with_access_token(self) -> None:
        """Sending 'dev-token' in development mode returns a valid JWT payload."""
        async with await _client() as client:
            response = await client.post(
                f"{API}/auth/token",
                json={"google_token": "dev-token"},
            )

        assert response.status_code == 200
        body = response.json()
        assert body["token_type"] == "bearer"
        assert isinstance(body["access_token"], str)
        assert len(body["access_token"]) > 0
        assert isinstance(body["expires_in"], int)
        assert body["expires_in"] > 0

    async def test_dev_token_response_contains_user_profile(self) -> None:
        """The ``user`` field in the token response matches the mock dev user."""
        async with await _client() as client:
            response = await client.post(
                f"{API}/auth/token",
                json={"google_token": "dev-token"},
            )

        user = response.json()["user"]
        assert user["email"] == "dev@example.com"
        assert user["name"] == "Dev User"
        assert user["department"] == "engineering"
        assert user["access_level"] == "all"

    async def test_invalid_google_token_returns_401(self) -> None:
        """A non-dev token that cannot be verified must return 401."""
        # Patch verify_google_token to raise an HTTPException as the real
        # implementation does when the token is malformed.
        from fastapi import HTTPException as FastAPIHTTPException  # noqa: PLC0415

        with patch(
            "app.api.routes.auth.verify_google_token",
            new=AsyncMock(
                side_effect=FastAPIHTTPException(status_code=401, detail="Invalid token format")
            ),
        ):
            async with await _client() as client:
                response = await client.post(
                    f"{API}/auth/token",
                    json={"google_token": "not-a-real-google-token"},
                )

        assert response.status_code == 401

    async def test_missing_body_returns_422(self) -> None:
        """Sending an empty body must result in a validation error."""
        async with await _client() as client:
            response = await client.post(f"{API}/auth/token", json={})

        assert response.status_code == 422


# ---------------------------------------------------------------------------
# Auth: GET /api/v1/auth/me
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestAuthMe:
    async def test_me_with_dev_token_returns_200(self) -> None:
        """GET /auth/me with dev-token returns the mock user profile."""
        async with await _client() as client:
            response = await client.get(f"{API}/auth/me", headers=AUTH_HEADERS)

        assert response.status_code == 200

    async def test_me_response_shape(self) -> None:
        """The /auth/me response contains all required profile fields."""
        async with await _client() as client:
            response = await client.get(f"{API}/auth/me", headers=AUTH_HEADERS)

        body = response.json()
        assert "id" in body
        assert "email" in body
        assert "name" in body
        assert "department" in body
        assert "access_level" in body

    async def test_me_returns_dev_user_email(self) -> None:
        """The email must match the mock dev user configured in auth.py."""
        async with await _client() as client:
            response = await client.get(f"{API}/auth/me", headers=AUTH_HEADERS)

        assert response.json()["email"] == "dev@example.com"

    async def test_me_without_auth_returns_401(self) -> None:
        """Requests without an Authorization header must be rejected."""
        async with await _client() as client:
            response = await client.get(f"{API}/auth/me")

        assert response.status_code == 401

    async def test_me_with_invalid_token_returns_401(self) -> None:
        """A Bearer token that is neither dev-token nor a valid JWT returns 401."""
        async with await _client() as client:
            response = await client.get(
                f"{API}/auth/me",
                headers={"Authorization": "Bearer totally-invalid"},
            )

        # The endpoint tries internal JWT then Google verification; both fail.
        assert response.status_code == 401


# ---------------------------------------------------------------------------
# Chat: POST /api/v1/chat
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestChat:
    async def test_chat_returns_200_with_mock_llm(self) -> None:
        """POST /chat with a mocked LLM returns a ChatResponse."""
        session_id = str(uuid.uuid4())

        db = _FakeSession(
            execute_results=[
                # chat_service.create_session -> flush gives UUID via side-effect
                # chat_service.add_message (user)
                # chat_service.add_message (assistant)
            ]
        )

        with (
            patch(
                "app.api.routes.chat.chat_service.create_session",
                new=AsyncMock(return_value=session_id),
            ),
            patch(
                "app.api.routes.chat.chat_service.add_message",
                new=AsyncMock(return_value=str(uuid.uuid4())),
            ),
            patch(
                "app.api.routes.chat.ClaudeService.generate",
                new=AsyncMock(return_value="Hello from the mock LLM!"),
            ),
        ):
            async with await _client(db) as client:
                response = await client.post(
                    f"{API}/chat",
                    json={"message": "What is the leave policy?"},
                    headers=AUTH_HEADERS,
                )

        assert response.status_code == 200
        body = response.json()
        assert body["message"] == "Hello from the mock LLM!"
        assert isinstance(body["sources"], list)
        assert "conversation_id" in body

    async def test_chat_creates_new_session_when_no_conversation_id(self) -> None:
        """A new session is created when conversation_id is omitted."""
        new_session_id = str(uuid.uuid4())
        create_session_mock = AsyncMock(return_value=new_session_id)

        with (
            patch(
                "app.api.routes.chat.chat_service.create_session",
                new=create_session_mock,
            ),
            patch(
                "app.api.routes.chat.chat_service.add_message",
                new=AsyncMock(return_value=str(uuid.uuid4())),
            ),
            patch(
                "app.api.routes.chat.ClaudeService.generate",
                new=AsyncMock(return_value="Hi there!"),
            ),
        ):
            async with await _client() as client:
                response = await client.post(
                    f"{API}/chat",
                    json={"message": "Hello"},
                    headers=AUTH_HEADERS,
                )

        assert response.status_code == 200
        create_session_mock.assert_awaited_once()
        assert response.json()["conversation_id"] == new_session_id

    async def test_chat_with_existing_conversation_id(self) -> None:
        """When a valid conversation_id is supplied the session is reused."""
        existing_id = str(uuid.uuid4())

        with (
            patch(
                "app.api.routes.chat.chat_service.session_belongs_to_user",
                new=AsyncMock(return_value=True),
            ),
            patch(
                "app.api.routes.chat.chat_service.get_session_context_messages",
                new=AsyncMock(return_value=[]),
            ),
            patch(
                "app.api.routes.chat.chat_service.add_message",
                new=AsyncMock(return_value=str(uuid.uuid4())),
            ),
            patch(
                "app.api.routes.chat.ClaudeService.generate",
                new=AsyncMock(return_value="Continued response"),
            ),
        ):
            async with await _client() as client:
                response = await client.post(
                    f"{API}/chat",
                    json={
                        "message": "Follow-up question",
                        "conversation_id": existing_id,
                    },
                    headers=AUTH_HEADERS,
                )

        assert response.status_code == 200
        assert response.json()["conversation_id"] == existing_id

    async def test_chat_404_for_unknown_conversation_id(self) -> None:
        """Using another user's or nonexistent conversation_id returns 404."""
        with patch(
            "app.api.routes.chat.chat_service.session_belongs_to_user",
            new=AsyncMock(return_value=False),
        ):
            async with await _client() as client:
                response = await client.post(
                    f"{API}/chat",
                    json={
                        "message": "Hello",
                        "conversation_id": str(uuid.uuid4()),
                    },
                    headers=AUTH_HEADERS,
                )

        assert response.status_code == 404

    async def test_chat_503_when_llm_unavailable(self) -> None:
        """LLMError propagates as a 503 Service Unavailable response."""
        from app.services.llm.claude_service import LLMError  # noqa: PLC0415

        with (
            patch(
                "app.api.routes.chat.chat_service.create_session",
                new=AsyncMock(return_value=str(uuid.uuid4())),
            ),
            patch(
                "app.api.routes.chat.chat_service.add_message",
                new=AsyncMock(return_value=str(uuid.uuid4())),
            ),
            patch(
                "app.api.routes.chat.ClaudeService.generate",
                new=AsyncMock(side_effect=LLMError("Upstream error")),
            ),
        ):
            async with await _client() as client:
                response = await client.post(
                    f"{API}/chat",
                    json={"message": "Will this fail?"},
                    headers=AUTH_HEADERS,
                )

        assert response.status_code == 503

    async def test_chat_requires_auth(self) -> None:
        """Unauthenticated POST /chat must return 401."""
        async with await _client() as client:
            response = await client.post(
                f"{API}/chat",
                json={"message": "Hello"},
            )

        assert response.status_code == 401

    async def test_chat_rejects_empty_message(self) -> None:
        """The message field has a min_length=1 constraint enforced by Pydantic."""
        async with await _client() as client:
            response = await client.post(
                f"{API}/chat",
                json={"message": ""},
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 422


# ---------------------------------------------------------------------------
# Chat: GET /api/v1/chat/sessions
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestChatSessions:
    async def test_list_sessions_returns_200(self) -> None:
        """GET /chat/sessions returns a 200 with a list payload."""
        mock_sessions = [
            {
                "id": str(uuid.uuid4()),
                "title": "What is the leave policy?",
                "updated_at": datetime.now(tz=UTC).isoformat(),
                "message_count": 4,
            },
            {
                "id": str(uuid.uuid4()),
                "title": "How do I submit expenses?",
                "updated_at": datetime.now(tz=UTC).isoformat(),
                "message_count": 2,
            },
        ]

        with patch(
            "app.api.routes.chat.chat_service.list_sessions",
            new=AsyncMock(return_value=mock_sessions),
        ):
            async with await _client() as client:
                response = await client.get(
                    f"{API}/chat/sessions",
                    headers=AUTH_HEADERS,
                )

        assert response.status_code == 200
        sessions = response.json()
        assert isinstance(sessions, list)
        assert len(sessions) == 2

    async def test_list_sessions_response_shape(self) -> None:
        """Each session summary contains id, title, updated_at, message_count."""
        mock_sessions = [
            {
                "id": str(uuid.uuid4()),
                "title": "Test session",
                "updated_at": datetime.now(tz=UTC).isoformat(),
                "message_count": 1,
            }
        ]

        with patch(
            "app.api.routes.chat.chat_service.list_sessions",
            new=AsyncMock(return_value=mock_sessions),
        ):
            async with await _client() as client:
                response = await client.get(
                    f"{API}/chat/sessions",
                    headers=AUTH_HEADERS,
                )

        session = response.json()[0]
        assert "id" in session
        assert "title" in session
        assert "updated_at" in session
        assert "message_count" in session

    async def test_list_sessions_returns_empty_list_when_none(self) -> None:
        """An empty list is valid when the user has no sessions yet."""
        with patch(
            "app.api.routes.chat.chat_service.list_sessions",
            new=AsyncMock(return_value=[]),
        ):
            async with await _client() as client:
                response = await client.get(
                    f"{API}/chat/sessions",
                    headers=AUTH_HEADERS,
                )

        assert response.status_code == 200
        assert response.json() == []

    async def test_list_sessions_requires_auth(self) -> None:
        """GET /chat/sessions without a token returns 401."""
        async with await _client() as client:
            response = await client.get(f"{API}/chat/sessions")

        assert response.status_code == 401


# ---------------------------------------------------------------------------
# Knowledge: POST /api/v1/knowledge/query
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestKnowledgeQuery:
    async def test_query_returns_200_with_direct_llm_fallback(self) -> None:
        """When Qdrant is unavailable the endpoint falls back to direct Claude."""
        # Ensure no Qdrant client is present on app.state so the RAG path
        # is skipped entirely and we hit the direct-Claude fallback.
        app.state.qdrant = None

        with patch(
            "app.api.routes.knowledge.ClaudeService.generate",
            new=AsyncMock(return_value="Here is an answer about leave policy."),
        ):
            async with await _client() as client:
                response = await client.post(
                    f"{API}/knowledge/query",
                    json={"query": "What is our leave policy?"},
                    headers=AUTH_HEADERS,
                )

        assert response.status_code == 200
        body = response.json()
        assert body["answer"] == "Here is an answer about leave policy."
        assert isinstance(body["sources"], list)
        assert "cached" in body

    async def test_query_response_contains_required_fields(self) -> None:
        """The QueryResponse shape includes answer, sources, and cached."""
        app.state.qdrant = None

        with patch(
            "app.api.routes.knowledge.ClaudeService.generate",
            new=AsyncMock(return_value="Some answer."),
        ):
            async with await _client() as client:
                response = await client.post(
                    f"{API}/knowledge/query",
                    json={"query": "Tell me about expenses"},
                    headers=AUTH_HEADERS,
                )

        body = response.json()
        assert "answer" in body
        assert "sources" in body
        assert "cached" in body

    async def test_query_with_rag_chunks_returns_grounded_answer(self) -> None:
        """When Qdrant returns chunks the LLM receives a grounded prompt.

        The RAG services (embedder, retriever) are imported lazily *inside* the
        route handler body (PLC0415 local imports), so they must be patched in
        their source modules rather than on the knowledge route module itself.
        ``settings.together_ai_api_key`` is patched via the config module so
        the ``if qdrant and settings.together_ai_api_key`` guard is satisfied.
        """
        fake_chunk = MagicMock()
        fake_chunk.content = "Employees are entitled to 15 days of annual leave."
        fake_chunk.metadata = {
            "title": "Leave Policy",
            "url": "https://notion.so/leave-policy",
            "updated_at": "2025-01-01",
        }

        # A non-None Qdrant client passes the truthiness check in the route.
        app.state.qdrant = MagicMock()
        # No Redis client so cache is skipped.
        app.state.redis = None

        mock_retriever = AsyncMock()
        mock_retriever.retrieve = AsyncMock(return_value=[fake_chunk])

        with (
            patch(
                "app.core.config.settings.together_ai_api_key",
                "fake-together-key",
            ),
            patch(
                "app.services.rag.embedder.TogetherEmbeddingService",
            ) as _embedder_cls,
            patch(
                "app.services.rag.retriever.QdrantRetrieverService",
                return_value=mock_retriever,
            ),
            patch(
                "app.api.routes.knowledge.ClaudeService.generate",
                new=AsyncMock(return_value="Based on [1], you get 15 days of annual leave."),
            ),
        ):
            async with await _client() as client:
                response = await client.post(
                    f"{API}/knowledge/query",
                    json={"query": "How many annual leave days do I get?"},
                    headers=AUTH_HEADERS,
                )

        assert response.status_code == 200
        body = response.json()
        assert isinstance(body["answer"], str)
        assert len(body["answer"]) > 0

    async def test_query_requires_auth(self) -> None:
        """POST /knowledge/query without auth returns 401."""
        async with await _client() as client:
            response = await client.post(
                f"{API}/knowledge/query",
                json={"query": "test"},
            )

        assert response.status_code == 401

    async def test_query_rejects_empty_query(self) -> None:
        """The query field has a min_length=1 constraint."""
        async with await _client() as client:
            response = await client.post(
                f"{API}/knowledge/query",
                json={"query": ""},
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 422

    async def test_query_rejects_missing_query_field(self) -> None:
        """A body without the query field returns a validation error."""
        async with await _client() as client:
            response = await client.post(
                f"{API}/knowledge/query",
                json={},
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 422


# ---------------------------------------------------------------------------
# Knowledge: GET /api/v1/knowledge/sources
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestKnowledgeSources:
    async def test_list_sources_returns_200(self) -> None:
        """GET /knowledge/sources returns HTTP 200."""
        # The endpoint queries Document grouped by source_type.
        # Return an empty result so the connector registry defaults apply.
        db = _FakeSession(execute_results=[_FakeResult(rows=[], scalar=None)])

        async with await _client(db) as client:
            response = await client.get(
                f"{API}/knowledge/sources",
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 200

    async def test_list_sources_returns_list(self) -> None:
        """The response must be a JSON array."""
        db = _FakeSession(execute_results=[_FakeResult(rows=[])])

        async with await _client(db) as client:
            response = await client.get(
                f"{API}/knowledge/sources",
                headers=AUTH_HEADERS,
            )

        assert isinstance(response.json(), list)

    async def test_list_sources_contains_all_connectors(self) -> None:
        """All three connectors (google_drive, telegram, notion) appear in the list."""
        db = _FakeSession(execute_results=[_FakeResult(rows=[])])

        async with await _client(db) as client:
            response = await client.get(
                f"{API}/knowledge/sources",
                headers=AUTH_HEADERS,
            )

        connector_ids = {src["id"] for src in response.json()}
        assert "google_drive" in connector_ids
        assert "telegram" in connector_ids
        assert "notion" in connector_ids

    async def test_list_sources_item_shape(self) -> None:
        """Each source item has id, label, status, document_count, last_synced_at."""
        db = _FakeSession(execute_results=[_FakeResult(rows=[])])

        async with await _client(db) as client:
            response = await client.get(
                f"{API}/knowledge/sources",
                headers=AUTH_HEADERS,
            )

        source = response.json()[0]
        assert "id" in source
        assert "label" in source
        assert "status" in source
        assert "document_count" in source
        assert "last_synced_at" in source

    async def test_list_sources_shows_zero_count_when_no_documents(self) -> None:
        """When the database has no documents the counts default to zero."""
        db = _FakeSession(execute_results=[_FakeResult(rows=[])])

        async with await _client(db) as client:
            response = await client.get(
                f"{API}/knowledge/sources",
                headers=AUTH_HEADERS,
            )

        for source in response.json():
            assert source["document_count"] == 0

    async def test_list_sources_requires_auth(self) -> None:
        """GET /knowledge/sources without auth returns 401."""
        async with await _client() as client:
            response = await client.get(f"{API}/knowledge/sources")

        assert response.status_code == 401


# ---------------------------------------------------------------------------
# Analytics: GET /api/v1/analytics/overview
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestAnalyticsOverview:
    async def test_overview_returns_200(self) -> None:
        """GET /analytics/overview returns HTTP 200 for authenticated users."""
        # Three sequential scalar results: queries_today, active_users, docs_this_week
        db = _FakeSession(
            execute_results=[
                _FakeResult(scalar=42),  # queries_today
                _FakeResult(scalar=10),  # active_users_today
                _FakeResult(scalar=5),  # documents_this_week
            ]
        )

        async with await _client(db) as client:
            response = await client.get(
                f"{API}/analytics/overview",
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 200

    async def test_overview_response_shape(self) -> None:
        """The overview has queries_today, active_users_today, docs_this_week, snapshot_at."""
        db = _FakeSession(
            execute_results=[
                _FakeResult(scalar=42),
                _FakeResult(scalar=10),
                _FakeResult(scalar=5),
            ]
        )

        async with await _client(db) as client:
            response = await client.get(
                f"{API}/analytics/overview",
                headers=AUTH_HEADERS,
            )

        body = response.json()
        assert "queries_today" in body
        assert "active_users_today" in body
        assert "documents_this_week" in body
        assert "snapshot_at" in body

    async def test_overview_returns_integer_counts(self) -> None:
        """Metric values must be integers, not floats or strings."""
        db = _FakeSession(
            execute_results=[
                _FakeResult(scalar=42),
                _FakeResult(scalar=10),
                _FakeResult(scalar=5),
            ]
        )

        async with await _client(db) as client:
            response = await client.get(
                f"{API}/analytics/overview",
                headers=AUTH_HEADERS,
            )

        body = response.json()
        assert isinstance(body["queries_today"], int)
        assert isinstance(body["active_users_today"], int)
        assert isinstance(body["documents_this_week"], int)

    async def test_overview_counts_match_db_values(self) -> None:
        """The response values must reflect what the database returns."""
        db = _FakeSession(
            execute_results=[
                _FakeResult(scalar=99),  # queries_today
                _FakeResult(scalar=7),  # active_users_today
                _FakeResult(scalar=3),  # documents_this_week
            ]
        )

        async with await _client(db) as client:
            response = await client.get(
                f"{API}/analytics/overview",
                headers=AUTH_HEADERS,
            )

        body = response.json()
        assert body["queries_today"] == 99
        assert body["active_users_today"] == 7
        assert body["documents_this_week"] == 3

    async def test_overview_defaults_to_zero_when_db_returns_none(self) -> None:
        """scalar_one() returning None must be coerced to zero."""
        db = _FakeSession(
            execute_results=[
                _FakeResult(scalar=None),
                _FakeResult(scalar=None),
                _FakeResult(scalar=None),
            ]
        )

        async with await _client(db) as client:
            response = await client.get(
                f"{API}/analytics/overview",
                headers=AUTH_HEADERS,
            )

        body = response.json()
        assert body["queries_today"] == 0
        assert body["active_users_today"] == 0
        assert body["documents_this_week"] == 0

    async def test_overview_requires_auth(self) -> None:
        """GET /analytics/overview without auth returns 401."""
        async with await _client() as client:
            response = await client.get(f"{API}/analytics/overview")

        assert response.status_code == 401


# ---------------------------------------------------------------------------
# Analytics: GET /api/v1/analytics/departments
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestAnalyticsDepartments:
    async def test_departments_returns_200(self) -> None:
        """GET /analytics/departments returns HTTP 200."""

        class _Row:
            def __init__(self, department: str, query_count: int) -> None:
                self.department = department
                self.query_count = query_count

        db = _FakeSession(
            execute_results=[
                _FakeResult(
                    rows=[
                        _Row("engineering", 30),
                        _Row("hr", 10),
                        _Row("Unassigned", 5),
                    ]
                )
            ]
        )

        async with await _client(db) as client:
            response = await client.get(
                f"{API}/analytics/departments",
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 200

    async def test_departments_response_is_list(self) -> None:
        """The departments endpoint returns a JSON array."""
        db = _FakeSession(execute_results=[_FakeResult(rows=[])])

        async with await _client(db) as client:
            response = await client.get(
                f"{API}/analytics/departments",
                headers=AUTH_HEADERS,
            )

        assert isinstance(response.json(), list)

    async def test_departments_item_shape(self) -> None:
        """Each department entry has 'department' and 'query_count' keys."""

        class _Row:
            department = "engineering"
            query_count = 15

        db = _FakeSession(execute_results=[_FakeResult(rows=[_Row()])])

        async with await _client(db) as client:
            response = await client.get(
                f"{API}/analytics/departments",
                headers=AUTH_HEADERS,
            )

        item = response.json()[0]
        assert "department" in item
        assert "query_count" in item

    async def test_departments_returns_correct_counts(self) -> None:
        """Row values must flow through to the JSON response unchanged."""

        class _Row:
            def __init__(self, department: str, query_count: int) -> None:
                self.department = department
                self.query_count = query_count

        db = _FakeSession(
            execute_results=[
                _FakeResult(
                    rows=[
                        _Row("engineering", 50),
                        _Row("sales", 20),
                    ]
                )
            ]
        )

        async with await _client(db) as client:
            response = await client.get(
                f"{API}/analytics/departments",
                headers=AUTH_HEADERS,
            )

        data = response.json()
        assert data[0]["department"] == "engineering"
        assert data[0]["query_count"] == 50
        assert data[1]["department"] == "sales"
        assert data[1]["query_count"] == 20

    async def test_departments_returns_empty_list_when_no_data(self) -> None:
        """No activity in the current week returns an empty array."""
        db = _FakeSession(execute_results=[_FakeResult(rows=[])])

        async with await _client(db) as client:
            response = await client.get(
                f"{API}/analytics/departments",
                headers=AUTH_HEADERS,
            )

        assert response.json() == []

    async def test_departments_requires_auth(self) -> None:
        """GET /analytics/departments without auth returns 401."""
        async with await _client() as client:
            response = await client.get(f"{API}/analytics/departments")

        assert response.status_code == 401


# ---------------------------------------------------------------------------
# Cross-cutting: internal JWT auth flow
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestInternalJwtAuth:
    """Verify that the internal JWT issued by /auth/token works on other endpoints."""

    async def test_internal_jwt_accepted_by_me_endpoint(self) -> None:
        """A JWT obtained from /auth/token can be used to call /auth/me."""
        # Step 1: Exchange dev-token for internal JWT
        async with await _client() as client:
            token_resp = await client.post(
                f"{API}/auth/token",
                json={"google_token": "dev-token"},
            )

        assert token_resp.status_code == 200
        internal_jwt = token_resp.json()["access_token"]

        # Step 2: Use the internal JWT to call /auth/me
        async with await _client() as client:
            me_resp = await client.get(
                f"{API}/auth/me",
                headers={"Authorization": f"Bearer {internal_jwt}"},
            )

        assert me_resp.status_code == 200
        assert me_resp.json()["email"] == "dev@example.com"

    async def test_internal_jwt_accepted_by_chat_sessions(self) -> None:
        """A JWT from /auth/token is valid for GET /chat/sessions."""
        # Obtain a real internal JWT
        async with await _client() as client:
            token_resp = await client.post(
                f"{API}/auth/token",
                json={"google_token": "dev-token"},
            )
        internal_jwt = token_resp.json()["access_token"]

        with patch(
            "app.api.routes.chat.chat_service.list_sessions",
            new=AsyncMock(return_value=[]),
        ):
            async with await _client() as client:
                response = await client.get(
                    f"{API}/chat/sessions",
                    headers={"Authorization": f"Bearer {internal_jwt}"},
                )

        assert response.status_code == 200
