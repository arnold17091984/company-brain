"""Tests for AI Recipe Book endpoints.

Covers:
- GET  /api/v1/recipes            - list recipes (pagination, filters)
- GET  /api/v1/recipes/onboarding - onboarding recipes for current user
- GET  /api/v1/recipes/{id}       - get single recipe (increments usage_count)
- POST /api/v1/recipes            - create recipe (admin only)
- PUT  /api/v1/recipes/{id}       - update recipe (admin only)
- DELETE /api/v1/recipes/{id}     - delete recipe (admin only)
- Non-admin gets 403 on write endpoints

Design decisions
----------------
- Uses httpx.AsyncClient with ASGITransport (same pattern as test_routes.py).
- dev-token bypasses Google JWKS for all authenticated calls.
- get_db is overridden with _FakeSession so no real PostgreSQL is needed.
- ORM objects are represented as plain Python objects with the attributes the
  route handlers actually access (id, title, description, …, department).
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
# Fake ORM recipe objects
# ---------------------------------------------------------------------------


def _make_recipe(
    *,
    recipe_id: uuid.UUID | None = None,
    title: str = "Test Recipe",
    description: str = "A helpful AI recipe",
    prompt_template: str = "Prompt: {query}",
    example_query: str = "Example question",
    example_response: str = "Example answer",
    department_id: uuid.UUID | None = None,
    department: Any = None,
    category: str = "general",
    effectiveness_score: float = 4.5,
    usage_count: int = 0,
    source: str = "manual",
    status: str = "published",
    created_at: datetime | None = None,
    updated_at: datetime | None = None,
) -> Any:
    """Build a minimal fake AIRecipe ORM row."""

    class _Recipe:
        pass

    r = _Recipe()
    r.id = recipe_id or uuid.uuid4()
    r.title = title
    r.description = description
    r.prompt_template = prompt_template
    r.example_query = example_query
    r.example_response = example_response
    r.department_id = department_id
    r.department = department
    r.category = category
    r.effectiveness_score = effectiveness_score
    r.usage_count = usage_count
    r.source = source
    r.status = status
    r.created_at = created_at or datetime(2026, 1, 1, tzinfo=UTC)
    r.updated_at = updated_at or datetime(2026, 1, 2, tzinfo=UTC)
    return r


# ---------------------------------------------------------------------------
# GET /api/v1/recipes  (list)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestListRecipes:
    async def test_returns_200(self) -> None:
        """GET /recipes returns HTTP 200 for an authenticated user."""
        db = _FakeSession(
            execute_results=[
                _FakeResult(scalar=0),   # total count
                _FakeResult(rows=[]),    # paginated rows
            ]
        )
        async with await _client(db) as client:
            response = await client.get(f"{API}/recipes", headers=AUTH_HEADERS)

        assert response.status_code == 200

    async def test_response_shape(self) -> None:
        """Response contains recipes list, total, page, and page_size."""
        db = _FakeSession(
            execute_results=[
                _FakeResult(scalar=0),
                _FakeResult(rows=[]),
            ]
        )
        async with await _client(db) as client:
            response = await client.get(f"{API}/recipes", headers=AUTH_HEADERS)

        body = response.json()
        assert "recipes" in body
        assert "total" in body
        assert "page" in body
        assert "page_size" in body

    async def test_returns_recipes_from_db(self) -> None:
        """Recipes returned from the DB appear in the response."""
        recipe = _make_recipe(title="SQL Explainer")
        db = _FakeSession(
            execute_results=[
                _FakeResult(scalar=1),
                _FakeResult(rows=[recipe]),
            ]
        )
        async with await _client(db) as client:
            response = await client.get(f"{API}/recipes", headers=AUTH_HEADERS)

        body = response.json()
        assert body["total"] == 1
        assert len(body["recipes"]) == 1
        assert body["recipes"][0]["title"] == "SQL Explainer"

    async def test_pagination_defaults(self) -> None:
        """Default page=1 and page_size=20 are returned in the response."""
        db = _FakeSession(
            execute_results=[
                _FakeResult(scalar=0),
                _FakeResult(rows=[]),
            ]
        )
        async with await _client(db) as client:
            response = await client.get(f"{API}/recipes", headers=AUTH_HEADERS)

        body = response.json()
        assert body["page"] == 1
        assert body["page_size"] == 20

    async def test_invalid_department_id_returns_400(self) -> None:
        """A malformed department_id query param returns HTTP 400."""
        async with await _client() as client:
            response = await client.get(
                f"{API}/recipes",
                params={"department_id": "not-a-uuid"},
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 400

    async def test_requires_auth(self) -> None:
        """Unauthenticated request returns 401."""
        async with await _client() as client:
            response = await client.get(f"{API}/recipes")

        assert response.status_code == 401


# ---------------------------------------------------------------------------
# GET /api/v1/recipes/{id}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestGetRecipe:
    async def test_returns_200_for_existing_recipe(self) -> None:
        """GET /recipes/{id} returns 200 when the recipe exists."""
        rid = uuid.uuid4()
        recipe = _make_recipe(recipe_id=rid)
        # First execute: fetch recipe; second execute: reload after usage_count increment
        db = _FakeSession(
            execute_results=[
                _FakeResult(scalar=recipe),
            ]
        )
        async with await _client(db) as client:
            response = await client.get(f"{API}/recipes/{rid}", headers=AUTH_HEADERS)

        assert response.status_code == 200

    async def test_response_contains_recipe_fields(self) -> None:
        """The single-recipe response includes all expected fields."""
        rid = uuid.uuid4()
        recipe = _make_recipe(recipe_id=rid, title="Jira Ticket Writer")
        db = _FakeSession(
            execute_results=[
                _FakeResult(scalar=recipe),
            ]
        )
        async with await _client(db) as client:
            response = await client.get(f"{API}/recipes/{rid}", headers=AUTH_HEADERS)

        body = response.json()
        for field in ("id", "title", "description", "prompt_template", "category", "status"):
            assert field in body, f"Missing field: {field}"

    async def test_returns_404_for_unknown_recipe(self) -> None:
        """GET /recipes/{id} for a nonexistent recipe returns 404."""
        rid = uuid.uuid4()
        db = _FakeSession(execute_results=[_FakeResult(scalar=None)])
        async with await _client(db) as client:
            response = await client.get(f"{API}/recipes/{rid}", headers=AUTH_HEADERS)

        assert response.status_code == 404

    async def test_returns_400_for_invalid_uuid(self) -> None:
        """GET /recipes/not-a-uuid returns HTTP 400."""
        async with await _client() as client:
            response = await client.get(f"{API}/recipes/not-a-uuid", headers=AUTH_HEADERS)

        assert response.status_code == 400

    async def test_requires_auth(self) -> None:
        """Unauthenticated request returns 401."""
        rid = uuid.uuid4()
        async with await _client() as client:
            response = await client.get(f"{API}/recipes/{rid}")

        assert response.status_code == 401


# ---------------------------------------------------------------------------
# POST /api/v1/recipes  (create – admin only)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestCreateRecipe:
    _PAYLOAD = {
        "title": "Code Review Recipe",
        "description": "Helps with code reviews",
        "prompt_template": "Review this code: {code}",
        "example_query": "Review my Python function",
        "example_response": "The function looks good except…",
        "category": "development",
        "status": "published",
    }

    async def test_admin_can_create_recipe(self) -> None:
        """POST /recipes as admin returns HTTP 201."""
        created = _make_recipe(title="Code Review Recipe", status="published")
        # Session: flush assigns id; then reload query returns the recipe
        db = _FakeSession(execute_results=[_FakeResult(scalar=created)])
        async with await _client(db) as client:
            response = await client.post(
                f"{API}/recipes",
                json=self._PAYLOAD,
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 201

    async def test_create_response_contains_id(self) -> None:
        """Created recipe response includes an id field."""
        created = _make_recipe(title="Code Review Recipe", status="published")
        db = _FakeSession(execute_results=[_FakeResult(scalar=created)])
        async with await _client(db) as client:
            response = await client.post(
                f"{API}/recipes",
                json=self._PAYLOAD,
                headers=AUTH_HEADERS,
            )

        assert "id" in response.json()

    async def test_non_admin_create_returns_403(self) -> None:
        """POST /recipes as a non-admin user returns HTTP 403.

        The dev-token maps to an admin user.  We need to override
        get_current_user to inject a regular (employee) user.
        """
        from app.core.auth import User, get_current_user  # noqa: PLC0415

        regular_user = User(
            id=str(uuid.uuid4()),
            email="employee@example.com",
            name="Employee",
            department="engineering",
            access_level="restricted",
            role="employee",
        )

        app.dependency_overrides[get_current_user] = lambda: regular_user
        try:
            async with await _client() as client:
                response = await client.post(
                    f"{API}/recipes",
                    json=self._PAYLOAD,
                    headers=AUTH_HEADERS,
                )
            assert response.status_code == 403
        finally:
            app.dependency_overrides.pop(get_current_user, None)

    async def test_invalid_department_id_returns_400(self) -> None:
        """Providing a malformed department_id returns 400."""
        payload = {**self._PAYLOAD, "department_id": "not-a-uuid"}
        async with await _client() as client:
            response = await client.post(
                f"{API}/recipes",
                json=payload,
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 400

    async def test_requires_auth(self) -> None:
        """Unauthenticated POST /recipes returns 401."""
        async with await _client() as client:
            response = await client.post(f"{API}/recipes", json=self._PAYLOAD)

        assert response.status_code == 401


# ---------------------------------------------------------------------------
# PUT /api/v1/recipes/{id}  (update – admin only)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestUpdateRecipe:
    async def test_admin_can_update_recipe(self) -> None:
        """PUT /recipes/{id} as admin returns 200."""
        rid = uuid.uuid4()
        existing = _make_recipe(recipe_id=rid, title="Old Title")
        updated = _make_recipe(recipe_id=rid, title="New Title")
        db = _FakeSession(
            execute_results=[
                _FakeResult(scalar=existing),  # initial fetch
                _FakeResult(scalar=updated),   # reload after flush
            ]
        )
        async with await _client(db) as client:
            response = await client.put(
                f"{API}/recipes/{rid}",
                json={"title": "New Title"},
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 200

    async def test_update_returns_updated_title(self) -> None:
        """Response title reflects the value sent in the request."""
        rid = uuid.uuid4()
        existing = _make_recipe(recipe_id=rid, title="Old Title")
        updated = _make_recipe(recipe_id=rid, title="Updated Title")
        db = _FakeSession(
            execute_results=[
                _FakeResult(scalar=existing),
                _FakeResult(scalar=updated),
            ]
        )
        async with await _client(db) as client:
            response = await client.put(
                f"{API}/recipes/{rid}",
                json={"title": "Updated Title"},
                headers=AUTH_HEADERS,
            )

        assert response.json()["title"] == "Updated Title"

    async def test_returns_404_for_unknown_recipe(self) -> None:
        """PUT /recipes/{id} for a nonexistent recipe returns 404."""
        rid = uuid.uuid4()
        db = _FakeSession(execute_results=[_FakeResult(scalar=None)])
        async with await _client(db) as client:
            response = await client.put(
                f"{API}/recipes/{rid}",
                json={"title": "X"},
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 404

    async def test_non_admin_update_returns_403(self) -> None:
        """PUT /recipes/{id} as a non-admin user returns 403."""
        from app.core.auth import User, get_current_user  # noqa: PLC0415

        regular_user = User(
            id=str(uuid.uuid4()),
            email="employee@example.com",
            name="Employee",
            department="engineering",
            access_level="restricted",
            role="employee",
        )
        rid = uuid.uuid4()
        app.dependency_overrides[get_current_user] = lambda: regular_user
        try:
            async with await _client() as client:
                response = await client.put(
                    f"{API}/recipes/{rid}",
                    json={"title": "Hack"},
                    headers=AUTH_HEADERS,
                )
            assert response.status_code == 403
        finally:
            app.dependency_overrides.pop(get_current_user, None)

    async def test_returns_400_for_invalid_uuid(self) -> None:
        """PUT /recipes/not-uuid returns 400."""
        async with await _client() as client:
            response = await client.put(
                f"{API}/recipes/not-a-uuid",
                json={"title": "X"},
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 400


# ---------------------------------------------------------------------------
# DELETE /api/v1/recipes/{id}  (delete – admin only)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestDeleteRecipe:
    async def test_admin_can_delete_recipe(self) -> None:
        """DELETE /recipes/{id} as admin returns 204."""
        rid = uuid.uuid4()
        recipe = _make_recipe(recipe_id=rid)
        db = _FakeSession(execute_results=[_FakeResult(scalar=recipe)])
        async with await _client(db) as client:
            response = await client.delete(
                f"{API}/recipes/{rid}",
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 204

    async def test_delete_returns_404_for_unknown_recipe(self) -> None:
        """DELETE /recipes/{id} for nonexistent recipe returns 404."""
        rid = uuid.uuid4()
        db = _FakeSession(execute_results=[_FakeResult(scalar=None)])
        async with await _client(db) as client:
            response = await client.delete(
                f"{API}/recipes/{rid}",
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 404

    async def test_non_admin_delete_returns_403(self) -> None:
        """DELETE /recipes/{id} as a non-admin user returns 403."""
        from app.core.auth import User, get_current_user  # noqa: PLC0415

        regular_user = User(
            id=str(uuid.uuid4()),
            email="employee@example.com",
            name="Employee",
            department="engineering",
            access_level="restricted",
            role="employee",
        )
        rid = uuid.uuid4()
        app.dependency_overrides[get_current_user] = lambda: regular_user
        try:
            async with await _client() as client:
                response = await client.delete(
                    f"{API}/recipes/{rid}",
                    headers=AUTH_HEADERS,
                )
            assert response.status_code == 403
        finally:
            app.dependency_overrides.pop(get_current_user, None)

    async def test_returns_400_for_invalid_uuid(self) -> None:
        """DELETE /recipes/bad-id returns 400."""
        async with await _client() as client:
            response = await client.delete(
                f"{API}/recipes/bad-id",
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 400

    async def test_requires_auth(self) -> None:
        """Unauthenticated DELETE returns 401."""
        rid = uuid.uuid4()
        async with await _client() as client:
            response = await client.delete(f"{API}/recipes/{rid}")

        assert response.status_code == 401


# ---------------------------------------------------------------------------
# GET /api/v1/recipes/onboarding
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestOnboardingRecipes:
    async def test_returns_200(self) -> None:
        """GET /recipes/onboarding returns 200 for authenticated users."""
        db = _FakeSession(execute_results=[_FakeResult(rows=[])])
        async with await _client(db) as client:
            response = await client.get(
                f"{API}/recipes/onboarding",
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 200

    async def test_returns_list(self) -> None:
        """Response is a JSON array."""
        db = _FakeSession(execute_results=[_FakeResult(rows=[])])
        async with await _client(db) as client:
            response = await client.get(
                f"{API}/recipes/onboarding",
                headers=AUTH_HEADERS,
            )

        assert isinstance(response.json(), list)

    async def test_returns_recipes_in_list(self) -> None:
        """Recipes from the DB are surfaced in the onboarding list."""
        recipe = _make_recipe(title="Onboarding Helper")
        db = _FakeSession(execute_results=[_FakeResult(rows=[recipe])])
        async with await _client(db) as client:
            response = await client.get(
                f"{API}/recipes/onboarding",
                headers=AUTH_HEADERS,
            )

        data = response.json()
        assert len(data) == 1
        assert data[0]["title"] == "Onboarding Helper"

    async def test_requires_auth(self) -> None:
        """Unauthenticated request returns 401."""
        async with await _client() as client:
            response = await client.get(f"{API}/recipes/onboarding")

        assert response.status_code == 401
