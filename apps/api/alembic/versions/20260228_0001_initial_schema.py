"""Initial schema: all core tables.

Revision ID: d1a2b3c4e5f6
Revises:
Create Date: 2026-02-28 00:01:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

# ---------------------------------------------------------------------------
# Alembic metadata
# ---------------------------------------------------------------------------

revision: str = "d1a2b3c4e5f6"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# ---------------------------------------------------------------------------
# Upgrade: create all tables in dependency order
# ---------------------------------------------------------------------------


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. departments
    # ------------------------------------------------------------------
    op.create_table(
        "departments",
        sa.Column("id", sa.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("slug", name="uq_departments_slug"),
    )

    # ------------------------------------------------------------------
    # 2. users  (depends on departments)
    # ------------------------------------------------------------------
    op.create_table(
        "users",
        sa.Column("id", sa.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("department_id", sa.UUID(as_uuid=True), nullable=True),
        sa.Column("access_level", sa.String(50), nullable=False, server_default="restricted"),
        sa.Column("google_id", sa.String(255), nullable=False),
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
        sa.ForeignKeyConstraint(
            ["department_id"],
            ["departments.id"],
            name="fk_users_department_id",
            ondelete="SET NULL",
        ),
        sa.UniqueConstraint("email", name="uq_users_email"),
        sa.UniqueConstraint("google_id", name="uq_users_google_id"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_index("ix_users_google_id", "users", ["google_id"], unique=True)

    # ------------------------------------------------------------------
    # 3. documents  (depends on departments)
    # ------------------------------------------------------------------
    op.create_table(
        "documents",
        sa.Column("id", sa.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("source_type", sa.String(100), nullable=False),
        sa.Column("source_id", sa.String(512), nullable=False),
        sa.Column("title", sa.String(512), nullable=False),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("access_level", sa.String(50), nullable=False, server_default="restricted"),
        sa.Column("department_id", sa.UUID(as_uuid=True), nullable=True),
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
        sa.Column("indexed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["department_id"],
            ["departments.id"],
            name="fk_documents_department_id",
            ondelete="SET NULL",
        ),
    )
    op.create_index(
        "ix_documents_source_type_source_id",
        "documents",
        ["source_type", "source_id"],
    )
    op.create_index("ix_documents_department_id", "documents", ["department_id"])
    op.create_index("ix_documents_content_hash", "documents", ["content_hash"])

    # ------------------------------------------------------------------
    # 4. chat_sessions  (depends on users)
    # ------------------------------------------------------------------
    op.create_table(
        "chat_sessions",
        sa.Column("id", sa.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", sa.UUID(as_uuid=True), nullable=False),
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
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_chat_sessions_user_id",
            ondelete="CASCADE",
        ),
    )
    op.create_index("ix_chat_sessions_user_id", "chat_sessions", ["user_id"])

    # ------------------------------------------------------------------
    # 5. chat_messages  (depends on chat_sessions)
    # ------------------------------------------------------------------
    op.create_table(
        "chat_messages",
        sa.Column("id", sa.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("session_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("sources", JSONB, nullable=False, server_default="[]"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["session_id"],
            ["chat_sessions.id"],
            name="fk_chat_messages_session_id",
            ondelete="CASCADE",
        ),
    )
    op.create_index("ix_chat_messages_session_id", "chat_messages", ["session_id"])

    # ------------------------------------------------------------------
    # 6. feedbacks  (depends on chat_messages + users)
    # ------------------------------------------------------------------
    op.create_table(
        "feedbacks",
        sa.Column("id", sa.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("message_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("rating", sa.String(10), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["message_id"],
            ["chat_messages.id"],
            name="fk_feedbacks_message_id",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_feedbacks_user_id",
            ondelete="CASCADE",
        ),
    )
    op.create_index("ix_feedbacks_message_id", "feedbacks", ["message_id"])

    # ------------------------------------------------------------------
    # 7. audit_logs  (depends on users)
    # ------------------------------------------------------------------
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("query", sa.Text, nullable=True),
        sa.Column("metadata", JSONB, nullable=False, server_default="{}"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_audit_logs_user_id",
            ondelete="SET NULL",
        ),
    )
    op.create_index("ix_audit_logs_user_id", "audit_logs", ["user_id"])
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])


# ---------------------------------------------------------------------------
# Downgrade: drop all tables in reverse dependency order
# ---------------------------------------------------------------------------


def downgrade() -> None:
    # Reverse order: children before parents
    op.drop_index("ix_audit_logs_created_at", table_name="audit_logs")
    op.drop_index("ix_audit_logs_user_id", table_name="audit_logs")
    op.drop_table("audit_logs")

    op.drop_index("ix_feedbacks_message_id", table_name="feedbacks")
    op.drop_table("feedbacks")

    op.drop_index("ix_chat_messages_session_id", table_name="chat_messages")
    op.drop_table("chat_messages")

    op.drop_index("ix_chat_sessions_user_id", table_name="chat_sessions")
    op.drop_table("chat_sessions")

    op.drop_index("ix_documents_content_hash", table_name="documents")
    op.drop_index("ix_documents_department_id", table_name="documents")
    op.drop_index("ix_documents_source_type_source_id", table_name="documents")
    op.drop_table("documents")

    op.drop_index("ix_users_google_id", table_name="users")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")

    op.drop_table("departments")
