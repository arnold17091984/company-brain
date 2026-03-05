"""Service for promoting high-quality chat Q&A pairs into the knowledge base.

Workflow:
1. Fetch the assistant ChatMessage by ID.
2. Find the preceding user message (the question).
3. Check for duplicate promotion via source_id.
4. Build a Q&A document, chunk it, embed it, and upsert to Qdrant + PostgreSQL.
"""

from __future__ import annotations

import hashlib
import logging
import uuid
from datetime import UTC, datetime
from typing import Any

from qdrant_client import AsyncQdrantClient
from qdrant_client.models import PointStruct
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import ChatMessage, Document
from app.services.document_classifier import ClassificationResult, DocumentClassifier
from app.services.ingestion.chunker import TextChunkingService
from app.services.rag.collection import _DENSE_VECTOR_NAME, COLLECTION_NAME
from app.services.rag.embedder import TogetherEmbeddingService
from app.services.types import ChunkType, ConnectorType, DocumentChunk, RawDocument

logger = logging.getLogger(__name__)

_UPSERT_BATCH_SIZE = 64


class KnowledgePromoter:
    """Promotes chat Q&A pairs into the RAG knowledge base."""

    def __init__(
        self,
        embedding_service: TogetherEmbeddingService,
        qdrant_client: AsyncQdrantClient,
        document_classifier: DocumentClassifier | None = None,
    ) -> None:
        self._embedding_service = embedding_service
        self._qdrant_client = qdrant_client
        self._chunker = TextChunkingService()
        self._classifier = document_classifier

    async def promote(
        self,
        db: AsyncSession,
        message_id: str,
        *,
        title: str | None = None,
        category: str = "general",
        department_id: str | None = None,
        access_level: str = "all",
    ) -> dict[str, Any]:
        """Promote an assistant message + its question into the knowledge base.

        Args:
            db: Active database session.
            message_id: UUID of the assistant ChatMessage.
            title: Optional custom title; auto-generated if omitted.
            category: Document category.
            department_id: Optional department UUID string.
            access_level: Access level for the promoted document.

        Returns:
            Dict with document_id, title, status, chunks_count.

        Raises:
            ValueError: If the message is not found, not an assistant message,
                or has already been promoted.
        """
        # 1. Fetch the assistant message
        msg_uuid = uuid.UUID(message_id)
        result = await db.execute(
            select(ChatMessage).where(ChatMessage.id == msg_uuid)
        )
        assistant_msg = result.scalar_one_or_none()
        if assistant_msg is None:
            raise ValueError(f"Message not found: {message_id}")
        if assistant_msg.role != "assistant":
            raise ValueError("Only assistant messages can be promoted")

        # 2. Find the preceding user message (question)
        result = await db.execute(
            select(ChatMessage)
            .where(
                ChatMessage.session_id == assistant_msg.session_id,
                ChatMessage.role == "user",
                ChatMessage.created_at < assistant_msg.created_at,
            )
            .order_by(ChatMessage.created_at.desc())
            .limit(1)
        )
        user_msg = result.scalar_one_or_none()
        question = user_msg.content if user_msg else "(No question found)"

        # 3. Check for duplicate promotion
        source_id = f"chat_learned:{message_id}"
        existing = await db.execute(
            select(Document.id).where(Document.source_id == source_id)
        )
        if existing.scalar_one_or_none() is not None:
            raise ValueError("This Q&A has already been promoted to the knowledge base")

        # 4. Build Q&A content
        auto_title = title or f"Q&A: {question[:80]}"
        content = f"## Question\n{question}\n\n## Answer\n{assistant_msg.content}"
        content_hash = hashlib.sha256(content.encode()).hexdigest()

        # Auto-classify if category is still "general"
        ai_classification_meta: dict[str, Any] | None = None
        if category == "general" and self._classifier is not None:
            try:
                cls_result: ClassificationResult = await self._classifier.classify(
                    title=auto_title,
                    content_preview=content[:2000],
                )
                category = cls_result.category
                ai_classification_meta = {
                    "category": cls_result.category,
                    "confidence": cls_result.confidence,
                    "suggested_department": cls_result.suggested_department,
                    "classified_at": datetime.now(tz=UTC).isoformat(),
                }
                logger.info(
                    "AI classified promoted Q&A as category=%s (confidence=%.2f)",
                    cls_result.category,
                    cls_result.confidence,
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning("AI classification failed for promoted Q&A: %s", exc)

        # 5. Build a RawDocument for the chunker
        raw_doc = RawDocument(
            source_type=ConnectorType.CHAT_LEARNED,
            source_id=source_id,
            title=auto_title,
            content=content,
            content_hash=content_hash,
            access_level=access_level,
        )

        # 6. Chunk the content
        chunks = await self._chunker.chunk(raw_doc)
        if not chunks:
            # Fallback: single chunk with the entire content
            chunks = [
                DocumentChunk(
                    chunk_id=hashlib.sha256(f"{source_id}:0".encode()).hexdigest()[:16],
                    document_source_id=source_id,
                    source_type=ConnectorType.CHAT_LEARNED,
                    content=f"Title: {auto_title}\nSource: chat_learned\n\n{content}",
                    chunk_type=ChunkType.TEXT,
                    chunk_index=0,
                    token_count=max(1, len(content) // 4),
                )
            ]

        # 7. Embed
        chunk_texts = [c.content for c in chunks]
        embeddings = await self._embedding_service.embed(chunk_texts)

        # 8. Prepare document UUID
        doc_uuid = uuid.uuid4()
        dept_uuid = uuid.UUID(department_id) if department_id else None

        # 9. Upsert to Qdrant
        await self._upsert_to_qdrant(
            chunks=chunks,
            embeddings=embeddings,
            document_id=doc_uuid,
            title=auto_title,
            access_level=access_level,
            department_id=dept_uuid,
        )

        # 10. Create Document record in PostgreSQL
        now = datetime.now(tz=UTC)
        doc_metadata: dict[str, Any] = {
            "chunks_count": len(chunks),
            "original_message_id": message_id,
            "question": question[:500],
        }
        if ai_classification_meta is not None:
            doc_metadata["ai_classification"] = ai_classification_meta

        doc = Document(
            id=doc_uuid,
            source_type="chat_learned",
            source_id=source_id,
            title=auto_title,
            content_hash=content_hash,
            access_level=access_level,
            category=category,
            department_id=dept_uuid,
            metadata_=doc_metadata,
            indexed_at=now,
        )
        db.add(doc)
        await db.flush()

        return {
            "document_id": str(doc_uuid),
            "title": auto_title,
            "status": "indexed",
            "chunks_count": len(chunks),
        }

    async def _upsert_to_qdrant(
        self,
        chunks: list[DocumentChunk],
        embeddings: list[list[float]],
        document_id: uuid.UUID,
        title: str,
        access_level: str,
        department_id: uuid.UUID | None,
    ) -> None:
        """Upsert chunk vectors into the Qdrant collection."""
        points: list[PointStruct] = []
        now_iso = datetime.now(tz=UTC).isoformat()

        for chunk, vector in zip(chunks, embeddings, strict=True):
            payload: dict[str, Any] = {
                "content": chunk.content,
                "document_id": str(document_id),
                "access_level": access_level,
                "department_id": str(department_id) if department_id else None,
                "source_type": "chat_learned",
                "title": title,
                "url": "",
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

        for i in range(0, len(points), _UPSERT_BATCH_SIZE):
            batch = points[i : i + _UPSERT_BATCH_SIZE]
            await self._qdrant_client.upsert(
                collection_name=COLLECTION_NAME,
                points=batch,
            )
            logger.info(
                "Upserted %d knowledge point(s) for promoted doc %s",
                len(batch),
                document_id,
            )
