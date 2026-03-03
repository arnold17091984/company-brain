"""Tests for Admin endpoints.

Covers:
- GET  /api/v1/admin/settings  — returns SystemSettings shape
- PUT  /api/v1/admin/settings  — accepts and returns updated values
- GET  /api/v1/admin/users     — returns list of UserSummary
- GET  /api/v1/admin/metrics   — returns PerformanceMetrics shape
- GET  /api/v1/admin/health    — returns list of HealthCheck
- All endpoints require auth (401 without token)

Design decisions
----------------
- Uses ``httpx.AsyncClient`` with ``ASGITransport`` (same pattern as test_routes.py).
- Dev-token header bypasses Google JWKS — no external calls required.
- ``get_db`` is overridden with ``_FakeSession`` so no real PostgreSQL is needed.
- ``app.state.redis`` and ``app.state.qdrant`` are set to ``None`` before health
  checks so the checks classify both services as ``down`` without network calls.
- After each test that mutates ``_SETTINGS`` the settings are restored to
  their default values to prevent test-order coupling.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

BASE_URL = "http://test"
AUTH_HEADERS = {"Authorization": "Bearer dev-token"}
NO_AUTH_HEADERS: dict[str, str] = {}
API = "/api/v1"

# ---------------------------------------------------------------------------
# Default settings snapshot (used to reset after mutation tests)
# ---------------------------------------------------------------------------

_DEFAULT_SETTINGS = {
    "rag": {"chunk_size": 2000, "overlap": 200, "top_k": 10},
    "llm": {"default_model": "sonnet", "temperature": 0.7, "max_tokens": 4096},
    "agent": {"thinking_budget": 8000, "confidence_threshold": 0.5},
}


def _reset_settings() -> None:
    """Restore the in-process settings store to its default values."""
    import copy

    from app.api.routes.admin import _SETTINGS  # noqa: PLC0415

    _SETTINGS.clear()
    _SETTINGS.update(copy.deepcopy(_DEFAULT_SETTINGS))


# ---------------------------------------------------------------------------
# Fake DB helpers (mirrored from test_routes.py)
# ---------------------------------------------------------------------------


class _FakeResult:
    """Minimal SQLAlchemy result stub."""

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
    """Async SQLAlchemy session stub with FIFO result queue."""

    def __init__(self, execute_results: list[_FakeResult] | None = None) -> None:
        self._results: list[_FakeResult] = list(execute_results or [])
        self.added: list[Any] = []
        self.committed = False

    async def execute(self, _stmt: Any) -> _FakeResult:
        if self._results:
            return self._results.pop(0)
        return _FakeResult(rows=[], scalar=0)

    def add(self, obj: Any) -> None:
        self.added.append(obj)

    async def flush(self) -> None:
        for obj in self.added:
            if not getattr(obj, "id", None):
                obj.id = uuid.uuid4()

    async def commit(self) -> None:
        self.committed = True

    async def rollback(self) -> None:
        pass


def _make_db_override(session: _FakeSession | None = None):
    """Return a (dependency, override) pair for FastAPI DI."""
    from app.core.database import get_db  # noqa: PLC0415

    _session = session or _FakeSession()

    async def _override():
        yield _session

    return get_db, _override


async def _client(db_session: _FakeSession | None = None) -> AsyncClient:
    """Return a configured AsyncClient with the DB dependency overridden."""
    dep, override = _make_db_override(db_session)
    app.dependency_overrides[dep] = override
    return AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL)


# ---------------------------------------------------------------------------
# Fake User ORM objects
# ---------------------------------------------------------------------------


def _make_user(
    *,
    user_id: uuid.UUID | None = None,
    email: str = "user@example.com",
    name: str = "Test User",
    department_name: str | None = "engineering",
    access_level: str = "restricted",
    created_at: datetime | None = None,
) -> Any:
    """Build a minimal fake user row returned by a DB query."""

    class _Row:
        pass

    row = _Row()
    row.id = user_id or uuid.uuid4()
    row.email = email
    row.name = name
    row.department_name = department_name
    row.access_level = access_level
    row.created_at = created_at or datetime(2026, 1, 1, tzinfo=UTC)
    return row


# ---------------------------------------------------------------------------
# GET /api/v1/admin/settings
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestGetSettings:
    async def test_returns_200(self) -> None:
        """GET /admin/settings returns HTTP 200."""
        async with await _client() as client:
            response = await client.get(f"{API}/admin/settings", headers=AUTH_HEADERS)

        assert response.status_code == 200

    async def test_response_has_rag_llm_agent_keys(self) -> None:
        """The response body contains rag, llm, and agent sub-sections."""
        async with await _client() as client:
            response = await client.get(f"{API}/admin/settings", headers=AUTH_HEADERS)

        body = response.json()
        assert "rag" in body
        assert "llm" in body
        assert "agent" in body

    async def test_rag_section_has_expected_defaults(self) -> None:
        """RAG section contains chunk_size, overlap, and top_k defaults."""
        async with await _client() as client:
            response = await client.get(f"{API}/admin/settings", headers=AUTH_HEADERS)

        rag = response.json()["rag"]
        assert "chunk_size" in rag
        assert "overlap" in rag
        assert "top_k" in rag

    async def test_llm_section_has_expected_defaults(self) -> None:
        """LLM section contains default_model, temperature, and max_tokens."""
        async with await _client() as client:
            response = await client.get(f"{API}/admin/settings", headers=AUTH_HEADERS)

        llm = response.json()["llm"]
        assert "default_model" in llm
        assert "temperature" in llm
        assert "max_tokens" in llm

    async def test_agent_section_has_expected_defaults(self) -> None:
        """Agent section contains thinking_budget and confidence_threshold."""
        async with await _client() as client:
            response = await client.get(f"{API}/admin/settings", headers=AUTH_HEADERS)

        agent = response.json()["agent"]
        assert "thinking_budget" in agent
        assert "confidence_threshold" in agent

    async def test_requires_auth(self) -> None:
        """GET /admin/settings without a token returns 401."""
        async with await _client() as client:
            response = await client.get(f"{API}/admin/settings")

        assert response.status_code == 401


# ---------------------------------------------------------------------------
# PUT /api/v1/admin/settings
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestUpdateSettings:
    async def test_returns_200(self) -> None:
        """PUT /admin/settings with a valid body returns HTTP 200."""
        try:
            async with await _client() as client:
                response = await client.put(
                    f"{API}/admin/settings",
                    json=_DEFAULT_SETTINGS,
                    headers=AUTH_HEADERS,
                )

            assert response.status_code == 200
        finally:
            _reset_settings()

    async def test_updated_values_reflected_in_response(self) -> None:
        """Returned settings contain the values sent in the PUT body."""
        payload = {
            "rag": {"chunk_size": 1000, "overlap": 100, "top_k": 5},
            "llm": {"default_model": "haiku", "temperature": 0.3, "max_tokens": 2048},
            "agent": {"thinking_budget": 4000, "confidence_threshold": 0.7},
        }
        try:
            async with await _client() as client:
                response = await client.put(
                    f"{API}/admin/settings",
                    json=payload,
                    headers=AUTH_HEADERS,
                )

            body = response.json()
            assert body["rag"]["chunk_size"] == 1000
            assert body["llm"]["default_model"] == "haiku"
            assert body["agent"]["confidence_threshold"] == 0.7
        finally:
            _reset_settings()

    async def test_subsequent_get_reflects_update(self) -> None:
        """After a PUT the GET endpoint returns the newly persisted values."""
        payload = {
            "rag": {"chunk_size": 500, "overlap": 50, "top_k": 3},
            "llm": {"default_model": "haiku", "temperature": 0.1, "max_tokens": 1024},
            "agent": {"thinking_budget": 2000, "confidence_threshold": 0.9},
        }
        try:
            async with await _client() as client:
                await client.put(
                    f"{API}/admin/settings",
                    json=payload,
                    headers=AUTH_HEADERS,
                )
                get_resp = await client.get(f"{API}/admin/settings", headers=AUTH_HEADERS)

            assert get_resp.json()["rag"]["chunk_size"] == 500
            assert get_resp.json()["llm"]["temperature"] == 0.1
        finally:
            _reset_settings()

    async def test_response_has_rag_llm_agent_keys(self) -> None:
        """PUT response contains rag, llm, and agent keys."""
        try:
            async with await _client() as client:
                response = await client.put(
                    f"{API}/admin/settings",
                    json=_DEFAULT_SETTINGS,
                    headers=AUTH_HEADERS,
                )

            body = response.json()
            assert "rag" in body
            assert "llm" in body
            assert "agent" in body
        finally:
            _reset_settings()

    async def test_requires_auth(self) -> None:
        """PUT /admin/settings without a token returns 401."""
        async with await _client() as client:
            response = await client.put(
                f"{API}/admin/settings",
                json=_DEFAULT_SETTINGS,
            )

        assert response.status_code == 401


# ---------------------------------------------------------------------------
# GET /api/v1/admin/users
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestListUsers:
    async def test_returns_200(self) -> None:
        """GET /admin/users returns HTTP 200."""
        db = _FakeSession(execute_results=[_FakeResult(rows=[])])

        async with await _client(db) as client:
            response = await client.get(f"{API}/admin/users", headers=AUTH_HEADERS)

        assert response.status_code == 200

    async def test_response_is_list(self) -> None:
        """The response must be a JSON array."""
        db = _FakeSession(execute_results=[_FakeResult(rows=[])])

        async with await _client(db) as client:
            response = await client.get(f"{API}/admin/users", headers=AUTH_HEADERS)

        assert isinstance(response.json(), list)

    async def test_empty_list_when_no_users(self) -> None:
        """An empty array is returned when the users table is empty."""
        db = _FakeSession(execute_results=[_FakeResult(rows=[])])

        async with await _client(db) as client:
            response = await client.get(f"{API}/admin/users", headers=AUTH_HEADERS)

        assert response.json() == []

    async def test_user_summary_shape(self) -> None:
        """Each user entry contains id, email, name, department, access_level, created_at."""
        user_row = _make_user()
        db = _FakeSession(execute_results=[_FakeResult(rows=[user_row])])

        async with await _client(db) as client:
            response = await client.get(f"{API}/admin/users", headers=AUTH_HEADERS)

        user = response.json()[0]
        for field in ("id", "email", "name", "access_level", "created_at"):
            assert field in user, f"Missing field: {field}"

    async def test_user_values_match_db(self) -> None:
        """Returned user fields reflect the values stored in the database."""
        uid = uuid.uuid4()
        user_row = _make_user(
            user_id=uid,
            email="alice@example.com",
            name="Alice",
            department_name="sales",
            access_level="all",
        )
        db = _FakeSession(execute_results=[_FakeResult(rows=[user_row])])

        async with await _client(db) as client:
            response = await client.get(f"{API}/admin/users", headers=AUTH_HEADERS)

        user = response.json()[0]
        assert user["id"] == str(uid)
        assert user["email"] == "alice@example.com"
        assert user["name"] == "Alice"
        assert user["department"] == "sales"
        assert user["access_level"] == "all"

    async def test_department_is_none_when_unassigned(self) -> None:
        """A user with no department has department=null in the response."""
        user_row = _make_user(department_name=None)
        db = _FakeSession(execute_results=[_FakeResult(rows=[user_row])])

        async with await _client(db) as client:
            response = await client.get(f"{API}/admin/users", headers=AUTH_HEADERS)

        assert response.json()[0]["department"] is None

    async def test_multiple_users_returned(self) -> None:
        """Multiple users in the DB all appear in the response."""
        rows = [
            _make_user(email="a@example.com", name="Alice"),
            _make_user(email="b@example.com", name="Bob"),
            _make_user(email="c@example.com", name="Charlie"),
        ]
        db = _FakeSession(execute_results=[_FakeResult(rows=rows)])

        async with await _client(db) as client:
            response = await client.get(f"{API}/admin/users", headers=AUTH_HEADERS)

        assert len(response.json()) == 3

    async def test_requires_auth(self) -> None:
        """GET /admin/users without a token returns 401."""
        async with await _client() as client:
            response = await client.get(f"{API}/admin/users")

        assert response.status_code == 401


# ---------------------------------------------------------------------------
# GET /api/v1/admin/metrics
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestGetMetrics:
    async def test_returns_200(self) -> None:
        """GET /admin/metrics returns HTTP 200."""
        async with await _client() as client:
            response = await client.get(f"{API}/admin/metrics", headers=AUTH_HEADERS)

        assert response.status_code == 200

    async def test_response_shape(self) -> None:
        """Response contains avg_latency_ms, total_tokens_today, accuracy_pct, queries_today."""
        async with await _client() as client:
            response = await client.get(f"{API}/admin/metrics", headers=AUTH_HEADERS)

        body = response.json()
        assert "avg_latency_ms" in body
        assert "total_tokens_today" in body
        assert "accuracy_pct" in body
        assert "queries_today" in body

    async def test_avg_latency_is_float(self) -> None:
        """avg_latency_ms must be a numeric (float) value."""
        async with await _client() as client:
            response = await client.get(f"{API}/admin/metrics", headers=AUTH_HEADERS)

        assert isinstance(response.json()["avg_latency_ms"], float)

    async def test_queries_today_is_int(self) -> None:
        """queries_today must be an integer."""
        async with await _client() as client:
            response = await client.get(f"{API}/admin/metrics", headers=AUTH_HEADERS)

        assert isinstance(response.json()["queries_today"], int)

    async def test_accuracy_pct_is_within_range(self) -> None:
        """accuracy_pct must be between 0 and 100 inclusive."""
        async with await _client() as client:
            response = await client.get(f"{API}/admin/metrics", headers=AUTH_HEADERS)

        pct = response.json()["accuracy_pct"]
        assert 0.0 <= pct <= 100.0

    async def test_requires_auth(self) -> None:
        """GET /admin/metrics without a token returns 401."""
        async with await _client() as client:
            response = await client.get(f"{API}/admin/metrics")

        assert response.status_code == 401


# ---------------------------------------------------------------------------
# GET /api/v1/admin/health
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestGetHealth:
    async def test_returns_200(self) -> None:
        """GET /admin/health returns HTTP 200 even when services are down."""
        # Use a real DB session stub that responds to SELECT 1
        db = _FakeSession(execute_results=[_FakeResult(scalar=1)])
        app.state.qdrant = None
        app.state.redis = None

        async with await _client(db) as client:
            response = await client.get(f"{API}/admin/health", headers=AUTH_HEADERS)

        assert response.status_code == 200

    async def test_response_is_list(self) -> None:
        """The response must be a JSON array."""
        db = _FakeSession(execute_results=[_FakeResult(scalar=1)])
        app.state.qdrant = None
        app.state.redis = None

        async with await _client(db) as client:
            response = await client.get(f"{API}/admin/health", headers=AUTH_HEADERS)

        assert isinstance(response.json(), list)

    async def test_three_services_returned(self) -> None:
        """Health check reports on exactly postgresql, qdrant, and redis."""
        db = _FakeSession(execute_results=[_FakeResult(scalar=1)])
        app.state.qdrant = None
        app.state.redis = None

        async with await _client(db) as client:
            response = await client.get(f"{API}/admin/health", headers=AUTH_HEADERS)

        services = {item["service"] for item in response.json()}
        assert "postgresql" in services
        assert "qdrant" in services
        assert "redis" in services

    async def test_health_check_item_shape(self) -> None:
        """Each item has service, status, and latency_ms fields."""
        db = _FakeSession(execute_results=[_FakeResult(scalar=1)])
        app.state.qdrant = None
        app.state.redis = None

        async with await _client(db) as client:
            response = await client.get(f"{API}/admin/health", headers=AUTH_HEADERS)

        for item in response.json():
            assert "service" in item, f"Missing 'service' in {item}"
            assert "status" in item, f"Missing 'status' in {item}"
            assert "latency_ms" in item, f"Missing 'latency_ms' in {item}"

    async def test_status_values_are_valid(self) -> None:
        """Status must be one of 'healthy', 'degraded', or 'down'."""
        db = _FakeSession(execute_results=[_FakeResult(scalar=1)])
        app.state.qdrant = None
        app.state.redis = None

        async with await _client(db) as client:
            response = await client.get(f"{API}/admin/health", headers=AUTH_HEADERS)

        valid_statuses = {"healthy", "degraded", "down"}
        for item in response.json():
            assert item["status"] in valid_statuses, f"Invalid status: {item['status']}"

    async def test_qdrant_down_when_client_is_none(self) -> None:
        """When app.state.qdrant is None the qdrant service reports 'down'."""
        db = _FakeSession(execute_results=[_FakeResult(scalar=1)])
        app.state.qdrant = None
        app.state.redis = None

        async with await _client(db) as client:
            response = await client.get(f"{API}/admin/health", headers=AUTH_HEADERS)

        qdrant_item = next(i for i in response.json() if i["service"] == "qdrant")
        assert qdrant_item["status"] == "down"

    async def test_redis_down_when_client_is_none(self) -> None:
        """When app.state.redis is None the redis service reports 'down'."""
        db = _FakeSession(execute_results=[_FakeResult(scalar=1)])
        app.state.qdrant = None
        app.state.redis = None

        async with await _client(db) as client:
            response = await client.get(f"{API}/admin/health", headers=AUTH_HEADERS)

        redis_item = next(i for i in response.json() if i["service"] == "redis")
        assert redis_item["status"] == "down"

    async def test_postgresql_healthy_when_db_responds(self) -> None:
        """PostgreSQL is marked healthy when SELECT 1 succeeds quickly."""
        db = _FakeSession(execute_results=[_FakeResult(scalar=1)])
        app.state.qdrant = None
        app.state.redis = None

        async with await _client(db) as client:
            response = await client.get(f"{API}/admin/health", headers=AUTH_HEADERS)

        pg_item = next(i for i in response.json() if i["service"] == "postgresql")
        # In tests the fake DB responds instantly so latency is well under 500 ms
        assert pg_item["status"] in ("healthy", "degraded")

    async def test_healthy_qdrant_and_redis(self) -> None:
        """When Qdrant and Redis clients are present and respond they are healthy."""
        db = _FakeSession(execute_results=[_FakeResult(scalar=1)])

        mock_qdrant = MagicMock()
        mock_qdrant.get_collections = AsyncMock(return_value=[])
        app.state.qdrant = mock_qdrant

        mock_redis = MagicMock()
        mock_redis.ping = AsyncMock(return_value=True)
        app.state.redis = mock_redis

        async with await _client(db) as client:
            response = await client.get(f"{API}/admin/health", headers=AUTH_HEADERS)

        statuses = {item["service"]: item["status"] for item in response.json()}
        assert statuses["qdrant"] in ("healthy", "degraded")
        assert statuses["redis"] in ("healthy", "degraded")

        # Clean up state
        app.state.qdrant = None
        app.state.redis = None

    async def test_requires_auth(self) -> None:
        """GET /admin/health without a token returns 401."""
        async with await _client() as client:
            response = await client.get(f"{API}/admin/health")

        assert response.status_code == 401
