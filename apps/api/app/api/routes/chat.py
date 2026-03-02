"""Chat endpoints including SSE streaming and session persistence."""

from __future__ import annotations

import json
import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from app.core.auth import User, get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.models.database import Feedback
from app.models.schemas import (
    ChatMessageDetail,
    ChatRequest,
    ChatResponse,
    ChatSessionSummary,
    FeedbackRequest,
    Source,
)
from app.services import chat_service
from app.services.llm.claude_service import ClaudeService, LLMError
from app.services.llm.model_router import ClaudeModelRouter
from app.services.security.data_classifier import classify_input, RiskLevel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])

_SYSTEM_PROMPT = (
    "You are Company Brain, an AI assistant for a 40-person Philippine IT company. "
    "You help employees with company knowledge, policies, and processes. "
    "Respond helpfully and concisely. "
    "You can respond in English, Japanese, or Korean based on the user's language."
)

_MAX_SNIPPET_LEN = 300


# ---------------------------------------------------------------------------
# RAG context retrieval helper
# ---------------------------------------------------------------------------


async def _retrieve_context(
    request: Request,
    user_message: str,
    user: User,
) -> list[Any]:
    """Retrieve grounding chunks from Qdrant for the user's message.

    Checks whether the Qdrant client and Together AI API key are available
    on ``request.app.state`` before attempting retrieval.  Returns an empty
    list whenever Qdrant is unavailable or no relevant chunks are found.

    Args:
        request: The incoming FastAPI request (used to access ``app.state``).
        user_message: The latest message text from the user.
        user: The authenticated user (used for access-level filtering).

    Returns:
        A list of up to 5 ``RetrievedChunk`` objects, or an empty list when
        retrieval is unavailable or returns no results.
    """
    qdrant = getattr(request.app.state, "qdrant", None)
    if not qdrant or not settings.together_ai_api_key:
        return []

    from app.services.rag.embedder import TogetherEmbeddingService  # noqa: PLC0415
    from app.services.rag.retriever import QdrantRetrieverService  # noqa: PLC0415

    embedder = TogetherEmbeddingService(settings.together_ai_api_key)
    retriever = QdrantRetrieverService(qdrant, embedder)
    chunks = await retriever.retrieve(user_message, user=user, top_k=5)
    return chunks


def _build_context_block(chunks: list[Any]) -> str:
    """Render retrieved chunks as a numbered context block for the system prompt.

    Args:
        chunks: ``RetrievedChunk`` objects to embed as grounding context.

    Returns:
        A formatted string with numbered document excerpts to append to the
        system prompt.
    """
    lines: list[str] = [
        "",
        "Use the following company documents to ground your answer. "
        "Cite sources by their reference number (e.g. [1], [2]).",
        "",
        "Documents:",
    ]
    for i, chunk in enumerate(chunks, 1):
        title = chunk.metadata.get("title", "Untitled")
        snippet = chunk.content[:_MAX_SNIPPET_LEN]
        lines.append(f"[{i}] Title: {title}")
        lines.append(snippet)
        lines.append("")
    return "\n".join(lines)


def _chunks_to_sources(chunks: list[Any]) -> list[Source]:
    """Convert retrieved chunks to ``Source`` schema objects.

    Args:
        chunks: ``RetrievedChunk`` objects from the retriever.

    Returns:
        A list of ``Source`` objects ready for inclusion in the API response.
    """
    return [
        Source(
            title=chunk.metadata.get("title", "Untitled"),
            url=chunk.metadata.get("url", ""),
            snippet=chunk.content[:_MAX_SNIPPET_LEN],
            updated_at=str(chunk.metadata.get("updated_at", "")),
        )
        for chunk in chunks
    ]


# ---------------------------------------------------------------------------
# Chat (non-streaming)
# ---------------------------------------------------------------------------


