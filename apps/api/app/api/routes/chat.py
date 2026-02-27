"""Chat endpoints including SSE streaming."""

import asyncio
import json
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sse_starlette.sse import EventSourceResponse

from app.core.auth import User, get_current_user
from app.models.schemas import (
    ChatRequest,
    ChatResponse,
    FeedbackRequest,
    Source,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])

# ---------------------------------------------------------------------------
# Stub data
# ---------------------------------------------------------------------------

_STUB_SOURCES = [
    Source(
        title="IT Onboarding Guide",
        url="https://notion.so/stub-page",
        snippet="Welcome to the team! Here is everything you need to get started…",
        updated_at="2026-01-15T00:00:00Z",
    )
]


@router.post("", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
) -> ChatResponse:
    """Send a message and receive a synchronous assistant reply.

    Args:
        request: User message and optional conversation ID.
        current_user: Injected authenticated user.

    Returns:
        ChatResponse: Assistant reply with sources and conversation ID.
    """
    logger.info("Chat message", extra={"user": current_user.email})

    conversation_id = request.conversation_id or str(uuid.uuid4())

    # TODO: wire in LangGraph agent and ChatSession persistence
    stub_reply = (
        f'[STUB] Hello {current_user.name}! You said: "{request.message}". '
        "The real implementation will run through the LangGraph agent pipeline "
        "with RAG retrieval and Claude as the generator."
    )
    return ChatResponse(
        message=stub_reply,
        sources=_STUB_SOURCES,
        conversation_id=conversation_id,
    )


@router.post("/stream")
async def chat_stream(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
) -> EventSourceResponse:
    """Stream an assistant reply token-by-token via Server-Sent Events.

    The client should open this endpoint with ``Accept: text/event-stream``.
    Each SSE event carries a JSON payload with a ``delta`` field containing
    the next token(s).  A final event with ``done: true`` signals completion.

    Args:
        request: User message and optional conversation ID.
        current_user: Injected authenticated user.

    Returns:
        EventSourceResponse: SSE stream of token chunks.
    """
    logger.info("Chat stream", extra={"user": current_user.email})

    conversation_id = request.conversation_id or str(uuid.uuid4())

    stub_tokens = [
        "[STUB] ",
        "Streaming ",
        "response ",
        "for: ",
        f'"{request.message}".',
        " The real implementation ",
        "will yield tokens ",
        "from Claude via ",
        "the Anthropic streaming API.",
    ]

    async def token_generator():
        for token in stub_tokens:
            payload = json.dumps({"delta": token, "done": False})
            yield {"data": payload}
            await asyncio.sleep(0.05)  # simulate network latency

        final_payload = json.dumps(
            {
                "delta": "",
                "done": True,
                "conversation_id": conversation_id,
                "sources": [s.model_dump() for s in _STUB_SOURCES],
            }
        )
        yield {"data": final_payload}

    return EventSourceResponse(token_generator())


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
