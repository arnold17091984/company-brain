"""RAG (Retrieval-Augmented Generation) service package."""

from __future__ import annotations

from app.services.rag.cache import RedisSemanticCache
from app.services.rag.collection import ensure_collection
from app.services.rag.embedder import TogetherEmbeddingService
from app.services.rag.pipeline import DefaultRAGPipeline
from app.services.rag.reranker import CohereRerankerService
from app.services.rag.retriever import QdrantRetrieverService

__all__ = [
    "CohereRerankerService",
    "DefaultRAGPipeline",
    "QdrantRetrieverService",
    "RedisSemanticCache",
    "TogetherEmbeddingService",
    "ensure_collection",
]
