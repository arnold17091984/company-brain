"""Protocol definitions for the document ingestion pipeline.

Covers the full lifecycle from fetching documents from external sources,
through chunking and enrichment, to the final orchestration pipeline
that coordinates the end-to-end flow.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import datetime
from typing import Protocol, runtime_checkable

from app.services.types import (
    ConnectorType,
    DocumentChunk,
    IngestionResult,
    RawDocument,
)


@runtime_checkable
class Connector(Protocol):
    """Fetches documents from an external knowledge source.

    Each connector implementation targets a single source system
    (Google Drive, Telegram, Notion).  Connectors are stateless --
    they do not track sync cursors; that responsibility belongs
    to the ``IngestionPipeline``.
    """

    @property
    def connector_type(self) -> ConnectorType:
        """The type of source this connector fetches from."""
        ...

    async def fetch_documents(
        self,
        *,
        since: datetime | None = None,
    ) -> AsyncIterator[RawDocument]:
        """Fetch documents from the source, optionally filtering by date.

        When ``since`` is provided, only documents created or modified
        after that timestamp should be yielded (incremental sync).
        When ``None``, all accessible documents are yielded (full sync).

        Args:
            since: Only fetch documents modified after this timestamp.
                   ``None`` triggers a full sync.

        Yields:
            ``RawDocument`` instances in no guaranteed order.

        Raises:
            ConnectorError: On authentication failures, rate limits,
                or network errors from the source system.
        """
        ...

    async def health_check(self) -> bool:
        """Verify connectivity to the source system.

        Returns:
            ``True`` if the connector can reach the source and
            authenticate successfully.
        """
        ...


@runtime_checkable
class ChunkingService(Protocol):
    """Splits raw documents into smaller, embeddable chunks.

    Implementations should respect token limits for the target embedding
    model (BGE-M3: ~8,192 tokens) and apply contextual enrichment
    (e.g. prepending document title/summary to each chunk).
    """

    async def chunk(
        self,
        document: RawDocument,
    ) -> list[DocumentChunk]:
        """Split a raw document into embedding-ready chunks.

        The chunking strategy should:
        - Respect sentence/paragraph boundaries when possible.
        - Keep chunks within the embedding model's token limit.
        - Add contextual headers (title, source) for better retrieval.
        - Handle tables, code blocks, and lists as distinct chunk types.
        - Generate deterministic ``chunk_id`` values for idempotent re-indexing.

        Args:
            document: The raw document to chunk.

        Returns:
            Ordered list of chunks with populated ``chunk_index`` values.
        """
        ...


@runtime_checkable
class IngestionPipeline(Protocol):
    """End-to-end orchestrator for the ingestion flow.

    Coordinates: fetch -> deduplicate -> chunk -> embed -> index.

    Implementations should be triggered by Inngest events and track
    sync cursors in PostgreSQL so that incremental syncs are efficient.
    """

    async def ingest(
        self,
        connector_type: str,
        *,
        full_sync: bool = False,
    ) -> IngestionResult:
        """Run the ingestion pipeline for a specific connector.

        Flow:
            1. Resolve the connector for ``connector_type``.
            2. Determine the ``since`` timestamp (last successful sync,
               or ``None`` if ``full_sync``).
            3. Fetch documents from the connector.
            4. Deduplicate against existing content hashes in PostgreSQL.
            5. Chunk new/updated documents.
            6. Embed all chunks via the ``EmbeddingService``.
            7. Upsert vectors into Qdrant.
            8. Update document records and sync cursor in PostgreSQL.

        Args:
            connector_type: One of the ``ConnectorType`` values
                (e.g. "google_drive", "telegram", "notion").
            full_sync: When ``True``, ignore the sync cursor and
                re-process all documents from scratch.

        Returns:
            An ``IngestionResult`` summarising counts and any errors.

        Raises:
            ValueError: If ``connector_type`` is not recognised.
            ConnectorError: If the source system is unreachable.
        """
        ...

    async def ingest_single(
        self,
        document: RawDocument,
    ) -> IngestionResult:
        """Ingest a single document (used for real-time webhook triggers).

        This is a convenience method for processing individual documents
        pushed via webhooks (e.g. a new Telegram message or Notion page
        update) without running the full connector sweep.

        Args:
            document: The raw document to process.

        Returns:
            An ``IngestionResult`` for the single document.
        """
        ...
