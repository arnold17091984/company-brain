"""Anthropic Claude implementation of LLM service protocols.

Wraps the AsyncAnthropic client with retry logic, error handling, and
support for both batch and streaming response modes.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator

import anthropic
from anthropic import AsyncAnthropic

from app.core.config import settings

logger = logging.getLogger(__name__)

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
    ) -> str:
        """Generate a complete response from Claude.

        Args:
            messages: Conversation history with ``role`` and ``content`` keys.
            model: Override the default model ID.
            temperature: Sampling temperature.
            max_tokens: Maximum output tokens.
            system_prompt: Optional system instruction.

        Returns:
            The generated text response.

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

        result = await _retry_call(_factory)
        text_blocks = [block.text for block in result.content if hasattr(block, "text")]
        return "".join(text_blocks)

    async def stream(
        self,
        messages: list[dict[str, str]],
        *,
        model: str | None = None,
        temperature: float = 0.3,
        max_tokens: int = 4096,
        system_prompt: str | None = None,
    ) -> AsyncIterator[str]:
        """Stream response tokens from Claude.

        Args:
            messages: Conversation history with ``role`` and ``content`` keys.
            model: Override the default model ID.
            temperature: Sampling temperature.
            max_tokens: Maximum output tokens.
            system_prompt: Optional system instruction.

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

        try:
            async with self._client.messages.stream(**kwargs) as stream_ctx:
                async for chunk in stream_ctx.text_stream:
                    yield chunk
        except anthropic.RateLimitError as exc:
            raise LLMError("Rate limit exceeded during streaming") from exc
        except anthropic.APIStatusError as exc:
            raise LLMError(f"API error {exc.status_code} during streaming") from exc
        except anthropic.APIConnectionError as exc:
            raise LLMError("Connection error during streaming") from exc