@router.post("", response_model=ChatResponse)
async def chat(
    request: Request,
    body: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ChatResponse:
    """Send a message and receive a synchronous assistant reply.

    When ``conversation_id`` is omitted a new session is created.  When
    it is provided the existing session is loaded and its full message
    history is used as LLM context (the ``history`` field in the request
    body is ignored for existing sessions).

    RAG retrieval is attempted before calling the LLM.  When relevant
    chunks are found they are inlined into the system prompt as grounding
    context and returned as ``sources`` in the response.

    Args:
        request: The FastAPI request object (used to access ``app.state``).
        body: User message and optional conversation ID.
        current_user: Injected authenticated user.
        db: Injected database session.

    Returns:
        ChatResponse: Assistant reply with sources and conversation ID.

    Raises:
        HTTPException: 404 if the conversation is not found or not owned
            by the current user.
        HTTPException: 503 if the LLM provider is unavailable.
    """
    logger.info("Chat message", extra={"user": current_user.email})

    # ── Resolve / create session ──────────────────────────────────────────
    if body.conversation_id:
        session_id = body.conversation_id
        if not await chat_service.session_belongs_to_user(db, session_id, current_user.id):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Conversation not found",
            )
        context_messages = await chat_service.get_session_context_messages(
            db, session_id, current_user.id
        )
    else:
        session_id = await chat_service.create_session(db, current_user.id)
        # Use history from request body for brand-new sessions
        context_messages = [
            {"role": m.role, "content": m.content} for m in body.history
        ]

    # ── Persist the incoming user message ────────────────────────────────
    await chat_service.add_message(db, session_id, "user", body.message)

    # ── RAG retrieval ─────────────────────────────────────────────────────
    try:
        chunks = await _retrieve_context(request, body.message, current_user)
    except Exception:
        logger.exception("RAG retrieval failed in chat endpoint, continuing without context")
        chunks = []

    # ── Build system prompt (optionally grounded) ─────────────────────────
    system_prompt = _SYSTEM_PROMPT
    if chunks:
        system_prompt = _SYSTEM_PROMPT + _build_context_block(chunks)

    # ── Sensitive data check ────────────────────────────────────────────
    classification = classify_input(body.message)
    if classification.risk_level == RiskLevel.HIGH and classification.warning_message:
        return ChatResponse(
            message=classification.warning_message,
            sources=[],
            conversation_id=session_id,
        )

    # ── Build messages list for the LLM ──────────────────────────────────
    llm_messages = context_messages + [{"role": "user", "content": body.message}]

    # ── Select model via router ──────────────────────────────────────────
    router_instance = ClaudeModelRouter()
    model_id = router_instance.select_model_for_query(
        body.message, has_history=bool(context_messages),
    )

    # ── Call the LLM ─────────────────────────────────────────────────────
    service = ClaudeService()
    try:
        reply = await service.generate(
            llm_messages, system_prompt=system_prompt, model=model_id,
        )
    except LLMError as exc:
        logger.error("LLM error in chat endpoint: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="LLM service is temporarily unavailable. Please try again.",
        ) from exc

    # ── Persist the assistant response ───────────────────────────────────
    await chat_service.add_message(db, session_id, "assistant", reply)

    sources = _chunks_to_sources(chunks)

    return ChatResponse(
        message=reply,
        sources=sources,
        conversation_id=session_id,
    )


# ---------------------------------------------------------------------------
# Chat (streaming / SSE)
# ---------------------------------------------------------------------------


