"""Knowledge / RAG endpoints."""

import logging

from fastapi import APIRouter, Depends

from app.core.auth import User, get_current_user
from app.models.schemas import QueryRequest, QueryResponse, Source

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/knowledge", tags=["knowledge"])

# ---------------------------------------------------------------------------
# Stub data – replace with real RAG pipeline calls
# ---------------------------------------------------------------------------

_STUB_SOURCES = [
    Source(
        title="Employee Handbook v3",
        url="https://drive.google.com/file/d/stub",
        snippet="All employees are expected to adhere to the code of conduct…",
        updated_at="2025-11-01T00:00:00Z",
    )
]


@router.post("/query", response_model=QueryResponse)
async def query_knowledge(
    request: QueryRequest,
    current_user: User = Depends(get_current_user),
) -> QueryResponse:
    """Run a RAG query against the company knowledge base.

    Args:
        request: The user's natural-language query and optional language hint.
        current_user: Injected authenticated user (used for access-level filtering).

    Returns:
        QueryResponse: Generated answer with grounding sources.
    """
    logger.info(
        "Knowledge query",
        extra={"user": current_user.email, "query": request.query[:120]},
    )

    # TODO: wire in app.services.rag.pipeline.RAGPipeline
    stub_answer = (
        f'[STUB] This is a placeholder answer for: "{request.query}". '
        "The real RAG pipeline will retrieve relevant chunks from Qdrant, "
        "rerank with Cohere, and generate an answer with Claude."
    )
    return QueryResponse(answer=stub_answer, sources=_STUB_SOURCES, cached=False)


@router.get("/sources", response_model=list[dict])
async def list_sources(
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    """List available data sources and their ingestion status.

    Args:
        current_user: Injected authenticated user.

    Returns:
        list[dict]: Connector metadata with last-sync timestamps.
    """
    logger.info("List sources", extra={"user": current_user.email})

    # TODO: query connector registry / Document table for live counts
    return [
        {
            "id": "google_drive",
            "label": "Google Drive",
            "status": "active",
            "document_count": 0,
            "last_synced_at": None,
        },
        {
            "id": "telegram",
            "label": "Telegram",
            "status": "active",
            "document_count": 0,
            "last_synced_at": None,
        },
        {
            "id": "notion",
            "label": "Notion",
            "status": "active",
            "document_count": 0,
            "last_synced_at": None,
        },
    ]
