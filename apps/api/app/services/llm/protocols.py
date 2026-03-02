"""Protocol definitions for LLM services.

Provides abstractions over language model providers (Anthropic Claude,
Together AI, etc.) so that calling code never depends on a specific SDK.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Protocol, runtime_checkable

from app.services.types import ModelConfig


@runtime_checkable
class LLMService(Protocol):
    """Non-streaming LLM text generation.

    Implementations wrap a specific provider SDK (e.g. Anthropic, Together AI)
    and translate the generic message format into provider-specific calls.
    """

    async def generate(
        self,
        messages: list[dict[str, str]],
        *,
        model: str | None = None,
        temperature: float = 0.3,
        max_tokens: int = 4096,
        system_prompt: str | None = None,
    ) -> str:
        """Generate a complete response from the LLM.

        Args:
            messages: Conversation history as a list of dicts with
                ``role`` ("user" | "assistant") and ``content`` keys.
            model: Provider-specific model ID. When ``None``, the
                implementation should use its configured default.
            temperature: Sampling temperature (0.0 = deterministic).
            max_tokens: Maximum tokens in the generated response.
            system_prompt: Optional system-level instruction prepended
                to the conversation.

        Returns:
            The complete generated text.

        Raises:
            LLMError: On provider errors (rate limits, timeouts, etc.).
        """
        ...


@runtime_checkable
class StreamingLLMService(Protocol):
    """Streaming LLM text generation for real-time UI updates.

    Yields tokens as they are generated so that the frontend can render
    responses incrementally via SSE or WebSocket.
    """

    async def stream(
        self,
        messages: list[dict[str, str]],
        *,
        model: str | None = None,
        temperature: float = 0.3,
        max_tokens: int = 4096,
        system_prompt: str | None = None,
    ) -> AsyncIterator[str]:
        """Stream generated tokens from the LLM.

        Args:
            messages: Conversation history (same format as ``LLMService.generate``).
            model: Provider-specific model ID.
            temperature: Sampling temperature.
            max_tokens: Maximum tokens in the generated response.
            system_prompt: Optional system-level instruction.

        Yields:
            Individual tokens or token chunks as they arrive.

        Raises:
            LLMError: On provider errors.
        """
        ...


@runtime_checkable
class ModelRouter(Protocol):
    """Selects the optimal model for a given task and complexity.

    The router balances quality, latency, and cost. For example:
    - Simple classification -> Haiku (fast, cheap)
    - Complex reasoning / chat -> Sonnet (balanced)
    - Document summarisation -> Sonnet with large context
    """

    def select_model(
        self,
        task: str,
        *,
        complexity: str = "medium",
    ) -> str:
        """Choose the best model ID for the given task.

        Args:
            task: The type of task (e.g. "chat", "summarize", "classify",
                "extract", "rewrite").
            complexity: Estimated task complexity -- "low", "medium",
                or "high".

        Returns:
            A provider-specific model ID string.
        """
        ...

    def get_model_config(
        self,
        model_id: str,
    ) -> ModelConfig:
        """Look up the full configuration for a model.

        Args:
            model_id: The provider-specific model identifier.

        Returns:
            The model's configuration including cost and capability info.

        Raises:
            KeyError: If the model ID is not registered.
        """
        ...