@router.post("/stream")
async def chat_stream(
    request: Request,
    body: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EventSourceResponse:
    """Stream an assistant reply token-by-token via Server-Sent Events.

    Session persistence follows the same logic as the non-streaming
    ``POST /chat`` endpoint: a new session is created when
    ``conversation_id`` is absent, otherwise the existing session is
    loaded and its history is used as LLM context.

    RAG retrieval is performed before streaming begins.  When relevant
    chunks are found they ground the system prompt and are emitted in the
    final ``done`` event as ``sources``.

    The full accumulated response is saved to the database before the
    final ``done`` event is sent to the client.

    Args:
        request: The FastAPI request object (used to access ``app.state``).
        body: User message and optional conversation ID.
        current_user: Injected authenticated user.
        db: Injected database session.

    Returns:
        EventSourceResponse: SSE stream of token chunks.
    """
    logger.info("Chat stream", extra={"user": current_user.email})

    # ── Resolve / create session ──────────────────────────────────────────
    if body.conversation_id:
        session_id = body.conversation_id
        if not await chat_service.session_belongs_to_user(db, session_id, current_user.id):
            # Return an error event rather than a 404 so the SSE client can
            # handle it uniformly without needing to inspect the HTTP status.
            async def _not_found_generator():
                error_payload = json.dumps(
                    {"error": "Conversation not found.", "done": True}
                )
                yield {"data": error_payload}

            return EventSourceResponse(_not_found_generator())
        context_messages = await chat_service.get_session_context_messages(
            db, session_id, current_user.id
        )
    else:
        session_id = await chat_service.create_session(db, current_user.id)
        context_messages = [
            {"role": m.role, "content": m.content} for m in body.history
        ]

    # ── Persist the incoming user message ────────────────────────────────
    await chat_service.add_message(db, session_id, "user", body.message)

    # ── RAG retrieval (before entering generator) ─────────────────────────
    try:
        chunks = await _retrieve_context(request, body.message, current_user)
    except Exception:
        logger.exception("RAG retrieval failed in chat stream, continuing without context")
        chunks = []

    # ── Build system prompt (optionally grounded) ─────────────────────────
    system_prompt = _SYSTEM_PROMPT
    if chunks:
        system_prompt = _SYSTEM_PROMPT + _build_context_block(chunks)

    # ── Sensitive data check ────────────────────────────────────────────
    classification = classify_input(body.message)
    if classification.risk_level == RiskLevel.HIGH and classification.warning_message:
        async def _warning_generator():
            payload = json.dumps({
                "content": classification.warning_message,
                "done": True,
                "conversation_id": session_id,
                "sources": [],
            })
            yield {"data": payload}
        return EventSourceResponse(_warning_generator())

    # ── Build messages list for the LLM ──────────────────────────────────
    llm_messages = context_messages + [{"role": "user", "content": body.message}]

    # ── Select model via router ──────────────────────────────────────────
    router_instance = ClaudeModelRouter()
    model_id = router_instance.select_model_for_query(
        body.message, has_history=bool(context_messages),
    )

    # Capture locals for use inside the generator closure
    _session_id = session_id
    _sources_payload = [
        {
            "title": chunk.metadata.get("title", "Untitled"),
            "url": chunk.metadata.get("url", ""),
            "snippet": chunk.content[:_MAX_SNIPPET_LEN],
            "updated_at": str(chunk.metadata.get("updated_at", "")),
        }
        for chunk in chunks
    ]

    _model_id = model_id

    async def token_generator():
        accumulated: list[str] = []
        service = ClaudeService()
        try:
            async for chunk in service.stream(llm_messages, system_prompt=system_prompt, model=_model_id):
                accumulated.append(chunk)
                payload = json.dumps({"content": chunk, "done": False})
                yield {"data": payload}

            # ── Persist the complete assistant reply ──────────────────────
            full_reply = "".join(accumulated)
            await chat_service.add_message(db, _session_id, "assistant", full_reply)
            await db.commit()

            final_payload = json.dumps(
                {
                    "content": "",
                    "done": True,
                    "conversation_id": _session_id,
                    "sources": _sources_payload,
                }
            )
            yield {"data": final_payload}

        except LLMError as exc:
            logger.error("LLM error in chat stream: %s", exc)
            error_payload = json.dumps(
                {"error": "LLM service is temporarily unavailable.", "done": True}
            )
            yield {"data": error_payload}

    return EventSourceResponse(token_generator())


# ---------------------------------------------------------------------------
# Session management endpoints
# ---------------------------------------------------------------------------


@router.get("/sessions", response_model=list[ChatSessionSummary])
async def list_sessions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ChatSessionSummary]:
    """List the current user's chat sessions, most recent first.

    Args:
        current_user: Injected authenticated user.
        db: Injected database session.

    Returns:
        List of session summaries ordered by last activity descending.
    """
    sessions = await chat_service.list_sessions(db, current_user.id)
    return [ChatSessionSummary(**s) for s in sessions]


@router.get(
    "/sessions/{session_id}",
    response_model=list[ChatMessageDetail],
)
async def get_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ChatMessageDetail]:
    """Return all messages in a session in chronological order.

    Args:
        session_id: UUID string of the target session.
        current_user: Injected authenticated user.
        db: Injected database session.

    Returns:
        Ordered list of message details.

    Raises:
        HTTPException: 404 if the session is not found or not owned by
            the current user.
    """
    messages = await chat_service.get_session_messages(db, session_id, current_user.id)
    if not messages:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )
    return [
        ChatMessageDetail(
            id=m["id"],
            role=m["role"],
            content=m["content"],
            sources=[Source(**s) for s in (m["sources"] or [])],
            created_at=m["created_at"],
        )
        for m in messages
    ]


@router.delete(
    "/sessions/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a chat session and all its messages.

    Args:
        session_id: UUID string of the session to delete.
        current_user: Injected authenticated user.
        db: Injected database session.

    Raises:
        HTTPException: 404 if the session is not found or not owned by
            the current user.
    """
    deleted = await chat_service.delete_session(db, session_id, current_user.id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )


# ---------------------------------------------------------------------------
# Feedback
# ---------------------------------------------------------------------------


@router.post("/feedback", status_code=status.HTTP_204_NO_CONTENT)
async def submit_feedback(
    request: FeedbackRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Record thumbs-up or thumbs-down feedback for an assistant message.

    Persists a ``Feedback`` row to the database linking the rating to the
    authenticated user and the target message.

    Args:
        request: Conversation ID, message ID, and rating.
        current_user: Injected authenticated user.
        db: Injected database session.

    Raises:
        HTTPException: 404 if the message_id is not provided.
    """
    if not request.message_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message not found",
        )

    logger.info(
        "Feedback submitted",
        extra={
            "user": current_user.email,
            "message_id": request.message_id,
            "rating": request.rating,
        },
    )

    feedback = Feedback(
        id=uuid.uuid4(),
        user_id=current_user.id,
        message_id=uuid.UUID(request.message_id),
        rating=request.rating,
    )
    db.add(feedback)
    await db.commit()
