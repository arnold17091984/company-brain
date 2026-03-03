"""Tests for Phase 3 AI Agent Dashboard analytics endpoints.

Covers:
- GET /api/v1/analytics/clusters
- GET /api/v1/analytics/recommendations
- GET /api/v1/analytics/ingestion-status
- GET /api/v1/analytics/logs

Uses the same ``_FakeSession`` / ``_FakeResult`` mock pattern established in
``test_routes.py`` so no live database is required.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

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
# Shared fake DB session (mirrors test_routes.py)
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
    """Async SQLAlchemy session stub.

    ``execute_results`` is a FIFO queue of ``_FakeResult`` objects.  When the
    queue is exhausted every subsequent call returns an empty ``_FakeResult``.
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


async def _client(db_session: _FakeSession | None = None) -> AsyncClient:
    """Return an AsyncClient wired to the ASGI app with ``get_db`` overridden."""
    dep, override = _make_db_override(db_session)
    app.dependency_overrides[dep] = override
    return AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL)


# ---------------------------------------------------------------------------
# Row stubs for complex query results
# ---------------------------------------------------------------------------


class _MessageRow:
    """Stub for a ChatMessage.content scalar row."""

    def __init__(self, content: str) -> None:
        self._content = content

    def __getitem__(self, idx: int) -> str:
        return self._content


class _SessionMessageRow:
    """Stub for (session_id, role, content) rows returned by the recommendations query."""

    def __init__(self, session_id: Any, role: str, content: str) -> None:
        self.session_id = session_id
        self.role = role
        self.content = content

    def __iter__(self):
        return iter((self.session_id, self.role, self.content))


class _DocumentRow:
    """Stub for (source_type, document_count, last_synced_at) rows."""

    def __init__(
        self,
        source_type: str,
        document_count: int,
        last_synced_at: datetime | None = None,
    ) -> None:
        self.source_type = source_type
        self.document_count = document_count
        self.last_synced_at = last_synced_at


class _LogRow:
    """Stub for AuditLog rows joined with User."""

    def __init__(
        self,
        log_id: uuid.UUID,
        user_email: str,
        action: str,
        query: str | None,
        created_at: datetime,
        metadata_: dict,
    ) -> None:
        self.id = log_id
        self.user_email = user_email
        self.action = action
        self.query = query
        self.created_at = created_at
        self.metadata_ = metadata_


# ---------------------------------------------------------------------------
# GET /api/v1/analytics/clusters
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestQuestionClusters:
    async def test_clusters_returns_200(self) -> None:
        """GET /analytics/clusters returns HTTP 200 for authenticated users."""
        db = _FakeSession(execute_results=[_FakeResult(rows=[])])

        async with await _client(db) as client:
            response = await client.get(f"{API}/analytics/clusters", headers=AUTH_HEADERS)

        assert response.status_code == 200

    async def test_clusters_returns_list(self) -> None:
        """The response body is a JSON array."""
        db = _FakeSession(execute_results=[_FakeResult(rows=[])])

        async with await _client(db) as client:
            response = await client.get(f"{API}/analytics/clusters", headers=AUTH_HEADERS)

        assert isinstance(response.json(), list)

    async def test_clusters_response_shape(self) -> None:
        """Each cluster entry has label, count and sample_queries."""
        # Provide enough identical queries so they form a cluster.
        messages = [_MessageRow("what is the leave policy") for _ in range(5)]
        db = _FakeSession(execute_results=[_FakeResult(rows=messages)])

        async with await _client(db) as client:
            response = await client.get(f"{API}/analytics/clusters", headers=AUTH_HEADERS)

        assert response.status_code == 200
        clusters = response.json()
        assert len(clusters) > 0
        cluster = clusters[0]
        assert "label" in cluster
        assert "count" in cluster
        assert "sample_queries" in cluster

    async def test_clusters_count_reflects_message_volume(self) -> None:
        """The cluster count matches the number of messages sharing the same keyword."""
        messages = [_MessageRow("how do I submit expense report") for _ in range(7)]
        db = _FakeSession(execute_results=[_FakeResult(rows=messages)])

        async with await _client(db) as client:
            response = await client.get(f"{API}/analytics/clusters", headers=AUTH_HEADERS)

        clusters = response.json()
        assert len(clusters) > 0
        # All 7 messages share the same dominant keyword
        assert clusters[0]["count"] == 7

    async def test_clusters_sample_queries_capped_at_three(self) -> None:
        """sample_queries contains at most 3 entries per cluster."""
        messages = [_MessageRow("leave policy details") for _ in range(10)]
        db = _FakeSession(execute_results=[_FakeResult(rows=messages)])

        async with await _client(db) as client:
            response = await client.get(f"{API}/analytics/clusters", headers=AUTH_HEADERS)

        clusters = response.json()
        for cluster in clusters:
            assert len(cluster["sample_queries"]) <= 3

    async def test_clusters_empty_when_no_messages(self) -> None:
        """No messages in the window returns an empty cluster list."""
        db = _FakeSession(execute_results=[_FakeResult(rows=[])])

        async with await _client(db) as client:
            response = await client.get(f"{API}/analytics/clusters", headers=AUTH_HEADERS)

        assert response.json() == []

    async def test_clusters_requires_auth(self) -> None:
        """GET /analytics/clusters without auth returns 401."""
        async with await _client() as client:
            response = await client.get(f"{API}/analytics/clusters")

        assert response.status_code == 401


