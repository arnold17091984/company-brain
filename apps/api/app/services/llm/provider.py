"""LLM Provider abstraction layer.

Defines a common protocol for all LLM providers (Claude, Gemini, OpenAI)
and a factory to instantiate the correct provider by name.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Protocol, runtime_checkable

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class LLMResponse:
    """Unified response from any LLM provider."""

    text: str
    input_tokens: int
    output_tokens: int
    latency_ms: float
    model_id: str
    provider: str


@dataclass
class StreamMetrics:
    """Accumulator for streaming token metrics."""

    input_tokens: int = 0
    output_tokens: int = 0
    latency_ms: float = 0.0


@runtime_checkable
class LLMProvider(Protocol):
    """Protocol that all LLM provider services must implement."""

    provider_name: str

    async def generate(
        self,
        messages: list[dict[str, str]],
        *,
        model: str,
        system_prompt: str = "",
        max_tokens: int = 4096,
        temperature: float = 0.3,
    ) -> LLMResponse: ...

    async def stream(
        self,
        messages: list[dict[str, str]],
        *,
        model: str,
        system_prompt: str = "",
        max_tokens: int = 4096,
        temperature: float = 0.3,
        metrics: StreamMetrics | None = None,
    ) -> AsyncIterator[str]: ...

    def supports_thinking(self, model_id: str) -> bool: ...


class ProviderFactory:
    """Registry and factory for LLM providers."""

    _providers: dict[str, LLMProvider] = {}

    @classmethod
    def register(cls, provider: LLMProvider) -> None:
        """Register a provider instance under its ``provider_name``.

        Args:
            provider: An object that satisfies the ``LLMProvider`` protocol.
        """
        cls._providers[provider.provider_name] = provider

    @classmethod
    def get(cls, name: str) -> LLMProvider:
        """Return the registered provider with the given name.

        Args:
            name: The ``provider_name`` used when the provider was registered.

        Returns:
            The matching ``LLMProvider`` instance.

        Raises:
            ValueError: If no provider is registered under ``name``.
        """
        if name not in cls._providers:
            available = ", ".join(cls._providers.keys())
            raise ValueError(f"Unknown provider {name!r}. Available: {available}")
        return cls._providers[name]

    @classmethod
    def available(cls) -> list[str]:
        """Return a list of all registered provider names.

        Returns:
            Sorted list of registered provider name strings.
        """
        return list(cls._providers.keys())

    @classmethod
    def reset(cls) -> None:
        """Clear all registered providers (useful for testing)."""
        cls._providers = {}
