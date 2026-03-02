from __future__ import annotations

import logging

import cohere

from app.services.types import RetrievedChunk

logger = logging.getLogger(__name__)

_MODEL = "rerank-v3.5"


class CohereRerankerService:
    """Cross-encoder reranker using Cohere Rerank v3.5."""

    def __init__(self, api_key: str) -> None:
        self._client = cohere.AsyncClientV2(api_key=api_key)

    async def rerank(
        self,
        query: str,
        chunks: list[RetrievedChunk],
        *,
        top_k: int = 5,
    ) -> list[RetrievedChunk]:
        if not chunks:
            return []

        documents = [chunk.content for chunk in chunks]

        try:
            response = await self._client.rerank(
                model=_MODEL,
                query=query,
                documents=documents,
                top_n=top_k,
            )
        except Exception:
            logger.exception("Cohere rerank failed, returning original chunks")
            return chunks[:top_k]

        reranked: list[RetrievedChunk] = []
        for result in response.results:
            original = chunks[result.index]
            reranked.append(original.model_copy(update={"score": result.relevance_score}))

        return reranked
