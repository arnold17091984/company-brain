"""Tests for AI Template Market endpoints.

Covers:
- GET  /api/v1/templates           - list templates (pagination, sort, filters)
- POST /api/v1/templates           - create template (any authenticated user)
- GET  /api/v1/templates/{id}      - get single template
- PUT  /api/v1/templates/{id}      - update template (owner only)
- DELETE /api/v1/templates/{id}    - delete template (owner or admin)
- POST /api/v1/templates/{id}/vote - vote/unvote toggle
- POST /api/v1/templates/{id}/copy - increment copy count

Design decisions
----------------
- Uses httpx.AsyncClient with ASGITransport.
- dev-token maps to an admin user (role=admin, id=00000000-0000-0000-0000-000000000001).
- _FakeSession is used instead of a real database.
- ORM template objects are plain Python objects with the attributes the route
  handlers need.  The ``user`` relationship must be pre-populated because the
  handlers rely on ``selectinload(PromptTemplate.user)``.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any
from unittest.mock import MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

BASE_URL = "http://test"
AUTH_HEADERS = {"Authorization": "Bearer dev-token"}
API = "/api/v1"

# The dev-token user id (matches auth.py _MOCK_USER)
DEV_USER_ID = "00000000-0000-0000-0000-000000000001"

# ---------------------------------------------------------------------------
# Fake DB helpers
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
        self.deleted: list[Any] = []
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
            if not getattr(obj, "created_at", None):
                obj.created_at = datetime.now(tz=UTC)
            if not getattr(obj, "updated_at", None):
                obj.updated_at = datetime.now(tz=UTC)

    async def delete(self, obj: Any) -> None:
        self.deleted.append(obj)

    async def commit(self) -> None:
        self.committed = True

    async def rollback(self) -> None:
        pass


def _make_db_override(session: _FakeSession | None = None):
    from app.core.database import get_db  # noqa: PLC0415

    _session = session or _FakeSession()

    async def _override():
        yield _session

    return get_db, _override


async def _client(db_session: _FakeSession | None = None) -> AsyncClient:
    dep, override = _make_db_override(db_session)
    app.dependency_overrides[dep] = override
    return AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL)


# ---------------------------------------------------------------------------
# Fake ORM template objects
# ---------------------------------------------------------------------------


def _make_user_obj(user_id: uuid.UUID | None = None, name: str = "Alice") -> Any:
    """Minimal fake ORM User for template.user relationship."""
    u = MagicMock()
    u.id = user_id or uuid.uuid4()
    u.name = name
    return u


def _make_template(
    *,
    template_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
    user_name: str = "Alice",
    title: str = "Email Draft Template",
    description: str = "Drafts professional emails",
    content: str = "Write an email about: {topic}",
    category: str = "general",
    vote_count: int = 0,
    copy_count: int = 0,
    created_at: datetime | None = None,
    updated_at: datetime | None = None,
) -> Any:
    """Build a minimal fake PromptTemplate ORM row."""

    class _Template:
        pass

    t = _Template()
    t.id = template_id or uuid.uuid4()
    t.user_id = user_id or uuid.uuid4()
    t.user = _make_user_obj(user_id=t.user_id, name=user_name)
    t.title = title
    t.description = description
    t.content = content
    t.category = category
    t.vote_count = vote_count
    t.copy_count = copy_count
    t.created_at = created_at or datetime(2026, 1, 1, tzinfo=UTC)
    t.updated_at = updated_at or datetime(2026, 1, 2, tzinfo=UTC)
    return t


# ---------------------------------------------------------------------------
# GET /api/v1/templates  (list)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestListTemplates:
    async def test_returns_200(self) -> None:
        """GET /templates returns 200 for authenticated users."""
        db = _FakeSession(
            execute_results=[
                _FakeResult(scalar=0),   # total count
                _FakeResult(rows=[]),    # paginated rows
                _FakeResult(rows=[]),    # voted_ids query
            ]
        )
        async with await _client(db) as client:
            response = await client.get(f"{API}/templates", headers=AUTH_HEADERS)

        assert response.status_code == 200

    async def test_response_shape(self) -> None:
        """Response has templates, total, page, page_size keys."""
        db = _FakeSession(
            execute_results=[
                _FakeResult(scalar=0),
                _FakeResult(rows=[]),
                _FakeResult(rows=[]),
            ]
        )
        async with await _client(db) as client:
            response = await client.get(f"{API}/templates", headers=AUTH_HEADERS)

        body = response.json()
        assert "templates" in body
        assert "total" in body
        assert "page" in body
        assert "page_size" in body

    async def test_returns_templates_from_db(self) -> None:
        """Templates from the DB appear in the response list."""
        tid = uuid.uuid4()
        template = _make_template(template_id=tid, title="Standup Note")
        db = _FakeSession(
            execute_results=[
                _FakeResult(scalar=1),
                _FakeResult(rows=[template]),
                _FakeResult(rows=[]),
            ]
        )
        async with await _client(db) as client:
            response = await client.get(f"{API}/templates", headers=AUTH_HEADERS)

        body = response.json()
        assert body["total"] == 1
        assert len(body["templates"]) == 1
        assert body["templates"][0]["title"] == "Standup Note"

    async def test_pagination_defaults(self) -> None:
        """Default pagination values are page=1, page_size=20."""
        db = _FakeSession(
            execute_results=[
                _FakeResult(scalar=0),
                _FakeResult(rows=[]),
                _FakeResult(rows=[]),
            ]
        )
        async with await _client(db) as client:
            response = await client.get(f"{API}/templates", headers=AUTH_HEADERS)

        body = response.json()
        assert body["page"] == 1
        assert body["page_size"] == 20

    async def test_voted_by_me_flag_present(self) -> None:
        """Each template response includes the voted_by_me boolean."""
        template = _make_template()
        db = _FakeSession(
            execute_results=[
                _FakeResult(scalar=1),
                _FakeResult(rows=[template]),
                _FakeResult(rows=[]),
            ]
        )
        async with await _client(db) as client:
            response = await client.get(f"{API}/templates", headers=AUTH_HEADERS)

        item = response.json()["templates"][0]
        assert "voted_by_me" in item

    async def test_requires_auth(self) -> None:
        """Unauthenticated GET /templates returns 401."""
        async with await _client() as client:
            response = await client.get(f"{API}/templates")

        assert response.status_code == 401


# ---------------------------------------------------------------------------
# POST /api/v1/templates  (create)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestCreateTemplate:
    _PAYLOAD = {
        "title": "Bug Report Helper",
        "description": "Formats bug reports clearly",
        "content": "Describe the bug: {description}",
        "category": "development",
    }

    async def test_authenticated_user_can_create_template(self) -> None:
        """POST /templates returns 201 for any authenticated user."""
        tid = uuid.uuid4()
        created = _make_template(
            template_id=tid,
            user_id=uuid.UUID(DEV_USER_ID),
            title="Bug Report Helper",
        )
        db = _FakeSession(
            execute_results=[
                _FakeResult(scalar=created),  # reload after flush
            ]
        )
        async with await _client(db) as client:
            response = await client.post(
                f"{API}/templates",
                json=self._PAYLOAD,
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 201

    async def test_create_response_contains_id(self) -> None:
        """Created template response includes an id field."""
        created = _make_template(user_id=uuid.UUID(DEV_USER_ID))
        db = _FakeSession(execute_results=[_FakeResult(scalar=created)])
        async with await _client(db) as client:
            response = await client.post(
                f"{API}/templates",
                json=self._PAYLOAD,
                headers=AUTH_HEADERS,
            )

        assert "id" in response.json()

    async def test_create_response_voted_by_me_is_false(self) -> None:
        """Newly created template has voted_by_me=False."""
        created = _make_template(user_id=uuid.UUID(DEV_USER_ID))
        db = _FakeSession(execute_results=[_FakeResult(scalar=created)])
        async with await _client(db) as client:
            response = await client.post(
                f"{API}/templates",
                json=self._PAYLOAD,
                headers=AUTH_HEADERS,
            )

        assert response.json()["voted_by_me"] is False

    async def test_requires_auth(self) -> None:
        """Unauthenticated POST /templates returns 401."""
        async with await _client() as client:
            response = await client.post(f"{API}/templates", json=self._PAYLOAD)

        assert response.status_code == 401

    async def test_empty_title_returns_422(self) -> None:
        """Title with length 0 violates min_length=1 constraint."""
        payload = {**self._PAYLOAD, "title": ""}
        async with await _client() as client:
            response = await client.post(
                f"{API}/templates",
                json=payload,
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 422


# ---------------------------------------------------------------------------
# GET /api/v1/templates/{id}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestGetTemplate:
    async def test_returns_200_for_existing_template(self) -> None:
        """GET /templates/{id} returns 200 when the template exists."""
        tid = uuid.uuid4()
        template = _make_template(template_id=tid)
        db = _FakeSession(
            execute_results=[
                _FakeResult(scalar=template),  # fetch template
                _FakeResult(rows=[]),           # voted_ids query
            ]
        )
        async with await _client(db) as client:
            response = await client.get(f"{API}/templates/{tid}", headers=AUTH_HEADERS)

        assert response.status_code == 200

    async def test_response_contains_expected_fields(self) -> None:
        """Single template response includes all required schema fields."""
        tid = uuid.uuid4()
        template = _make_template(template_id=tid, title="Meeting Summary")
        db = _FakeSession(
            execute_results=[
                _FakeResult(scalar=template),
                _FakeResult(rows=[]),
            ]
        )
        async with await _client(db) as client:
            response = await client.get(f"{API}/templates/{tid}", headers=AUTH_HEADERS)

        body = response.json()
        for field in ("id", "title", "description", "content", "category", "vote_count"):
            assert field in body, f"Missing field: {field}"

    async def test_returns_404_for_unknown_template(self) -> None:
        """GET /templates/{id} for a nonexistent template returns 404."""
        tid = uuid.uuid4()
        db = _FakeSession(execute_results=[_FakeResult(scalar=None)])
        async with await _client(db) as client:
            response = await client.get(f"{API}/templates/{tid}", headers=AUTH_HEADERS)

        assert response.status_code == 404

    async def test_returns_400_for_invalid_uuid(self) -> None:
        """GET /templates/not-a-uuid returns 400."""
        async with await _client() as client:
            response = await client.get(
                f"{API}/templates/not-a-uuid",
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 400

    async def test_requires_auth(self) -> None:
        """Unauthenticated request returns 401."""
        tid = uuid.uuid4()
        async with await _client() as client:
            response = await client.get(f"{API}/templates/{tid}")

        assert response.status_code == 401


# ---------------------------------------------------------------------------
# PUT /api/v1/templates/{id}  (update – owner only)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestUpdateTemplate:
    async def test_owner_can_update_template(self) -> None:
        """PUT /templates/{id} by the owner returns 200."""
        tid = uuid.uuid4()
        # dev-token user owns the template
        template = _make_template(
            template_id=tid,
            user_id=uuid.UUID(DEV_USER_ID),
            title="Old Title",
        )
        updated = _make_template(
            template_id=tid,
            user_id=uuid.UUID(DEV_USER_ID),
            title="New Title",
        )
        db = _FakeSession(
            execute_results=[
                _FakeResult(scalar=template),  # initial fetch
                _FakeResult(scalar=updated),   # reload after flush
                _FakeResult(rows=[]),           # voted_ids query
            ]
        )
        async with await _client(db) as client:
            response = await client.put(
                f"{API}/templates/{tid}",
                json={"title": "New Title"},
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 200

    async def test_non_owner_update_returns_403(self) -> None:
        """PUT /templates/{id} by a non-owner returns 403."""
        tid = uuid.uuid4()
        # Template owned by a different user
        other_user_id = uuid.uuid4()
        template = _make_template(
            template_id=tid,
            user_id=other_user_id,
            user_name="Other User",
            title="Someone Else's Template",
        )
        db = _FakeSession(execute_results=[_FakeResult(scalar=template)])
        async with await _client(db) as client:
            response = await client.put(
                f"{API}/templates/{tid}",
                json={"title": "Stolen Title"},
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 403

    async def test_returns_404_for_unknown_template(self) -> None:
        """PUT /templates/{id} for nonexistent template returns 404."""
        tid = uuid.uuid4()
        db = _FakeSession(execute_results=[_FakeResult(scalar=None)])
        async with await _client(db) as client:
            response = await client.put(
                f"{API}/templates/{tid}",
                json={"title": "Whatever"},
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 404

    async def test_returns_400_for_invalid_uuid(self) -> None:
        """PUT /templates/bad-id returns 400."""
        async with await _client() as client:
            response = await client.put(
                f"{API}/templates/bad-id",
                json={"title": "X"},
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 400

    async def test_requires_auth(self) -> None:
        """Unauthenticated PUT returns 401."""
        tid = uuid.uuid4()
        async with await _client() as client:
            response = await client.put(f"{API}/templates/{tid}", json={"title": "X"})

        assert response.status_code == 401


# ---------------------------------------------------------------------------
# DELETE /api/v1/templates/{id}  (delete – owner or admin)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestDeleteTemplate:
    async def test_owner_can_delete_template(self) -> None:
        """DELETE /templates/{id} as the owner returns 204."""
        tid = uuid.uuid4()
        template = _make_template(
            template_id=tid,
            user_id=uuid.UUID(DEV_USER_ID),
        )
        db = _FakeSession(execute_results=[_FakeResult(scalar=template)])
        async with await _client(db) as client:
            response = await client.delete(
                f"{API}/templates/{tid}",
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 204

    async def test_admin_can_delete_any_template(self) -> None:
        """Admin (dev-token role=admin) can delete any template regardless of ownership."""
        tid = uuid.uuid4()
        other_user_id = uuid.uuid4()
        template = _make_template(template_id=tid, user_id=other_user_id)
        db = _FakeSession(execute_results=[_FakeResult(scalar=template)])
        async with await _client(db) as client:
            response = await client.delete(
                f"{API}/templates/{tid}",
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 204

    async def test_non_owner_non_admin_returns_403(self) -> None:
        """A regular employee who does not own the template gets 403."""
        from app.core.auth import User, get_current_user  # noqa: PLC0415

        employee = User(
            id=str(uuid.uuid4()),
            email="emp@example.com",
            name="Emp",
            department="sales",
            access_level="restricted",
            role="employee",
        )
        tid = uuid.uuid4()
        other_user_id = uuid.uuid4()
        template = _make_template(template_id=tid, user_id=other_user_id)
        db = _FakeSession(execute_results=[_FakeResult(scalar=template)])
        app.dependency_overrides[get_current_user] = lambda: employee
        try:
            async with await _client(db) as client:
                response = await client.delete(
                    f"{API}/templates/{tid}",
                    headers=AUTH_HEADERS,
                )
            assert response.status_code == 403
        finally:
            app.dependency_overrides.pop(get_current_user, None)

    async def test_returns_404_for_unknown_template(self) -> None:
        """DELETE /templates/{id} for a nonexistent template returns 404."""
        tid = uuid.uuid4()
        db = _FakeSession(execute_results=[_FakeResult(scalar=None)])
        async with await _client(db) as client:
            response = await client.delete(
                f"{API}/templates/{tid}",
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 404

    async def test_returns_400_for_invalid_uuid(self) -> None:
        """DELETE /templates/not-a-uuid returns 400."""
        async with await _client() as client:
            response = await client.delete(
                f"{API}/templates/not-a-uuid",
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 400


# ---------------------------------------------------------------------------
# POST /api/v1/templates/{id}/vote  (toggle vote)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestToggleVote:
    async def test_vote_adds_vote_when_none_exists(self) -> None:
        """POST /templates/{id}/vote creates a new vote and returns voted=True."""
        tid = uuid.uuid4()
        template = _make_template(template_id=tid, vote_count=0)
        db = _FakeSession(
            execute_results=[
                _FakeResult(scalar=template),   # fetch template
                _FakeResult(scalar=None),        # existing vote check (no vote)
            ]
        )
        async with await _client(db) as client:
            response = await client.post(
                f"{API}/templates/{tid}/vote",
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 200
        body = response.json()
        assert body["voted"] is True
        assert body["vote_count"] == 1

    async def test_vote_removes_vote_when_already_voted(self) -> None:
        """POST /templates/{id}/vote removes an existing vote and returns voted=False."""
        from unittest.mock import MagicMock  # noqa: PLC0415

        tid = uuid.uuid4()
        template = _make_template(template_id=tid, vote_count=3)
        existing_vote = MagicMock()

        db = _FakeSession(
            execute_results=[
                _FakeResult(scalar=template),        # fetch template
                _FakeResult(scalar=existing_vote),   # existing vote found
            ]
        )
        async with await _client(db) as client:
            response = await client.post(
                f"{API}/templates/{tid}/vote",
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 200
        body = response.json()
        assert body["voted"] is False
        assert body["vote_count"] == 2

    async def test_returns_404_for_unknown_template(self) -> None:
        """POST /templates/{id}/vote for a nonexistent template returns 404."""
        tid = uuid.uuid4()
        db = _FakeSession(execute_results=[_FakeResult(scalar=None)])
        async with await _client(db) as client:
            response = await client.post(
                f"{API}/templates/{tid}/vote",
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 404

    async def test_returns_400_for_invalid_uuid(self) -> None:
        """POST /templates/bad-id/vote returns 400."""
        async with await _client() as client:
            response = await client.post(
                f"{API}/templates/bad-id/vote",
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 400

    async def test_requires_auth(self) -> None:
        """Unauthenticated vote request returns 401."""
        tid = uuid.uuid4()
        async with await _client() as client:
            response = await client.post(f"{API}/templates/{tid}/vote")

        assert response.status_code == 401


# ---------------------------------------------------------------------------
# POST /api/v1/templates/{id}/copy  (increment copy count)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestCopyTemplate:
    async def test_copy_returns_content_and_incremented_count(self) -> None:
        """POST /templates/{id}/copy returns content and copy_count+1."""
        tid = uuid.uuid4()
        template = _make_template(
            template_id=tid,
            content="Describe the task: {task}",
            copy_count=5,
        )
        db = _FakeSession(execute_results=[_FakeResult(scalar=template)])
        async with await _client(db) as client:
            response = await client.post(
                f"{API}/templates/{tid}/copy",
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 200
        body = response.json()
        assert body["content"] == "Describe the task: {task}"
        assert body["copy_count"] == 6

    async def test_returns_404_for_unknown_template(self) -> None:
        """POST /templates/{id}/copy for a nonexistent template returns 404."""
        tid = uuid.uuid4()
        db = _FakeSession(execute_results=[_FakeResult(scalar=None)])
        async with await _client(db) as client:
            response = await client.post(
                f"{API}/templates/{tid}/copy",
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 404

    async def test_returns_400_for_invalid_uuid(self) -> None:
        """POST /templates/bad-id/copy returns 400."""
        async with await _client() as client:
            response = await client.post(
                f"{API}/templates/bad-id/copy",
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 400

    async def test_requires_auth(self) -> None:
        """Unauthenticated copy request returns 401."""
        tid = uuid.uuid4()
        async with await _client() as client:
            response = await client.post(f"{API}/templates/{tid}/copy")

        assert response.status_code == 401

    async def test_response_contains_content_key(self) -> None:
        """The copy response always includes the 'content' key."""
        tid = uuid.uuid4()
        template = _make_template(template_id=tid, content="My prompt content")
        db = _FakeSession(execute_results=[_FakeResult(scalar=template)])
        async with await _client(db) as client:
            response = await client.post(
                f"{API}/templates/{tid}/copy",
                headers=AUTH_HEADERS,
            )

        assert "content" in response.json()
