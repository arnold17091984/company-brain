"""Tests for the Telegram MarkdownV2 response formatters."""

import pytest

from app.formatters.response import (
    _MARKDOWN_V2_SPECIAL,
    escape_markdown,
    format_answer,
    format_error,
    format_sources,
)
from app.models import Source


# ── Helpers ────────────────────────────────────────────────────────────────────


def _make_source(
    *,
    title: str = "Test Document",
    url: str = "https://example.com/doc",
    snippet: str = "A short excerpt.",
    updated_at: str = "2025-12-01T10:00:00Z",
) -> Source:
    return Source(title=title, url=url, snippet=snippet, updated_at=updated_at)  # type: ignore[arg-type]


# ── escape_markdown ────────────────────────────────────────────────────────────


class TestEscapeMarkdown:
    """Unit tests for ``escape_markdown``."""

    def test_plain_text_unchanged(self) -> None:
        assert escape_markdown("Hello world") == "Hello world"

    def test_all_special_chars_escaped(self) -> None:
        """Every MarkdownV2 special character must be prefixed with a backslash."""
        for char in _MARKDOWN_V2_SPECIAL:
            result = escape_markdown(char)
            assert result == f"\\{char}", (
                f"Expected '\\{char}' but got {result!r} for char {char!r}"
            )

    def test_mixed_text_escaping(self) -> None:
        raw = "Hello (world)! How are *you*?"
        escaped = escape_markdown(raw)
        # Parentheses, exclamation mark, and asterisks must all be escaped.
        assert "\\(" in escaped
        assert "\\)" in escaped
        assert "\\!" in escaped
        assert "\\*" in escaped

    def test_url_characters_escaped(self) -> None:
        """Dots and hyphens in domain names should be escaped."""
        escaped = escape_markdown("https://example.com")
        assert "\\." in escaped

    def test_empty_string(self) -> None:
        assert escape_markdown("") == ""

    def test_already_escaped_text_double_escapes(self) -> None:
        """Calling escape_markdown on already-escaped text double-escapes backslashes.

        Callers are responsible for only escaping once.
        """
        once = escape_markdown("Hello!")
        twice = escape_markdown(once)
        assert once != twice  # idempotency is intentionally NOT guaranteed


# ── format_sources ─────────────────────────────────────────────────────────────


class TestFormatSources:
    """Unit tests for ``format_sources``."""

    def test_empty_list_returns_empty_string(self) -> None:
        assert format_sources([]) == ""

    def test_single_source_contains_title_and_url(self) -> None:
        src = _make_source(title="Leave Policy", url="https://hr.example.com/leave")
        result = format_sources([src])
        assert "Leave Policy" in result
        assert "https://hr.example.com/leave" in result

    def test_multiple_sources_numbered(self) -> None:
        sources = [
            _make_source(title="Doc A", url="https://example.com/a"),
            _make_source(title="Doc B", url="https://example.com/b"),
            _make_source(title="Doc C", url="https://example.com/c"),
        ]
        result = format_sources(sources)
        assert "1\\." in result
        assert "2\\." in result
        assert "3\\." in result

    def test_freshness_indicator_recent(self) -> None:
        """Sources updated today should show 'today'."""
        from datetime import datetime, timezone

        today = datetime.now(tz=timezone.utc).isoformat()
        src = _make_source(updated_at=today)
        result = format_sources([src])
        assert "today" in result

    def test_freshness_indicator_days_ago(self) -> None:
        src = _make_source(updated_at="2026-02-01T00:00:00Z")
        result = format_sources([src])
        # 27 days before 2026-02-28 → "27d ago"
        assert "ago" in result

    def test_invalid_timestamp_skips_freshness(self) -> None:
        src = _make_source(updated_at="not-a-date")
        # Should not raise; freshness part is simply omitted.
        result = format_sources([src])
        assert result  # non-empty


# ── format_answer ──────────────────────────────────────────────────────────────


class TestFormatAnswer:
    """Unit tests for ``format_answer``."""

    def test_returns_tuple_of_text_and_markup(self) -> None:
        from telegram import InlineKeyboardMarkup

        text, markup = format_answer("The answer.", [])
        assert isinstance(text, str)
        assert isinstance(markup, InlineKeyboardMarkup)

    def test_answer_text_is_included(self) -> None:
        text, _ = format_answer("Remote work is allowed.", [])
        assert "Remote work is allowed" in text

    def test_feedback_buttons_always_present(self) -> None:
        from telegram import InlineKeyboardMarkup

        _, markup = format_answer("Some answer.", [])
        assert isinstance(markup, InlineKeyboardMarkup)
        all_buttons = [btn for row in markup.inline_keyboard for btn in row]
        callback_data = {btn.callback_data for btn in all_buttons}
        assert "feedback:up" in callback_data
        assert "feedback:down" in callback_data

    def test_no_show_more_button_when_few_sources(self) -> None:
        sources = [_make_source() for _ in range(3)]  # exactly at limit
        _, markup = format_answer("Answer.", sources)
        all_buttons = [btn for row in markup.inline_keyboard for btn in row]
        callback_data = {btn.callback_data for btn in all_buttons}
        assert "sources:more" not in callback_data

    def test_show_more_button_appears_with_excess_sources(self) -> None:
        sources = [_make_source() for _ in range(5)]  # over the 3-source limit
        _, markup = format_answer("Answer.", sources)
        all_buttons = [btn for row in markup.inline_keyboard for btn in row]
        callback_data = {btn.callback_data for btn in all_buttons}
        assert "sources:more" in callback_data

    def test_special_chars_in_answer_are_escaped(self) -> None:
        answer = "Use the #channel! See docs (v2)."
        text, _ = format_answer(answer, [])
        # Hash, exclamation mark, and parentheses must be escaped.
        assert "\\#" in text
        assert "\\!" in text
        assert "\\(" in text

    def test_empty_sources_produces_no_source_block(self) -> None:
        text, _ = format_answer("Just an answer.", [])
        assert "Sources" not in text


# ── format_error ───────────────────────────────────────────────────────────────


class TestFormatError:
    """Unit tests for ``format_error``."""

    def test_returns_string(self) -> None:
        assert isinstance(format_error("Oops"), str)

    def test_contains_message(self) -> None:
        result = format_error("Service unavailable")
        assert "Service unavailable" in result

    def test_special_chars_escaped(self) -> None:
        result = format_error("Error (code: 503).")
        assert "\\(" in result
        assert "\\)" in result
        assert "\\." in result
