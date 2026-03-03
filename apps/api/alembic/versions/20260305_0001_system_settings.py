"""Add system_settings table with default configuration rows.

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-03-05 00:01:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

# ---------------------------------------------------------------------------
# Alembic metadata
# ---------------------------------------------------------------------------

revision: str = "d4e5f6a7b8c9"
down_revision: str | None = "c3d4e5f6a7b8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "system_settings",
        sa.Column("key", sa.String(255), primary_key=True),
        sa.Column("value", JSONB, nullable=False, server_default="{}"),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # Seed default settings rows
    op.bulk_insert(
        sa.table(
            "system_settings",
            sa.column("key", sa.String),
            sa.column("value", JSONB),
        ),
        [
            {"key": "rag", "value": {"chunk_size": 2000, "overlap": 200, "top_k": 10}},
            {
                "key": "llm",
                "value": {"default_model": "sonnet", "temperature": 0.7, "max_tokens": 4096},
            },
            {
                "key": "agent",
                "value": {"thinking_budget": 8000, "confidence_threshold": 0.5},
            },
        ],
    )


def downgrade() -> None:
    op.drop_table("system_settings")
