"""OpenAI LLM provider implementation."""

from __future__ import annotations

import logging
import time
from collections.abc import AsyncIterator

from openai import AsyncOpenAI

from app.core.config import settings
from app.services.llm.provider import LLMResponse, StreamMetrics

logger = logging.getLogger(__name__)


class OpenAIService:
    """OpenAI LLM provider using the openai SDK."""

    provider_name = "openai"

    def __init__(self) -> None:
        self._client = AsyncOpenAI(api_key=settings.openai_api_key)

    async def generate(
        self,
        messages: list[dict[str, str]],
        *,
        model: str = "gpt-4o-mini",
        system_prompt: str = "",
        max_tokens: int = 4096,
        temperature: float = 0.3,
    ) -> LLMResponse:
        start = time.perf_counter()
        all_messages: list[dict[str, str]] = []
        if system_prompt:
            all_messages.append({"role": "system", "content": system_prompt})
        all_messages.extend(messages)

        response = await self._client.chat.completions.create(
            model=model,
            messages=all_messages,
            max_tokens=max_tokens,
            temperature=temperature,
        )
        latency = (time.perf_counter() - start) * 1000
        choice = response.choices[0]
        usage = response.usage
        return LLMResponse(
            text=choice.message.content or "",
            input_tokens=usage.prompt_tokens if usage else 0,
            output_tokens=usage.completion_tokens if usage else 0,
            latency_ms=latency,
            model_id=model,
            provider=self.provider_name,
        )

    async def stream(
        self,
        messages: list[dict[str, str]],
        *,
        model: str = "gpt-4o-mini",
        system_prompt: str = "",
        max_tokens: int = 4096,
        temperature: float = 0.3,
        metrics: StreamMetrics | None = None,
    ) -> AsyncIterator[str]:
        start = time.perf_counter()
        all_messages: list[dict[str, str]] = []
        if system_prompt:
            all_messages.append({"role": "system", "content": system_prompt})
        all_messages.extend(messages)

        stream = await self._client.chat.completions.create(
            model=model,
            messages=all_messages,
            max_tokens=max_tokens,
            temperature=temperature,
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta if chunk.choices else None
            if delta and delta.content:
                if metrics:
                    metrics.output_tokens += 1
                yield delta.content
        if metrics:
            metrics.latency_ms = (time.perf_counter() - start) * 1000

    def supports_thinking(self, model_id: str) -> bool:
        return False
