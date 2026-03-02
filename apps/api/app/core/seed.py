"""Database seeding utilities for local development.

Provides idempotent seed functions that insert fixture data on startup
when running in development mode.  All inserts use ON CONFLICT DO NOTHING
so repeated invocations are safe.
"""

import logging
import uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_DEV_USER_ID = "00000000-0000-0000-0000-000000000001"
_DEV_USER_EMAIL = "dev@company.com"
_DEV_USER_NAME = "Dev User"
_DEV_USER_GOOGLE_ID = "dev-google-id"
_DEV_USER_ACCESS_LEVEL = "all"


# ---------------------------------------------------------------------------
# Seed helpers
# ---------------------------------------------------------------------------


async def seed_dev_user(db: AsyncSession) -> None:
    """Ensure the development mock user exists in the database.

    Uses ``INSERT … ON CONFLICT DO NOTHING`` so the function is fully
    idempotent and safe to call on every startup.

    Args:
        db: An active async database session.  The caller is responsible
            for committing the transaction.
    """
    stmt = text(
        """
        INSERT INTO users (id, email, name, google_id, access_level, created_at, updated_at)
        VALUES (
            :id,
            :email,
            :name,
            :google_id,
            :access_level,
            NOW(),
            NOW()
        )
        ON CONFLICT DO NOTHING
        """
    )
    await db.execute(
        stmt,
        {
            "id": uuid.UUID(_DEV_USER_ID),
            "email": _DEV_USER_EMAIL,
            "name": _DEV_USER_NAME,
            "google_id": _DEV_USER_GOOGLE_ID,
            "access_level": _DEV_USER_ACCESS_LEVEL,
        },
    )
    await db.commit()
    logger.info("Dev user seeded (id=%s)", _DEV_USER_ID)
