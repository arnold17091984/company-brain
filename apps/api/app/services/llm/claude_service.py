"""Anthropic Claude implementation of LLM service protocols.

Wraps the AsyncAnthropic client with retry logic, error handling, and
support for both batch and streaming response modes.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import AsyncIterator
from dataclasses import dataclass, field

import anthropic
from anthropic import AsyncAnthropic

from app.core.config import settings

logger = logging.getLogger(__name__)


@dataclass
class LLMResponse:
    """Extended response from the LLM including usage metrics."""

    text: str
    input_tokens: int = 0
    output_tokens: int = 0
    latency_ms: float = 0.0


@dataclass
class StreamMetrics:
    """Accumulated metrics collected during streaming."""

    input_tokens: int = 0
    output_tokens: int = 0
    latency_ms: float = 0.0

_DEFAULT_SONNET = "claude-sonnet-4-6"
_DEFAULT_HAIKU = "claude-haiku-4-5-20251001"

_MAX_RETRIES = 3
_RETRY_BASE_DELAY = 1.0  # seconds


class LLMError(Exception):
    """Raised when the LLM provider returns an unrecoverable error."""


def _build_client() -> AsyncAnthropic:
    return AsyncAnthropic(api_key=settings.anthropic_api_key)


async def _retry_call(coro_factory, *, retries: int = _MAX_RETRIES) -> object:
    """Run coro_factory() up to `retries` times with exponential backoff.

    Args:
        coro_factory: Zero-argument callable that returns a coroutine.
        retries: Maximum number of attempts.

    Returns:
        The result of the successful coroutine call.

    Raises:
        LLMError: After all retries are exhausted.
    """
    last_exc: Exception | None = None
    for attempt in range(retries):
        try:
            return await coro_factory()
        except anthropic.RateLimitError as exc:
            last_exc = exc
            delay = _RETRY_BASE_DELAY * (2**attempt)
            logger.warning(
                "Rate limit hit (attempt %d/%d). Retrying in %.1fs.",
                attempt + 1,
                retries,
                delay,
            )
            await asyncio.sleep(delay)
        except anthropic.APIStatusError as exc:
            if exc.status_code and exc.status_code >= 500:
                last_exc = exc
                delay = _RETRY_BASE_DELAY * (2**attempt)
                logger.warning(
                    "Server error %d (attempt %d/%d). Retrying in %.1fs.",
                    exc.status_code,
                    attempt + 1,
                    retries,
                    delay,
                )
                await asyncio.sleep(delay)
            else:
                raise LLMError(str(exc)) from exc
        except anthropic.APIConnectionError as exc:
            last_exc = exc
            delay = _RETRY_BASE_DELAY * (2**attempt)
            logger.warning(
                "Connection error (attempt %d/%d). Retrying in %.1fs.",
                attempt + 1,
                retries,
                delay,
            )
            await asyncio.sleep(delay)

    raise LLMError(f"LLM call failed after {retries} attempts") from last_exc


class ClaudeService:
    """AsyncAnthropic-backed implementation of LLMService and StreamingLLMService.

    Satisfies both protocols via duck typing so it can be injected wherever
    either interface is expected.
    """

    def __init__(self, default_model: str = _DEFAULT_SONNET) -> None:
        self._client = _build_client()
        self._default_model = default_model

    async def generate(
        self,
        messages: list[dict[str, str]],
        *,
        model: str | None = None,
        temperature: float = 0.3,
        max_tokens: int = 4096,
        system_prompt: str | None = None,
    ) -> LLMResponse:
        """Generate a complete response from Claude.

        Args:
            messages: Conversation history with ``role`` and ``content`` keys.
            model: Override the default model ID.
            temperature: Sampling temperature.
            max_tokens: Maximum output tokens.
            system_prompt: Optional system instruction.

        Returns:
            LLMResponse with text, token counts, and latency.

        Raises:
            LLMError: On provider errors after retries.
        """
        resolved_model = model or self._default_model
        kwargs: dict = {
            "model": resolved_model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if system_prompt:
            kwargs["system"] = system_prompt

        def _factory():
            return self._client.messages.create(**kwargs)

        start = time.monotonic()
        result = await _retry_call(_factory)
        latency_ms = (time.monotonic() - start) * 1000

        text_blocks = [block.text for block in result.content if hasattr(block, "text")]
        usage = getattr(result, "usage", None)
        return LLMResponse(
            text="".join(text_blocks),
            input_tokens=getattr(usage, "input_tokens", 0) if usage else 0,
            output_tokens=getattr(usage, "output_tokens", 0) if usage else 0,
            latency_ms=round(latency_ms, 1),
        )

    async def stream(
        self,
        messages: list[dict[str, str]],
        *,
        model: str | None = None,
        temperature: float = 0.3,
        max_tokens: int = 4096,
        system_prompt: str | None = None,
        metrics: StreamMetrics | None = None,
    ) -> AsyncIterator[str]:
        """Stream response tokens from Claude.

        Args:
            messages: Conversation history with ``role`` and ``content`` keys.
            model: Override the default model ID.
            temperature: Sampling temperature.
            max_tokens: Maximum output tokens.
            system_prompt: Optional system instruction.
            metrics: Optional mutable object to collect token/latency stats.

        Yields:
            Individual text chunks as they arrive from the API.

        Raises:
            LLMError: On provider errors.
        """
        resolved_model = model or self._default_model
        kwargs: dict = {
            "model": resolved_model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if system_prompt:
            kwargs["system"] = system_prompt

        start = time.monotonic()
        try:
            async with self._client.messages.stream(**kwargs) as stream_ctx:
                async for chunk in stream_ctx.text_stream:
                    yield chunk
                # Collect usage after stream completes
                if metrics is not None:
                    final_message = await stream_ctx.get_final_message()
                    usage = getattr(final_message, "usage", None)
                    if usage:
                        metrics.input_tokens = getattr(usage, "input_tokens", 0)
                        metrics.output_tokens = getattr(usage, "output_tokens", 0)
                    metrics.latency_ms = round((time.monotonic() - start) * 1000, 1)
        except anthropic.RateLimitError as exc:
            raise LLMError("Rate limit exceeded during streaming") from exc
        except anthropic.APIStatusError as exc:
            raise LLMError(f"API error {exc.status_code} during streaming") from exc
        except anthropic.APIConnectionError as exc:
            raise LLMError("Connection error during streaming") from exc

    async def stream_with_thinking(
        self,
        messages: list[dict[str, str]],
        *,
        model: str | None = None,
        max_tokens: int = 16000,
        system_prompt: str | None = None,
        thinking_budget: int = 8000,
    ) -> AsyncIterator[dict[str, str]]:
        """Stream response with extended thinking from Claude.

        Extended thinking lets the model reason before answering. The
        stream yields typed dicts so callers can distinguish thinking
        tokens from response tokens.

        Args:
            messages: Conversation history.
            model: Override the default model ID.
            max_tokens: Maximum output tokens (includes thinking budget).
            system_prompt: Optional system instruction.
            thinking_budget: Token budget for internal reasoning.

        Yields:
            ``{"type": "thinking", "content": "..."}`` for reasoning tokens
            and ``{"type": "text", "content": "..."}`` for answer tokens.

        Raises:
            LLMError: On provider errors.
        """
        resolved_model = model or self._default_model
        kwargs: dict = {
            "model": resolved_model,
            "messages": messages,
            "max_tokens": max_tokens,
            "thinking": {
                "type": "enabled",
                "budget_tokens": thinking_budget,
            },
        }
        if system_prompt:
            kwargs["system"] = system_prompt

        try:
            async with self._client.messages.stream(**kwargs) as stream_ctx:
                async for event in stream_ctx:
                    if event.type == "thinking":
                        yield {"type": "thinking", "content": event.thinking}
                    elif event.type == "text":
                        yield {"type": "text", "content": event.text}
        except anthropic.RateLimitError as exc:
            raise LLMError("Rate limit exceeded during streaming") from exc
        except anthropic.APIStatusError as exc:
            raise LLMError(f"API error {exc.status_code} during streaming") from exc
        except anthropic.APIConnectionError as exc:
            raise LLMError("Connection error during streaming") from exc
