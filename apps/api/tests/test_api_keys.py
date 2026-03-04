"""Tests for API key encryption utilities and admin API key management endpoints.

Covers:
- encrypt_value / decrypt_value roundtrip
- decrypt with wrong key raises ValueError
- encrypt without key raises RuntimeError
- mask_key output formatting
- GET  /api/v1/admin/api-keys  - list managed API key statuses
- PUT  /api/v1/admin/api-keys  - update managed API keys

Design decisions
----------------
- Encryption unit tests use monkeypatch to control settings.encryption_key
  without touching real environment variables.
- HTTP tests follow the same _FakeSession / _FakeResult pattern used in
  test_users.py.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

import pytest
from cryptography.fernet import Fernet
from httpx import ASGITransport, AsyncClient

from app.core.api_keys import MANAGED_KEYS, mask_key
from app.core.encryption import decrypt_value, encrypt_value
from app.main import app

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

BASE_URL = "http://test"
AUTH_HEADERS = {"Authorization": "Bearer dev-token"}
API = "/api/v1"

# ---------------------------------------------------------------------------
# Fake DB helpers (same pattern as test_users.py)
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
        return _FakeResult(rows=[], scalar=None)

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


# ===========================================================================
# Unit tests: encryption utilities
# ===========================================================================


class TestEncryptDecryptRoundtrip:
    """encrypt_value -> decrypt_value returns the original plaintext."""

    def test_roundtrip(self, monkeypatch: pytest.MonkeyPatch) -> None:
        from app.core.config import settings  # noqa: PLC0415

        key = Fernet.generate_key().decode()
        monkeypatch.setattr(settings, "encryption_key", key)

        plaintext = "my-secret-key"
        ciphertext = encrypt_value(plaintext)
        assert decrypt_value(ciphertext) == plaintext


class TestDecryptWithWrongKey:
    """Decrypting with a different key raises ValueError."""

    def test_wrong_key_raises_value_error(self, monkeypatch: pytest.MonkeyPatch) -> None:
        from app.core.config import settings  # noqa: PLC0415

        key1 = Fernet.generate_key().decode()
        monkeypatch.setattr(settings, "encryption_key", key1)
        ciphertext = encrypt_value("my-secret-key")

        key2 = Fernet.generate_key().decode()
        monkeypatch.setattr(settings, "encryption_key", key2)

        with pytest.raises(ValueError, match="Failed to decrypt"):
            decrypt_value(ciphertext)


class TestEncryptWithoutKey:
    """Encrypting without ENCRYPTION_KEY raises RuntimeError."""

    def test_no_key_raises_runtime_error(self, monkeypatch: pytest.MonkeyPatch) -> None:
        from app.core.config import settings  # noqa: PLC0415

        monkeypatch.setattr(settings, "encryption_key", "")

        with pytest.raises(RuntimeError, match="ENCRYPTION_KEY is not configured"):
            encrypt_value("some-value")


class TestMaskKey:
    """mask_key shows only the last 4 characters for long keys."""

    def test_mask_long_key(self) -> None:
        assert mask_key("sk-1234567890") == "*********7890"

    def test_mask_short_key(self) -> None:
        assert mask_key("abc") == "****"

    def test_mask_exactly_four_chars(self) -> None:
        assert mask_key("abcd") == "****"

    def test_mask_five_chars(self) -> None:
        assert mask_key("abcde") == "*bcde"


# ===========================================================================
# HTTP tests: GET /api/v1/admin/api-keys
# ===========================================================================


@pytest.mark.asyncio
class TestGetApiKeys:
    async def test_returns_200(self) -> None:
        """GET /admin/api-keys returns 200 for admin."""
        # 8 MANAGED_KEYS, each does one DB query -> 8 _FakeResult(scalar=None)
        results = [_FakeResult(scalar=None) for _ in MANAGED_KEYS]
        db = _FakeSession(execute_results=results)
        async with await _client(db) as client:
            response = await client.get(f"{API}/admin/api-keys", headers=AUTH_HEADERS)

        assert response.status_code == 200

    async def test_response_is_list(self) -> None:
        """Response is a JSON array."""
        results = [_FakeResult(scalar=None) for _ in MANAGED_KEYS]
        db = _FakeSession(execute_results=results)
        async with await _client(db) as client:
            response = await client.get(f"{API}/admin/api-keys", headers=AUTH_HEADERS)

        assert isinstance(response.json(), list)

    async def test_returns_all_managed_keys(self) -> None:
        """Response contains an entry for every managed key."""
        results = [_FakeResult(scalar=None) for _ in MANAGED_KEYS]
        db = _FakeSession(execute_results=results)
        async with await _client(db) as client:
            response = await client.get(f"{API}/admin/api-keys", headers=AUTH_HEADERS)

        data = response.json()
        assert len(data) == len(MANAGED_KEYS)
        key_names = {item["key_name"] for item in data}
        assert key_names == set(MANAGED_KEYS)

    async def test_each_entry_has_expected_fields(self) -> None:
        """Each entry has key_name, source, and masked_value fields."""
        results = [_FakeResult(scalar=None) for _ in MANAGED_KEYS]
        db = _FakeSession(execute_results=results)
        async with await _client(db) as client:
            response = await client.get(f"{API}/admin/api-keys", headers=AUTH_HEADERS)

        for item in response.json():
            assert "key_name" in item
            assert "source" in item
            assert "masked_value" in item

    async def test_no_db_entries_source_is_env_or_none(self) -> None:
        """When no DB entries exist, source is 'env' or 'none' depending on env."""
        results = [_FakeResult(scalar=None) for _ in MANAGED_KEYS]
        db = _FakeSession(execute_results=results)
        async with await _client(db) as client:
            response = await client.get(f"{API}/admin/api-keys", headers=AUTH_HEADERS)

        for item in response.json():
            assert item["source"] in ("env", "none")

    async def test_requires_auth_401(self) -> None:
        """Unauthenticated request returns 401."""
        async with await _client() as client:
            response = await client.get(f"{API}/admin/api-keys")

        assert response.status_code == 401

    async def test_non_admin_returns_403(self) -> None:
        """Non-admin user gets 403."""
        _override_as_employee()
        try:
            async with await _client() as client:
                response = await client.get(f"{API}/admin/api-keys", headers=AUTH_HEADERS)
            assert response.status_code == 403
        finally:
            _clear_user_override()


# ===========================================================================
# HTTP tests: PUT /api/v1/admin/api-keys
# ===========================================================================


@pytest.mark.asyncio
class TestUpdateApiKeys:
    async def test_returns_200(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """PUT /admin/api-keys returns 200 for admin."""
        from app.core.config import settings  # noqa: PLC0415

        key = Fernet.generate_key().decode()
        monkeypatch.setattr(settings, "encryption_key", key)

        # PUT body sends one key update.
        # The endpoint does model_dump(exclude_unset=True), so only the supplied
        # key is iterated. For that key: 1 DB query (check existing).
        # Then it calls get_api_keys() which does 8 queries (one per MANAGED_KEY).
        # Total: 1 + 8 = 9 results needed.
        results = [_FakeResult(scalar=None)] + [_FakeResult(scalar=None) for _ in MANAGED_KEYS]
        db = _FakeSession(execute_results=results)
        async with await _client(db) as client:
            response = await client.put(
                f"{API}/admin/api-keys",
                json={"anthropic_api_key": "sk-test-123"},
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 200

    async def test_response_is_list_of_statuses(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Response is a list of APIKeyStatus objects."""
        from app.core.config import settings  # noqa: PLC0415

        key = Fernet.generate_key().decode()
        monkeypatch.setattr(settings, "encryption_key", key)

        results = [_FakeResult(scalar=None)] + [_FakeResult(scalar=None) for _ in MANAGED_KEYS]
        db = _FakeSession(execute_results=results)
        async with await _client(db) as client:
            response = await client.put(
                f"{API}/admin/api-keys",
                json={"anthropic_api_key": "sk-test-456"},
                headers=AUTH_HEADERS,
            )

        data = response.json()
        assert isinstance(data, list)
        assert len(data) == len(MANAGED_KEYS)

    async def test_requires_auth_401(self) -> None:
        """Unauthenticated PUT returns 401."""
        async with await _client() as client:
            response = await client.put(
                f"{API}/admin/api-keys",
                json={"anthropic_api_key": "sk-test"},
            )

        assert response.status_code == 401

    async def test_non_admin_returns_403(self) -> None:
        """Non-admin PUT returns 403."""
        _override_as_employee()
        try:
            async with await _client() as client:
                response = await client.put(
                    f"{API}/admin/api-keys",
                    json={"anthropic_api_key": "sk-test"},
                    headers=AUTH_HEADERS,
                )
            assert response.status_code == 403
        finally:
            _clear_user_override()