# ---------------------------------------------------------------------------
# GET /api/v1/analytics/recommendations
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestDocumentRecommendations:
    async def test_recommendations_returns_200(self) -> None:
        """GET /analytics/recommendations returns HTTP 200."""
        db = _FakeSession(execute_results=[_FakeResult(rows=[])])

        async with await _client(db) as client:
            response = await client.get(f"{API}/analytics/recommendations", headers=AUTH_HEADERS)

        assert response.status_code == 200

    async def test_recommendations_returns_list(self) -> None:
        """The response body is a JSON array."""
        db = _FakeSession(execute_results=[_FakeResult(rows=[])])

        async with await _client(db) as client:
            response = await client.get(f"{API}/analytics/recommendations", headers=AUTH_HEADERS)

        assert isinstance(response.json(), list)

    async def test_recommendations_response_shape(self) -> None:
        """Each recommendation has topic, query_count and priority."""
        sid = uuid.uuid4()
        rows = [
            _SessionMessageRow(sid, "user", "how to request overtime pay"),
            _SessionMessageRow(sid, "assistant", "The answer was not found in the knowledge base."),
        ]
        db = _FakeSession(execute_results=[_FakeResult(rows=rows)])

        async with await _client(db) as client:
            response = await client.get(f"{API}/analytics/recommendations", headers=AUTH_HEADERS)

        recs = response.json()
        assert len(recs) > 0
        rec = recs[0]
        assert "topic" in rec
        assert "query_count" in rec
        assert "priority" in rec

    async def test_recommendations_priority_values_are_valid(self) -> None:
        """Priority must be one of high, medium, or low."""
        valid_priorities = {"high", "medium", "low"}
        # Generate 6 identical unanswered queries to trigger "high" priority.
        rows: list[_SessionMessageRow] = []
        for _ in range(6):
            s = uuid.uuid4()
            rows.append(_SessionMessageRow(s, "user", "overtime policy request"))
            rows.append(
                _SessionMessageRow(
                    s,
                    "assistant",
                    "I could not find this information in the knowledge base.",
                )
            )
        # Add one medium-priority gap (2 occurrences).
        for _ in range(2):
            s = uuid.uuid4()
            rows.append(_SessionMessageRow(s, "user", "health insurance coverage details"))
            rows.append(
                _SessionMessageRow(s, "assistant", "No information found in the company documents.")
            )
        db = _FakeSession(execute_results=[_FakeResult(rows=rows)])

        async with await _client(db) as client:
            response = await client.get(f"{API}/analytics/recommendations", headers=AUTH_HEADERS)

        for rec in response.json():
            assert rec["priority"] in valid_priorities

    async def test_recommendations_empty_when_no_unanswered_queries(self) -> None:
        """When all queries returned answers, recommendations is an empty list."""
        sid = uuid.uuid4()
        rows = [
            _SessionMessageRow(sid, "user", "what is the leave policy"),
            _SessionMessageRow(sid, "assistant", "You are entitled to 15 days of annual leave."),
        ]
        db = _FakeSession(execute_results=[_FakeResult(rows=rows)])

        async with await _client(db) as client:
            response = await client.get(f"{API}/analytics/recommendations", headers=AUTH_HEADERS)

        assert response.json() == []

    async def test_recommendations_empty_when_no_messages(self) -> None:
        """An empty message table returns an empty recommendations list."""
        db = _FakeSession(execute_results=[_FakeResult(rows=[])])

        async with await _client(db) as client:
            response = await client.get(f"{API}/analytics/recommendations", headers=AUTH_HEADERS)

        assert response.json() == []

    async def test_recommendations_requires_auth(self) -> None:
        """GET /analytics/recommendations without auth returns 401."""
        async with await _client() as client:
            response = await client.get(f"{API}/analytics/recommendations")

        assert response.status_code == 401


