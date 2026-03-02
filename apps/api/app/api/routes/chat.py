"""Chat endpoints including SSE streaming and session persistence."""

from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from app.core.auth import User, get_current_user
from app.core.database import get_db
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

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])

_SYSTEM_PROMPT = (
    "You are Company Brain, an AI assistant for a 40-person Philippine IT company. "
    "You help employees with company knowledge, policies, and processes. "
    "Respond helpfully and concisely. "
    "You can respond in English, Japanese, or Korean based on the user's language."
)


# ---------------------------------------------------------------------------
# Chat (non-streaming)
# ---------------------------------------------------------------------------


@router.post("", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ChatResponse:
    """Send a message and receive a synchronous assistant reply.

    When ``conversation_id`` is omitted a new session is created.  When
    it is provided the existing session is loaded and its full message
    history is used as LLM context (the ``history`` field in the request
    body is ignored for existing sessions).

    Args:
        request: User message and optional conversation ID.
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
    if request.conversation_id:
        session_id = request.conversation_id
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
            {"role": m.role, "content": m.content} for m in request.history
        ]

    # ── Persist the incoming user message ────────────────────────────────
    await chat_service.add_message(db, session_id, "user", request.message)

    # ── Build messages list for the LLM ──────────────────────────────────
    llm_messages = context_messages + [{"role": "user", "content": request.message}]

    # ── Call the LLM ─────────────────────────────────────────────────────
    service = ClaudeService()
    try:
        reply = await service.generate(llm_messages, system_prompt=_SYSTEM_PROMPT)
    except LLMError as exc:
        logger.error("LLM error in chat endpoint: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="LLM service is temporarily unavailable. Please try again.",
        ) from exc

    # ── Persist the assistant response ───────────────────────────────────
    await chat_service.add_message(db, session_id, "assistant", reply)

    return ChatResponse(
        message=reply,
        sources=[],
        conversation_id=session_id,
    )


# ---------------------------------------------------------------------------
# Chat (streaming / SSE)
# ---------------------------------------------------------------------------


@router.post("/stream")
async def chat_stream(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EventSourceResponse:
    """Stream an assistant reply token-by-token via Server-Sent Events.

    Session persistence follows the same logic as the non-streaming
    ``POST /chat`` endpoint: a new session is created when
    ``conversation_id`` is absent, otherwise the existing session is
    loaded and its history is used as LLM context.

    The full accumulated response is saved to the database before the
    final ``done`` event is sent to the client.

    Args:
        request: User message and optional conversation ID.
        current_user: Injected authenticated user.
        db: Injected database session.

    Returns:
        EventSourceResponse: SSE stream of token chunks.
    """
    logger.info("Chat stream", extra={"user": current_user.email})

    # ── Resolve / create session ──────────────────────────────────────────
    if request.conversation_id:
        session_id = request.conversation_id
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
            {"role": m.role, "content": m.content} for m in request.history
        ]

    # ── Persist the incoming user message ────────────────────────────────
    await chat_service.add_message(db, session_id, "user", request.message)

    # ── Build messages list for the LLM ──────────────────────────────────
    llm_messages = context_messages + [{"role": "user", "content": request.message}]

    # Capture session_id for use inside the generator closure
    _session_id = session_id

    async def token_generator():
        accumulated: list[str] = []
        service = ClaudeService()
        try:
            async for chunk in service.stream(llm_messages, system_prompt=_SYSTEM_PROMPT):
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
                    "sources": [],
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
) -> None:
    """Record thumbs-up or thumbs-down feedback for an assistant message.

    Args:
        request: Conversation ID, message ID, and rating.
        current_user: Injected authenticated user.

    Raises:
        HTTPException: 404 if the message does not exist (stub always succeeds).
    """
    logger.info(
        "Feedback submitted",
        extra={
            "user": current_user.email,
            "message_id": request.message_id,
            "rating": request.rating,
        },
    )

    # TODO: persist to Feedback table and forward to Langfuse score API
    if not request.message_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message not found",
        )
