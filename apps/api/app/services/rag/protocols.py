"""Protocol definitions for the RAG (Retrieval-Augmented Generation) pipeline.

All interfaces use ``typing.Protocol`` for structural subtyping -- any class
that implements the required methods satisfies the protocol without explicit
inheritance.  This keeps concrete implementations decoupled from abstractions.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from app.core.auth import User
from app.models.schemas import QueryRequest, QueryResponse
from app.services.types import RetrievedChunk


@runtime_checkable
class EmbeddingService(Protocol):
    """Produces dense vector embeddings from text.

    Implementations should target BGE-M3 (via Together AI) which natively
    handles EN, JA, and KO.  The ``language`` hint allows implementations
    to apply language-specific preprocessing when beneficial.
    """

    async def embed(
        self,
        texts: list[str],
        *,
        language: str | None = None,
    ) -> list[list[float]]:
        """Embed a batch of texts into dense vectors.

        Args:
            texts: One or more text strings to embed.
            language: Optional BCP-47 language hint for preprocessing.

        Returns:
            A list of embedding vectors, one per input text.
            All vectors must have identical dimensionality.
        """
        ...


@runtime_checkable
class RetrieverService(Protocol):
    """Retrieves relevant document chunks from the vector store.

    Implementations should perform hybrid search (dense + sparse) against
    Qdrant, applying access-level filtering based on the requesting user.
    """

    async def retrieve(
        self,
        query: str,
        *,
        user: User,
        top_k: int = 10,
    ) -> list[RetrievedChunk]:
        """Retrieve the most relevant chunks for a query.

        Args:
            query: The user's natural-language query.
            user: Authenticated user, used for access-level filtering.
                  - ``access_level == "all"``: no restriction.
                  - ``access_level == "department"``: only chunks from
                    the user's department plus public documents.
                  - ``access_level == "restricted"``: only explicitly
                    shared documents.
            top_k: Maximum number of chunks to return.

        Returns:
            Chunks sorted by descending relevance score.
        """
        ...


@runtime_checkable
class RerankerService(Protocol):
    """Cross-encoder reranker that refines retrieval results.

    Implementations should use Cohere Rerank or an equivalent cross-encoder
    to produce more accurate relevance scores than embedding similarity alone.
    """

    async def rerank(
        self,
        query: str,
        chunks: list[RetrievedChunk],
        *,
        top_k: int = 5,
    ) -> list[RetrievedChunk]:
        """Rerank retrieved chunks using a cross-encoder model.

        Args:
            query: The original user query.
            chunks: Candidate chunks from the retriever.
            top_k: Maximum number of chunks to return after reranking.

        Returns:
            Reranked chunks sorted by descending cross-encoder score.
            Scores are replaced with cross-encoder logits.
        """
        ...


@runtime_checkable
class SemanticCache(Protocol):
    """Semantic cache that short-circuits repeated or near-duplicate queries.

    Implementations should use Redis with embedding-based similarity to
    match semantically equivalent queries, not just exact string matches.
    """

    async def get(
        self,
        query: str,
        *,
        user: User,
    ) -> QueryResponse | None:
        """Look up a cached response for a semantically similar query.

        Args:
            query: The user's query.
            user: Authenticated user (cache is scoped per access level).

        Returns:
            A cached ``QueryResponse`` with ``cached=True`` if a
            sufficiently similar query was found, or ``None`` on miss.
        """
        ...

    async def set(
        self,
        query: str,
        response: QueryResponse,
        *,
        user: User,
    ) -> None:
        """Store a query-response pair in the semantic cache.

        Args:
            query: The original query string.
            response: The generated response to cache.
            user: Authenticated user (cache is scoped per access level).
        """
        ...


@runtime_checkable
class RAGPipeline(Protocol):
    """End-to-end RAG pipeline: cache check -> retrieve -> rerank -> generate.

    This is the top-level orchestrator that composes all RAG sub-services.
    Route handlers should depend on this protocol only.
    """

    async def query(
        self,
        request: QueryRequest,
        *,
        user: User,
    ) -> QueryResponse:
        """Execute the full RAG pipeline for a knowledge query.

        Flow:
            1. Check semantic cache.
            2. Embed the query.
            3. Retrieve candidate chunks (with access filtering).
            4. Rerank candidates.
            5. Generate an answer grounded in the top chunks.
            6. Cache the result.

        Args:
            request: The incoming query request.
            user: Authenticated user for access control and caching.

        Returns:
            A ``QueryResponse`` with the generated answer and sources.
        """
        ...
