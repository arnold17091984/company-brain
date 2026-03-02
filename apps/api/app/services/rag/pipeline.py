from __future__ import annotations

import logging

from app.core.auth import User
from app.models.schemas import (
    QueryRequest,
    QueryResponse,
    Source,
)
from app.services.rag.protocols import (
    EmbeddingService,
    RerankerService,
    RetrieverService,
    SemanticCache,
)
from app.services.types import RetrievedChunk

logger = logging.getLogger(__name__)

_MAX_SNIPPET_LEN = 300


class DefaultRAGPipeline:
    """Phase 2 RAG orchestrator.

    Flow: cache check -> retrieve -> rerank -> build response.
    LLM answer generation is deferred to Phase 3; the answer
    field concatenates top chunk contents instead.
    """

    def __init__(
        self,
        cache: SemanticCache,
        embedding_service: EmbeddingService,
        retriever: RetrieverService,
        reranker: RerankerService,
    ) -> None:
        self._cache = cache
        self._embedding = embedding_service
        self._retriever = retriever
        self._reranker = reranker

    async def query(
        self,
        request: QueryRequest,
        *,
        user: User,
    ) -> QueryResponse:
        cached = await self._cache.get(request.query, user=user)
        if cached is not None:
            logger.info("Cache hit for query: %s", request.query[:80])
            return cached

        chunks = await self._retriever.retrieve(
            request.query,
            user=user,
            top_k=10,
        )

        if not chunks:
            response = QueryResponse(
                answer="No relevant documents found.",
                sources=[],
                cached=False,
            )
            return response

        reranked = await self._reranker.rerank(
            request.query,
            chunks,
            top_k=5,
        )

        answer = self._build_answer(reranked)
        sources = self._build_sources(reranked)

        response = QueryResponse(
            answer=answer,
            sources=sources,
            cached=False,
        )

        await self._cache.set(request.query, response, user=user)
        logger.info(
            "RAG query completed: %d sources for '%s'",
            len(sources),
            request.query[:80],
        )
        return response

    def _build_answer(self, chunks: list[RetrievedChunk]) -> str:
        if not chunks:
            return "No relevant documents found."

        parts = [
            "Based on the following sources:\n",
        ]
        for i, chunk in enumerate(chunks, 1):
            title = chunk.metadata.get("title", "Untitled")
            snippet = chunk.content[:_MAX_SNIPPET_LEN]
            parts.append(f"[{i}] {title}: {snippet}")

        return "\n\n".join(parts)

    def _build_sources(self, chunks: list[RetrievedChunk]) -> list[Source]:
        sources: list[Source] = []
        for chunk in chunks:
            meta = chunk.metadata
            sources.append(
                Source(
                    title=meta.get("title", "Untitled"),
                    url=meta.get("url", ""),
                    snippet=chunk.content[:_MAX_SNIPPET_LEN],
                    updated_at=meta.get("updated_at", ""),
                )
            )
        return sources
