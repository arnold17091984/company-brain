"""Pydantic v2 request/response schemas for the Company Brain API."""

from typing import Literal

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Shared primitives
# ---------------------------------------------------------------------------


class Source(BaseModel):
    """A document chunk surfaced by the retrieval pipeline."""

    title: str
    url: str
    snippet: str
    updated_at: str


# ---------------------------------------------------------------------------
# Knowledge / RAG
# ---------------------------------------------------------------------------


class QueryRequest(BaseModel):
    """Incoming knowledge query."""

    query: str = Field(..., min_length=1, max_length=2000)
    language: str | None = Field(
        default=None,
        description="BCP-47 language tag (e.g. 'en', 'ja', 'tl'). "
        "Inferred automatically when omitted.",
    )


class QueryResponse(BaseModel):
    """RAG-generated answer with supporting sources."""

    answer: str
    sources: list[Source]
    cached: bool = False


# ---------------------------------------------------------------------------
# Chat
# ---------------------------------------------------------------------------


class ChatMessage(BaseModel):
    """A single turn in a conversation."""

    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    """Incoming chat message."""

    message: str = Field(..., min_length=1, max_length=4000)
    conversation_id: str | None = Field(
        default=None,
        description="Omit to start a new conversation.",
    )


class ChatResponse(BaseModel):
    """Assistant reply with optional grounding sources."""

    message: str
    sources: list[Source]
    conversation_id: str


class FeedbackRequest(BaseModel):
    """User feedback on a specific assistant message."""

    conversation_id: str
    message_id: str
    rating: Literal["up", "down"]
