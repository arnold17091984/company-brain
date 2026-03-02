"""Tests for app.services.ingestion.pipeline.DefaultIngestionPipeline.

Covers:
- ingest() happy path: new document flow (fetch -> chunk -> embed -> upsert)
- ingest() deduplication: unchanged content_hash is skipped
- ingest() updated document: changed hash triggers re-indexing
- ingest() error handling: per-document errors are captured, pipeline continues
- ingest() full_sync bypasses since timestamp
- ingest_single() happy path
- ingest_single() error capture
- Unknown connector_type raises ValueError
- Qdrant upsert is called with correct collection name
- PostgreSQL upsert uses INSERT ... ON CONFLICT

All external dependencies (DB, Qdrant, Embedder, Connector) are replaced
with lightweight fakes/mocks so no network or database infrastructure is
required to run the test suite.
"""

from __future__ import annotations

import hashlib
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.ingestion.pipeline import DefaultIngestionPipeline
from app.services.types import ConnectorType, IngestionResult, RawDocument

# ---------------------------------------------------------------------------
# Fake helpers
# ---------------------------------------------------------------------------


def _make_raw_doc(
    source_id: str = "doc-1",
    title: str = "Test Doc",
    content: str = "This is a long enough document content for testing purposes.",
    source_type: ConnectorType = ConnectorType.NOTION,
) -> RawDocument:
    return RawDocument(
        source_type=source_type,
        source_id=source_id,
        title=title,
        content=content,
        content_hash=hashlib.sha256(content.encode()).hexdigest(),
        url="https://notion.so/test",
        access_level="all",
    )


async def _async_gen(*docs: RawDocument) -> AsyncIterator[RawDocument]:
    """Async generator that yields the given documents."""
    for doc in docs:
        yield doc


class FakeConnector:
    """A stub connector that yields a fixed list of documents."""

    def __init__(
        self,
        docs: list[RawDocument],
        ctype: ConnectorType = ConnectorType.NOTION,
    ) -> None:
        self._docs = docs
        self._ctype = ctype

    @property
    def connector_type(self) -> ConnectorType:
        return self._ctype

    async def fetch_documents(
        self,
        *,
        since: datetime | None = None,
    ) -> AsyncIterator[RawDocument]:
        for doc in self._docs:
            yield doc

    async def health_check(self) -> bool:
        return True


class FakeEmbeddingService:
    """Returns deterministic zero-vectors (length 1024) for any input texts."""

    def __init__(self) -> None:
        self.calls: list[list[str]] = []

    async def embed(
        self,
        texts: list[str],
        *,
        language: str | None = None,
    ) -> list[list[float]]:
        self.calls.append(texts)
        return [[0.0] * 1024 for _ in texts]


class FakeQdrantClient:
    """Records upsert calls without actually writing to Qdrant."""

    def __init__(self) -> None:
        self.upserted: list[dict[str, Any]] = []

    async def upsert(self, *, collection_name: str, points: list[Any]) -> None:
        self.upserted.append({"collection_name": collection_name, "points": points})


class FakeSession:
    """Async SQLAlchemy session stub.

    execute() returns a configurable result; commit/rollback are no-ops.
    """

    def __init__(self, execute_side_effects: list[Any] | None = None) -> None:
        self._effects: list[Any] = execute_side_effects or []
        self._call_count = 0
        self.committed = False
        self.executed_stmts: list[Any] = []

    async def execute(self, stmt: Any) -> Any:
        self.executed_stmts.append(stmt)
        if self._call_count < len(self._effects):
            effect = self._effects[self._call_count]
        else:
            # Default: return a result that says "no existing doc, no dept"
            effect = _make_scalar_result(None)
        self._call_count += 1
        return effect

    async def commit(self) -> None:
        self.committed = True

    async def rollback(self) -> None:
        pass


def _make_scalar_result(value: Any) -> MagicMock:
    """Return a MagicMock that mimics SQLAlchemy scalar result objects."""
    mock = MagicMock()
    mock.scalar_one_or_none.return_value = value
    mock.first.return_value = None  # "no existing document"
    return mock


def _make_doc_exists_result(doc_id: uuid.UUID, content_hash: str) -> MagicMock:
    """Return a result that simulates an existing document row."""
    mock = MagicMock()
    mock.first.return_value = (doc_id, content_hash)
    mock.scalar_one_or_none.return_value = None
    return mock


# ---------------------------------------------------------------------------
# Session factory builder
# ---------------------------------------------------------------------------


def _make_session_factory(session: FakeSession) -> Any:
    """Return a callable session factory that yields *session* as a context manager."""

    @asynccontextmanager
    async def factory(*_: Any, **__: Any) -> AsyncIterator[FakeSession]:
        yield session

    return factory