# ---------------------------------------------------------------------------
# GET /api/v1/analytics/ingestion-status
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestIngestionStatus:
    async def test_ingestion_status_returns_200(self) -> None:
        """GET /analytics/ingestion-status returns HTTP 200."""
        db = _FakeSession(execute_results=[_FakeResult(rows=[])])

        async with await _client(db) as client:
            response = await client.get(f"{API}/analytics/ingestion-status", headers=AUTH_HEADERS)

        assert response.status_code == 200

    async def test_ingestion_status_returns_list(self) -> None:
        """The response body is a JSON array."""
        db = _FakeSession(execute_results=[_FakeResult(rows=[])])

        async with await _client(db) as client:
            response = await client.get(f"{API}/analytics/ingestion-status", headers=AUTH_HEADERS)

        assert isinstance(response.json(), list)

    async def test_ingestion_status_contains_all_connectors(self) -> None:
        """All three connectors always appear in the response."""
        db = _FakeSession(execute_results=[_FakeResult(rows=[])])

        async with await _client(db) as client:
            response = await client.get(f"{API}/analytics/ingestion-status", headers=AUTH_HEADERS)

        connector_names = {item["connector"] for item in response.json()}
        assert "google_drive" in connector_names
        assert "telegram" in connector_names
        assert "notion" in connector_names

    async def test_ingestion_status_response_shape(self) -> None:
        """Each connector entry has the expected fields."""
        db = _FakeSession(execute_results=[_FakeResult(rows=[])])

        async with await _client(db) as client:
            response = await client.get(f"{API}/analytics/ingestion-status", headers=AUTH_HEADERS)

        item = response.json()[0]
        assert "connector" in item
        assert "status" in item
        assert "document_count" in item
        assert "last_synced" in item

    async def test_ingestion_status_active_when_documents_present(self) -> None:
        """A connector with at least one document is marked 'active'."""
        now = datetime.now(tz=UTC)
        rows = [_DocumentRow("google_drive", 10, now)]
        db = _FakeSession(execute_results=[_FakeResult(rows=rows)])

        async with await _client(db) as client:
            response = await client.get(f"{API}/analytics/ingestion-status", headers=AUTH_HEADERS)

        by_connector = {item["connector"]: item for item in response.json()}
        assert by_connector["google_drive"]["status"] == "active"
        assert by_connector["google_drive"]["document_count"] == 10
        assert by_connector["google_drive"]["last_synced"] is not None

    async def test_ingestion_status_inactive_when_no_documents(self) -> None:
        """All connectors are 'inactive' when the documents table is empty."""
        db = _FakeSession(execute_results=[_FakeResult(rows=[])])

        async with await _client(db) as client:
            response = await client.get(f"{API}/analytics/ingestion-status", headers=AUTH_HEADERS)

        for item in response.json():
            assert item["status"] == "inactive"
            assert item["document_count"] == 0

    async def test_ingestion_status_requires_auth(self) -> None:
        """GET /analytics/ingestion-status without auth returns 401."""
        async with await _client() as client:
            response = await client.get(f"{API}/analytics/ingestion-status")

        assert response.status_code == 401


