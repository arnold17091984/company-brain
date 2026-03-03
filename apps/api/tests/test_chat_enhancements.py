"""Tests for Phase 1 chat enhancements: extended thinking, confidence, source fields.

Covers:
- Source schema accepts optional score and source_type fields
- Source schema serialization with and without optional fields
- model_supports_thinking returns True for Sonnet, False for Haiku
- model_supports_thinking returns False for unknown models
- Confidence computation from chunk scores
"""

from __future__ import annotations

import pytest

from app.models.schemas import Source
from app.services.llm.model_router import (
    _HAIKU_ID,
    _SONNET_ID,
    ClaudeModelRouter,
)

# ---------------------------------------------------------------------------
# Source schema with new optional fields
# ---------------------------------------------------------------------------


class TestSourceSchemaExtended:
    def test_source_without_optional_fields(self) -> None:
        source = Source(
            title="Test Doc",
            url="https://example.com",
            snippet="Some text",
            updated_at="2026-01-01",
        )
        assert source.score is None
        assert source.source_type is None

    def test_source_with_score(self) -> None:
        source = Source(
            title="Test Doc",
            url="https://example.com",
            snippet="Some text",
            updated_at="2026-01-01",
            score=0.85,
        )
        assert source.score == pytest.approx(0.85)

    def test_source_with_source_type(self) -> None:
        source = Source(
            title="Test Doc",
            url="https://example.com",
            snippet="Some text",
            updated_at="2026-01-01",
            source_type="google_drive",
        )
        assert source.source_type == "google_drive"

    def test_source_with_all_fields(self) -> None:
        source = Source(
            title="Test Doc",
            url="https://example.com",
            snippet="Some text",
            updated_at="2026-01-01",
            score=0.92,
            source_type="notion",
        )
        assert source.score == pytest.approx(0.92)
        assert source.source_type == "notion"

    def test_source_serialization_includes_optional_fields(self) -> None:
        source = Source(
            title="Test",
            url="https://example.com",
            snippet="text",
            updated_at="2026-01-01",
            score=0.75,
            source_type="telegram",
        )
        data = source.model_dump()
        assert data["score"] == pytest.approx(0.75)
        assert data["source_type"] == "telegram"

    def test_source_serialization_nulls_when_absent(self) -> None:
        source = Source(
            title="Test",
            url="https://example.com",
            snippet="text",
            updated_at="2026-01-01",
        )
        data = source.model_dump()
        assert data["score"] is None
        assert data["source_type"] is None


# ---------------------------------------------------------------------------
# model_supports_thinking
# ---------------------------------------------------------------------------


class TestModelSupportsThinking:
    @pytest.fixture()
    def router(self) -> ClaudeModelRouter:
        return ClaudeModelRouter()

    def test_sonnet_supports_thinking(self, router: ClaudeModelRouter) -> None:
        assert router.model_supports_thinking(_SONNET_ID) is True

    def test_haiku_does_not_support_thinking(self, router: ClaudeModelRouter) -> None:
        assert router.model_supports_thinking(_HAIKU_ID) is False

    def test_unknown_model_does_not_support_thinking(self, router: ClaudeModelRouter) -> None:
        assert router.model_supports_thinking("unknown-model") is False

    def test_sonnet_config_has_thinking_flag(self, router: ClaudeModelRouter) -> None:
        config = router.get_model_config(_SONNET_ID)
        assert config.supports_thinking is True

    def test_haiku_config_has_thinking_flag_false(self, router: ClaudeModelRouter) -> None:
        config = router.get_model_config(_HAIKU_ID)
        assert config.supports_thinking is False


# ---------------------------------------------------------------------------
# Confidence computation logic (unit test of the algorithm)
# ---------------------------------------------------------------------------


def _compute_confidence(scores: list[float]) -> float | None:
    """Mirror the confidence computation in chat.py."""
    if not scores:
        return None
    top = scores[:3]
    return round(min(sum(top) / len(top), 1.0), 3)


class TestConfidenceComputation:
    def test_no_scores_returns_none(self) -> None:
        assert _compute_confidence([]) is None

    def test_single_score(self) -> None:
        result = _compute_confidence([0.9])
        assert result == pytest.approx(0.9)

    def test_three_scores_averaged(self) -> None:
        result = _compute_confidence([0.8, 0.7, 0.6])
        assert result == pytest.approx(0.7)

    def test_more_than_three_scores_uses_top_three(self) -> None:
        result = _compute_confidence([0.9, 0.8, 0.7, 0.5, 0.3])
        assert result == pytest.approx(0.8)

    def test_clamped_to_one(self) -> None:
        # If scores are somehow > 1 (shouldn't happen but safety)
        result = _compute_confidence([1.5, 1.2, 1.0])
        assert result is not None
        assert result <= 1.0

    def test_result_is_rounded(self) -> None:
        result = _compute_confidence([0.333, 0.666, 0.999])
        assert result is not None
        # Rounded to 3 decimal places
        assert result == round(result, 3)
