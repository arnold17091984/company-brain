"""Tests for app.services.llm.model_router.ClaudeModelRouter.

Covers:
- select_model with complexity="low" always returns Haiku
- select_model with complexity="high" always returns Sonnet
- select_model with complexity="medium" and task="classify" returns Haiku
- select_model with complexity="medium" and non-classify tasks returns Sonnet
- select_model_for_query with short query and no history returns Haiku
- select_model_for_query with long query returns Sonnet
- select_model_for_query with any query that has history returns Sonnet
- select_model_for_query at the exact character boundary (edge case)
- get_model_config returns correct ModelConfig for valid Sonnet and Haiku IDs
- get_model_config raises KeyError for an unknown model ID
- ModelConfig field values match the expected registry entries
"""

from __future__ import annotations

import pytest

from app.services.llm.model_router import (
    ClaudeModelRouter,
    _HAIKU_ID,
    _SIMPLE_QUERY_CHAR_LIMIT,
    _SONNET_ID,
)
from app.services.types import ModelConfig

# ---------------------------------------------------------------------------
# Constants re-exported for test readability
# ---------------------------------------------------------------------------

_SHORT_QUERY = "x" * (_SIMPLE_QUERY_CHAR_LIMIT - 1)    # one char below the limit
_EXACT_LIMIT_QUERY = "x" * _SIMPLE_QUERY_CHAR_LIMIT     # at the limit (not < limit)
_LONG_QUERY = "x" * (_SIMPLE_QUERY_CHAR_LIMIT + 1)     # one char above the limit


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def router() -> ClaudeModelRouter:
    """Return a fresh ClaudeModelRouter instance for each test."""
    return ClaudeModelRouter()


# ---------------------------------------------------------------------------
# select_model: complexity="low"
# ---------------------------------------------------------------------------


class TestSelectModelLowComplexity:
    def test_chat_low_returns_haiku(self, router: ClaudeModelRouter) -> None:
        assert router.select_model("chat", complexity="low") == _HAIKU_ID

    def test_summarize_low_returns_haiku(self, router: ClaudeModelRouter) -> None:
        assert router.select_model("summarize", complexity="low") == _HAIKU_ID

    def test_classify_low_returns_haiku(self, router: ClaudeModelRouter) -> None:
        assert router.select_model("classify", complexity="low") == _HAIKU_ID

    def test_extract_low_returns_haiku(self, router: ClaudeModelRouter) -> None:
        assert router.select_model("extract", complexity="low") == _HAIKU_ID

    def test_unknown_task_low_returns_haiku(self, router: ClaudeModelRouter) -> None:
        # Any task is Haiku when complexity is explicitly low
        assert router.select_model("any_task", complexity="low") == _HAIKU_ID


# ---------------------------------------------------------------------------
# select_model: complexity="high"
# ---------------------------------------------------------------------------


class TestSelectModelHighComplexity:
    def test_chat_high_returns_sonnet(self, router: ClaudeModelRouter) -> None:
        assert router.select_model("chat", complexity="high") == _SONNET_ID

    def test_summarize_high_returns_sonnet(self, router: ClaudeModelRouter) -> None:
        assert router.select_model("summarize", complexity="high") == _SONNET_ID

    def test_classify_high_returns_sonnet(self, router: ClaudeModelRouter) -> None:
        # Even "classify" must use Sonnet when complexity is explicitly high
        assert router.select_model("classify", complexity="high") == _SONNET_ID

    def test_reasoning_high_returns_sonnet(self, router: ClaudeModelRouter) -> None:
        assert router.select_model("reasoning", complexity="high") == _SONNET_ID

    def test_unknown_task_high_returns_sonnet(self, router: ClaudeModelRouter) -> None:
        assert router.select_model("any_task", complexity="high") == _SONNET_ID


# ---------------------------------------------------------------------------
# select_model: complexity="medium" (default)
# ---------------------------------------------------------------------------


class TestSelectModelMediumComplexity:
    def test_classify_medium_returns_haiku(self, router: ClaudeModelRouter) -> None:
        assert router.select_model("classify", complexity="medium") == _HAIKU_ID

    def test_classify_default_complexity_returns_haiku(
        self, router: ClaudeModelRouter
    ) -> None:
        # "medium" is the default, so omitting complexity must behave the same
        assert router.select_model("classify") == _HAIKU_ID

    def test_chat_medium_returns_sonnet(self, router: ClaudeModelRouter) -> None:
        assert router.select_model("chat", complexity="medium") == _SONNET_ID

    def test_chat_default_complexity_returns_sonnet(
        self, router: ClaudeModelRouter
    ) -> None:
        assert router.select_model("chat") == _SONNET_ID

    def test_summarize_medium_returns_sonnet(self, router: ClaudeModelRouter) -> None:
        assert router.select_model("summarize", complexity="medium") == _SONNET_ID

    def test_extract_medium_returns_sonnet(self, router: ClaudeModelRouter) -> None:
        assert router.select_model("extract", complexity="medium") == _SONNET_ID

    def test_rewrite_medium_returns_sonnet(self, router: ClaudeModelRouter) -> None:
        assert router.select_model("rewrite", complexity="medium") == _SONNET_ID

    def test_reasoning_medium_returns_sonnet(self, router: ClaudeModelRouter) -> None:
        assert router.select_model("reasoning", complexity="medium") == _SONNET_ID

    def test_unknown_task_medium_returns_sonnet(
        self, router: ClaudeModelRouter
    ) -> None:
        # Unknown non-classify task falls through to Sonnet at medium complexity
        assert router.select_model("custom_task", complexity="medium") == _SONNET_ID


