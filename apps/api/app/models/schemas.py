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
    score: float | None = None
    source_type: str | None = None


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
    history: list[ChatMessage] = Field(
        default_factory=list,
        description="Previous turns for multi-turn context. Max 20 turns.",
        max_length=20,
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


# ---------------------------------------------------------------------------
# Chat history / session schemas
# ---------------------------------------------------------------------------


class ChatSessionSummary(BaseModel):
    """Summary of a chat session shown in the session list."""

    id: str
    title: str
    updated_at: str
    message_count: int


class ChatMessageDetail(BaseModel):
    """Full detail of a single chat message."""

    id: str
    role: str
    content: str
    sources: list[Source]
    created_at: str


# ---------------------------------------------------------------------------
# Document management
# ---------------------------------------------------------------------------


class ACLEntry(BaseModel):
    """A single access-control entry granting a user, role, or department access."""

    grantee_type: Literal["user", "role", "department"]
    grantee_id: str
    permission: Literal["read", "write"] = "read"


class DocumentUploadRequest(BaseModel):
    """Metadata supplied alongside a document upload."""

    category: str = "general"
    acl: list[ACLEntry] = []
    related_employee_id: str | None = None


class DocumentSummary(BaseModel):
    """Document list item."""

    id: str
    title: str
    source_type: str
    status: str  # "processing" | "indexed" | "error"
    access_level: str
    category: str = "general"
    related_employee_id: str | None = None
    created_at: str
    updated_at: str
    indexed_at: str | None = None
    file_size: int | None = None
    mime_type: str | None = None


class DocumentListResponse(BaseModel):
    """Paginated document list."""

    documents: list[DocumentSummary]
    total: int
    page: int
    page_size: int


class DocumentUploadResponse(BaseModel):
    """Response after successful file upload."""

    id: str
    title: str
    status: str


# ---------------------------------------------------------------------------
# Analytics Phase 3 – AI Agent Dashboard
# ---------------------------------------------------------------------------


class QuestionCluster(BaseModel):
    """A cluster of semantically similar questions derived from chat history."""

    label: str
    count: int
    sample_queries: list[str]


class DocumentRecommendation(BaseModel):
    """A content gap identified by analysing queries that returned no results."""

    topic: str
    query_count: int
    priority: str  # "high" | "medium" | "low"


class ConnectorStatus(BaseModel):
    """Ingestion health and document count for a single connector."""

    connector: str
    status: str  # "active" | "inactive"
    document_count: int
    last_synced: str | None = None
    error: str | None = None


class LogEntry(BaseModel):
    """A single row from the AuditLog table."""

    id: str
    user_email: str
    action: str
    query: str | None = None
    created_at: str
    metadata: dict


class LogListResponse(BaseModel):
    """Paginated response for the agent execution logs endpoint."""

    logs: list[LogEntry]
    total: int
    page: int
    page_size: int


# ---------------------------------------------------------------------------
# Admin Phase 4
# ---------------------------------------------------------------------------


class SystemSettings(BaseModel):
    """System-wide configuration values for RAG, LLM, and agent behaviour."""

    rag: dict
    llm: dict
    agent: dict


class UserSummary(BaseModel):
    """A brief user record returned by the admin users endpoint."""

    id: str
    email: str
    name: str
    department: str | None = None
    access_level: str
    created_at: str


class PerformanceMetrics(BaseModel):
    """Aggregated performance metrics for the admin dashboard."""

    avg_latency_ms: float
    total_tokens_today: int
    accuracy_pct: float
    queries_today: int


class HealthCheck(BaseModel):
    """Health status for a single infrastructure service."""

    service: str
    status: str  # "healthy" | "degraded" | "down"
    latency_ms: float
