"""Tests for harvest system schemas, question generator, and session management."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch

import pytest

from app.models.schemas import (
    HarvestAnswerSubmit,
    HarvestQuestionDetail,
    HarvestSessionCreate,
    HarvestSessionDetail,
    HarvestSessionSummary,
)
from app.services.harvest.question_generator import (
    _FALLBACK_QUESTIONS,
    _QUESTION_PROMPT,
)
from app.services.llm.provider import LLMResponse

# ---------------------------------------------------------------------------
# Schema validation tests
# ---------------------------------------------------------------------------


class TestHarvestSchemas:
    def test_session_create_valid(self) -> None:
        s = HarvestSessionCreate(target_user_id="abc-123", departure_date="2026-06-30")
        assert s.target_user_id == "abc-123"
        assert s.departure_date == "2026-06-30"

    def test_session_summary_fields(self) -> None:
        s = HarvestSessionSummary(
            id="s1",
            target_user_name="Alice",
            target_user_email="a@co.com",
            status="active",
            total_questions=20,
            answered_questions=5,
            progress_percent=25.0,
            created_at="2026-03-01",
            departure_date="2026-06-30",
        )
        assert s.progress_percent == 25.0
        assert s.status == "active"

    def test_question_detail_fields(self) -> None:
        q = HarvestQuestionDetail(
            id="q1",
            category="project",
            question="What is X?",
            answer=None,
            answer_quality=None,
            source=None,
            asked_at="2026-03-01",
            answered_at=None,
        )
        assert q.category == "project"
        assert q.answer is None

    def test_question_detail_with_answer(self) -> None:
        q = HarvestQuestionDetail(
            id="q1",
            category="tool",
            question="Which tools?",
            answer="Jira and Slack",
            answer_quality=0.8,
            source="telegram",
            asked_at="2026-03-01",
            answered_at="2026-03-02",
        )
        assert q.answer == "Jira and Slack"
        assert q.source == "telegram"

    def test_session_detail_with_questions(self) -> None:
        d = HarvestSessionDetail(
            id="s1",
            target_user_name="Bob",
            target_user_email="b@co.com",
            status="active",
            total_questions=2,
            answered_questions=1,
            progress_percent=50.0,
            created_at="2026-03-01",
            departure_date=None,
            questions=[
                HarvestQuestionDetail(
                    id="q1",
                    category="project",
                    question="What?",
                    answer="This",
                    answer_quality=None,
                    source="web",
                    asked_at="2026-03-01",
                    answered_at="2026-03-01",
                )
            ],
        )
        assert len(d.questions) == 1

    def test_answer_submit_valid(self) -> None:
        a = HarvestAnswerSubmit(question_id="q1", answer="My answer", source="telegram")
        assert a.source == "telegram"

    def test_answer_submit_default_source(self) -> None:
        a = HarvestAnswerSubmit(question_id="q1", answer="My answer")
        assert a.source == "web"

    def test_session_summary_null_departure(self) -> None:
        s = HarvestSessionSummary(
            id="s2",
            target_user_name="Bob",
            target_user_email="b@co.com",
            status="completed",
            total_questions=10,
            answered_questions=10,
            progress_percent=100.0,
            created_at="2026-03-01",
            departure_date=None,
        )
        assert s.departure_date is None


# ---------------------------------------------------------------------------
# Question generator tests
# ---------------------------------------------------------------------------


class TestQuestionGenerator:
    def test_fallback_questions_has_all_categories(self) -> None:
        categories = {q["category"] for q in _FALLBACK_QUESTIONS}
        assert categories == {"project", "process", "client", "tool", "team"}

    def test_fallback_questions_count(self) -> None:
        assert len(_FALLBACK_QUESTIONS) == 5

    def test_prompt_template_has_placeholders(self) -> None:
        assert "{name}" in _QUESTION_PROMPT
        assert "{job_title}" in _QUESTION_PROMPT
        assert "{department}" in _QUESTION_PROMPT

    def test_fallback_questions_have_required_keys(self) -> None:
        for q in _FALLBACK_QUESTIONS:
            assert "category" in q
            assert "question" in q

    @pytest.mark.asyncio
    async def test_generate_questions_parses_json(self) -> None:
        mock_questions = [
            {"category": "project", "question": "What project?"},
            {"category": "team", "question": "Who leads?"},
        ]
        mock_response = LLMResponse(
            text=json.dumps(mock_questions),
            input_tokens=100,
            output_tokens=50,
            latency_ms=500.0,
            model_id="claude-sonnet-4-6",
            provider="anthropic",
        )

        with patch("app.services.harvest.question_generator.ClaudeService") as mock_claude:
            instance = mock_claude.return_value
            instance.generate = AsyncMock(return_value=mock_response)

            from app.services.harvest.question_generator import generate_questions

            result = await generate_questions(AsyncMock(), "Alice", "Engineer")

        assert len(result) == 2
        assert result[0]["category"] == "project"

    @pytest.mark.asyncio
    async def test_generate_questions_fallback_on_bad_json(self) -> None:
        mock_response = LLMResponse(
            text="not valid json",
            input_tokens=100,
            output_tokens=50,
            latency_ms=500.0,
            model_id="claude-sonnet-4-6",
            provider="anthropic",
        )

        with patch("app.services.harvest.question_generator.ClaudeService") as mock_claude:
            instance = mock_claude.return_value
            instance.generate = AsyncMock(return_value=mock_response)

            from app.services.harvest.question_generator import generate_questions

            result = await generate_questions(AsyncMock(), "Bob")

        assert len(result) == 5  # fallback count
        categories = {q["category"] for q in result}
        assert categories == {"project", "process", "client", "tool", "team"}

    @pytest.mark.asyncio
    async def test_generate_questions_filters_empty_questions(self) -> None:
        mock_questions = [
            {"category": "project", "question": "What project?"},
            {"category": "team", "question": ""},  # empty question gets filtered
            {"category": "client", "question": "Who is the client?"},
        ]
        mock_response = LLMResponse(
            text=json.dumps(mock_questions),
            input_tokens=100,
            output_tokens=50,
            latency_ms=500.0,
            model_id="claude-sonnet-4-6",
            provider="anthropic",
        )

        with patch("app.services.harvest.question_generator.ClaudeService") as mock_claude:
            instance = mock_claude.return_value
            instance.generate = AsyncMock(return_value=mock_response)

            from app.services.harvest.question_generator import generate_questions

            result = await generate_questions(AsyncMock(), "Carol", "Designer")

        # Empty question is filtered out; only 2 valid questions remain
        assert len(result) == 2


# ---------------------------------------------------------------------------
# Enum types tests
# ---------------------------------------------------------------------------


class TestEnumTypes:
    def test_employment_status_values(self) -> None:
        from app.services.types import EmploymentStatus

        assert EmploymentStatus.ACTIVE == "active"
        assert EmploymentStatus.DEPARTING == "departing"
        assert EmploymentStatus.DEPARTED == "departed"

    def test_harvest_status_values(self) -> None:
        from app.services.types import HarvestStatus

        assert HarvestStatus.ACTIVE == "active"
        assert HarvestStatus.COMPLETED == "completed"
        assert HarvestStatus.PAUSED == "paused"

    def test_harvest_category_values(self) -> None:
        from app.services.types import HarvestCategory

        assert HarvestCategory.PROJECT == "project"
        assert HarvestCategory.PROCESS == "process"
        assert HarvestCategory.CLIENT == "client"
        assert HarvestCategory.TOOL == "tool"
        assert HarvestCategory.TEAM == "team"

    def test_harvest_status_is_str_enum(self) -> None:
        from app.services.types import HarvestStatus

        # StrEnum values are plain strings
        assert isinstance(HarvestStatus.ACTIVE, str)

    def test_harvest_category_is_str_enum(self) -> None:
        from app.services.types import HarvestCategory

        assert isinstance(HarvestCategory.PROJECT, str)

    def test_employment_status_is_str_enum(self) -> None:
        from app.services.types import EmploymentStatus

        assert isinstance(EmploymentStatus.ACTIVE, str)
