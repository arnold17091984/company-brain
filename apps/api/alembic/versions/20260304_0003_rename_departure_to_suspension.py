"""Rename departure columns to suspension on users table.

Revision ID: 20260304_0003
Revises: 20260304_0002
Create Date: 2026-03-04 00:03:00.000000
"""

from collections.abc import Sequence

from alembic import op

# ---------------------------------------------------------------------------
# Alembic metadata
# ---------------------------------------------------------------------------

revision: str = "20260304_0003"
down_revision: str | None = "20260304_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("users", "departure_date", new_column_name="suspension_date")
    op.alter_column("users", "departure_flagged_by", new_column_name="suspension_flagged_by")
    op.alter_column("users", "departure_flagged_at", new_column_name="suspension_flagged_at")

    # Update existing 'departing' status to 'suspended'
    op.execute(
        "UPDATE users SET employment_status = 'suspended'"
        " WHERE employment_status = 'departing'"
    )
    op.execute(
        "UPDATE users SET employment_status = 'suspension_ended'"
        " WHERE employment_status = 'departed'"
    )


def downgrade() -> None:
    op.execute(
        "UPDATE users SET employment_status = 'departed'"
        " WHERE employment_status = 'suspension_ended'"
    )
    op.execute(
        "UPDATE users SET employment_status = 'departing'"
        " WHERE employment_status = 'suspended'"
    )

    op.alter_column("users", "suspension_flagged_at", new_column_name="departure_flagged_at")
    op.alter_column("users", "suspension_flagged_by", new_column_name="departure_flagged_by")
    op.alter_column("users", "suspension_date", new_column_name="departure_date")
