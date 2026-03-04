"""Make google_id nullable and add telegram_id column to users table.

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-03-05 00:02:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# ---------------------------------------------------------------------------
# Alembic metadata
# ---------------------------------------------------------------------------

revision: str = "e5f6a7b8c9d0"
down_revision: str | None = "d4e5f6a7b8c9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Support pre-provisioned users who may not have Google SSO linked initially
    op.alter_column(
        "users",
        "google_id",
        nullable=True,
        existing_type=sa.String(255),
    )
    # Telegram bot user linking
    op.add_column(
        "users",
        sa.Column("telegram_id", sa.BigInteger(), nullable=True),
    )
    op.create_unique_constraint("uq_users_telegram_id", "users", ["telegram_id"])


def downgrade() -> None:
    op.drop_constraint("uq_users_telegram_id", "users", type_="unique")
    op.drop_column("users", "telegram_id")
    op.alter_column(
        "users",
        "google_id",
        nullable=False,
        existing_type=sa.String(255),
    )
