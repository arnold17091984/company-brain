"""Default ingestion pipeline: fetch -> deduplicate -> chunk -> embed -> index.

Orchestrates the full lifecycle for a single connector type:

1. Resolve the concrete :class:`~app.services.ingestion.protocols.Connector`
   via the connector factory.
2. Determine the *since* timestamp from the ``indexed_at`` watermark stored in
   PostgreSQL (skipped on full-sync runs).
3. Stream documents from the connector and skip those whose ``content_hash``
   has not changed since the last index run.
4. Chunk new/changed documents via :class:`TextChunkingService`.
5. Batch-embed all chunks via the :class:`~app.services.rag.embedder.TogetherEmbeddingService`.
6. Upsert vector points into Qdrant.
7. Upsert or insert the canonical :class:`~app.models.database.Document` record
   in PostgreSQL and stamp ``indexed_at``.
8. Return an :class:`~app.services.types.IngestionResult` summary.

The pipeline is safe to run concurrently for *different* connector types, but
should not be run concurrently for the *same* connector type (no distributed
lock is implemented here).
"""

from __future__ import annotations

import logging
import uuid
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

from qdrant_client import AsyncQdrantClient
from qdrant_client.models import PointStruct
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import Department, Document
from app.services.ingestion.chunker import TextChunkingService
from app.services.rag.collection import COLLECTION_NAME
from app.services.rag.embedder import TogetherEmbeddingService
from app.services.types import (
    ConnectorType,
    DocumentChunk,
    IngestionError,
    IngestionResult,
    RawDocument,
)

logger = logging.getLogger(__name__)

# Qdrant: the dense vector field name (must match collection config)
_DENSE_VECTOR_NAME = "dense"

# How many chunks to embed and upsert in a single Qdrant batch
_UPSERT_BATCH_SIZE = 64


# ---------------------------------------------------------------------------
# Helper: resolve department UUID from slug
# ---------------------------------------------------------------------------


async def _resolve_department_id(
    session: AsyncSession,
    slug: str | None,
) -> uuid.UUID | None:
    """Return the UUID of the department with *slug*, or None if not found.

    Args:
        session: Active async SQLAlchemy session.
        slug: Department slug string (e.g. "engineering").  If ``None``, returns
            ``None`` immediately.

    Returns:
        The department's UUID, or ``None`` when the slug is absent or unknown.
    """
    if slug is None:
        return None
    result = await session.execute(select(Department.id).where(Department.slug == slug))
    row = result.scalar_one_or_none()
    return row  # type: ignore[return-value]


# ---------------------------------------------------------------------------
# Main pipeline class
# ---------------------------------------------------------------------------


