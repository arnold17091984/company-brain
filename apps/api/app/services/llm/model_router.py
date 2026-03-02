"""Model router: selects the optimal Claude model for a given task.

Routing logic:
- Short queries with no conversation history -> Haiku (fast, cheap)
- Complex tasks or long conversations -> Sonnet (balanced quality)
"""

from __future__ import annotations

import logging

from app.services.types import ModelConfig

logger = logging.getLogger(__name__)

_SONNET_ID = "claude-sonnet-4-6"
_HAIKU_ID = "claude-haiku-4-5-20251001"

_SIMPLE_QUERY_CHAR_LIMIT = 100

_MODEL_REGISTRY: dict[str, ModelConfig] = {
    _SONNET_ID: ModelConfig(
        model_id=_SONNET_ID,
        provider="anthropic",
        max_tokens=8192,
        temperature=0.3,
        cost_per_1k_input=0.003,
        cost_per_1k_output=0.015,
        supports_streaming=True,
        context_window=200_000,
        tasks=["chat", "summarize", "extract", "rewrite", "reasoning"],
    ),
    _HAIKU_ID: ModelConfig(
        model_id=_HAIKU_ID,
        provider="anthropic",
        max_tokens=4096,
        temperature=0.3,
        cost_per_1k_input=0.00025,
        cost_per_1k_output=0.00125,
        supports_streaming=True,
        context_window=200_000,
        tasks=["classify", "chat"],
    ),
}


class ClaudeModelRouter:
    """Simple cost-optimizing model router for Claude models.

    Routing rules:
    - ``complexity="low"`` -> always Haiku
    - ``complexity="high"`` -> always Sonnet
    - ``complexity="medium"`` (default) -> Haiku for short tasks, Sonnet otherwise
    """

    def select_model(
        self,
        task: str,
        *,
        complexity: str = "medium",
    ) -> str:
        """Choose the best model ID for the given task.

        Args:
            task: The task type (e.g. "chat", "summarize", "classify").
            complexity: Estimated complexity -- "low", "medium", or "high".

        Returns:
            A Claude model ID string.
        """
        if complexity == "low":
            logger.debug("Router selected Haiku (complexity=low, task=%s)", task)
            return _HAIKU_ID

        if complexity == "high":
            logger.debug("Router selected Sonnet (complexity=high, task=%s)", task)
            return _SONNET_ID

        # medium: use Haiku only for simple classify tasks
        if task == "classify":
            logger.debug("Router selected Haiku (classify task)")
            return _HAIKU_ID

        logger.debug("Router selected Sonnet (task=%s, complexity=medium)", task)
        return _SONNET_ID

    def select_model_for_query(
        self,
        query: str,
        *,
        has_history: bool = False,
    ) -> str:
        """Convenience method that routes based on query length and history.

        Args:
            query: The raw user query string.
            has_history: Whether there is prior conversation context.

        Returns:
            A Claude model ID string.
        """
        if len(query) < _SIMPLE_QUERY_CHAR_LIMIT and not has_history:
            logger.debug("Router selected Haiku (short query, no history)")
            return _HAIKU_ID

        logger.debug("Router selected Sonnet (long query or history present)")
        return _SONNET_ID

    def get_model_config(self, model_id: str) -> ModelConfig:
        """Look up the full configuration for a model.

        Args:
            model_id: The Claude model identifier.

        Returns:
            The model's configuration.

        Raises:
            KeyError: If the model ID is not registered.
        """
        if model_id not in _MODEL_REGISTRY:
            raise KeyError(f"Unknown model ID: {model_id!r}. Registered: {list(_MODEL_REGISTRY)}")
        return _MODEL_REGISTRY[model_id]
