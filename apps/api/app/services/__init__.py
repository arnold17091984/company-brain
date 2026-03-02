"""Service layer protocols and shared types.

Import protocols and value objects from here for clean dependency injection::

    from app.services import RAGPipeline, LLMService, RetrievedChunk
"""

# -- Value objects -----------------------------------------------------------
# -- Ingestion protocols -----------------------------------------------------
from app.services.ingestion.protocols import (
    ChunkingService,
    Connector,
    IngestionPipeline,
)

# -- LLM protocols -----------------------------------------------------------
from app.services.llm.protocols import (
    LLMService,
    ModelRouter,
    StreamingLLMService,
)

# -- RAG protocols -----------------------------------------------------------
from app.services.rag.protocols import (
    EmbeddingService,
    RAGPipeline,
    RerankerService,
    RetrieverService,
    SemanticCache,
)
from app.services.types import (
    ChunkType,
    ConnectorType,
    DocumentChunk,
    IngestionError,
    IngestionResult,
    ModelConfig,
    RawDocument,
    RetrievedChunk,
)

__all__ = [
    # Value objects
    "ChunkType",
    "ConnectorType",
    "DocumentChunk",
    "IngestionError",
    "IngestionResult",
    "ModelConfig",
    "RawDocument",
    "RetrievedChunk",
    # RAG
    "EmbeddingService",
    "RAGPipeline",
    "RerankerService",
    "RetrieverService",
    "SemanticCache",
    # LLM
    "LLMService",
    "ModelRouter",
    "StreamingLLMService",
    # Ingestion
    "ChunkingService",
    "Connector",
    "IngestionPipeline",
]
