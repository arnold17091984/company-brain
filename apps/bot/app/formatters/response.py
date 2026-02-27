"""Telegram MarkdownV2 response formatters for Company Brain answers."""

import re
from datetime import UTC, datetime

from telegram import InlineKeyboardButton, InlineKeyboardMarkup

from app.models import Source

# Characters that must be escaped in MarkdownV2 outside code spans.
# Reference: https://core.telegram.org/bots/api#markdownv2-style
_MARKDOWN_V2_SPECIAL = r"\_*[]()~`>#+-=|{}.!"

# Maximum number of sources shown inline before "show more" is offered.
_MAX_INLINE_SOURCES = 3


def escape_markdown(text: str) -> str:
    """Escape all MarkdownV2 special characters in *text*.

    Every character listed in the Telegram MarkdownV2 spec that appears
    outside of an explicit formatting context is prefixed with a backslash.

    Args:
        text: Raw, unescaped string.

    Returns:
        String safe for use in a MarkdownV2 ``parse_mode`` message.
    """
    return re.sub(r"([" + re.escape(_MARKDOWN_V2_SPECIAL) + r"])", r"\\\1", text)


def _freshness_indicator(updated_at: str) -> str:
    """Return a human-readable freshness label for a source.

    Args:
        updated_at: ISO-8601 timestamp string.

    Returns:
        A short label such as ``"2d ago"`` or ``"just now"``.
    """
    try:
        dt = datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
        now = datetime.now(tz=UTC)
        delta = now - dt
        days = delta.days
        if days == 0:
            return "today"
        if days == 1:
            return "1d ago"
        if days < 30:
            return f"{days}d ago"
        months = days // 30
        if months < 12:
            return f"{months}mo ago"
        return f"{months // 12}y ago"
    except (ValueError, TypeError):
        return ""


def format_sources(sources: list[Source]) -> str:
    """Render a list of sources as a MarkdownV2-safe block.

    Args:
        sources: List of ``Source`` objects to render.  An empty list
            returns an empty string so callers can check truthiness.

    Returns:
        A MarkdownV2-formatted string listing each source with a link and
        freshness indicator, or an empty string when *sources* is empty.
    """
    if not sources:
        return ""

    lines: list[str] = [escape_markdown("Sources:")]
    for i, src in enumerate(sources, start=1):
        freshness = _freshness_indicator(src.updated_at)
        freshness_part = f" \\({escape_markdown(freshness)}\\)" if freshness else ""
        title = escape_markdown(src.title)
        url = str(src.url)
        lines.append(f"{i}\\. [{title}]({url}){freshness_part}")

    return "\n".join(lines)


def format_answer(answer: str, sources: list[Source]) -> tuple[str, InlineKeyboardMarkup]:
    """Render an API answer as a complete MarkdownV2 Telegram message.

    Produces the message text and a matching inline keyboard with feedback
    buttons and, when there are more than ``_MAX_INLINE_SOURCES`` sources, a
    "Show all sources" button.

    Args:
        answer: Raw LLM answer text (not yet escaped).
        sources: Ordered list of evidence sources.

    Returns:
        A tuple of ``(text, reply_markup)`` ready to pass to
        ``message.reply_text(..., parse_mode="MarkdownV2")``.
    """
    parts: list[str] = [escape_markdown(answer)]

    visible_sources = sources[:_MAX_INLINE_SOURCES]
    has_more = len(sources) > _MAX_INLINE_SOURCES

    if visible_sources:
        parts.append("")
        parts.append(format_sources(visible_sources))

    text = "\n".join(parts)

    keyboard_rows: list[list[InlineKeyboardButton]] = [
        [
            InlineKeyboardButton("👍 Helpful", callback_data="feedback:up"),
            InlineKeyboardButton("👎 Not helpful", callback_data="feedback:down"),
        ]
    ]
    if has_more:
        keyboard_rows.append(
            [InlineKeyboardButton("Show all sources", callback_data="sources:more")]
        )

    return text, InlineKeyboardMarkup(keyboard_rows)


def format_error(message: str) -> str:
    """Render a user-facing error message in MarkdownV2.

    Args:
        message: Plain-text description of what went wrong.

    Returns:
        MarkdownV2-safe error string prefixed with an indicator.
    """
    return escape_markdown(f"Sorry, something went wrong: {message}")