# ---------------------------------------------------------------------------
# GET /api/v1/analytics/logs
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestAgentLogs:
    async def test_logs_returns_200(self) -> None:
        """GET /analytics/logs returns HTTP 200."""
        db = _FakeSession(
            execute_results=[
                _FakeResult(scalar=0),  # count query
                _FakeResult(rows=[]),  # paginated rows
            ]
        )

        async with await _client(db) as client:
            response = await client.get(f"{API}/analytics/logs", headers=AUTH_HEADERS)

        assert response.status_code == 200

    async def test_logs_response_shape(self) -> None:
        """The response has logs, total, page and page_size fields."""
        db = _FakeSession(
            execute_results=[
                _FakeResult(scalar=0),
                _FakeResult(rows=[]),
            ]
        )

        async with await _client(db) as client:
            response = await client.get(f"{API}/analytics/logs", headers=AUTH_HEADERS)

        body = response.json()
        assert "logs" in body
        assert "total" in body
        assert "page" in body
        assert "page_size" in body

    async def test_logs_default_pagination(self) -> None:
        """Default page is 1 and default page_size is 50."""
        db = _FakeSession(
            execute_results=[
                _FakeResult(scalar=0),
                _FakeResult(rows=[]),
            ]
        )

        async with await _client(db) as client:
            response = await client.get(f"{API}/analytics/logs", headers=AUTH_HEADERS)

        body = response.json()
        assert body["page"] == 1
        assert body["page_size"] == 50

    async def test_logs_custom_pagination_params(self) -> None:
        """Custom page and page_size query params are reflected in the response."""
        db = _FakeSession(
            execute_results=[
                _FakeResult(scalar=200),
                _FakeResult(rows=[]),
            ]
        )

        async with await _client(db) as client:
            response = await client.get(
                f"{API}/analytics/logs",
                params={"page": 3, "page_size": 20},
                headers=AUTH_HEADERS,
            )

        body = response.json()
        assert body["page"] == 3
        assert body["page_size"] == 20

    async def test_logs_total_reflects_db_count(self) -> None:
        """The total field mirrors the count returned by the database."""
        db = _FakeSession(
            execute_results=[
                _FakeResult(scalar=123),
                _FakeResult(rows=[]),
            ]
        )

        async with await _client(db) as client:
            response = await client.get(f"{API}/analytics/logs", headers=AUTH_HEADERS)

        assert response.json()["total"] == 123

    async def test_logs_entry_shape(self) -> None:
        """Each log entry contains all required fields."""
        log_id = uuid.uuid4()
        now = datetime.now(tz=UTC)
        rows = [
            _LogRow(
                log_id=log_id,
                user_email="alice@example.com",
                action="knowledge_query",
                query="What is the leave policy?",
                created_at=now,
                metadata_={"model": "claude-sonnet-4-6"},
            )
        ]
        db = _FakeSession(
            execute_results=[
                _FakeResult(scalar=1),
                _FakeResult(rows=rows),
            ]
        )

        async with await _client(db) as client:
            response = await client.get(f"{API}/analytics/logs", headers=AUTH_HEADERS)

        entry = response.json()["logs"][0]
        assert "id" in entry
        assert "user_email" in entry
        assert "action" in entry
        assert "query" in entry
        assert "created_at" in entry
        assert "metadata" in entry

    async def test_logs_entry_values_match_db(self) -> None:
        """Log entry values faithfully represent the database row."""
        log_id = uuid.uuid4()
        now = datetime.now(tz=UTC)
        rows = [
            _LogRow(
                log_id=log_id,
                user_email="bob@example.com",
                action="document_upload",
                query=None,
                created_at=now,
                metadata_={"file": "report.pdf"},
            )
        ]
        db = _FakeSession(
            execute_results=[
                _FakeResult(scalar=1),
                _FakeResult(rows=rows),
            ]
        )

        async with await _client(db) as client:
            response = await client.get(f"{API}/analytics/logs", headers=AUTH_HEADERS)

        entry = response.json()["logs"][0]
        assert entry["id"] == str(log_id)
        assert entry["user_email"] == "bob@example.com"
        assert entry["action"] == "document_upload"
        assert entry["query"] is None
        assert entry["metadata"] == {"file": "report.pdf"}

    async def test_logs_empty_when_no_audit_entries(self) -> None:
        """An empty audit_logs table returns an empty logs list."""
        db = _FakeSession(
            execute_results=[
                _FakeResult(scalar=0),
                _FakeResult(rows=[]),
            ]
        )

        async with await _client(db) as client:
            response = await client.get(f"{API}/analytics/logs", headers=AUTH_HEADERS)

        body = response.json()
        assert body["logs"] == []
        assert body["total"] == 0

    async def test_logs_requires_auth(self) -> None:
        """GET /analytics/logs without auth returns 401."""
        async with await _client() as client:
            response = await client.get(f"{API}/analytics/logs")

        assert response.status_code == 401

    async def test_logs_invalid_page_returns_422(self) -> None:
        """page=0 violates ge=1 constraint and returns 422."""
        async with await _client() as client:
            response = await client.get(
                f"{API}/analytics/logs",
                params={"page": 0},
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 422
