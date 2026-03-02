"""Knowledge / RAG endpoints."""

import logging

from fastapi import APIRouter, Depends

from app.core.auth import User, get_current_user
from app.models.schemas import QueryRequest, QueryResponse, Source
from app.services.llm.claude_service import ClaudeService, LLMError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/knowledge", tags=["knowledge"])

_SEARCH_SYSTEM_PROMPT = (
    "You are Company Brain, an AI search engine for a 40-person Philippine IT company. "
    "The user has entered a search query. Provide a concise, helpful answer. "
    "Format your response in clear paragraphs. Keep it brief (2-4 paragraphs max). "
    "Respond in the same language as the query."
)


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

    # TODO: wire in app.services.rag.pipeline.RAGPipeline for real retrieval
    # For now, use Claude directly to generate an answer
    messages = [{"role": "user", "content": request.query}]
    service = ClaudeService()
    try:
        answer = await service.generate(messages, system_prompt=_SEARCH_SYSTEM_PROMPT)
    except LLMError as exc:
        logger.error("LLM error in knowledge query: %s", exc)
        answer = (
            "Sorry, I'm unable to search right now. Please try again in a moment."
        )

    return QueryResponse(answer=answer, sources=[], cached=False)


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