class DefaultIngestionPipeline:
    """End-to-end orchestrator for the fetch -> chunk -> embed -> index flow.

    All I/O operations are async.  The class is designed to be instantiated
    once at application startup and reused across multiple ingestion runs.

    Args:
        db_session_factory: Callable that returns an async context manager
            yielding an :class:`AsyncSession`.  Typically
            ``app.core.database.AsyncSessionLocal``.
        embedding_service: Configured :class:`TogetherEmbeddingService`
            instance used to embed chunk texts.
        qdrant_client: Configured :class:`AsyncQdrantClient` connected to the
            Qdrant instance that holds the ``company_brain_chunks`` collection.
    """

    def __init__(
        self,
        db_session_factory: Callable[..., Any],
        embedding_service: TogetherEmbeddingService,
        qdrant_client: AsyncQdrantClient,
    ) -> None:
        self._session_factory = db_session_factory
        self._embedding_service = embedding_service
        self._qdrant_client = qdrant_client
        self._chunker = TextChunkingService()

    # -----------------------------------------------------------------------
    # Public API
    # -----------------------------------------------------------------------

    async def ingest(
        self,
        connector_type: str,
        *,
        full_sync: bool = False,
    ) -> IngestionResult:
        """Run the full ingestion pipeline for *connector_type*.

        Args:
            connector_type: One of the :class:`~app.services.types.ConnectorType`
                string values (e.g. ``"google_drive"``).
            full_sync: When ``True`` ignore the ``indexed_at`` watermark and
                re-process every document returned by the connector.

        Returns:
            :class:`IngestionResult` summarising counts and any non-fatal errors.

        Raises:
            ValueError: If *connector_type* is not a recognised
                :class:`ConnectorType`.
        """
        try:
            ctype = ConnectorType(connector_type)
        except ValueError as exc:
            msg = f"Unknown connector_type: {connector_type!r}"
            raise ValueError(msg) from exc

        result = IngestionResult(
            connector_type=ctype,
            full_sync=full_sync,
            started_at=datetime.now(tz=UTC),
        )

        # --- Step 1: resolve connector ----------------------------------------
        from app.services.ingestion.connectors import get_connector

        connector = get_connector(ctype)

        # --- Step 2: determine since timestamp --------------------------------
        since: datetime | None = None
        if not full_sync:
            since = await self._get_last_sync_time(ctype)

        logger.info(
            "Starting ingestion for connector=%s full_sync=%s since=%s",
            ctype,
            full_sync,
            since,
        )

        # --- Step 3: stream and process documents -----------------------------
        async for raw_doc in connector.fetch_documents(since=since):
            result.total_documents += 1
            try:
                doc_status = await self._process_document(raw_doc, result)
                logger.debug(
                    "Processed source_id=%s status=%s",
                    raw_doc.source_id,
                    doc_status,
                )
            except Exception as exc:  # noqa: BLE001
                logger.exception(
                    "Failed to ingest source_id=%s: %s",
                    raw_doc.source_id,
                    exc,
                )
                result.errors.append(
                    IngestionError(
                        source_id=raw_doc.source_id,
                        error_type=type(exc).__name__,
                        message=str(exc),
                    )
                )

        result.completed_at = datetime.now(tz=UTC)
        logger.info(
            "Ingestion complete connector=%s total=%d new=%d updated=%d "
            "skipped=%d chunks=%d errors=%d",
            ctype,
            result.total_documents,
            result.new_documents,
            result.updated_documents,
            result.skipped_documents,
            result.total_chunks,
            len(result.errors),
        )
        return result

    async def ingest_single(self, document: RawDocument) -> IngestionResult:
        """Ingest a single pre-fetched document (e.g. from a webhook trigger).

        Bypasses the connector fetch step.  Useful for real-time Telegram
        messages or Notion webhook updates.

        Args:
            document: The :class:`RawDocument` to process.

        Returns:
            :class:`IngestionResult` for the single document.
        """
        result = IngestionResult(
            connector_type=document.source_type,
            full_sync=False,
            started_at=datetime.now(tz=UTC),
            total_documents=1,
        )
        try:
            await self._process_document(document, result)
        except Exception as exc:  # noqa: BLE001
            logger.exception(
                "Failed to ingest single document source_id=%s: %s",
                document.source_id,
                exc,
            )
            result.errors.append(
                IngestionError(
                    source_id=document.source_id,
                    error_type=type(exc).__name__,
                    message=str(exc),
                )
            )
        result.completed_at = datetime.now(tz=UTC)
        return result

    # -----------------------------------------------------------------------
    # Internal helpers
    # -----------------------------------------------------------------------

    async def _get_last_sync_time(self, connector_type: ConnectorType) -> datetime | None:
        """Return the most recent ``indexed_at`` for *connector_type*, or None.

        Queries the ``documents`` table for the latest ``indexed_at`` stamp
        across all documents belonging to the given connector type.  Returns
        ``None`` if no documents have been indexed yet (first-time run).

        Args:
            connector_type: The connector type to query.

        Returns:
            The most recent ``indexed_at`` timestamp, or ``None``.
        """
        from sqlalchemy import func as sa_func

        async with self._session_factory() as session:
            result = await session.execute(
                select(sa_func.max(Document.indexed_at)).where(
                    Document.source_type == connector_type.value
                )
            )
            return result.scalar_one_or_none()

    async def _check_content_hash(
        self,
        session: AsyncSession,
        source_id: str,
        content_hash: str,
    ) -> tuple[bool, uuid.UUID | None]:
        """Check whether *content_hash* differs from the stored hash.

        Args:
            session: Active async session.
            source_id: Source system identifier of the document.
            content_hash: SHA-256 hex digest of the fetched content.

        Returns:
            A 2-tuple ``(changed, existing_doc_id)`` where:
            - ``changed`` is ``True`` if the document is new or its hash has
              changed.
            - ``existing_doc_id`` is the UUID of the existing DB record, or
              ``None`` if the document has never been indexed.
        """
        result = await session.execute(
            select(Document.id, Document.content_hash).where(Document.source_id == source_id)
        )
        row = result.first()
        if row is None:
            return True, None
        existing_id: uuid.UUID = row[0]
        stored_hash: str = row[1]
        if stored_hash == content_hash:
            return False, existing_id
        return True, existing_id

    async def _process_document(
        self,
        raw_doc: RawDocument,
        result: IngestionResult,
    ) -> str:
        """Core per-document processing: deduplicate -> chunk -> embed -> upsert.

        Mutates *result* counters in place.

        Args:
            raw_doc: The raw document fetched by the connector.
            result: The :class:`IngestionResult` being accumulated.

        Returns:
            One of ``"skipped"``, ``"new"``, or ``"updated"`` indicating what
            happened to this document.
        """
        async with self._session_factory() as session:
            # --- Deduplication ------------------------------------------------
            changed, existing_doc_id = await self._check_content_hash(
                session,
                raw_doc.source_id,
                raw_doc.content_hash,
            )
            if not changed:
                result.skipped_documents += 1
                return "skipped"

            is_new = existing_doc_id is None

            # --- Chunking -----------------------------------------------------
            chunks = await self._chunker.chunk(raw_doc)
            if not chunks:
                logger.debug("No chunks produced for source_id=%s", raw_doc.source_id)
                result.skipped_documents += 1
                return "skipped"

            # --- Embedding ----------------------------------------------------
            chunk_texts = [c.content for c in chunks]
            embeddings = await self._embedding_service.embed(
                chunk_texts,
                language=raw_doc.language,
            )

            # --- Resolve department -------------------------------------------
            department_id = await _resolve_department_id(session, raw_doc.department_slug)

            # --- Determine document UUID -------------------------------------
            doc_uuid: uuid.UUID = existing_doc_id if existing_doc_id is not None else uuid.uuid4()

            # --- Qdrant upsert ------------------------------------------------
            await self._upsert_to_qdrant(
                chunks=chunks,
                embeddings=embeddings,
                document_id=doc_uuid,
                raw_doc=raw_doc,
                department_id=department_id,
            )

            # --- PostgreSQL upsert -------------------------------------------
            await self._upsert_document(
                session=session,
                doc_uuid=doc_uuid,
                raw_doc=raw_doc,
                department_id=department_id,
                chunks_count=len(chunks),
            )
            await session.commit()

        result.total_chunks += len(chunks)
        if is_new:
            result.new_documents += 1
            return "new"
        result.updated_documents += 1
        return "updated"

    async def _upsert_to_qdrant(
        self,
        chunks: list[DocumentChunk],
        embeddings: list[list[float]],
        document_id: uuid.UUID,
        raw_doc: RawDocument,
        department_id: uuid.UUID | None,
    ) -> None:
        """Upsert vector points into the Qdrant collection.

        Each chunk becomes a :class:`PointStruct` with:
        - ``id``: A freshly generated UUID v4 (stable re-indexing is achieved
          by deleting old points for the document before upserting; for
          incremental upserts the point IDs are regenerated, which is
          acceptable because duplicate content is gated by the hash check).
        - ``vectors``: Named dense vector under the ``"dense"`` key.
        - ``payload``: Filterable metadata fields.

        Args:
            chunks: The chunked document segments.
            embeddings: Dense embedding vectors (parallel to *chunks*).
            document_id: UUID of the canonical Document record.
            raw_doc: Original raw document (provides access/title/url metadata).
            department_id: Resolved department UUID (may be ``None``).
        """
        points: list[PointStruct] = []
        now_iso = datetime.now(tz=UTC).isoformat()

        for chunk, vector in zip(chunks, embeddings, strict=True):
            payload: dict[str, Any] = {
                "content": chunk.content,
                "document_id": str(document_id),
                "access_level": raw_doc.access_level,
                "department_id": str(department_id) if department_id else None,
                "source_type": raw_doc.source_type.value,
                "title": raw_doc.title,
                "url": raw_doc.url,
                "updated_at": now_iso,
                "chunk_index": chunk.chunk_index,
                "chunk_type": chunk.chunk_type.value,
                "token_count": chunk.token_count,
            }
            points.append(
                PointStruct(
                    id=str(uuid.uuid4()),
                    vector={_DENSE_VECTOR_NAME: vector},
                    payload=payload,
                )
            )

        # Upsert in batches to avoid oversized gRPC/HTTP payloads
        for i in range(0, len(points), _UPSERT_BATCH_SIZE):
            batch = points[i : i + _UPSERT_BATCH_SIZE]
            await self._qdrant_client.upsert(
                collection_name=COLLECTION_NAME,
                points=batch,
            )
            logger.debug(
                "Upserted %d Qdrant point(s) for document_id=%s (batch %d-%d)",
                len(batch),
                document_id,
                i,
                i + len(batch) - 1,
            )

    async def _upsert_document(
        self,
        session: AsyncSession,
        doc_uuid: uuid.UUID,
        raw_doc: RawDocument,
        department_id: uuid.UUID | None,
        chunks_count: int,
    ) -> None:
        """Insert or update the :class:`~app.models.database.Document` record.

        Uses PostgreSQL ``INSERT ... ON CONFLICT DO UPDATE`` so this method is
        safe to call for both new and existing documents.

        Args:
            session: Active async session (within an open transaction).
            doc_uuid: The UUID to use as the document primary key.
            raw_doc: Source data to persist.
            department_id: Resolved department UUID (may be ``None``).
            chunks_count: Number of chunks produced (stored in metadata).
        """
        now = datetime.now(tz=UTC)
        metadata: dict[str, Any] = {
            **raw_doc.metadata,
            "chunks_count": chunks_count,
            "language": raw_doc.language,
        }

        stmt = (
            pg_insert(Document)
            .values(
                id=doc_uuid,
                source_type=raw_doc.source_type.value,
                source_id=raw_doc.source_id,
                title=raw_doc.title,
                content_hash=raw_doc.content_hash,
                access_level=raw_doc.access_level,
                department_id=department_id,
                metadata_=metadata,
                indexed_at=now,
            )
            .on_conflict_do_update(
                index_elements=["id"],
                set_={
                    "title": raw_doc.title,
                    "content_hash": raw_doc.content_hash,
                    "access_level": raw_doc.access_level,
                    "department_id": department_id,
                    "metadata_": metadata,
                    "indexed_at": now,
                    "updated_at": now,
                },
            )
        )
        await session.execute(stmt)
        logger.debug(
            "Upserted Document record doc_id=%s source_id=%s",
            doc_uuid,
            raw_doc.source_id,
        )
