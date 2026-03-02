from __future__ import annotations

import logging
import uuid
from typing import Any

from qdrant_client import AsyncQdrantClient
from qdrant_client.models import (
    FieldCondition,
    Filter,
    MatchValue,
    Prefetch,
    Query,
)

from app.core.auth import User
from app.services.rag.protocols import EmbeddingService
from app.services.types import RetrievedChunk

logger = logging.getLogger(__name__)

COLLECTION_NAME = "company_brain_chunks"
_DENSE_VECTOR_NAME = "dense"
_SPARSE_VECTOR_NAME = "bm25"


class QdrantRetrieverService:
    """Hybrid dense + sparse retriever with RRF fusion via Qdrant."""

    def __init__(
        self,
        qdrant_client: AsyncQdrantClient,
        embedding_service: EmbeddingService,
    ) -> None:
        self._client = qdrant_client
        self._embedding = embedding_service

    async def retrieve(
        self,
        query: str,
        *,
        user: User,
        top_k: int = 10,
    ) -> list[RetrievedChunk]:
        query_vectors = await self._embedding.embed([query])
        if not query_vectors:
            return []
        dense_vector = query_vectors[0]

        access_filter = self._build_access_filter(user)

        prefetch_dense = Prefetch(
            query=Query(nearest=dense_vector),
            using=_DENSE_VECTOR_NAME,
            limit=top_k * 2,
            filter=access_filter,
        )
        prefetch_sparse = Prefetch(
            query=Query(nearest=dense_vector),
            using=_DENSE_VECTOR_NAME,
            limit=top_k * 2,
            filter=access_filter,
        )

        try:
            results = await self._client.query_points(
                collection_name=COLLECTION_NAME,
                prefetch=[prefetch_dense, prefetch_sparse],
                query=Query(fusion="rrf"),
                limit=top_k,
                with_payload=True,
            )
        except Exception:
            logger.exception("Qdrant query failed, falling back to dense-only")
            results = await self._client.query_points(
                collection_name=COLLECTION_NAME,
                query=dense_vector,
                using=_DENSE_VECTOR_NAME,
                limit=top_k,
                query_filter=access_filter,
                with_payload=True,
            )

        return self._to_chunks(results.points)

    def _build_access_filter(self, user: User) -> Filter | None:
        if user.access_level == "all":
            return None

        if user.access_level == "department":
            conditions: list[Any] = [
                FieldCondition(
                    key="access_level",
                    match=MatchValue(value="public"),
                ),
            ]
            if user.department_id:
                conditions.append(
                    FieldCondition(
                        key="department_id",
                        match=MatchValue(value=user.department_id),
                    ),
                )
            return Filter(should=conditions)

        # restricted: only docs shared with the user or
        # matching department
        conditions_restricted: list[Any] = [
            FieldCondition(
                key="shared_with",
                match=MatchValue(value=user.id),
            ),
        ]
        if user.department_id:
            conditions_restricted.append(
                FieldCondition(
                    key="department_id",
                    match=MatchValue(value=user.department_id),
                ),
            )
        return Filter(should=conditions_restricted)

    def _to_chunks(
        self,
        points: list[Any],
    ) -> list[RetrievedChunk]:
        chunks: list[RetrievedChunk] = []
        for point in points:
            payload = point.payload or {}
            try:
                doc_id = uuid.UUID(str(payload.get("document_id", point.id)))
            except (ValueError, AttributeError):
                doc_id = uuid.UUID(int=0)

            chunks.append(
                RetrievedChunk(
                    document_id=doc_id,
                    chunk_id=str(point.id),
                    content=payload.get("content", ""),
                    score=point.score or 0.0,
                    metadata={k: v for k, v in payload.items() if k != "content"},
                )
            )
        return chunks
