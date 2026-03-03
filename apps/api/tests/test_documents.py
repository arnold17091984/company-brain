"""Tests for Document Management endpoints.

Covers:
- GET  /api/v1/documents        — paginated list with search / filter
- GET  /api/v1/documents/{id}   — single document detail
- DELETE /api/v1/documents/{id} — 404 for unknown IDs, success path
- POST /api/v1/documents/upload — file upload creates a DB record
- Schema serialisation correctness

Design decisions
----------------
- Uses ``httpx.AsyncClient`` with ``ASGITransport`` (same pattern as test_routes.py).
- Dev-token header bypasses Google JWKS — no external calls needed.
- ``get_db`` is overridden with ``_FakeSession`` so no real PostgreSQL is needed.
- File uploads are exercised via ``httpx``'s ``files`` parameter.
"""

from __future__ import annotations

import io
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
        self.deleted: list[Any] = []
        self.committed = False
        self.flushed = False

    async def execute(self, _stmt: Any) -> _FakeResult:
        if self._results:
            return self._results.pop(0)
        return _FakeResult(rows=[], scalar=0)

    def add(self, obj: Any) -> None:
        self.added.append(obj)

    async def delete(self, obj: Any) -> None:
        self.deleted.append(obj)

    async def flush(self) -> None:
        self.flushed = True
        for obj in self.added:
            if not getattr(obj, "id", None):
                obj.id = uuid.uuid4()
            # Populate timestamps if missing (mirrors server_default behaviour)
            now = datetime.now(tz=UTC)
            if not getattr(obj, "created_at", None):
                obj.created_at = now
            if not getattr(obj, "updated_at", None):
                obj.updated_at = now

    async def commit(self) -> None:
        self.committed = True

    async def rollback(self) -> None:
        pass


def _make_db_override(session: _FakeSession | None = None):
    """Return a (dependency, override) tuple for FastAPI dependency injection."""
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
# Fake Document ORM objects
# ---------------------------------------------------------------------------


def _make_doc(
    *,
    doc_id: uuid.UUID | None = None,
    title: str = "Leave Policy.pdf",
    source_type: str = "upload",
    access_level: str = "restricted",
    indexed_at: datetime | None = None,
    file_size: int = 12345,
    mime_type: str = "application/pdf",
    error: str | None = None,
) -> Any:
    """Build a minimal fake Document ORM object."""

    class _FakeDoc:
        pass

    doc = _FakeDoc()
    doc.id = doc_id or uuid.uuid4()
    doc.title = title
    doc.source_type = source_type
    doc.source_id = title
    doc.content_hash = "abc123"
    doc.access_level = access_level
    doc.department_id = None
    doc.category = "general"
    doc.related_employee_id = None
    doc.indexed_at = indexed_at
    doc.created_at = datetime(2026, 1, 1, tzinfo=UTC)
    doc.updated_at = datetime(2026, 2, 1, tzinfo=UTC)
    doc.metadata_ = {
        "file_size": file_size,
        "mime_type": mime_type,
        **({"error": error} if error else {}),
    }
    return doc