# ---------------------------------------------------------------------------
# select_model_for_query
# ---------------------------------------------------------------------------


class TestSelectModelForQuery:
    # Short query, no history -> Haiku

    def test_short_query_no_history_returns_haiku(
        self, router: ClaudeModelRouter
    ) -> None:
        assert router.select_model_for_query(_SHORT_QUERY, has_history=False) == _HAIKU_ID

    def test_short_query_no_history_default_returns_haiku(
        self, router: ClaudeModelRouter
    ) -> None:
        # has_history defaults to False
        assert router.select_model_for_query(_SHORT_QUERY) == _HAIKU_ID

    def test_single_char_query_no_history_returns_haiku(
        self, router: ClaudeModelRouter
    ) -> None:
        assert router.select_model_for_query("hi", has_history=False) == _HAIKU_ID

    # At / above the boundary -> Sonnet

    def test_exact_limit_query_no_history_returns_sonnet(
        self, router: ClaudeModelRouter
    ) -> None:
        # len(query) == _SIMPLE_QUERY_CHAR_LIMIT is NOT < limit -> Sonnet
        assert (
            router.select_model_for_query(_EXACT_LIMIT_QUERY, has_history=False)
            == _SONNET_ID
        )

    def test_long_query_no_history_returns_sonnet(
        self, router: ClaudeModelRouter
    ) -> None:
        assert (
            router.select_model_for_query(_LONG_QUERY, has_history=False) == _SONNET_ID
        )

    # History present -> Sonnet regardless of length

    def test_short_query_with_history_returns_sonnet(
        self, router: ClaudeModelRouter
    ) -> None:
        assert (
            router.select_model_for_query(_SHORT_QUERY, has_history=True) == _SONNET_ID
        )

    def test_long_query_with_history_returns_sonnet(
        self, router: ClaudeModelRouter
    ) -> None:
        assert (
            router.select_model_for_query(_LONG_QUERY, has_history=True) == _SONNET_ID
        )

    def test_empty_query_no_history_returns_haiku(
        self, router: ClaudeModelRouter
    ) -> None:
        # Empty string has length 0, which is < limit -> Haiku
        assert router.select_model_for_query("", has_history=False) == _HAIKU_ID

    def test_empty_query_with_history_returns_sonnet(
        self, router: ClaudeModelRouter
    ) -> None:
        # Even a zero-length query escalates to Sonnet when history is present
        assert router.select_model_for_query("", has_history=True) == _SONNET_ID

    def test_realistic_short_query_returns_haiku(
        self, router: ClaudeModelRouter
    ) -> None:
        assert router.select_model_for_query("What is the leave policy?") == _HAIKU_ID

    def test_realistic_long_query_with_history_returns_sonnet(
        self, router: ClaudeModelRouter
    ) -> None:
        long_query = (
            "Can you compare all the engineering department policies from the past "
            "three years and summarise the key changes in leave entitlements, remote "
            "work eligibility, and performance review cycles?"
        )
        assert (
            router.select_model_for_query(long_query, has_history=True) == _SONNET_ID
        )


# ---------------------------------------------------------------------------
# get_model_config: valid IDs
# ---------------------------------------------------------------------------


