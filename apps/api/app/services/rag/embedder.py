from __future__ import annotations

import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_TOGETHER_API_URL = "https://api.together.xyz/v1/embeddings"
_MODEL = "BAAI/bge-m3"
_DIMENSION = 1024
_MAX_BATCH = 32
_MAX_RETRIES = 3
_BASE_DELAY = 0.5


class TogetherEmbeddingService:
    """BGE-M3 embedding service via Together AI API."""

    def __init__(self, api_key: str) -> None:
        self._api_key = api_key
        self._client = httpx.AsyncClient(
            timeout=30.0,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
        )

    async def embed(
        self,
        texts: list[str],
        *,
        language: str | None = None,
    ) -> list[list[float]]:
        if not texts:
            return []

        all_embeddings: list[list[float]] = []
        for i in range(0, len(texts), _MAX_BATCH):
            batch = texts[i : i + _MAX_BATCH]
            embeddings = await self._embed_batch(batch)
            all_embeddings.extend(embeddings)

        return all_embeddings

    async def _embed_batch(
        self,
        texts: list[str],
    ) -> list[list[float]]:
        import asyncio

        payload: dict[str, Any] = {
            "model": _MODEL,
            "input": texts,
        }

        last_exc: Exception | None = None
        for attempt in range(_MAX_RETRIES):
            try:
                resp = await self._client.post(
                    _TOGETHER_API_URL,
                    json=payload,
                )
                resp.raise_for_status()
                data = resp.json()
                sorted_data = sorted(data["data"], key=lambda x: x["index"])
                return [item["embedding"] for item in sorted_data]
            except httpx.HTTPStatusError as exc:
                last_exc = exc
                if exc.response.status_code >= 500:
                    delay = _BASE_DELAY * (2**attempt)
                    logger.warning(
                        "Together AI server error (attempt %d/%d): %s. Retrying in %.1fs",
                        attempt + 1,
                        _MAX_RETRIES,
                        exc.response.status_code,
                        delay,
                    )
                    await asyncio.sleep(delay)
                    continue
                if exc.response.status_code == 429:
                    delay = _BASE_DELAY * (2**attempt)
                    logger.warning(
                        "Together AI rate limit (attempt %d/%d). Retrying in %.1fs",
                        attempt + 1,
                        _MAX_RETRIES,
                        delay,
                    )
                    await asyncio.sleep(delay)
                    continue
                raise
            except httpx.HTTPError as exc:
                last_exc = exc
                delay = _BASE_DELAY * (2**attempt)
                logger.warning(
                    "Together AI request failed (attempt %d/%d): %s. Retrying in %.1fs",
                    attempt + 1,
                    _MAX_RETRIES,
                    exc,
                    delay,
                )
                await asyncio.sleep(delay)

        msg = f"Together AI embedding failed after {_MAX_RETRIES} attempts"
        raise RuntimeError(msg) from last_exc

    async def close(self) -> None:
        await self._client.aclose()