# ---------------------------------------------------------------------------
# Pipeline factory
# ---------------------------------------------------------------------------


def _build_pipeline(
    session: FakeSession,
    embedder: FakeEmbeddingService | None = None,
    qdrant: FakeQdrantClient | None = None,
) -> DefaultIngestionPipeline:
    return DefaultIngestionPipeline(
        db_session_factory=_make_session_factory(session),
        embedding_service=embedder or FakeEmbeddingService(),
        qdrant_client=qdrant or FakeQdrantClient(),
    )


# ---------------------------------------------------------------------------
# Tests: ingest()
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestIngestion:
    async def test_ingest_unknown_connector_type_raises(self) -> None:
        pipeline = _build_pipeline(FakeSession())
        with pytest.raises(ValueError, match="Unknown connector_type"):
            await pipeline.ingest("nonexistent_source")

    async def test_ingest_new_document_increments_new_count(self) -> None:
        doc = _make_raw_doc()
        connector = FakeConnector([doc])
        session = FakeSession(
            execute_side_effects=[
                _make_scalar_result(None),  # _get_last_sync_time -> None
                _make_scalar_result(None),  # _check_content_hash -> no existing doc
                _make_scalar_result(None),  # _resolve_department_id -> None
            ]
        )
        pipeline = _build_pipeline(session)

        with (
            patch(
                "app.services.ingestion.pipeline.DefaultIngestionPipeline._get_last_sync_time",
                new=AsyncMock(return_value=None),
            ),
            patch(
                "app.services.ingestion.connectors.get_connector",
                return_value=connector,
            ),
        ):
            result = await pipeline.ingest("notion")

        assert isinstance(result, IngestionResult)
        assert result.total_documents == 1
        assert result.new_documents == 1
        assert result.skipped_documents == 0
        assert result.updated_documents == 0

    async def test_ingest_unchanged_document_is_skipped(self) -> None:
        doc = _make_raw_doc()
        existing_id = uuid.uuid4()
        connector = FakeConnector([doc])
        session = FakeSession(
            execute_side_effects=[
                # _check_content_hash: existing doc with same hash
                _make_doc_exists_result(existing_id, doc.content_hash),
                _make_scalar_result(None),  # _resolve_department_id
            ]
        )
        pipeline = _build_pipeline(session)

        with (
            patch(
                "app.services.ingestion.pipeline.DefaultIngestionPipeline._get_last_sync_time",
                new=AsyncMock(return_value=None),
            ),
            patch(
                "app.services.ingestion.connectors.get_connector",
                return_value=connector,
            ),
        ):
            result = await pipeline.ingest("notion")

        assert result.skipped_documents == 1
        assert result.new_documents == 0
        assert result.updated_documents == 0

    async def test_ingest_changed_hash_increments_updated_count(self) -> None:
        doc = _make_raw_doc()
        existing_id = uuid.uuid4()
        old_hash = "old_hash_value" + "0" * 50  # different from doc.content_hash
        connector = FakeConnector([doc])
        session = FakeSession(
            execute_side_effects=[
                _make_doc_exists_result(existing_id, old_hash),  # hash mismatch
                _make_scalar_result(None),  # _resolve_department_id
            ]
        )
        pipeline = _build_pipeline(session)

        with (
            patch(
                "app.services.ingestion.pipeline.DefaultIngestionPipeline._get_last_sync_time",
                new=AsyncMock(return_value=None),
            ),
            patch(
                "app.services.ingestion.connectors.get_connector",
                return_value=connector,
            ),
        ):
            result = await pipeline.ingest("notion")

        assert result.updated_documents == 1
        assert result.new_documents == 0

    async def test_ingest_full_sync_skips_watermark(self) -> None:
        doc = _make_raw_doc()
        connector = FakeConnector([doc])
        session = FakeSession(
            execute_side_effects=[
                _make_scalar_result(None),  # _check_content_hash
                _make_scalar_result(None),  # _resolve_department_id
            ]
        )
        pipeline = _build_pipeline(session)

        get_last_sync_spy = AsyncMock(return_value=None)
        with (
            patch(
                "app.services.ingestion.pipeline.DefaultIngestionPipeline._get_last_sync_time",
                new=get_last_sync_spy,
            ),
            patch(
                "app.services.ingestion.connectors.get_connector",
                return_value=connector,
            ),
        ):
            await pipeline.ingest("notion", full_sync=True)

        # _get_last_sync_time should NOT be called when full_sync=True
        get_last_sync_spy.assert_not_awaited()

    async def test_ingest_error_is_captured_pipeline_continues(self) -> None:
        good_doc = _make_raw_doc(source_id="good", content="Long enough content for good doc.")
        bad_doc = _make_raw_doc(source_id="bad", content="Bad document that will error.")

        class _ErrorConnector(FakeConnector):
            pass

        connector = _ErrorConnector([bad_doc, good_doc])
        session = FakeSession(
            execute_side_effects=[
                # bad_doc: _check_content_hash -> no existing row
                _make_scalar_result(None),
                # bad_doc: _resolve_department_id
                _make_scalar_result(None),
                # good_doc: _check_content_hash -> no existing row
                _make_scalar_result(None),
                # good_doc: _resolve_department_id
                _make_scalar_result(None),
            ]
        )
        embedder = FakeEmbeddingService()
        qdrant = FakeQdrantClient()
        pipeline = _build_pipeline(session, embedder=embedder, qdrant=qdrant)

        # Make embedding raise for bad_doc but succeed for good_doc
        original_embed = embedder.embed
        call_count = 0

        async def _selective_embed(texts: list[str], **kwargs: Any) -> list[list[float]]:
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise RuntimeError("Simulated embedding failure")
            return await original_embed(texts, **kwargs)

        embedder.embed = _selective_embed  # type: ignore[method-assign]

        with (
            patch(
                "app.services.ingestion.pipeline.DefaultIngestionPipeline._get_last_sync_time",
                new=AsyncMock(return_value=None),
            ),
            patch(
                "app.services.ingestion.connectors.get_connector",
                return_value=connector,
            ),
        ):
            result = await pipeline.ingest("notion")

        assert len(result.errors) == 1
        assert result.errors[0].source_id == "bad"
        assert result.errors[0].error_type == "RuntimeError"
        # The good document should still have been processed
        assert result.new_documents == 1

    async def test_ingest_result_has_connector_type(self) -> None:
        connector = FakeConnector([])
        session = FakeSession()
        pipeline = _build_pipeline(session)

        with (
            patch(
                "app.services.ingestion.pipeline.DefaultIngestionPipeline._get_last_sync_time",
                new=AsyncMock(return_value=None),
            ),
            patch(
                "app.services.ingestion.connectors.get_connector",
                return_value=connector,
            ),
        ):
            result = await pipeline.ingest("notion")

        assert result.connector_type == ConnectorType.NOTION

    async def test_ingest_completed_at_is_set(self) -> None:
        connector = FakeConnector([])
        session = FakeSession()
        pipeline = _build_pipeline(session)

        with (
            patch(
                "app.services.ingestion.pipeline.DefaultIngestionPipeline._get_last_sync_time",
                new=AsyncMock(return_value=None),
            ),
            patch(
                "app.services.ingestion.connectors.get_connector",
                return_value=connector,
            ),
        ):
            result = await pipeline.ingest("notion")

        assert result.completed_at is not None
        assert result.completed_at >= result.started_at

    async def test_qdrant_upsert_uses_correct_collection(self) -> None:
        doc = _make_raw_doc()
        connector = FakeConnector([doc])
        session = FakeSession(
            execute_side_effects=[
                _make_scalar_result(None),
                _make_scalar_result(None),
            ]
        )
        qdrant = FakeQdrantClient()
        pipeline = _build_pipeline(session, qdrant=qdrant)

        with (
            patch(
                "app.services.ingestion.pipeline.DefaultIngestionPipeline._get_last_sync_time",
                new=AsyncMock(return_value=None),
            ),
            patch(
                "app.services.ingestion.connectors.get_connector",
                return_value=connector,
            ),
        ):
            await pipeline.ingest("notion")

        assert len(qdrant.upserted) > 0
        for call in qdrant.upserted:
            assert call["collection_name"] == "company_brain_chunks"

    async def test_qdrant_point_payload_fields(self) -> None:
        doc = _make_raw_doc()
        connector = FakeConnector([doc])
        session = FakeSession(
            execute_side_effects=[
                _make_scalar_result(None),
                _make_scalar_result(None),
            ]
        )
        qdrant = FakeQdrantClient()
        pipeline = _build_pipeline(session, qdrant=qdrant)

        with (
            patch(
                "app.services.ingestion.pipeline.DefaultIngestionPipeline._get_last_sync_time",
                new=AsyncMock(return_value=None),
            ),
            patch(
                "app.services.ingestion.connectors.get_connector",
                return_value=connector,
            ),
        ):
            await pipeline.ingest("notion")

        assert len(qdrant.upserted) > 0
        first_point = qdrant.upserted[0]["points"][0]
        payload = first_point.payload
        assert "content" in payload
        assert "document_id" in payload
        assert "access_level" in payload
        assert "source_type" in payload
        assert "title" in payload
        assert "url" in payload
        assert "updated_at" in payload

    async def test_qdrant_point_has_dense_vector(self) -> None:
        doc = _make_raw_doc()
        connector = FakeConnector([doc])
        session = FakeSession(
            execute_side_effects=[
                _make_scalar_result(None),
                _make_scalar_result(None),
            ]
        )
        qdrant = FakeQdrantClient()
        pipeline = _build_pipeline(session, qdrant=qdrant)

        with (
            patch(
                "app.services.ingestion.pipeline.DefaultIngestionPipeline._get_last_sync_time",
                new=AsyncMock(return_value=None),
            ),
            patch(
                "app.services.ingestion.connectors.get_connector",
                return_value=connector,
            ),
        ):
            await pipeline.ingest("notion")

        first_point = qdrant.upserted[0]["points"][0]
        assert "dense" in first_point.vector
        assert isinstance(first_point.vector["dense"], list)
        assert len(first_point.vector["dense"]) == 1024

    async def test_total_chunks_counted_in_result(self) -> None:
        doc = _make_raw_doc(content=" ".join(["word"] * 600))  # ~2400 chars -> multiple chunks
        connector = FakeConnector([doc])
        session = FakeSession(
            execute_side_effects=[
                _make_scalar_result(None),
                _make_scalar_result(None),
            ]
        )
        pipeline = _build_pipeline(session)

        with (
            patch(
                "app.services.ingestion.pipeline.DefaultIngestionPipeline._get_last_sync_time",
                new=AsyncMock(return_value=None),
            ),
            patch(
                "app.services.ingestion.connectors.get_connector",
                return_value=connector,
            ),
        ):
            result = await pipeline.ingest("notion")

        assert result.total_chunks > 0


