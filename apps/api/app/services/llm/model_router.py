"""Model router: selects the optimal LLM model for a given task.

Routing logic:
- Role-based routing maps user roles to cost-appropriate models
- Short queries with no conversation history -> Haiku (fast, cheap)
- Complex tasks or long conversations -> Sonnet (balanced quality)
- Supports Anthropic, Google, and OpenAI providers
"""

from __future__ import annotations

import logging

from app.services.types import ModelConfig

logger = logging.getLogger(__name__)

_SONNET_ID = "claude-sonnet-4-6"
_HAIKU_ID = "claude-haiku-4-5-20251001"
_GEMINI_FLASH_ID = "gemini-2.0-flash"
_GEMINI_FLASH_LITE_ID = "gemini-2.0-flash-lite"
_GPT4O_MINI_ID = "gpt-4o-mini"

_SIMPLE_QUERY_CHAR_LIMIT = 100

_MODEL_REGISTRY: dict[str, ModelConfig] = {
    # Anthropic
    "claude-sonnet-4-6": ModelConfig(
        model_id="claude-sonnet-4-6",
        provider="anthropic",
        max_tokens=8192,
        temperature=0.3,
        cost_per_1k_input=3.0,
        cost_per_1k_output=15.0,
        supports_streaming=True,
        supports_thinking=True,
        context_window=200_000,
        tasks=["chat", "analysis", "code"],
    ),
    "claude-haiku-4-5-20251001": ModelConfig(
        model_id="claude-haiku-4-5-20251001",
        provider="anthropic",
        max_tokens=4096,
        temperature=0.3,
        cost_per_1k_input=0.8,
        cost_per_1k_output=4.0,
        supports_streaming=True,
        supports_thinking=False,
        context_window=200_000,
        tasks=["chat", "classify", "escalation"],
    ),
    # Google
    "gemini-2.0-flash": ModelConfig(
        model_id="gemini-2.0-flash",
        provider="google",
        max_tokens=8192,
        temperature=0.3,
        cost_per_1k_input=0.075,
        cost_per_1k_output=0.3,
        supports_streaming=True,
        supports_thinking=False,
        context_window=1_000_000,
        tasks=["chat", "classify"],
    ),
    "gemini-2.0-flash-lite": ModelConfig(
        model_id="gemini-2.0-flash-lite",
        provider="google",
        max_tokens=4096,
        temperature=0.3,
        cost_per_1k_input=0.0375,
        cost_per_1k_output=0.15,
        supports_streaming=True,
        supports_thinking=False,
        context_window=1_000_000,
        tasks=["classify"],
    ),
    # OpenAI
    "gpt-4o-mini": ModelConfig(
        model_id="gpt-4o-mini",
        provider="openai",
        max_tokens=4096,
        temperature=0.3,
        cost_per_1k_input=0.15,
        cost_per_1k_output=0.6,
        supports_streaming=True,
        supports_thinking=False,
        context_window=128_000,
        tasks=["chat", "fallback"],
    ),
}

_DEFAULT_ROLE_ROUTING: dict[str, str] = {
    "ceo": "claude-sonnet-4-6",
    "executive": "claude-sonnet-4-6",
    "hr": "claude-sonnet-4-6",
    "manager": "claude-sonnet-4-6",
    "employee": "gemini-2.0-flash",
    "admin": "claude-haiku-4-5-20251001",
}


class MultiModelRouter:
    """Multi-provider model router with role-based selection.

    Supports Anthropic, Google, and OpenAI providers. Routing rules:
    - Role-based: CEO/Executive/HR/Manager -> Sonnet, Employee -> Gemini Flash,
      Admin -> Haiku
    - Complexity-based: ``complexity="low"`` -> Haiku, ``complexity="high"`` ->
      Sonnet, ``complexity="medium"`` -> Haiku for classify, Sonnet otherwise
    - Query-length-based: short query with no history -> Haiku, else Sonnet
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
            A model ID string.
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
            A model ID string.
        """
        if len(query) < _SIMPLE_QUERY_CHAR_LIMIT and not has_history:
            logger.debug("Router selected Haiku (short query, no history)")
            return _HAIKU_ID

        logger.debug("Router selected Sonnet (long query or history present)")
        return _SONNET_ID

    def select_model_for_role(self, role: str, task: str = "chat") -> ModelConfig:
        """Select model based on user role.

        Args:
            role: The user's role (e.g. "ceo", "employee", "admin").
            task: The task type, reserved for future task-aware role routing.

        Returns:
            The ``ModelConfig`` for the role-appropriate model, defaulting to
            Gemini Flash for unrecognised roles.
        """
        model_id = _DEFAULT_ROLE_ROUTING.get(role, _GEMINI_FLASH_ID)
        logger.debug(
            "Router selected %r for role=%r task=%s",
            model_id,
            role,
            task,
        )
        return self.get_model_config(model_id)

    def model_supports_thinking(self, model_id: str) -> bool:
        """Check if a model supports extended thinking.

        Args:
            model_id: The model identifier.

        Returns:
            True if the model supports extended thinking.
        """
        config = _MODEL_REGISTRY.get(model_id)
        return config.supports_thinking if config else False

    def get_model_config(self, model_id: str) -> ModelConfig:
        """Look up the full configuration for a model.

        Args:
            model_id: The model identifier.

        Returns:
            The model's configuration.

        Raises:
            KeyError: If the model ID is not registered.
        """
        if model_id not in _MODEL_REGISTRY:
            raise KeyError(f"Unknown model ID: {model_id!r}. Registered: {list(_MODEL_REGISTRY)}")
        return _MODEL_REGISTRY[model_id]


# Backward compatibility
ClaudeModelRouter = MultiModelRouter
