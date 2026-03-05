"""Inngest background worker – orchestrates the full ingestion pipeline.

Event schema
------------
``ingestion/sync.requested``::

    {
        "name": "ingestion/sync.requested",
        "data": {
            "connector_type": "google_drive" | "telegram" | "notion",
            "full_sync": false          # optional, default false
        }
    }

Flow
----
1. Resolve connector from registry.
2. Fetch documents (incremental unless full_sync).
3. Deduplicate via SHA-256 content_hash against the ``documents`` table.
4. Chunk each new/updated document.
5. Embed chunks (via Together AI BGE-M3 embeddings).
6. Upsert to Qdrant.
7. Update ``documents`` table (create or update row, set indexed_at).
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime
from typing import Any

import httpx
import inngest
from qdrant_client import AsyncQdrantClient
from qdrant_client.models import (
    Distance,
    PointStruct,
    SparseIndexParams,
    SparseVectorParams,
    VectorParams,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.connectors import get_connector
from app.connectors.chunker import DefaultChunkingService
from app.connectors.google_drive import GoogleDriveConnector
from app.connectors.notion import NotionConnector
from app.connectors.telegram import TelegramConnector
from app.core.api_keys import get_api_key
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.database import Department, Document, SystemSetting
from app.services.types import (
    ConnectorType,
    DocumentChunk,
    IngestionError,
    IngestionResult,
    RawDocument,
)

logger = logging.getLogger(__name__)

# ── Inngest client ────────────────────────────────────────────────────────────

inngest_client = inngest.Inngest(
    app_id="company-brain",
    event_key=settings.inngest_event_key or None,
    signing_key=settings.inngest_signing_key or None,
    is_production=settings.is_production,
)

# ── Constants ─────────────────────────────────────────────────────────────────

_TOGETHER_EMBED_URL = "https://api.together.xyz/v1/embeddings"
_EMBED_MODEL = "BAAI/bge-m3"
_EMBED_DIM = 1024
_QDRANT_COLLECTION = "company_brain_chunks"

# Batch size for Together AI embedding calls
_EMBED_BATCH_SIZE = 32

# ── Embedding service ─────────────────────────────────────────────────────────


async def _embed_texts(texts: list[str]) -> list[list[float]]:
    """Call Together AI to embed a batch of texts.

    Args:
        texts: List of strings to embed.

    Returns:
        List of embedding vectors in the same order as *texts*.
    """
    api_key = settings.together_ai_api_key
    if not api_key:
        raise RuntimeError("together_ai_api_key is not configured")

    all_embeddings: list[list[float]] = []

    async with httpx.AsyncClient(timeout=60.0) as client:
        for i in range(0, len(texts), _EMBED_BATCH_SIZE):
            batch = texts[i : i + _EMBED_BATCH_SIZE]
            resp = await client.post(
                _TOGETHER_EMBED_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={"model": _EMBED_MODEL, "input": batch},
            )
            resp.raise_for_status()
            data = resp.json()
            # Together returns data sorted by index
            sorted_data = sorted(data["data"], key=lambda x: x["index"])
            all_embeddings.extend(item["embedding"] for item in sorted_data)

    return all_embeddings


# ── Qdrant helpers ────────────────────────────────────────────────────────────


async def _ensure_qdrant_collection(client: AsyncQdrantClient) -> None:
    """Create the Qdrant collection if it does not already exist.

    The collection uses named vectors to support hybrid dense + sparse search:
    - ``dense``: 1024-dimensional COSINE vectors produced by BGE-M3.
    - ``bm25``: sparse vectors for BM25 keyword search.

    Payload indexes are created on ``access_level``, ``department_id``, and
    ``source_type`` to enable fast filtered retrieval.
    """
    existing = {c.name for c in (await client.get_collections()).collections}
    if _QDRANT_COLLECTION in existing:
        return

    await client.create_collection(
        collection_name=_QDRANT_COLLECTION,
        vectors_config={
            "dense": VectorParams(size=_EMBED_DIM, distance=Distance.COSINE),
        },
        sparse_vectors_config={
            "bm25": SparseVectorParams(index=SparseIndexParams()),
        },
    )
    logger.info("Created Qdrant collection '%s'", _QDRANT_COLLECTION)

    from qdrant_client.models import PayloadSchemaType

    for field_name, schema_type in [
        ("access_level", PayloadSchemaType.KEYWORD),
        ("department_id", PayloadSchemaType.KEYWORD),
        ("source_type", PayloadSchemaType.KEYWORD),
    ]:
        await client.create_payload_index(
            collection_name=_QDRANT_COLLECTION,
            field_name=field_name,
            field_schema=schema_type,
        )
        logger.info("Created payload index: %s (%s)", field_name, schema_type)


async def _upsert_chunks(
    qdrant: AsyncQdrantClient,
    chunks: list[DocumentChunk],
    embeddings: list[list[float]],
) -> None:
    """Upsert chunk vectors into Qdrant."""
    points: list[PointStruct] = []
    for chunk, vector in zip(chunks, embeddings, strict=True):
        # Deterministic UUID from chunk_id hex string
        point_id = str(uuid.UUID(chunk.chunk_id[:32]))
        payload: dict[str, Any] = {
            "chunk_id": chunk.chunk_id,
            "document_source_id": chunk.document_source_id,
            "source_type": chunk.source_type.value,
            "content": chunk.content,
            "chunk_type": chunk.chunk_type.value,
            "chunk_index": chunk.chunk_index,
            **chunk.metadata,
        }
        points.append(PointStruct(id=point_id, vector={"dense": vector}, payload=payload))

    if points:
        await qdrant.upsert(collection_name=_QDRANT_COLLECTION, points=points)


# ── Database helpers ──────────────────────────────────────────────────────────


async def _resolve_department_id(
    session: AsyncSession,
    department_slug: str | None,
) -> uuid.UUID | None:
    """Return the UUID for a department slug, or None if not found."""
    if not department_slug:
        return None
    result = await session.execute(select(Department).where(Department.slug == department_slug))
    dept = result.scalar_one_or_none()
    return dept.id if dept else None


async def _get_existing_document(
    session: AsyncSession,
    source_type: str,
    source_id: str,
) -> Document | None:
    """Look up an existing Document row by source_type + source_id."""
    result = await session.execute(
        select(Document).where(
            Document.source_type == source_type,
            Document.source_id == source_id,
        )
    )
    return result.scalar_one_or_none()


async def _upsert_document_row(
    session: AsyncSession,
    doc: RawDocument,
    department_id: uuid.UUID | None,
    indexed: bool = False,
) -> tuple[Document, bool]:
    """Insert or update a Document row.

    Returns:
        (document_orm_object, is_new)
    """
    existing = await _get_existing_document(session, doc.source_type.value, doc.source_id)
    now = datetime.now(tz=UTC)

    if existing is None:
        new_doc = Document(
            source_type=doc.source_type.value,
            source_id=doc.source_id,
            title=doc.title,
            content_hash=doc.content_hash,
            access_level=doc.access_level,
            department_id=department_id,
            metadata_=doc.metadata,
            indexed_at=now if indexed else None,
        )
        session.add(new_doc)
        return new_doc, True

    # Update mutable fields
    existing.title = doc.title
    existing.content_hash = doc.content_hash
    existing.access_level = doc.access_level
    existing.department_id = department_id
    existing.metadata_ = doc.metadata
    if indexed:
        existing.indexed_at = now
    return existing, False


# ── Core pipeline ─────────────────────────────────────────────────────────────


async def _process_document(
    doc: RawDocument,
    chunker: DefaultChunkingService,
    qdrant: AsyncQdrantClient,
    session: AsyncSession,
    full_sync: bool,
) -> tuple[bool, bool, list[DocumentChunk]]:
    """Process a single document through chunk → embed → upsert.

    Returns:
        (is_new, was_updated, chunks)
    """
    # Deduplication: check if content_hash changed
    existing = await _get_existing_document(session, doc.source_type.value, doc.source_id)
    if existing and not full_sync and existing.content_hash == doc.content_hash:
        return False, False, []

    is_new = existing is None

    # Chunk
    chunks = await chunker.chunk(doc)
    if not chunks:
        return is_new, not is_new, []

    # Embed
    texts = [chunk.content for chunk in chunks]
    embeddings = await _embed_texts(texts)

    # Upsert to Qdrant
    await _ensure_qdrant_collection(qdrant)
    await _upsert_chunks(qdrant, chunks, embeddings)

    # Update DB
    dept_id = await _resolve_department_id(session, doc.department_slug)
    await _upsert_document_row(session, doc, dept_id, indexed=True)
    await session.flush()

    return is_new, not is_new, chunks


# ── Inngest function definition ───────────────────────────────────────────────


@inngest_client.create_function(
    fn_id="ingestion-sync",
    name="Ingestion Sync",
    trigger=inngest.TriggerEvent(event="ingestion/sync.requested"),
    retries=3,
)
async def ingestion_sync_fn(
    ctx: inngest.Context,
    step: inngest.Step,
) -> dict[str, Any]:
    """Inngest handler for ``ingestion/sync.requested`` events.

    Event data fields:
        connector_type (str): One of "google_drive", "telegram", "notion".
        full_sync (bool): Re-process all documents if True (default False).
    """
    event_data: dict[str, Any] = ctx.event.data or {}
    connector_type_str: str = event_data.get("connector_type", "")
    full_sync: bool = bool(event_data.get("full_sync", False))

    try:
        connector_type = ConnectorType(connector_type_str)
    except ValueError as exc:
        raise inngest.NonRetriableError(f"Unknown connector_type: {connector_type_str!r}") from exc

    started_at = datetime.now(tz=UTC)
    result = IngestionResult(
        connector_type=connector_type,
        started_at=started_at,
        full_sync=full_sync,
    )

    chunker = DefaultChunkingService()
    qdrant = AsyncQdrantClient(
        url=settings.qdrant_url,
        api_key=settings.qdrant_api_key or None,
    )

    # Resolve connector with DB-stored credentials (encrypted, with env fallback)
    async with AsyncSessionLocal() as config_session:
        if connector_type_str == "telegram":
            token = await get_api_key("telegram_bot_token", config_session)
            connector = TelegramConnector(bot_token=token)
        elif connector_type_str == "notion":
            token = await get_api_key("notion_integration_token", config_session)
            connector = NotionConnector(integration_token=token)
        else:
            connector = get_connector(connector_type)

        # Load connector-specific config (e.g. Google Drive folder scope)
        config_key = f"connector:{connector_type_str}"
        config_result = await config_session.execute(
            select(SystemSetting).where(SystemSetting.key == config_key)
        )
        config_setting = config_result.scalar_one_or_none()
        if config_setting and config_setting.value:
            folder_ids = config_setting.value.get("folder_ids", [])
            if isinstance(connector, GoogleDriveConnector) and folder_ids:
                connector.folder_ids = folder_ids
                logger.info("Applied folder scope: %d folder(s)", len(folder_ids))

    async with AsyncSessionLocal() as session:
        try:
            async for doc in connector.fetch_documents(since=None if full_sync else None):
                result.total_documents += 1
                try:
                    is_new, is_updated, chunks = await _process_document(
                        doc, chunker, qdrant, session, full_sync
                    )
                    if is_new:
                        result.new_documents += 1
                    elif is_updated:
                        result.updated_documents += 1
                    else:
                        result.skipped_documents += 1
                    result.total_chunks += len(chunks)

                except Exception as exc:
                    err_type = type(exc).__name__
                    logger.error(
                        "Failed to process document %s (%s): %s",
                        doc.source_id,
                        connector_type,
                        exc,
                        exc_info=True,
                    )
                    result.errors.append(
                        IngestionError(
                            source_id=doc.source_id,
                            error_type=err_type,
                            message=str(exc),
                        )
                    )

            await session.commit()

        except Exception as exc:
            await session.rollback()
            logger.error("Ingestion pipeline failed for %s: %s", connector_type, exc)
            raise

        finally:
            result.completed_at = datetime.now(tz=UTC)
            await qdrant.close()

    logger.info(
        "Ingestion complete [%s]: total=%d new=%d updated=%d skipped=%d chunks=%d errors=%d",
        connector_type,
        result.total_documents,
        result.new_documents,
        result.updated_documents,
        result.skipped_documents,
        result.total_chunks,
        len(result.errors),
    )

    return result.model_dump(mode="json")


# ── Helper: ingest a single pre-fetched document ──────────────────────────────


async def ingest_single_document(document: RawDocument) -> IngestionResult:
    """Ingest a single pre-fetched document outside of the Inngest event flow.

    Useful for testing and for real-time ingestion triggered by webhooks.

    Args:
        document: A RawDocument already retrieved from a source system.

    Returns:
        IngestionResult for this single document.
    """
    started_at = datetime.now(tz=UTC)
    result = IngestionResult(
        connector_type=document.source_type,
        started_at=started_at,
        full_sync=False,
    )

    chunker = DefaultChunkingService()
    qdrant = AsyncQdrantClient(
        url=settings.qdrant_url,
        api_key=settings.qdrant_api_key or None,
    )

    try:
        async with AsyncSessionLocal() as session:
            result.total_documents = 1
            try:
                is_new, is_updated, chunks = await _process_document(
                    document, chunker, qdrant, session, full_sync=False
                )
                if is_new:
                    result.new_documents = 1
                elif is_updated:
                    result.updated_documents = 1
                else:
                    result.skipped_documents = 1
                result.total_chunks = len(chunks)
                await session.commit()
            except Exception as exc:
                await session.rollback()
                result.errors.append(
                    IngestionError(
                        source_id=document.source_id,
                        error_type=type(exc).__name__,
                        message=str(exc),
                    )
                )
    finally:
        result.completed_at = datetime.now(tz=UTC)
        await qdrant.close()

    return result
