"""Runtime API key resolution: DB-first with env fallback."""

from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.encryption import decrypt_value
from app.models.database import SystemSetting

logger = logging.getLogger(__name__)

# Keys managed through the admin UI
MANAGED_KEYS = [
    "anthropic_api_key",
    "gemini_api_key",
    "openai_api_key",
    "together_ai_api_key",
    "google_client_id",
    "google_client_secret",
    "telegram_bot_token",
    "notion_integration_token",
]

# Mapping from managed key name to Settings attribute name
_ENV_ATTR_MAP: dict[str, str] = {k: k for k in MANAGED_KEYS}


async def get_api_key(key_name: str, db: AsyncSession) -> str | None:
    """Resolve an API key: DB (encrypted) first, then env fallback.

    Args:
        key_name: One of the MANAGED_KEYS names.
        db: Async database session.

    Returns:
        The plaintext API key, or None if not configured anywhere.
    """
    # Try DB first
    result = await db.execute(
        select(SystemSetting).where(SystemSetting.key == f"api_key:{key_name}")
    )
    row = result.scalar_one_or_none()
    if row and row.value.get("encrypted_value"):
        try:
            return decrypt_value(row.value["encrypted_value"])
        except (ValueError, RuntimeError):
            logger.warning(
                "Failed to decrypt DB key %s, falling back to env",
                key_name,
            )

    # Fallback to env
    env_attr = _ENV_ATTR_MAP.get(key_name)
    if env_attr:
        val = getattr(settings, env_attr, "")
        if val:
            return val

    return None


def mask_key(value: str) -> str:
    """Return a masked version showing only the last 4 characters."""
    if len(value) <= 4:
        return "****"
    return "*" * (len(value) - 4) + value[-4:]