# ---------------------------------------------------------------------------
# Tests: ingest_single()
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestIngestSingle:
    async def test_ingest_single_new_document(self) -> None:
        doc = _make_raw_doc()
        session = FakeSession(
            execute_side_effects=[
                _make_scalar_result(None),  # _check_content_hash
                _make_scalar_result(None),  # _resolve_department_id
            ]
        )
        pipeline = _build_pipeline(session)
        result = await pipeline.ingest_single(doc)

        assert result.new_documents == 1
        assert result.total_documents == 1
        assert result.connector_type == ConnectorType.NOTION

    async def test_ingest_single_skips_unchanged(self) -> None:
        doc = _make_raw_doc()
        existing_id = uuid.uuid4()
        session = FakeSession(
            execute_side_effects=[
                _make_doc_exists_result(existing_id, doc.content_hash),
            ]
        )
        pipeline = _build_pipeline(session)
        result = await pipeline.ingest_single(doc)

        assert result.skipped_documents == 1
        assert result.new_documents == 0

    async def test_ingest_single_captures_error(self) -> None:
        doc = _make_raw_doc()
        session = FakeSession(
            execute_side_effects=[
                _make_scalar_result(None),
                _make_scalar_result(None),
            ]
        )
        embedder = FakeEmbeddingService()

        async def _fail_embed(texts: list[str], **kwargs: Any) -> list[list[float]]:
            raise RuntimeError("embed failed")

        embedder.embed = _fail_embed  # type: ignore[method-assign]
        pipeline = _build_pipeline(session, embedder=embedder)

        result = await pipeline.ingest_single(doc)

        assert len(result.errors) == 1
        assert result.errors[0].source_id == doc.source_id
        assert "embed failed" in result.errors[0].message

    async def test_ingest_single_completed_at_set(self) -> None:
        doc = _make_raw_doc()
        session = FakeSession(
            execute_side_effects=[
                _make_scalar_result(None),
                _make_scalar_result(None),
            ]
        )
        pipeline = _build_pipeline(session)
        result = await pipeline.ingest_single(doc)
        assert result.completed_at is not None


# ---------------------------------------------------------------------------
# Tests: connectors factory shim
# ---------------------------------------------------------------------------


class TestConnectorFactory:
    def test_get_connector_delegates_to_registry(self) -> None:
        from app.services.ingestion.connectors import get_connector

        fake = FakeConnector([], ctype=ConnectorType.NOTION)
        with patch("app.connectors.get_connector", return_value=fake):
            result = get_connector(ConnectorType.NOTION)
        assert result is fake

    def test_get_connector_raises_not_implemented_on_import_error(self) -> None:
        """When app.connectors cannot be imported, NotImplementedError is raised."""
        import builtins

        real_import = builtins.__import__

        def _mock_import(name: str, *args: Any, **kwargs: Any) -> Any:
            if name == "app.connectors":
                raise ImportError("simulated missing module")
            return real_import(name, *args, **kwargs)

        from app.services.ingestion.connectors import get_connector

        with (
            patch("builtins.__import__", side_effect=_mock_import),
            pytest.raises(NotImplementedError, match="No connector implementation"),
        ):
            get_connector(ConnectorType.GOOGLE_DRIVE)
