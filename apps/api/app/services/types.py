"""Shared value objects used across all service layer protocols.

These are pure data containers (Pydantic v2 models) that flow between
service boundaries.  They carry no business logic and are safe to
import from anywhere in the codebase.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class ConnectorType(StrEnum):
    """Supported knowledge-source connectors."""

    GOOGLE_DRIVE = "google_drive"
    TELEGRAM = "telegram"
    NOTION = "notion"
    CHAT_LEARNED = "chat_learned"


class ChunkType(StrEnum):
    """Content type of a document chunk."""

    TEXT = "text"
    TABLE = "table"
    CODE = "code"
    IMAGE_CAPTION = "image_caption"


class DocumentCategory(StrEnum):
    """Category of a document, used for HR access-control scoping."""

    GENERAL = "general"
    HR_EVALUATION = "hr_evaluation"
    HR_COMPENSATION = "hr_compensation"
    HR_CONTRACT = "hr_contract"
    HR_ATTENDANCE = "hr_attendance"
    HR_SKILLS = "hr_skills"
    HR_ORG = "hr_org"
    HR_COMPLIANCE = "hr_compliance"
    ENGINEERING = "engineering"
    SALES = "sales"
    MARKETING = "marketing"
    FINANCE = "finance"
    POLICY = "policy"
    ONBOARDING = "onboarding"
    PROJECT = "project"
    MEETING_NOTES = "meeting_notes"


class UserRole(StrEnum):
    """Role of a user, used for HR access-control scoping."""

    EMPLOYEE = "employee"
    MANAGER = "manager"
    HR = "hr"
    EXECUTIVE = "executive"
    CEO = "ceo"
    ADMIN = "admin"


class EmploymentStatus(StrEnum):
    """Employee lifecycle status."""

    ACTIVE = "active"
    DEPARTING = "departing"
    DEPARTED = "departed"


class HarvestStatus(StrEnum):
    """Knowledge harvest session status."""

    ACTIVE = "active"
    COMPLETED = "completed"
    PAUSED = "paused"


class HarvestCategory(StrEnum):
    """Knowledge harvest question categories."""

    PROJECT = "project"
    PROCESS = "process"
    CLIENT = "client"
    TOOL = "tool"
    TEAM = "team"


# ---------------------------------------------------------------------------
# RAG value objects
# ---------------------------------------------------------------------------


class RetrievedChunk(BaseModel):
    """A single chunk returned by the retrieval/reranking pipeline."""

    document_id: uuid.UUID = Field(
        description="FK to the documents table.",
    )
    chunk_id: str = Field(
        description="Unique identifier for this chunk within Qdrant.",
    )
    content: str = Field(
        description="The text content of this chunk.",
    )
    score: float = Field(
        description="Relevance score (higher is better). "
        "Scale depends on the stage: cosine similarity for retrieval, "
        "cross-encoder logit for reranking.",
    )
    metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Arbitrary metadata: source_type, title, url, language, chunk_index, etc.",
    )


# ---------------------------------------------------------------------------
# Ingestion value objects
# ---------------------------------------------------------------------------


class RawDocument(BaseModel):
    """A document fetched from a connector before any processing."""

    source_type: ConnectorType
    source_id: str = Field(
        description="Identifier in the source system (file ID, message ID, page ID).",
    )
    title: str
    content: str = Field(
        description="Full raw content (plain text, markdown, or HTML).",
    )
    content_hash: str = Field(
        description="SHA-256 hex digest of the raw content for deduplication.",
    )
    url: str = Field(
        default="",
        description="Canonical URL to the source document.",
    )
    language: str | None = Field(
        default=None,
        description="BCP-47 language tag if known (e.g. 'en', 'ja', 'tl').",
    )
    access_level: str = Field(
        default="restricted",
        description="Access scope: 'all', 'department', or 'restricted'.",
    )
    department_slug: str | None = Field(
        default=None,
        description="Owning department slug, used when access_level is 'department'.",
    )
    metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Connector-specific metadata (MIME type, author, channel, etc.).",
    )
    fetched_at: datetime = Field(
        default_factory=datetime.utcnow,
        description="Timestamp when the document was fetched from the source.",
    )


class DocumentChunk(BaseModel):
    """A processed chunk ready for embedding and indexing."""

    chunk_id: str = Field(
        description="Deterministic ID derived from source_id + chunk_index.",
    )
    document_source_id: str = Field(
        description="Source-system identifier of the parent document.",
    )
    source_type: ConnectorType
    content: str = Field(
        description="The chunk text, enriched with contextual header if applicable.",
    )
    chunk_type: ChunkType = Field(default=ChunkType.TEXT)
    chunk_index: int = Field(
        description="Zero-based position of this chunk within the parent document.",
    )
    token_count: int = Field(
        default=0,
        description="Approximate token count (for cost/limit tracking).",
    )
    metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Inherited document metadata plus chunk-level additions.",
    )


class IngestionResult(BaseModel):
    """Summary of a completed ingestion run."""

    connector_type: ConnectorType
    total_documents: int = Field(
        default=0,
        description="Number of documents fetched from the source.",
    )
    new_documents: int = Field(
        default=0,
        description="Documents indexed for the first time.",
    )
    updated_documents: int = Field(
        default=0,
        description="Documents re-indexed due to content changes.",
    )
    skipped_documents: int = Field(
        default=0,
        description="Documents skipped (unchanged content hash).",
    )
    total_chunks: int = Field(
        default=0,
        description="Total chunks produced and embedded.",
    )
    errors: list[IngestionError] = Field(
        default_factory=list,
        description="Non-fatal errors encountered during ingestion.",
    )
    started_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: datetime | None = Field(default=None)
    full_sync: bool = Field(
        default=False,
        description="Whether this was a full re-sync or incremental.",
    )


class IngestionError(BaseModel):
    """A non-fatal error encountered while processing a single document."""

    source_id: str
    error_type: str
    message: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)


# ---------------------------------------------------------------------------
# LLM value objects
# ---------------------------------------------------------------------------


class ModelConfig(BaseModel):
    """Configuration for an LLM model used by the model router."""

    model_id: str = Field(
        description="Provider-specific model identifier (e.g. 'claude-sonnet-4-20250514').",
    )
    provider: str = Field(
        description="LLM provider name: 'anthropic', 'together', etc.",
    )
    max_tokens: int = Field(default=4096)
    temperature: float = Field(default=0.3)
    cost_per_1k_input: float = Field(
        default=0.0,
        description="Cost in USD per 1,000 input tokens.",
    )
    cost_per_1k_output: float = Field(
        default=0.0,
        description="Cost in USD per 1,000 output tokens.",
    )
    supports_streaming: bool = Field(default=True)
    supports_thinking: bool = Field(
        default=False,
        description="Whether the model supports extended thinking.",
    )
    context_window: int = Field(
        default=200_000,
        description="Maximum context window in tokens.",
    )
    tasks: list[str] = Field(
        default_factory=list,
        description="Task types this model is suited for (e.g. 'chat', 'summarize', 'classify').",
    )
