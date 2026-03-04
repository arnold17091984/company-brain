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
    confidence: float | None = None


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
    ai_classification: dict | None = None


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


class DocumentUpdate(BaseModel):
    """Request to update document metadata."""

    title: str | None = None
    category: str | None = None
    access_level: str | None = None
    related_employee_id: str | None = None


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
    telegram_id: int | None = None
    created_at: str


# ---------------------------------------------------------------------------
# Admin: API Key Management
# ---------------------------------------------------------------------------


class APIKeyStatus(BaseModel):
    """Status of a single managed API key."""

    key_name: str
    source: Literal["db", "env", "none"]
    masked_value: str | None = None


class APIKeyUpdate(BaseModel):
    """Request to update API keys via the admin panel."""

    anthropic_api_key: str | None = None
    gemini_api_key: str | None = None
    openai_api_key: str | None = None
    together_ai_api_key: str | None = None
    google_client_id: str | None = None
    google_client_secret: str | None = None
    telegram_bot_token: str | None = None
    notion_integration_token: str | None = None


# ---------------------------------------------------------------------------
# User Management
# ---------------------------------------------------------------------------

UserRole = Literal["admin", "ceo", "executive", "hr", "manager", "employee"]
AccessLevel = Literal["all", "department", "restricted"]


class UserCreate(BaseModel):
    """Request to create a new user (admin pre-provisioning)."""

    email: str = Field(..., min_length=1, max_length=255)
    name: str = Field(..., min_length=1, max_length=255)
    role: UserRole = "employee"
    department_id: str | None = None
    access_level: AccessLevel = "restricted"


class UserUpdate(BaseModel):
    """Request to update user role, department, or access level."""

    role: UserRole | None = None
    department_id: str | None = None
    access_level: AccessLevel | None = None
    name: str | None = None
    telegram_id: int | None = None


class UserDetailResponse(BaseModel):
    """Detailed user response with department info."""

    id: str
    email: str
    name: str
    role: str
    department_id: str | None = None
    department_name: str | None = None
    access_level: str
    telegram_id: int | None = None
    created_at: str
    updated_at: str


# ---------------------------------------------------------------------------
# Department Management
# ---------------------------------------------------------------------------


class DepartmentCreate(BaseModel):
    """Request to create a new department."""

    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=1, max_length=100, pattern=r"^[a-z0-9_-]+$")