# ---------------------------------------------------------------------------
# GET /api/v1/documents — list documents
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestListDocuments:
    async def test_list_returns_200(self) -> None:
        """Authenticated request to list documents returns HTTP 200."""
        db = _FakeSession(
            execute_results=[
                _FakeResult(scalar=0),  # count query
                _FakeResult(rows=[]),  # paginated rows
            ]
        )

        async with await _client(db) as client:
            response = await client.get(f"{API}/documents", headers=AUTH_HEADERS)

        assert response.status_code == 200

    async def test_list_requires_auth(self) -> None:
        """Unauthenticated request returns 401."""
        async with await _client() as client:
            response = await client.get(f"{API}/documents")

        assert response.status_code == 401

    async def test_list_response_shape(self) -> None:
        """Response contains documents, total, page, page_size keys."""
        db = _FakeSession(
            execute_results=[
                _FakeResult(scalar=0),
                _FakeResult(rows=[]),
            ]
        )

        async with await _client(db) as client:
            response = await client.get(f"{API}/documents", headers=AUTH_HEADERS)

        body = response.json()
        assert "documents" in body
        assert "total" in body
        assert "page" in body
        assert "page_size" in body

    async def test_list_returns_correct_defaults(self) -> None:
        """Default page=1 and page_size=20 are reflected in the response."""
        db = _FakeSession(
            execute_results=[
                _FakeResult(scalar=0),
                _FakeResult(rows=[]),
            ]
        )

        async with await _client(db) as client:
            response = await client.get(f"{API}/documents", headers=AUTH_HEADERS)

        body = response.json()
        assert body["page"] == 1
        assert body["page_size"] == 20

    async def test_list_includes_document_items(self) -> None:
        """Documents returned from DB appear in the response list."""
        doc = _make_doc(title="HR Handbook.docx")
        db = _FakeSession(
            execute_results=[
                _FakeResult(scalar=1),
                _FakeResult(rows=[doc]),
            ]
        )

        async with await _client(db) as client:
            response = await client.get(f"{API}/documents", headers=AUTH_HEADERS)

        body = response.json()
        assert body["total"] == 1
        assert len(body["documents"]) == 1
        assert body["documents"][0]["title"] == "HR Handbook.docx"

    async def test_list_document_item_shape(self) -> None:
        """Each document item contains all required DocumentSummary fields."""
        doc = _make_doc()
        db = _FakeSession(
            execute_results=[
                _FakeResult(scalar=1),
                _FakeResult(rows=[doc]),
            ]
        )

        async with await _client(db) as client:
            response = await client.get(f"{API}/documents", headers=AUTH_HEADERS)

        item = response.json()["documents"][0]
        for field in (
            "id",
            "title",
            "source_type",
            "status",
            "access_level",
            "created_at",
            "updated_at",
        ):
            assert field in item, f"Missing field: {field}"

    async def test_list_status_processing_when_not_indexed(self) -> None:
        """A document without indexed_at and no error has status 'processing'."""
        doc = _make_doc(indexed_at=None)
        db = _FakeSession(
            execute_results=[
                _FakeResult(scalar=1),
                _FakeResult(rows=[doc]),
            ]
        )

        async with await _client(db) as client:
            response = await client.get(f"{API}/documents", headers=AUTH_HEADERS)

        assert response.json()["documents"][0]["status"] == "processing"

    async def test_list_status_indexed_when_indexed_at_set(self) -> None:
        """A document with indexed_at set has status 'indexed'."""
        doc = _make_doc(indexed_at=datetime(2026, 2, 15, tzinfo=UTC))
        db = _FakeSession(
            execute_results=[
                _FakeResult(scalar=1),
                _FakeResult(rows=[doc]),
            ]
        )

        async with await _client(db) as client:
            response = await client.get(f"{API}/documents", headers=AUTH_HEADERS)

        assert response.json()["documents"][0]["status"] == "indexed"

    async def test_list_status_error_when_metadata_error_set(self) -> None:
        """A document with metadata_['error'] has status 'error'."""
        doc = _make_doc(error="chunking failed")
        db = _FakeSession(
            execute_results=[
                _FakeResult(scalar=1),
                _FakeResult(rows=[doc]),
            ]
        )

        async with await _client(db) as client:
            response = await client.get(f"{API}/documents", headers=AUTH_HEADERS)

        assert response.json()["documents"][0]["status"] == "error"

    async def test_list_custom_pagination(self) -> None:
        """Custom page and page_size query params are echoed in the response."""
        db = _FakeSession(
            execute_results=[
                _FakeResult(scalar=50),
                _FakeResult(rows=[]),
            ]
        )

        async with await _client(db) as client:
            response = await client.get(
                f"{API}/documents",
                params={"page": 3, "page_size": 5},
                headers=AUTH_HEADERS,
            )

        body = response.json()
        assert body["page"] == 3
        assert body["page_size"] == 5

    async def test_list_invalid_page_returns_422(self) -> None:
        """page < 1 fails Pydantic validation."""
        async with await _client() as client:
            response = await client.get(
                f"{API}/documents",
                params={"page": 0},
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 422

    async def test_list_search_filter_passes_through(self) -> None:
        """Passing a search term returns 200 (DB filter is applied server-side)."""
        db = _FakeSession(
            execute_results=[
                _FakeResult(scalar=0),
                _FakeResult(rows=[]),
            ]
        )

        async with await _client(db) as client:
            response = await client.get(
                f"{API}/documents",
                params={"search": "leave policy"},
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 200

    async def test_list_source_type_filter_passes_through(self) -> None:
        """Passing a source_type filter returns 200 (DB filter applied server-side)."""
        db = _FakeSession(
            execute_results=[
                _FakeResult(scalar=0),
                _FakeResult(rows=[]),
            ]
        )

        async with await _client(db) as client:
            response = await client.get(
                f"{API}/documents",
                params={"source_type": "google_drive"},
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 200

    async def test_list_returns_file_size_and_mime_type(self) -> None:
        """file_size and mime_type from metadata_ appear in the response."""
        doc = _make_doc(file_size=98765, mime_type="text/plain")
        db = _FakeSession(
            execute_results=[
                _FakeResult(scalar=1),
                _FakeResult(rows=[doc]),
            ]
        )

        async with await _client(db) as client:
            response = await client.get(f"{API}/documents", headers=AUTH_HEADERS)

        item = response.json()["documents"][0]
        assert item["file_size"] == 98765
        assert item["mime_type"] == "text/plain"


# ---------------------------------------------------------------------------
# GET /api/v1/documents/{id} — single document
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestGetDocument:
    async def test_get_returns_200_for_known_id(self) -> None:
        """A valid UUID that exists in the DB returns HTTP 200."""
        doc_id = uuid.uuid4()
        doc = _make_doc(doc_id=doc_id)
        db = _FakeSession(execute_results=[_FakeResult(scalar=doc)])

        async with await _client(db) as client:
            response = await client.get(f"{API}/documents/{doc_id}", headers=AUTH_HEADERS)

        assert response.status_code == 200

    async def test_get_returns_document_summary(self) -> None:
        """The response matches DocumentSummary shape."""
        doc_id = uuid.uuid4()
        doc = _make_doc(doc_id=doc_id, title="Expense Report.xlsx")
        db = _FakeSession(execute_results=[_FakeResult(scalar=doc)])

        async with await _client(db) as client:
            response = await client.get(f"{API}/documents/{doc_id}", headers=AUTH_HEADERS)

        body = response.json()
        assert body["id"] == str(doc_id)
        assert body["title"] == "Expense Report.xlsx"

    async def test_get_returns_404_for_unknown_id(self) -> None:
        """A UUID not in the DB returns HTTP 404."""
        db = _FakeSession(execute_results=[_FakeResult(scalar=None)])

        async with await _client(db) as client:
            response = await client.get(f"{API}/documents/{uuid.uuid4()}", headers=AUTH_HEADERS)

        assert response.status_code == 404

    async def test_get_returns_400_for_invalid_uuid(self) -> None:
        """A non-UUID path segment returns HTTP 400."""
        async with await _client() as client:
            response = await client.get(f"{API}/documents/not-a-uuid", headers=AUTH_HEADERS)

        assert response.status_code == 400

    async def test_get_requires_auth(self) -> None:
        """Unauthenticated request returns 401."""
        async with await _client() as client:
            response = await client.get(f"{API}/documents/{uuid.uuid4()}")

        assert response.status_code == 401


# ---------------------------------------------------------------------------
# DELETE /api/v1/documents/{id}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestDeleteDocument:
    async def test_delete_returns_200_for_known_id(self) -> None:
        """Deleting an existing document returns HTTP 200 with deleted=true."""
        doc_id = uuid.uuid4()
        doc = _make_doc(doc_id=doc_id)
        db = _FakeSession(execute_results=[_FakeResult(scalar=doc)])

        async with await _client(db) as client:
            response = await client.delete(f"{API}/documents/{doc_id}", headers=AUTH_HEADERS)

        assert response.status_code == 200
        assert response.json() == {"deleted": True}

    async def test_delete_returns_404_for_unknown_id(self) -> None:
        """Attempting to delete a non-existent document returns HTTP 404."""
        db = _FakeSession(execute_results=[_FakeResult(scalar=None)])

        async with await _client(db) as client:
            response = await client.delete(f"{API}/documents/{uuid.uuid4()}", headers=AUTH_HEADERS)

        assert response.status_code == 404

    async def test_delete_returns_400_for_invalid_uuid(self) -> None:
        """Non-UUID path segment returns 400 on delete."""
        async with await _client() as client:
            response = await client.delete(f"{API}/documents/not-a-uuid", headers=AUTH_HEADERS)

        assert response.status_code == 400

    async def test_delete_requires_auth(self) -> None:
        """Unauthenticated delete returns 401."""
        async with await _client() as client:
            response = await client.delete(f"{API}/documents/{uuid.uuid4()}")

        assert response.status_code == 401

    async def test_delete_commits_session(self) -> None:
        """Successful delete calls commit on the DB session."""
        doc_id = uuid.uuid4()
        doc = _make_doc(doc_id=doc_id)
        db = _FakeSession(execute_results=[_FakeResult(scalar=doc)])

        async with await _client(db) as client:
            await client.delete(f"{API}/documents/{doc_id}", headers=AUTH_HEADERS)

        assert db.committed


# ---------------------------------------------------------------------------
# POST /api/v1/documents/upload
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestUploadDocument:
    async def test_upload_pdf_returns_201(self) -> None:
        """Uploading a PDF file returns HTTP 201."""
        db = _FakeSession()

        async with await _client(db) as client:
            response = await client.post(
                f"{API}/documents/upload",
                files={
                    "file": ("report.pdf", io.BytesIO(b"%PDF-1.4 fake content"), "application/pdf")
                },
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 201

    async def test_upload_response_shape(self) -> None:
        """Upload response contains id, title, and status fields."""
        db = _FakeSession()

        async with await _client(db) as client:
            response = await client.post(
                f"{API}/documents/upload",
                files={"file": ("notes.txt", io.BytesIO(b"some text content"), "text/plain")},
                headers=AUTH_HEADERS,
            )

        body = response.json()
        assert "id" in body
        assert "title" in body
        assert "status" in body

    async def test_upload_initial_status_is_processing(self) -> None:
        """Newly uploaded documents have status 'processing'."""
        db = _FakeSession()

        async with await _client(db) as client:
            response = await client.post(
                f"{API}/documents/upload",
                files={"file": ("doc.md", io.BytesIO(b"# Title\nContent"), "text/markdown")},
                headers=AUTH_HEADERS,
            )

        assert response.json()["status"] == "processing"

    async def test_upload_title_matches_filename(self) -> None:
        """The returned title matches the uploaded filename."""
        db = _FakeSession()

        async with await _client(db) as client:
            response = await client.post(
                f"{API}/documents/upload",
                files={"file": ("quarterly_report.csv", io.BytesIO(b"col1,col2\n1,2"), "text/csv")},
                headers=AUTH_HEADERS,
            )

        assert response.json()["title"] == "quarterly_report.csv"

    async def test_upload_creates_db_record(self) -> None:
        """A Document ORM object is added to the DB session."""
        db = _FakeSession()

        async with await _client(db) as client:
            await client.post(
                f"{API}/documents/upload",
                files={"file": ("policy.txt", io.BytesIO(b"policy text"), "text/plain")},
                headers=AUTH_HEADERS,
            )

        assert len(db.added) == 1
        from app.models.database import Document  # noqa: PLC0415

        assert isinstance(db.added[0], Document)

    async def test_upload_sets_source_type_upload(self) -> None:
        """The created Document has source_type='upload'."""
        db = _FakeSession()

        async with await _client(db) as client:
            await client.post(
                f"{API}/documents/upload",
                files={"file": ("file.txt", io.BytesIO(b"data"), "text/plain")},
                headers=AUTH_HEADERS,
            )

        assert db.added[0].source_type == "upload"

    async def test_upload_computes_content_hash(self) -> None:
        """The Document's content_hash is a 64-character hex string (SHA-256)."""
        db = _FakeSession()

        async with await _client(db) as client:
            await client.post(
                f"{API}/documents/upload",
                files={"file": ("file.txt", io.BytesIO(b"hello world"), "text/plain")},
                headers=AUTH_HEADERS,
            )

        content_hash = db.added[0].content_hash
        assert len(content_hash) == 64
        assert all(c in "0123456789abcdef" for c in content_hash)

    async def test_upload_rejects_unsupported_extension(self) -> None:
        """An .exe file is rejected with HTTP 400."""
        db = _FakeSession()

        async with await _client(db) as client:
            response = await client.post(
                f"{API}/documents/upload",
                files={"file": ("malware.exe", io.BytesIO(b"MZ"), "application/octet-stream")},
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 400

    async def test_upload_rejects_html_extension(self) -> None:
        """An .html file is rejected with HTTP 400."""
        db = _FakeSession()

        async with await _client(db) as client:
            response = await client.post(
                f"{API}/documents/upload",
                files={"file": ("page.html", io.BytesIO(b"<html>"), "text/html")},
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 400

    async def test_upload_accepts_docx(self) -> None:
        """A .docx file is accepted (201)."""
        db = _FakeSession()

        async with await _client(db) as client:
            response = await client.post(
                f"{API}/documents/upload",
                files={
                    "file": (
                        "contract.docx",
                        io.BytesIO(b"PK fake docx bytes"),
                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    )
                },
                headers=AUTH_HEADERS,
            )

        assert response.status_code == 201

    async def test_upload_requires_auth(self) -> None:
        """Unauthenticated upload returns 401."""
        async with await _client() as client:
            response = await client.post(
                f"{API}/documents/upload",
                files={"file": ("doc.txt", io.BytesIO(b"text"), "text/plain")},
            )

        assert response.status_code == 401

    async def test_upload_stores_file_size_in_metadata(self) -> None:
        """The created Document's metadata_ contains the correct file_size."""
        content = b"x" * 1024
        db = _FakeSession()

        async with await _client(db) as client:
            await client.post(
                f"{API}/documents/upload",
                files={"file": ("big.txt", io.BytesIO(content), "text/plain")},
                headers=AUTH_HEADERS,
            )

        assert db.added[0].metadata_["file_size"] == 1024

    async def test_upload_stores_mime_type_in_metadata(self) -> None:
        """The created Document's metadata_ contains the MIME type."""
        db = _FakeSession()

        async with await _client(db) as client:
            await client.post(
                f"{API}/documents/upload",
                files={"file": ("data.csv", io.BytesIO(b"a,b\n1,2"), "text/csv")},
                headers=AUTH_HEADERS,
            )

        assert db.added[0].metadata_["mime_type"] == "text/csv"


# ---------------------------------------------------------------------------
# Schema serialisation
# ---------------------------------------------------------------------------


class TestDocumentSchemas:
    def test_document_summary_serialises_correctly(self) -> None:
        """DocumentSummary populates all fields from explicit values."""
        from app.models.schemas import DocumentSummary  # noqa: PLC0415

        doc_id = str(uuid.uuid4())
        summary = DocumentSummary(
            id=doc_id,
            title="Handbook.pdf",
            source_type="upload",
            status="indexed",
            access_level="restricted",
            created_at="2026-01-01T00:00:00+00:00",
            updated_at="2026-02-01T00:00:00+00:00",
            indexed_at="2026-02-15T12:00:00+00:00",
            file_size=4096,
            mime_type="application/pdf",
        )

        data = summary.model_dump()
        assert data["id"] == doc_id
        assert data["title"] == "Handbook.pdf"
        assert data["status"] == "indexed"
        assert data["file_size"] == 4096
        assert data["mime_type"] == "application/pdf"

    def test_document_summary_optional_fields_default_none(self) -> None:
        """indexed_at, file_size, and mime_type default to None when omitted."""
        from app.models.schemas import DocumentSummary  # noqa: PLC0415

        summary = DocumentSummary(
            id=str(uuid.uuid4()),
            title="Doc",
            source_type="upload",
            status="processing",
            access_level="restricted",
            created_at="2026-01-01T00:00:00",
            updated_at="2026-01-01T00:00:00",
        )

        assert summary.indexed_at is None
        assert summary.file_size is None
        assert summary.mime_type is None

    def test_document_list_response_serialises(self) -> None:
        """DocumentListResponse round-trips through model_dump."""
        from app.models.schemas import DocumentListResponse, DocumentSummary  # noqa: PLC0415

        summary = DocumentSummary(
            id=str(uuid.uuid4()),
            title="T",
            source_type="upload",
            status="processing",
            access_level="restricted",
            created_at="2026-01-01T00:00:00",
            updated_at="2026-01-01T00:00:00",
        )
        response = DocumentListResponse(documents=[summary], total=1, page=1, page_size=20)

        data = response.model_dump()
        assert data["total"] == 1
        assert len(data["documents"]) == 1

    def test_document_upload_response_serialises(self) -> None:
        """DocumentUploadResponse round-trips through model_dump."""
        from app.models.schemas import DocumentUploadResponse  # noqa: PLC0415

        doc_id = str(uuid.uuid4())
        resp = DocumentUploadResponse(id=doc_id, title="file.pdf", status="processing")

        data = resp.model_dump()
        assert data["id"] == doc_id
        assert data["status"] == "processing"
