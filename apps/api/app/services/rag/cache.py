from __future__ import annotations

import hashlib
import json
import logging

import redis.asyncio as redis

from app.core.auth import User
from app.models.schemas import QueryResponse

logger = logging.getLogger(__name__)

_TTL_SECONDS = 3600
_KEY_PREFIX = "cache"


class RedisSemanticCache:
    """Hash-based semantic cache backed by Redis.

    Phase 2: uses exact SHA-256 hash matching on normalized
    queries. Embedding-based similarity is planned for Phase 3.
    """

    def __init__(self, redis_client: redis.Redis) -> None:
        self._redis = redis_client

    async def get(
        self,
        query: str,
        *,
        user: User,
    ) -> QueryResponse | None:
        key = self._build_key(query, user)
        try:
            raw = await self._redis.get(key)
        except Exception:
            logger.exception("Redis cache GET failed")
            return None

        if raw is None:
            return None

        try:
            data = json.loads(raw)
            response = QueryResponse.model_validate(data)
            return response.model_copy(update={"cached": True})
        except (json.JSONDecodeError, ValueError):
            logger.warning("Corrupted cache entry for key=%s", key)
            return None

    async def set(
        self,
        query: str,
        response: QueryResponse,
        *,
        user: User,
    ) -> None:
        key = self._build_key(query, user)
        try:
            data = response.model_dump_json()
            await self._redis.set(key, data, ex=_TTL_SECONDS)
        except Exception:
            logger.exception("Redis cache SET failed")

    def _build_key(self, query: str, user: User) -> str:
        normalized = query.strip().lower()
        query_hash = hashlib.sha256(normalized.encode()).hexdigest()
        dept_id = user.department_id or "none"
        return f"{_KEY_PREFIX}:{user.access_level}:{dept_id}:{query_hash}"