class DepartmentUpdate(BaseModel):
    """Request to update an existing department."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    slug: str | None = Field(default=None, min_length=1, max_length=100, pattern=r"^[a-z0-9_-]+$")


class DepartmentResponse(BaseModel):
    """Response for a single department."""

    id: str
    name: str
    slug: str
    user_count: int = 0
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


# ---------------------------------------------------------------------------
# Feature 1: AI Template Market
# ---------------------------------------------------------------------------


class PromptTemplateCreate(BaseModel):
    """Request to create a new prompt template."""

    title: str = Field(..., min_length=1, max_length=255)
    description: str = Field(default="", max_length=1000)
    content: str = Field(..., min_length=1)
    category: Literal[
        "cs", "marketing", "development", "accounting", "general_affairs", "general"
    ] = "general"


class PromptTemplateUpdate(BaseModel):
    """Request to update an existing prompt template."""

    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=1000)
    content: str | None = Field(default=None, min_length=1)
    category: (
        Literal["cs", "marketing", "development", "accounting", "general_affairs", "general"] | None
    ) = None


class PromptTemplateResponse(BaseModel):
    """Response for a single prompt template."""

    id: str
    user_id: str
    user_name: str = ""
    title: str
    description: str
    content: str
    category: str
    vote_count: int
    copy_count: int
    voted_by_me: bool = False
    created_at: str
    updated_at: str


class PromptTemplateListResponse(BaseModel):
    """Paginated template list."""

    templates: list[PromptTemplateResponse]
    total: int
    page: int
    page_size: int


# ---------------------------------------------------------------------------
# Knowledge Promotion (Chat → Knowledge Base)
# ---------------------------------------------------------------------------


class KnowledgePromoteRequest(BaseModel):
    """Request to promote a chat Q&A into the knowledge base."""

    message_id: str = Field(..., description="ID of the assistant message to promote")
    title: str | None = Field(default=None, max_length=255)
    category: str = "general"
    department_id: str | None = None
    access_level: Literal["all", "department", "restricted"] = "all"


class KnowledgePromoteResponse(BaseModel):
    """Response after promoting a chat Q&A to the knowledge base."""

    document_id: str
    title: str
    status: str
    chunks_count: int


class PromotableQA(BaseModel):
    """A thumbs-up rated Q&A eligible for knowledge promotion."""

    message_id: str
    question: str
    answer: str
    upvote_count: int
    session_id: str
    user_email: str
    created_at: str
    already_promoted: bool = False


class PromotableQAListResponse(BaseModel):
    """Paginated list of promotable Q&A pairs."""

    items: list[PromotableQA]
    total: int
    page: int
    page_size: int


# ---------------------------------------------------------------------------
# Feature 2: AI Recipe Book
# ---------------------------------------------------------------------------


class AIRecipeCreate(BaseModel):
    """Request to create a new AI recipe (admin only)."""

    title: str = Field(..., min_length=1, max_length=255)
    description: str = Field(default="", max_length=2000)
    prompt_template: str = ""
    example_query: str = ""
    example_response: str = ""
    department_id: str | None = None
    category: str = "general"
    status: Literal["draft", "published", "archived"] = "draft"


class AIRecipeUpdate(BaseModel):
    """Request to update an existing AI recipe."""

    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    prompt_template: str | None = None
    example_query: str | None = None
    example_response: str | None = None
    department_id: str | None = None
    category: str | None = None
    effectiveness_score: float | None = None
    status: Literal["draft", "published", "archived"] | None = None


class AIRecipeResponse(BaseModel):
    """Response for a single AI recipe."""

    id: str
    title: str
    description: str
    prompt_template: str
    example_query: str
    example_response: str
    department_id: str | None = None
    department_name: str | None = None
    category: str
    effectiveness_score: float
    usage_count: int
    source: str
    status: str
    created_at: str
    updated_at: str


class AIRecipeListResponse(BaseModel):
    """Paginated recipe list."""

    recipes: list[AIRecipeResponse]
    total: int
    page: int
    page_size: int


# ---------------------------------------------------------------------------
# Feature 3: AI Safety Monitor
# ---------------------------------------------------------------------------


class SafetyViolationResponse(BaseModel):
    """Response for a single safety violation."""

    id: str
    user_id: str
    user_email: str = ""
    session_id: str | None = None
    violation_type: str
    risk_level: str
    detected_categories: list[str]
    context_snippet: str
    action_taken: str
    source: str
    created_at: str
    resolved_at: str | None = None
    resolved_by: str | None = None


class SafetyViolationListResponse(BaseModel):
    """Paginated safety violation list."""

    violations: list[SafetyViolationResponse]
    total: int
    page: int
    page_size: int


class SafetyStats(BaseModel):
    """Aggregated safety statistics for the admin dashboard."""

    total_violations: int
    violations_today: int
    blocked_count: int
    masked_count: int
    warned_count: int
    top_violation_types: list[dict]


# ---------------------------------------------------------------------------
# Feature 4: ROI Analytics
# ---------------------------------------------------------------------------


class UsageMetricResponse(BaseModel):
    """Usage metrics for a single user on a single day."""

    user_id: str
    user_name: str = ""
    user_email: str = ""
    department_name: str | None = None
    date: str
    query_count: int
    total_input_tokens: int
    total_output_tokens: int
    avg_latency_ms: float
    feedback_up: int
    feedback_down: int


class CorrelationDataPoint(BaseModel):
    """A single data point for the AI usage vs KPI scatter plot."""

    user_id: str
    user_name: str = ""
    department_name: str | None = None
    query_count: int
    total_tokens: int
    kpi_achievement_pct: float


class KPIRecordCreate(BaseModel):
    """Request to manually input a KPI record."""

    user_id: str
    department_id: str | None = None
    period: str = Field(..., pattern=r"^\d{4}-\d{2}$")
    kpi_name: str = Field(..., min_length=1, max_length=255)
    target_value: float
    actual_value: float


class KPIRecordResponse(BaseModel):
    """Response for a single KPI record."""

    id: str
    user_id: str
    user_name: str = ""
    department_id: str | None = None
    period: str
    kpi_name: str
    target_value: float
    actual_value: float
    achievement_pct: float


class ROIReportResponse(BaseModel):
    """Response for a monthly ROI report."""

    id: str
    period: str
    total_queries: int
    total_tokens: int
    active_users: int
    avg_satisfaction_pct: float
    estimated_hours_saved: float
    estimated_cost_usd: float
    department_breakdown: dict
    kpi_correlation: dict
    report_markdown: str
    created_at: str


# ---------------------------------------------------------------------------
# Feature 5: Knowledge Harvesting
# ---------------------------------------------------------------------------


class HarvestSessionCreate(BaseModel):
    """Request to start a knowledge harvest session."""

    target_user_id: str
    suspension_date: str  # ISO date


class HarvestSessionSummary(BaseModel):
    """Summary of a harvest session for the dashboard list."""

    id: str
    target_user_name: str
    target_user_email: str
    status: str
    total_questions: int
    answered_questions: int
    progress_percent: float
    created_at: str
    suspension_date: str | None


class HarvestQuestionDetail(BaseModel):
    """Detail of a single harvest question with answer."""

    id: str
    category: str
    question: str
    answer: str | None
    answer_quality: float | None
    source: str | None
    asked_at: str
    answered_at: str | None


class HarvestSessionDetail(BaseModel):
    """Full session detail including all questions."""

    id: str
    target_user_name: str
    target_user_email: str
    status: str
    total_questions: int
    answered_questions: int
    progress_percent: float
    created_at: str
    suspension_date: str | None
    questions: list[HarvestQuestionDetail]


class HarvestAnswerSubmit(BaseModel):
    """Request to submit an answer to a harvest question."""

    question_id: str
    answer: str
    source: str = "web"