class TestGetModelConfigValid:
    def test_sonnet_config_returns_model_config_type(
        self, router: ClaudeModelRouter
    ) -> None:
        config = router.get_model_config(_SONNET_ID)
        assert isinstance(config, ModelConfig)

    def test_haiku_config_returns_model_config_type(
        self, router: ClaudeModelRouter
    ) -> None:
        config = router.get_model_config(_HAIKU_ID)
        assert isinstance(config, ModelConfig)

    # Sonnet field assertions

    def test_sonnet_model_id_matches(self, router: ClaudeModelRouter) -> None:
        config = router.get_model_config(_SONNET_ID)
        assert config.model_id == _SONNET_ID

    def test_sonnet_provider_is_anthropic(self, router: ClaudeModelRouter) -> None:
        config = router.get_model_config(_SONNET_ID)
        assert config.provider == "anthropic"

    def test_sonnet_max_tokens(self, router: ClaudeModelRouter) -> None:
        config = router.get_model_config(_SONNET_ID)
        assert config.max_tokens == 8192

    def test_sonnet_supports_streaming(self, router: ClaudeModelRouter) -> None:
        config = router.get_model_config(_SONNET_ID)
        assert config.supports_streaming is True

    def test_sonnet_context_window(self, router: ClaudeModelRouter) -> None:
        config = router.get_model_config(_SONNET_ID)
        assert config.context_window == 200_000

    def test_sonnet_includes_chat_task(self, router: ClaudeModelRouter) -> None:
        config = router.get_model_config(_SONNET_ID)
        assert "chat" in config.tasks

    def test_sonnet_includes_reasoning_task(self, router: ClaudeModelRouter) -> None:
        config = router.get_model_config(_SONNET_ID)
        assert "reasoning" in config.tasks

    def test_sonnet_cost_per_1k_input(self, router: ClaudeModelRouter) -> None:
        config = router.get_model_config(_SONNET_ID)
        assert config.cost_per_1k_input == pytest.approx(0.003)

    def test_sonnet_cost_per_1k_output(self, router: ClaudeModelRouter) -> None:
        config = router.get_model_config(_SONNET_ID)
        assert config.cost_per_1k_output == pytest.approx(0.015)

    # Haiku field assertions

    def test_haiku_model_id_matches(self, router: ClaudeModelRouter) -> None:
        config = router.get_model_config(_HAIKU_ID)
        assert config.model_id == _HAIKU_ID

    def test_haiku_provider_is_anthropic(self, router: ClaudeModelRouter) -> None:
        config = router.get_model_config(_HAIKU_ID)
        assert config.provider == "anthropic"

    def test_haiku_max_tokens(self, router: ClaudeModelRouter) -> None:
        config = router.get_model_config(_HAIKU_ID)
        assert config.max_tokens == 4096

    def test_haiku_supports_streaming(self, router: ClaudeModelRouter) -> None:
        config = router.get_model_config(_HAIKU_ID)
        assert config.supports_streaming is True

    def test_haiku_context_window(self, router: ClaudeModelRouter) -> None:
        config = router.get_model_config(_HAIKU_ID)
        assert config.context_window == 200_000

    def test_haiku_includes_classify_task(self, router: ClaudeModelRouter) -> None:
        config = router.get_model_config(_HAIKU_ID)
        assert "classify" in config.tasks

    def test_haiku_includes_chat_task(self, router: ClaudeModelRouter) -> None:
        config = router.get_model_config(_HAIKU_ID)
        assert "chat" in config.tasks

    def test_haiku_cost_per_1k_input(self, router: ClaudeModelRouter) -> None:
        config = router.get_model_config(_HAIKU_ID)
        assert config.cost_per_1k_input == pytest.approx(0.00025)

    def test_haiku_cost_per_1k_output(self, router: ClaudeModelRouter) -> None:
        config = router.get_model_config(_HAIKU_ID)
        assert config.cost_per_1k_output == pytest.approx(0.00125)

    # Relative cost relationship

    def test_haiku_cheaper_than_sonnet_input(self, router: ClaudeModelRouter) -> None:
        haiku = router.get_model_config(_HAIKU_ID)
        sonnet = router.get_model_config(_SONNET_ID)
        assert haiku.cost_per_1k_input < sonnet.cost_per_1k_input

    def test_haiku_cheaper_than_sonnet_output(self, router: ClaudeModelRouter) -> None:
        haiku = router.get_model_config(_HAIKU_ID)
        sonnet = router.get_model_config(_SONNET_ID)
        assert haiku.cost_per_1k_output < sonnet.cost_per_1k_output


# ---------------------------------------------------------------------------
# get_model_config: invalid ID
# ---------------------------------------------------------------------------


class TestGetModelConfigInvalid:
    def test_unknown_model_id_raises_key_error(
        self, router: ClaudeModelRouter
    ) -> None:
        with pytest.raises(KeyError):
            router.get_model_config("claude-nonexistent-99")

    def test_empty_string_raises_key_error(self, router: ClaudeModelRouter) -> None:
        with pytest.raises(KeyError):
            router.get_model_config("")

    def test_error_message_contains_model_id(self, router: ClaudeModelRouter) -> None:
        unknown = "gpt-4o"
        with pytest.raises(KeyError, match=unknown):
            router.get_model_config(unknown)

    def test_error_message_lists_registered_models(
        self, router: ClaudeModelRouter
    ) -> None:
        with pytest.raises(KeyError, match="Registered"):
            router.get_model_config("bad-model-id")


# ---------------------------------------------------------------------------
# Router instance isolation
# ---------------------------------------------------------------------------


class TestRouterInstanceIsolation:
    def test_two_instances_return_same_results(self) -> None:
        r1 = ClaudeModelRouter()
        r2 = ClaudeModelRouter()
        assert r1.select_model("chat", complexity="low") == r2.select_model(
            "chat", complexity="low"
        )

    def test_router_is_stateless_across_calls(self) -> None:
        router = ClaudeModelRouter()
        # Calling once with high complexity must not affect the next call
        router.select_model("chat", complexity="high")
        assert router.select_model("chat", complexity="low") == _HAIKU_ID
