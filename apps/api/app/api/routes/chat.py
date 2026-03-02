"""Chat endpoints including SSE streaming."""

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
)
from app.services.llm.claude_service import ClaudeService, LLMError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])

_SYSTEM_PROMPT = (
    "You are Company Brain, an AI assistant for a 40-person Philippine IT company. "
    "You help employees with company knowledge, policies, and processes. "
    "Respond helpfully and concisely. "
    "You can respond in English, Japanese, or Korean based on the user's language."
)


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

    Raises:
        HTTPException: 503 if the LLM provider is unavailable.
    """
    logger.info("Chat message", extra={"user": current_user.email})

    conversation_id = request.conversation_id or str(uuid.uuid4())
    messages = [
        {"role": m.role, "content": m.content} for m in request.history
    ]
    messages.append({"role": "user", "content": request.message})

    service = ClaudeService()
    try:
        reply = await service.generate(messages, system_prompt=_SYSTEM_PROMPT)
    except LLMError as exc:
        logger.error("LLM error in chat endpoint: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="LLM service is temporarily unavailable. Please try again.",
        ) from exc

    return ChatResponse(
        message=reply,
        sources=[],
        conversation_id=conversation_id,
    )


@router.post("/stream")
async def chat_stream(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
) -> EventSourceResponse:
    """Stream an assistant reply token-by-token via Server-Sent Events.

    The client should open this endpoint with ``Accept: text/event-stream``.
    Each SSE event carries a JSON payload with a ``content`` field containing
    the next token(s).  A final event with ``done: true`` signals completion.

    Args:
        request: User message and optional conversation ID.
        current_user: Injected authenticated user.

    Returns:
        EventSourceResponse: SSE stream of token chunks.
    """
    logger.info("Chat stream", extra={"user": current_user.email})

    conversation_id = request.conversation_id or str(uuid.uuid4())
    messages = [
        {"role": m.role, "content": m.content} for m in request.history
    ]
    messages.append({"role": "user", "content": request.message})

    async def token_generator():
        service = ClaudeService()
        try:
            async for chunk in service.stream(messages, system_prompt=_SYSTEM_PROMPT):
                payload = json.dumps({"content": chunk, "done": False})
                yield {"data": payload}

            final_payload = json.dumps(
                {
                    "content": "",
                    "done": True,
                    "conversation_id": conversation_id,
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
