"""Add prompt_templates, ai_recipes, safety_violations, usage_metrics, kpi_records, roi_reports.

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-03-04 00:01:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

from alembic import op

# ---------------------------------------------------------------------------
# Alembic metadata
# ---------------------------------------------------------------------------

revision: str = "c3d4e5f6a7b8"
down_revision: str | None = "b2c3d4e5f6a7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # -- Feature 1: prompt_templates --
    op.create_table(
        "prompt_templates",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.String(1000), nullable=False, server_default=""),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("category", sa.String(50), nullable=False, server_default="general"),
        sa.Column("vote_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("copy_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_prompt_templates_user_id", "prompt_templates", ["user_id"])
    op.create_index("ix_prompt_templates_category", "prompt_templates", ["category"])

    # -- Feature 1: prompt_template_votes --
    op.create_table(
        "prompt_template_votes",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "template_id",
            UUID(as_uuid=True),
            sa.ForeignKey("prompt_templates.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("template_id", "user_id", name="uq_template_vote_user"),
    )

    # -- Feature 2: ai_recipes --
    op.create_table(
        "ai_recipes",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.String(2000), nullable=False, server_default=""),
        sa.Column("prompt_template", sa.Text, nullable=False, server_default=""),
        sa.Column("example_query", sa.Text, nullable=False, server_default=""),
        sa.Column("example_response", sa.Text, nullable=False, server_default=""),
        sa.Column(
            "department_id",
            UUID(as_uuid=True),
            sa.ForeignKey("departments.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("category", sa.String(100), nullable=False, server_default="general"),
        sa.Column("effectiveness_score", sa.Float, nullable=False, server_default="0"),
        sa.Column("usage_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("source", sa.String(20), nullable=False, server_default="manual"),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("metadata", JSONB, nullable=False, server_default="{}"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_ai_recipes_department_id", "ai_recipes", ["department_id"])
    op.create_index("ix_ai_recipes_status", "ai_recipes", ["status"])

    # -- Feature 3: safety_violations --
    op.create_table(
        "safety_violations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=False,
        ),
        sa.Column(
            "session_id",
            UUID(as_uuid=True),
            sa.ForeignKey("chat_sessions.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("violation_type", sa.String(100), nullable=False),
        sa.Column("risk_level", sa.String(20), nullable=False),
        sa.Column("detected_categories", JSONB, nullable=False, server_default="[]"),
        sa.Column("context_snippet", sa.String(500), nullable=False, server_default=""),
        sa.Column("action_taken", sa.String(20), nullable=False),
        sa.Column("source", sa.String(20), nullable=False, server_default="chat"),
        sa.Column("metadata", JSONB, nullable=False, server_default="{}"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "resolved_by",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_safety_violations_user_id", "safety_violations", ["user_id"])
    op.create_index("ix_safety_violations_created_at", "safety_violations", ["created_at"])

    # -- Feature 4: usage_metrics_daily --
    op.create_table(
        "usage_metrics_daily",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "department_id",
            UUID(as_uuid=True),
            sa.ForeignKey("departments.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("date", sa.Date, nullable=False),
        sa.Column("query_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("total_input_tokens", sa.Integer, nullable=False, server_default="0"),
        sa.Column("total_output_tokens", sa.Integer, nullable=False, server_default="0"),
        sa.Column("avg_latency_ms", sa.Float, nullable=False, server_default="0"),
        sa.Column("feedback_up", sa.Integer, nullable=False, server_default="0"),
        sa.Column("feedback_down", sa.Integer, nullable=False, server_default="0"),
        sa.UniqueConstraint("user_id", "date", name="uq_usage_metrics_user_date"),
    )

    # -- Feature 4: kpi_records --
    op.create_table(
        "kpi_records",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "department_id",
            UUID(as_uuid=True),
            sa.ForeignKey("departments.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("period", sa.String(10), nullable=False),
        sa.Column("kpi_name", sa.String(255), nullable=False),
        sa.Column("target_value", sa.Float, nullable=False, server_default="0"),
        sa.Column("actual_value", sa.Float, nullable=False, server_default="0"),
        sa.Column("achievement_pct", sa.Float, nullable=False, server_default="0"),
    )
    op.create_index("ix_kpi_records_user_period", "kpi_records", ["user_id", "period"])

    # -- Feature 4: monthly_roi_reports --
    op.create_table(
        "monthly_roi_reports",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("period", sa.String(10), unique=True, nullable=False),
        sa.Column("total_queries", sa.Integer, nullable=False, server_default="0"),
        sa.Column("total_tokens", sa.Integer, nullable=False, server_default="0"),
        sa.Column("active_users", sa.Integer, nullable=False, server_default="0"),
        sa.Column("avg_satisfaction_pct", sa.Float, nullable=False, server_default="0"),
        sa.Column("estimated_hours_saved", sa.Float, nullable=False, server_default="0"),
        sa.Column("estimated_cost_usd", sa.Float, nullable=False, server_default="0"),
        sa.Column("department_breakdown", JSONB, nullable=False, server_default="{}"),
        sa.Column("kpi_correlation", JSONB, nullable=False, server_default="{}"),
        sa.Column("report_markdown", sa.Text, nullable=False, server_default=""),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("monthly_roi_reports")
    op.drop_table("kpi_records")
    op.drop_table("usage_metrics_daily")
    op.drop_table("safety_violations")
    op.drop_table("ai_recipes")
    op.drop_table("prompt_template_votes")
    op.drop_table("prompt_templates")
