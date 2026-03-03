"""Promote a user to admin role by email address.

Usage
-----
    cd apps/api
    uv run python -m app.scripts.promote_admin user@example.com
"""

from __future__ import annotations

import asyncio
import logging
import sys
from datetime import UTC, datetime

from sqlalchemy import select

from app.core.database import AsyncSessionLocal, engine
from app.models.database import User

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)-8s %(message)s",
    stream=sys.stdout,
)


async def promote(email: str) -> None:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(User).where(User.email == email.lower())
        )
        user = result.scalar_one_or_none()

        if user is None:
            logger.error("User not found: %s", email)
            sys.exit(1)

        if user.role == "admin":
            logger.info("User %s is already an admin.", email)
            return

        user.role = "admin"
        user.access_level = "all"
        user.updated_at = datetime.now(tz=UTC)
        await session.commit()
        logger.info("Promoted %s (%s) to admin.", user.name, email)

    await engine.dispose()


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: uv run python -m app.scripts.promote_admin <email>")
        sys.exit(1)
    asyncio.run(promote(sys.argv[1]))


if __name__ == "__main__":
    main()
