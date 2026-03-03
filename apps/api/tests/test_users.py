"""Tests for user management and department management endpoints.

Covers:
- GET   /api/v1/admin/users             - list all users (admin only)
- GET   /api/v1/admin/users/{id}        - get user detail (admin only)
- PATCH /api/v1/admin/users/{id}        - update user role/access (admin only)
- DELETE /api/v1/admin/users/{id}       - disable user (admin only)
- GET   /api/v1/admin/departments       - list departments (admin only)
- POST  /api/v1/admin/departments       - create department (admin only)
- PATCH /api/v1/admin/departments/{id}  - update department (admin only)
- DELETE /api/v1/admin/departments/{id} - delete department (admin only)
  - Fails with 409 when users are still assigned

Design decisions
----------------
- Uses httpx.AsyncClient with ASGITransport.
- dev-token maps to role=admin so all admin-only tests pass by default.
- To test 403 scenarios get_current_user is overridden with a regular employee.
- _FakeSession queues _FakeResult objects in FIFO order matching the route's
  execute() call sequence.
- ORM objects are plain Python classes with the attributes route handlers use.
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

# dev-token user id (matches auth.py _MOCK_USER)
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

    def one_or_none(self) -> Any:
        if self._scalar is not None:
            return self._scalar
        if self._rows:
            return self._rows[0]
        return None

    def one(self) -> Any:
        if self._scalar is not None:
            return self._scalar
        return self._rows[0]


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
# Fake ORM objects
# ---------------------------------------------------------------------------


def _make_user_orm(
    *,
    user_id: uuid.UUID | None = None,
    email: str = "user@example.com",
    name: str = "Test User",
    role: str = "employee",
    department_id: uuid.UUID | None = None,
    access_level: str = "restricted",
    created_at: datetime | None = None,
    updated_at: datetime | None = None,
) -> Any:
    """Build a minimal fake ORM User row."""

    class _User:
        pass

    u = _User()
    u.id = user_id or uuid.uuid4()
    u.email = email
    u.name = name
    u.role = role
    u.department_id = department_id
    u.access_level = access_level
    u.created_at = created_at or datetime(2026, 1, 1, tzinfo=UTC)
    u.updated_at = updated_at or datetime(2026, 1, 2, tzinfo=UTC)
    return u


def _make_user_row(
    *,
    user_id: uuid.UUID | None = None,
    email: str = "user@example.com",
    name: str = "Test User",
    department_name: str | None = "engineering",
    access_level: str = "restricted",
    created_at: datetime | None = None,
) -> Any:
    """Build a minimal flat DB row for list_users (returns plain row objects)."""

    class _Row:
        pass

    r = _Row()
    r.id = user_id or uuid.uuid4()
    r.email = email
    r.name = name
    r.department_name = department_name
    r.access_level = access_level
    r.created_at = created_at or datetime(2026, 1, 1, tzinfo=UTC)
    return r


def _make_dept_orm(
    *,
    dept_id: uuid.UUID | None = None,
    name: str = "Engineering",
    slug: str = "engineering",
    created_at: datetime | None = None,
) -> Any:
    """Build a minimal fake ORM Department row."""

    class _Dept:
        pass

    d = _Dept()
    d.id = dept_id or uuid.uuid4()
    d.name = name
    d.slug = slug
    d.created_at = created_at or datetime(2026, 1, 1, tzinfo=UTC)
    return d


# ---------------------------------------------------------------------------
# Helper: inject a regular (non-admin) employee user
# ---------------------------------------------------------------------------


def _override_as_employee():
    from app.core.auth import User, get_current_user  # noqa: PLC0415

    employee = User(
        id=str(uuid.uuid4()),
        email="emp@example.com",
        name="Employee",
        department="sales",
        access_level="restricted",
        role="employee",
    )
    app.dependency_overrides[get_current_user] = lambda: employee


def _clear_user_override():
    from app.core.auth import get_current_user  # noqa: PLC0415

    app.dependency_overrides.pop(get_current_user, None)


# ---------------------------------------------------------------------------
# GET /api/v1/admin/users
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestListUsers:
    async def test_returns_200(self) -> None:
        """GET /admin/users returns 200 for admin user."""
        db = _FakeSession(execute_results=[_FakeResult(rows=[])])
        async with await _client(db) as client:
            response = await client.get(f"{API}/admin/users", headers=AUTH_HEADERS)

        assert response.status_code == 200

    async def test_response_is_list(self) -> None:
        """Response is a JSON array."""
        db = _FakeSession(execute_results=[_FakeResult(rows=[])])
        async with await _client(db) as client:
            response = await client.get(f"{API}/admin/users", headers=AUTH_HEADERS)

        assert isinstance(response.json(), list)

    async def test_empty_list_when_no_users(self) -> None:
        """Empty array is returned when there are no users."""
        db = _FakeSession(execute_results=[_FakeResult(rows=[])])
        async with await _client(db) as client:
            response = await client.get(f"{API}/admin/users", headers=AUTH_HEADERS)

        assert response.json() == []

    async def test_user_summary_shape(self) -> None:
        """Each user entry contains id, email, name, access_level, created_at."""
        uid = uuid.uuid4()
        row = _make_user_row(user_id=uid, email="alice@example.com")
        db = _FakeSession(execute_results=[_FakeResult(rows=[row])])
        async with await _client(db) as client:
            response = await client.get(f"{API}/admin/users", headers=AUTH_HEADERS)

        user = response.json()[0]
        for field in ("id", "email", "name", "access_level", "created_at"):
            assert field in user, f"Missing field: {field}"

    async def test_user_values_match_db(self) -> None:
        """Returned user fields reflect the values from the database row."""
        uid = uuid.uuid4()
        row = _make_user_row(
            user_id=uid,
            email="bob@example.com",
            name="Bob",
            access_level="all",
        )
        db = _FakeSession(execute_results=[_FakeResult(rows=[row])])
        async with await _client(db) as client:
            response = await client.get(f"{API}/admin/users", headers=AUTH_HEADERS)

        user = response.json()[0]
        assert user["id"] == str(uid)
        assert user["email"] == "bob@example.com"
        assert user["name"] == "Bob"
        assert user["access_level"] == "all"

    async def test_department_is_none_for_unassigned_user(self) -> None:
        """A user with no department has department=null in the response."""
        row = _make_user_row(department_name=None)
        db = _FakeSession(execute_results=[_FakeResult(rows=[row])])
        async with await _client(db) as client:
            response = await client.get(f"{API}/admin/users", headers=AUTH_HEADERS)

        assert response.json()[0]["department"] is None

    async def test_non_admin_returns_403(self) -> None:
        """Non-admin user gets 403 when accessing GET /admin/users."""
        _override_as_employee()
        try:
            async with await _client() as client:
                response = await client.get(f"{API}/admin/users", headers=AUTH_HEADERS)
            assert response.status_code == 403
        finally:
            _clear_user_override()

    async def test_requires_auth(self) -> None:
        """Unauthenticated request returns 401."""
        async with await _client() as client:
            response = await client.get(f"{API}/admin/users")

        assert response.status_code == 401


# ---------------------------------------------------------------------------
# Helper: SQLAlchemy-style named row (supports index + attribute access)
# ---------------------------------------------------------------------------


def _make_user_dept_row(user_obj: Any, dept_name: str | None) -> Any:
    """Produce a row that supports both row[0] and row.department_name access.

    SQLAlchemy returns named-tuple-like Row objects from multi-column SELECT
    statements.  This emulates that behaviour for the get_user / update_user
    routes which access ``row[0]`` (the User ORM object) and
    ``row.department_name`` (the labelled column).
    """

    class _Row:
        def __init__(self, user: Any, department_name: str | None) -> None:
            self._user = user
            self.department_name = department_name

        def __getitem__(self, idx: int) -> Any:
            if idx == 0:
                return self._user
            raise IndexError(idx)

    return _Row(user_obj, dept_name)


# ---------------------------------------------------------------------------
# GET /api/v1/admin/users/{id}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestGetUser:
    async def test_returns_200_for_existing_user(self) -> None:
        """GET /admin/users/{id} returns 200 when the user exists."""
        uid = uuid.uuid4()
        user_obj = _make_user_orm(user_id=uid)
        row = _make_user_dept_row(user_obj, "engineering")
        result = _FakeResult()
        result.one_or_none = lambda: row
        db = _FakeSession(execute_results=[result])
        async with await _client(db) as client:
            response = await client.get(f"{API}/admin/users/{uid}", headers=AUTH_HEADERS)

        assert response.status_code == 200

    async def test_response_has_expected_fields(self) -> None:
        """Detail response includes id, email, name, role, access_level, etc."""
        uid = uuid.uuid4()
        user_obj = _make_user_orm(user_id=uid, email="carol@example.com", role="manager")
        row = _make_user_dept_row(user_obj, "hr")
        result = _FakeResult()
        result.one_or_none = lambda: row
        db = _FakeSession(execute_results=[result])
        async with await _client(db) as client:
            response = await client.get(f"{API}/admin/users/{uid}", headers=AUTH_HEADERS)

        body = response.json()
        for field in ("id", "email", "name", "role", "access_level", "created_at", "updated_at"):
            assert field in body, f"Missing field: {field}"

    async def test_returns_404_for_unknown_user(self) -> None:
        """GET /admin/users/{id} for an unknown user returns 404."""
        uid = uuid.uuid4()
        result = _FakeResult()
        result.one_or_none = lambda: None
        db = _FakeSession(execute_results=[result])
        async with await _client(db) as client:
            response = await client.get(f"{API}/admin/users/{uid}", headers=AUTH_HEADERS)

        assert response.status_code == 404

    async def test_returns_422_for_invalid_uuid(self) -> None:
        """GET /admin/users/not-a-uuid returns 422."""
        async with await _client() as client:
            response = await client.get(
                f"{API}/admin/users/not-a-uuid",
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 422

    async def test_non_admin_returns_403(self) -> None:
        """Non-admin user gets 403 on GET /admin/users/{id}."""
        _override_as_employee()
        try:
            uid = uuid.uuid4()
            async with await _client() as client:
                response = await client.get(
                    f"{API}/admin/users/{uid}",
                    headers=AUTH_HEADERS,
                )
            assert response.status_code == 403
        finally:
            _clear_user_override()


# ---------------------------------------------------------------------------
# PATCH /api/v1/admin/users/{id}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestUpdateUser:
    async def test_admin_can_update_user_role(self) -> None:
        """PATCH /admin/users/{id} by admin returns 200."""
        uid = uuid.uuid4()
        user_obj = _make_user_orm(user_id=uid, role="employee")
        updated_user_obj = _make_user_orm(user_id=uid, role="manager")
        row_after = _make_user_dept_row(updated_user_obj, "engineering")
        result_after = _FakeResult()
        result_after.one = lambda: row_after

        db = _FakeSession(
            execute_results=[
                _FakeResult(scalar=user_obj),   # initial fetch by id
                result_after,                    # re-fetch after commit
            ]
        )
        async with await _client(db) as client:
            response = await client.patch(
                f"{API}/admin/users/{uid}",
                json={"role": "manager"},
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 200

    async def test_returns_updated_role_in_response(self) -> None:
        """Response role reflects the new value from the request."""
        uid = uuid.uuid4()
        user_obj = _make_user_orm(user_id=uid, role="employee")
        updated_user_obj = _make_user_orm(user_id=uid, role="hr")
        row_after = _make_user_dept_row(updated_user_obj, None)
        result_after = _FakeResult()
        result_after.one = lambda: row_after

        db = _FakeSession(
            execute_results=[
                _FakeResult(scalar=user_obj),
                result_after,
            ]
        )
        async with await _client(db) as client:
            response = await client.patch(
                f"{API}/admin/users/{uid}",
                json={"role": "hr"},
                headers=AUTH_HEADERS,
            )

        assert response.json()["role"] == "hr"

    async def test_returns_404_for_unknown_user(self) -> None:
        """PATCH /admin/users/{id} for an unknown user returns 404."""
        uid = uuid.uuid4()
        db = _FakeSession(execute_results=[_FakeResult(scalar=None)])
        async with await _client(db) as client:
            response = await client.patch(
                f"{API}/admin/users/{uid}",
                json={"role": "manager"},
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 404

    async def test_returns_422_for_invalid_uuid(self) -> None:
        """PATCH /admin/users/not-a-uuid returns 422."""
        async with await _client() as client:
            response = await client.patch(
                f"{API}/admin/users/not-a-uuid",
                json={"role": "manager"},
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 422

    async def test_non_admin_returns_403(self) -> None:
        """Non-admin PATCH /admin/users/{id} returns 403."""
        _override_as_employee()
        uid = uuid.uuid4()
        try:
            async with await _client() as client:
                response = await client.patch(
                    f"{API}/admin/users/{uid}",
                    json={"role": "manager"},
                    headers=AUTH_HEADERS,
                )
            assert response.status_code == 403
        finally:
            _clear_user_override()

    async def test_requires_auth(self) -> None:
        """Unauthenticated PATCH returns 401."""
        uid = uuid.uuid4()
        async with await _client() as client:
            response = await client.patch(f"{API}/admin/users/{uid}", json={"role": "manager"})

        assert response.status_code == 401


# ---------------------------------------------------------------------------
# DELETE /api/v1/admin/users/{id}  (disable user)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestDisableUser:
    async def test_admin_can_disable_user(self) -> None:
        """DELETE /admin/users/{id} by admin returns 204."""
        target_id = uuid.uuid4()
        user_obj = _make_user_orm(user_id=target_id)
        db = _FakeSession(execute_results=[_FakeResult(scalar=user_obj)])
        async with await _client(db) as client:
            response = await client.delete(
                f"{API}/admin/users/{target_id}",
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 204

    async def test_cannot_disable_yourself(self) -> None:
        """Admin cannot disable their own account (returns 400)."""
        # DEV_USER_ID is the id of the dev-token admin
        dev_uid = uuid.UUID(DEV_USER_ID)
        user_obj = _make_user_orm(user_id=dev_uid)
        db = _FakeSession(execute_results=[_FakeResult(scalar=user_obj)])
        async with await _client(db) as client:
            response = await client.delete(
                f"{API}/admin/users/{dev_uid}",
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 400

    async def test_returns_404_for_unknown_user(self) -> None:
        """DELETE /admin/users/{id} for an unknown user returns 404."""
        uid = uuid.uuid4()
        db = _FakeSession(execute_results=[_FakeResult(scalar=None)])
        async with await _client(db) as client:
            response = await client.delete(
                f"{API}/admin/users/{uid}",
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 404

    async def test_returns_422_for_invalid_uuid(self) -> None:
        """DELETE /admin/users/bad returns 422."""
        async with await _client() as client:
            response = await client.delete(
                f"{API}/admin/users/bad-id",
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 422

    async def test_non_admin_returns_403(self) -> None:
        """Non-admin DELETE /admin/users/{id} returns 403."""
        _override_as_employee()
        uid = uuid.uuid4()
        try:
            async with await _client() as client:
                response = await client.delete(
                    f"{API}/admin/users/{uid}",
                    headers=AUTH_HEADERS,
                )
            assert response.status_code == 403
        finally:
            _clear_user_override()

    async def test_requires_auth(self) -> None:
        """Unauthenticated DELETE returns 401."""
        uid = uuid.uuid4()
        async with await _client() as client:
            response = await client.delete(f"{API}/admin/users/{uid}")

        assert response.status_code == 401


# ---------------------------------------------------------------------------
# GET /api/v1/admin/departments
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestListDepartments:
    async def test_returns_200(self) -> None:
        """GET /admin/departments returns 200 for admin user."""
        db = _FakeSession(execute_results=[_FakeResult(rows=[])])
        async with await _client(db) as client:
            response = await client.get(f"{API}/admin/departments", headers=AUTH_HEADERS)

        assert response.status_code == 200

    async def test_response_is_list(self) -> None:
        """Response is a JSON array."""
        db = _FakeSession(execute_results=[_FakeResult(rows=[])])
        async with await _client(db) as client:
            response = await client.get(f"{API}/admin/departments", headers=AUTH_HEADERS)

        assert isinstance(response.json(), list)

    async def test_department_shape(self) -> None:
        """Each department entry contains id, name, slug, user_count, created_at."""
        dept = _make_dept_orm(name="Marketing", slug="marketing")
        # list_departments query returns (dept, user_count) tuples
        db = _FakeSession(execute_results=[_FakeResult(rows=[(dept, 3)])])
        async with await _client(db) as client:
            response = await client.get(f"{API}/admin/departments", headers=AUTH_HEADERS)

        dept_item = response.json()[0]
        for field in ("id", "name", "slug", "user_count", "created_at"):
            assert field in dept_item, f"Missing field: {field}"

    async def test_department_values_match_db(self) -> None:
        """Returned department fields match the ORM values."""
        did = uuid.uuid4()
        dept = _make_dept_orm(dept_id=did, name="Finance", slug="finance")
        db = _FakeSession(execute_results=[_FakeResult(rows=[(dept, 5)])])
        async with await _client(db) as client:
            response = await client.get(f"{API}/admin/departments", headers=AUTH_HEADERS)

        item = response.json()[0]
        assert item["id"] == str(did)
        assert item["name"] == "Finance"
        assert item["slug"] == "finance"
        assert item["user_count"] == 5

    async def test_non_admin_returns_403(self) -> None:
        """Non-admin GET /admin/departments returns 403."""
        _override_as_employee()
        try:
            async with await _client() as client:
                response = await client.get(
                    f"{API}/admin/departments",
                    headers=AUTH_HEADERS,
                )
            assert response.status_code == 403
        finally:
            _clear_user_override()

    async def test_requires_auth(self) -> None:
        """Unauthenticated request returns 401."""
        async with await _client() as client:
            response = await client.get(f"{API}/admin/departments")

        assert response.status_code == 401


# ---------------------------------------------------------------------------
# POST /api/v1/admin/departments
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestCreateDepartment:
    _PAYLOAD = {"name": "Customer Success", "slug": "customer-success"}

    async def test_admin_can_create_department(self) -> None:
        """POST /admin/departments returns 201 for admin."""
        new_dept = _make_dept_orm(name="Customer Success", slug="customer-success")
        db = _FakeSession(
            execute_results=[
                _FakeResult(scalar=None),   # slug uniqueness check (no existing)
            ]
        )
        # After flush db.added will contain the new dept
        async with await _client(db) as client:
            response = await client.post(
                f"{API}/admin/departments",
                json=self._PAYLOAD,
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 201

    async def test_create_response_contains_id(self) -> None:
        """Created department response includes an id field."""
        db = _FakeSession(execute_results=[_FakeResult(scalar=None)])
        async with await _client(db) as client:
            response = await client.post(
                f"{API}/admin/departments",
                json=self._PAYLOAD,
                headers=AUTH_HEADERS,
            )

        assert "id" in response.json()

    async def test_duplicate_slug_returns_409(self) -> None:
        """Creating a department with an existing slug returns 409."""
        existing = _make_dept_orm(slug="customer-success")
        db = _FakeSession(execute_results=[_FakeResult(scalar=existing)])
        async with await _client(db) as client:
            response = await client.post(
                f"{API}/admin/departments",
                json=self._PAYLOAD,
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 409

    async def test_invalid_slug_returns_422(self) -> None:
        """Slug with uppercase letters violates the pattern constraint."""
        payload = {"name": "Test Dept", "slug": "INVALID-SLUG"}
        async with await _client() as client:
            response = await client.post(
                f"{API}/admin/departments",
                json=payload,
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 422

    async def test_non_admin_returns_403(self) -> None:
        """Non-admin POST /admin/departments returns 403."""
        _override_as_employee()
        try:
            async with await _client() as client:
                response = await client.post(
                    f"{API}/admin/departments",
                    json=self._PAYLOAD,
                    headers=AUTH_HEADERS,
                )
            assert response.status_code == 403
        finally:
            _clear_user_override()

    async def test_requires_auth(self) -> None:
        """Unauthenticated POST returns 401."""
        async with await _client() as client:
            response = await client.post(f"{API}/admin/departments", json=self._PAYLOAD)

        assert response.status_code == 401


# ---------------------------------------------------------------------------
# PATCH /api/v1/admin/departments/{id}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestUpdateDepartment:
    async def test_admin_can_update_department_name(self) -> None:
        """PATCH /admin/departments/{id} returns 200 for admin."""
        did = uuid.uuid4()
        dept = _make_dept_orm(dept_id=did, name="Old Name", slug="old-name")
        db = _FakeSession(
            execute_results=[
                _FakeResult(scalar=dept),   # fetch department
                _FakeResult(scalar=0),       # user count
            ]
        )
        async with await _client(db) as client:
            response = await client.patch(
                f"{API}/admin/departments/{did}",
                json={"name": "New Name"},
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 200

    async def test_returns_404_for_unknown_department(self) -> None:
        """PATCH /admin/departments/{id} for nonexistent dept returns 404."""
        did = uuid.uuid4()
        db = _FakeSession(execute_results=[_FakeResult(scalar=None)])
        async with await _client(db) as client:
            response = await client.patch(
                f"{API}/admin/departments/{did}",
                json={"name": "Whatever"},
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 404

    async def test_duplicate_slug_on_update_returns_409(self) -> None:
        """Updating to a slug that already exists returns 409."""
        did = uuid.uuid4()
        dept = _make_dept_orm(dept_id=did, slug="engineering")
        conflicting = _make_dept_orm(slug="hr")
        db = _FakeSession(
            execute_results=[
                _FakeResult(scalar=dept),        # fetch department
                _FakeResult(scalar=conflicting),  # slug uniqueness check finds conflict
            ]
        )
        async with await _client(db) as client:
            response = await client.patch(
                f"{API}/admin/departments/{did}",
                json={"slug": "hr"},
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 409

    async def test_returns_422_for_invalid_uuid(self) -> None:
        """PATCH /admin/departments/bad-id returns 422."""
        async with await _client() as client:
            response = await client.patch(
                f"{API}/admin/departments/bad-id",
                json={"name": "X"},
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 422

    async def test_non_admin_returns_403(self) -> None:
        """Non-admin PATCH /admin/departments/{id} returns 403."""
        _override_as_employee()
        did = uuid.uuid4()
        try:
            async with await _client() as client:
                response = await client.patch(
                    f"{API}/admin/departments/{did}",
                    json={"name": "X"},
                    headers=AUTH_HEADERS,
                )
            assert response.status_code == 403
        finally:
            _clear_user_override()


# ---------------------------------------------------------------------------
# DELETE /api/v1/admin/departments/{id}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestDeleteDepartment:
    async def test_admin_can_delete_empty_department(self) -> None:
        """DELETE /admin/departments/{id} returns 204 when no users are assigned."""
        did = uuid.uuid4()
        dept = _make_dept_orm(dept_id=did)
        db = _FakeSession(
            execute_results=[
                _FakeResult(scalar=dept),  # fetch department
                _FakeResult(scalar=0),      # user count = 0
            ]
        )
        async with await _client(db) as client:
            response = await client.delete(
                f"{API}/admin/departments/{did}",
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 204

    async def test_delete_with_assigned_users_returns_409(self) -> None:
        """Cannot delete a department that has assigned users — returns 409."""
        did = uuid.uuid4()
        dept = _make_dept_orm(dept_id=did)
        db = _FakeSession(
            execute_results=[
                _FakeResult(scalar=dept),  # fetch department
                _FakeResult(scalar=3),      # user_count = 3 (non-zero)
            ]
        )
        async with await _client(db) as client:
            response = await client.delete(
                f"{API}/admin/departments/{did}",
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 409

    async def test_returns_404_for_unknown_department(self) -> None:
        """DELETE /admin/departments/{id} for nonexistent dept returns 404."""
        did = uuid.uuid4()
        db = _FakeSession(execute_results=[_FakeResult(scalar=None)])
        async with await _client(db) as client:
            response = await client.delete(
                f"{API}/admin/departments/{did}",
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 404

    async def test_returns_422_for_invalid_uuid(self) -> None:
        """DELETE /admin/departments/not-uuid returns 422."""
        async with await _client() as client:
            response = await client.delete(
                f"{API}/admin/departments/not-uuid",
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 422

    async def test_non_admin_returns_403(self) -> None:
        """Non-admin DELETE /admin/departments/{id} returns 403."""
        _override_as_employee()
        did = uuid.uuid4()
        try:
            async with await _client() as client:
                response = await client.delete(
                    f"{API}/admin/departments/{did}",
                    headers=AUTH_HEADERS,
                )
            assert response.status_code == 403
        finally:
            _clear_user_override()

    async def test_requires_auth(self) -> None:
        """Unauthenticated DELETE returns 401."""
        did = uuid.uuid4()
        async with await _client() as client:
            response = await client.delete(f"{API}/admin/departments/{did}")

        assert response.status_code == 401
