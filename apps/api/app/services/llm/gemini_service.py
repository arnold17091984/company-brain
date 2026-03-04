"""Google Gemini LLM provider implementation."""

from __future__ import annotations

import logging
import time
from collections.abc import AsyncIterator

from google import genai
from google.genai import types

from app.core.config import settings
from app.services.llm.provider import LLMResponse, StreamMetrics

logger = logging.getLogger(__name__)


class GeminiService:
    """Gemini LLM provider using the google-genai SDK."""

    provider_name = "google"

    def __init__(self) -> None:
        self._client = genai.Client(api_key=settings.gemini_api_key)

    async def generate(
        self,
        messages: list[dict[str, str]],
        *,
        model: str = "gemini-2.0-flash",
        system_prompt: str = "",
        max_tokens: int = 4096,
        temperature: float = 0.3,
    ) -> LLMResponse:
        """Generate a complete response from Gemini.

        Args:
            messages: OpenAI-style message dicts with ``role`` and ``content``.
            model: Gemini model ID to use.
            system_prompt: Optional system instruction prepended to the request.
            max_tokens: Maximum number of output tokens to generate.
            temperature: Sampling temperature controlling response randomness.

        Returns:
            A unified ``LLMResponse`` with text, token counts, and latency.
        """
        start = time.perf_counter()
        contents = self._build_contents(messages)
        config = types.GenerateContentConfig(
            system_instruction=system_prompt or None,
            max_output_tokens=max_tokens,
            temperature=temperature,
        )
        response = await self._client.aio.models.generate_content(
            model=model,
            contents=contents,
            config=config,
        )
        latency = (time.perf_counter() - start) * 1000
        usage = response.usage_metadata
        return LLMResponse(
            text=response.text or "",
            input_tokens=usage.prompt_token_count or 0 if usage else 0,
            output_tokens=usage.candidates_token_count or 0 if usage else 0,
            latency_ms=latency,
            model_id=model,
            provider=self.provider_name,
        )

    async def stream(
        self,
        messages: list[dict[str, str]],
        *,
        model: str = "gemini-2.0-flash",
        system_prompt: str = "",
        max_tokens: int = 4096,
        temperature: float = 0.3,
        metrics: StreamMetrics | None = None,
    ) -> AsyncIterator[str]:
        """Stream response chunks from Gemini.

        Args:
            messages: OpenAI-style message dicts with ``role`` and ``content``.
            model: Gemini model ID to use.
            system_prompt: Optional system instruction prepended to the request.
            max_tokens: Maximum number of output tokens to generate.
            temperature: Sampling temperature controlling response randomness.
            metrics: Optional accumulator updated with token counts and latency.

        Yields:
            Text chunks as they arrive from the model.
        """
        start = time.perf_counter()
        contents = self._build_contents(messages)
        config = types.GenerateContentConfig(
            system_instruction=system_prompt or None,
            max_output_tokens=max_tokens,
            temperature=temperature,
        )
        async for chunk in await self._client.aio.models.generate_content_stream(
            model=model,
            contents=contents,
            config=config,
        ):
            if chunk.text:
                if metrics:
                    metrics.output_tokens += len(chunk.text.split())
                yield chunk.text
        if metrics:
            metrics.latency_ms = (time.perf_counter() - start) * 1000

    def supports_thinking(self, model_id: str) -> bool:
        """Return whether the given model supports extended thinking.

        Args:
            model_id: The Gemini model identifier to check.

        Returns:
            Always ``False`` — Gemini models do not expose a thinking mode
            via the google-genai SDK at this time.
        """
        return False

    @staticmethod
    def _build_contents(messages: list[dict[str, str]]) -> list[types.Content]:
        """Convert OpenAI-style messages to Gemini Content objects.

        Args:
            messages: List of dicts with ``role`` (``"user"`` / ``"assistant"``)
                and ``content`` keys.

        Returns:
            List of ``types.Content`` objects suitable for the Gemini API.
        """
        contents = []
        for msg in messages:
            role = "model" if msg["role"] == "assistant" else "user"
            contents.append(types.Content(role=role, parts=[types.Part(text=msg["content"])]))
        return contents
