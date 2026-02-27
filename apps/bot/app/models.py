"""Pydantic models that mirror the Company Brain API response schemas."""

from pydantic import BaseModel, HttpUrl


class Source(BaseModel):
    """A single knowledge source returned alongside an answer.

    Attributes:
        title: Display title of the source document.
        url: Canonical link to the source.
        snippet: Short excerpt most relevant to the query.
        updated_at: ISO-8601 timestamp of the last known modification.
    """

    title: str
    url: HttpUrl
    snippet: str
    updated_at: str


class QueryResponse(BaseModel):
    """Response returned by the /query endpoint.

    Attributes:
        answer: LLM-generated answer to the user's question.
        sources: Ordered list of evidence sources used to form the answer.
        cached: True when the response was served from cache.
    """

    answer: str
    sources: list[Source]
    cached: bool


class ChatResponse(BaseModel):
    """Response returned by the /chat endpoint.

    Attributes:
        message: The assistant's reply in the ongoing conversation.
        sources: Sources referenced in the reply.
        conversation_id: Opaque identifier for the conversation thread.
    """

    message: str
    sources: list[Source]
    conversation_id: str
