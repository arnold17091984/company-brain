"""Knowledge / RAG endpoints."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import User, get_admin_user, get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.models.database import Document
from app.models.schemas import QueryRequest, QueryResponse, Source
from app.services.llm.claude_service import ClaudeService, LLMError
from app.services.security.data_classifier import RiskLevel, classify_input
from app.services.types import ConnectorType

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/knowledge", tags=["knowledge"])

_SEARCH_SYSTEM_PROMPT = (
    "You are Company Brain, an AI search engine for a 40-person Philippine IT company. "
    "The user has entered a search query. Provide a concise, helpful answer. "
    "Format your response in clear paragraphs. Keep it brief (2-4 paragraphs max). "
    "Respond in the same language as the query."
)

_RAG_SYSTEM_PROMPT = (
    "You are Company Brain, an AI search engine for a 40-person Philippine IT company. "
    "Answer the user's question based on the provided company documents. "
    "Cite sources by their reference number (e.g. [1], [2]). "
    "If the documents do not contain relevant information, explicitly state that "
    "the answer was not found in the company knowledge base. "
    "Keep your response concise (2-4 paragraphs max). "
    "Respond in the same language as the query."
)

_MAX_SNIPPET_LEN = 300


def _build_rag_prompt(query: str, chunks: list[Any]) -> str:
    """Build a grounded prompt that inlines retrieved document chunks.

    Args:
        query: The original user query.
        chunks: Reranked ``RetrievedChunk`` objects to use as grounding context.

    Returns:
        A single prompt string with numbered document excerpts followed by
        the user's question.
    """
    doc_lines: list[str] = [
        "Answer the user's question based on the following company documents.",
    ]
    doc_lines.append(
        "Cite sources by number. If the documents don't contain relevant info, say so."
    )
    doc_lines.append("")
    doc_lines.append("Documents:")

    for i, chunk in enumerate(chunks, 1):
        title = chunk.metadata.get("title", "Untitled")
        content = chunk.content[:_MAX_SNIPPET_LEN]
        doc_lines.append(f"[{i}] Title: {title}")
        doc_lines.append(content)
        doc_lines.append("")

    doc_lines.append(f"Question: {query}")
    return "\n".join(doc_lines)


@router.post("/query", response_model=QueryResponse)
async def query_knowledge(
    request: Request,
    body: QueryRequest,
    current_user: User = Depends(get_current_user),
) -> QueryResponse:
    """Run a RAG query against the company knowledge base.

    Attempts to retrieve relevant chunks from Qdrant and generate a
    grounded answer via Claude. Falls back to a direct Claude call when
    Qdrant is unavailable or returns no results.

    Args:
        request: The FastAPI ``Request`` object used to access ``app.state``
            for the Qdrant and Redis clients initialised at startup.
        body: The user's natural-language query and optional language hint.
        current_user: Injected authenticated user (used for access-level
            filtering in the vector store).

    Returns:
        QueryResponse: Generated answer with grounding sources.
    """
    logger.info(
        "Knowledge query",
        extra={"user": current_user.email, "query": body.query[:120]},
    )

    # ── Sensitive data check ──────────────────────────────────────────────
    classification = classify_input(body.query)
    if classification.risk_level == RiskLevel.HIGH and classification.warning_message:
        return QueryResponse(
            answer=classification.warning_message,
            sources=[],
            cached=False,
        )

    # ── Attempt RAG pipeline ──────────────────────────────────────────────
    try:
        qdrant = getattr(request.app.state, "qdrant", None)

        if qdrant and settings.together_ai_api_key:
            from app.services.rag.cache import RedisSemanticCache  # noqa: PLC0415
            from app.services.rag.embedder import TogetherEmbeddingService  # noqa: PLC0415
            from app.services.rag.reranker import CohereRerankerService  # noqa: PLC0415
            from app.services.rag.retriever import QdrantRetrieverService  # noqa: PLC0415

            embedder = TogetherEmbeddingService(settings.together_ai_api_key)
            retriever = QdrantRetrieverService(qdrant, embedder)

            # Build optional services; skip gracefully when keys are missing
            reranker: CohereRerankerService | None = None
            if settings.cohere_api_key:
                reranker = CohereRerankerService(settings.cohere_api_key)

            redis_client = getattr(request.app.state, "redis", None)
            cache: RedisSemanticCache | None = None
            if redis_client is not None:
                cache = RedisSemanticCache(redis_client)

            # ── Cache lookup ─────────────────────────────────────────────
            if cache is not None:
                cached_response = await cache.get(body.query, user=current_user)
                if cached_response is not None:
                    logger.info("Cache hit for knowledge query: %s", body.query[:80])
                    return cached_response

            # ── Retrieval ────────────────────────────────────────────────
            chunks = await retriever.retrieve(body.query, user=current_user, top_k=10)

            if chunks:
                # ── Reranking ────────────────────────────────────────────
                if reranker is not None:
                    chunks = await reranker.rerank(body.query, chunks, top_k=5)
                else:
                    chunks = chunks[:5]

                # ── LLM answer generation grounded in retrieved chunks ───
                rag_prompt = _build_rag_prompt(body.query, chunks)
                llm_messages = [{"role": "user", "content": rag_prompt}]
                llm_service = ClaudeService()

                try:
                    llm_result = await llm_service.generate(
                        llm_messages,
                        system_prompt=_RAG_SYSTEM_PROMPT,
                    )
                    answer_text = llm_result.text
                except LLMError as exc:
                    logger.error("LLM error during RAG answer generation: %s", exc)
                    answer_text = (
                        "Sorry, I'm unable to generate an answer right now. "
                        "Please try again in a moment."
                    )

                sources = [
                    Source(
                        title=chunk.metadata.get("title", "Untitled"),
                        url=chunk.metadata.get("url", ""),
                        snippet=chunk.content[:_MAX_SNIPPET_LEN],
                        updated_at=str(chunk.metadata.get("updated_at", "")),
                    )
                    for chunk in chunks
                ]

                response = QueryResponse(answer=answer_text, sources=sources, cached=False)

                # ── Write cache ──────────────────────────────────────────
                if cache is not None:
                    await cache.set(body.query, response, user=current_user)

                logger.info(
                    "RAG query completed with %d sources for '%s'",
                    len(sources),
                    body.query[:80],
                )
                return response

            logger.info(
                "No chunks retrieved from Qdrant for query '%s', falling back to direct Claude",
                body.query[:80],
            )

    except Exception:
        logger.exception(
            "RAG pipeline failed for query '%s', falling back to direct Claude",
            body.query[:80],
        )

    # ── Fallback: direct Claude without retrieval ─────────────────────────
    messages = [{"role": "user", "content": body.query}]
    service = ClaudeService()
    try:
        fallback_result = await service.generate(messages, system_prompt=_SEARCH_SYSTEM_PROMPT)
        fallback_text = fallback_result.text
    except LLMError as exc:
        logger.error("LLM error in knowledge query fallback: %s", exc)
        fallback_text = "Sorry, I'm unable to search right now. Please try again in a moment."

    return QueryResponse(answer=fallback_text, sources=[], cached=False)


@router.get("/sources", response_model=list[dict])
async def list_sources(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """List available data sources and their ingestion status from the Document table.

    Queries the ``documents`` table grouped by ``source_type`` to return
    real document counts and the timestamp of the most recent ingestion per
    connector.

    Args:
        current_user: Injected authenticated user.
        db: Injected database session.

    Returns:
        list[dict]: Connector metadata with live document counts and
        last-sync timestamps.
    """
    logger.info("List sources", extra={"user": current_user.email})

    # Query Document table: count and latest indexed_at per source_type
    stmt = select(
        Document.source_type,
        func.count(Document.id).label("document_count"),
        func.max(Document.indexed_at).label("last_synced_at"),
    ).group_by(Document.source_type)
    result = await db.execute(stmt)
    rows = result.all()

    # Build a lookup dict from actual DB data
    db_counts: dict[str, dict[str, Any]] = {}
    for row in rows:
        db_counts[row.source_type] = {
            "document_count": row.document_count,
            "last_synced_at": row.last_synced_at.isoformat() if row.last_synced_at else None,
        }

    # Merge DB data with the static connector registry
    connectors = [
        {"id": ConnectorType.GOOGLE_DRIVE, "label": "Google Drive"},
        {"id": ConnectorType.TELEGRAM, "label": "Telegram"},
        {"id": ConnectorType.NOTION, "label": "Notion"},
    ]

    sources: list[dict] = []
    for connector in connectors:
        source_id = connector["id"]
        db_row = db_counts.get(source_id, {})
        sources.append(
            {
                "id": source_id,
                "label": connector["label"],
                "status": "active",
                "document_count": db_row.get("document_count", 0),
                "last_synced_at": db_row.get("last_synced_at"),
            }
        )

    return sources


@router.post("/ingest", response_model=dict)
async def trigger_ingest(
    connector_type: str,
    full_sync: bool = False,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Trigger an ingestion run for the given connector type via Inngest.

    Validates the ``connector_type`` against the ``ConnectorType`` enum and
    sends an ``ingestion/sync.requested`` event to Inngest. The event is
    processed asynchronously by the ``ingestion_sync_fn`` worker.

    Args:
        connector_type: One of ``"google_drive"``, ``"telegram"``, or ``"notion"``.
        full_sync: When ``True``, ignore previous sync state and re-process
            all documents from scratch (default ``False``).
        current_user: Injected authenticated admin user.
        db: Injected database session (reserved for future audit logging).

    Returns:
        dict: Confirmation with the queued connector type and sync mode.

    Raises:
        HTTPException: 400 when ``connector_type`` is not a recognised value.
        HTTPException: 503 when the Inngest event key is not configured.
    """
    logger.info(
        "Ingest triggered",
        extra={
            "user": current_user.email,
            "connector_type": connector_type,
            "full_sync": full_sync,
        },
    )

    # Validate connector type
    try:
        validated_connector = ConnectorType(connector_type)
    except ValueError:
        valid = [c.value for c in ConnectorType]
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown connector_type '{connector_type}'. Valid values: {valid}",
        ) from None

    # Send the Inngest event (requires event key to be configured)
    if not settings.inngest_event_key:
        logger.warning("Inngest event key not configured – returning no-op acknowledgement")
        return {
            "queued": False,
            "connector_type": validated_connector.value,
            "full_sync": full_sync,
            "note": "Inngest not configured – set INNGEST_EVENT_KEY to enable background ingestion",
        }

    try:
        import inngest as inngest_lib  # noqa: PLC0415

        from app.workers.ingestion_worker import inngest_client  # noqa: PLC0415

        await inngest_client.send(
            inngest_lib.Event(
                name="ingestion/sync.requested",
                data={
                    "connector_type": validated_connector.value,
                    "full_sync": full_sync,
                    "triggered_by": current_user.email,
                },
            )
        )
    except Exception as exc:
        logger.error("Failed to send Inngest event: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to queue ingestion job. Please try again.",
        ) from exc

    return {
        "queued": True,
        "connector_type": validated_connector.value,
        "full_sync": full_sync,
    }
