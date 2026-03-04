"""Add user departure fields and knowledge harvesting tables.

Revision ID: 20260304_0002
Revises: d4e5f6a7b8c9
Create Date: 2026-03-04 00:02:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

# ---------------------------------------------------------------------------
# Alembic metadata
# ---------------------------------------------------------------------------

revision: str = "20260304_0002"
down_revision: str | None = "d4e5f6a7b8c9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # Extend users table with departure and org-chart fields
    # ------------------------------------------------------------------
    op.add_column(
        "users",
        sa.Column(
            "employment_status",
            sa.String(20),
            nullable=False,
            server_default="active",
        ),
    )
    op.add_column(
        "users",
        sa.Column("departure_date", sa.Date, nullable=True),
    )
    op.add_column(
        "users",
        sa.Column(
            "departure_flagged_by",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "departure_flagged_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.add_column(
        "users",
        sa.Column("job_title", sa.String(200), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column(
            "manager_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )

    op.create_index(
        "ix_users_employment_status",
        "users",
        ["employment_status"],
    )

    # ------------------------------------------------------------------
    # harvest_sessions table
    # ------------------------------------------------------------------
    op.create_table(
        "harvest_sessions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "target_user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default="active",
        ),
        sa.Column("total_questions", sa.Integer, nullable=False, server_default="0"),
        sa.Column("answered_questions", sa.Integer, nullable=False, server_default="0"),
        sa.Column(
            "created_by",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_index(
        "ix_harvest_sessions_target_user_id",
        "harvest_sessions",
        ["target_user_id"],
    )

    # ------------------------------------------------------------------
    # harvest_questions table
    # ------------------------------------------------------------------
    op.create_table(
        "harvest_questions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "session_id",
            UUID(as_uuid=True),
            sa.ForeignKey("harvest_sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("category", sa.String(50), nullable=False),
        sa.Column("question", sa.String, nullable=False),
        sa.Column("answer", sa.String, nullable=True),
        sa.Column("answer_quality", sa.Float, nullable=True),
        sa.Column("source", sa.String(20), nullable=True),
        sa.Column(
            "asked_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("answered_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("harvest_questions")
    op.drop_index("ix_harvest_sessions_target_user_id", table_name="harvest_sessions")
    op.drop_table("harvest_sessions")
    op.drop_index("ix_users_employment_status", table_name="users")
    op.drop_column("users", "manager_id")
    op.drop_column("users", "job_title")
    op.drop_column("users", "departure_flagged_at")
    op.drop_column("users", "departure_flagged_by")
    op.drop_column("users", "departure_date")
    op.drop_column("users", "employment_status")
