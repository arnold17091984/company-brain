"""Plain-message handler for DMs and group @mentions."""

from __future__ import annotations

import asyncio
import contextlib
import logging
import time

from telegram import Bot, Message, Update
from telegram.constants import ChatAction, ChatType, ParseMode
from telegram.error import BadRequest
from telegram.ext import ContextTypes

from app.api_client import APIError, CompanyBrainClient
from app.config import settings
from app.formatters.response import escape_markdown, format_answer, format_error
from app.i18n import t

logger = logging.getLogger(__name__)

# Minimum seconds between requests from the same user.
_RATE_LIMIT_SECONDS = 1.0

# How many seconds to batch streamed content before editing the message.
_STREAM_EDIT_INTERVAL = 0.5

# Telegram language codes mapped to supported languages.
_LANGUAGE_CODE_MAP: dict[str, str] = {
    "en": "en",
    "ja": "ja",
    "ko": "ko",
    "tl": "tl",
    "fil": "tl",
}


def _extract_mention_query(text: str, bot: Bot) -> str | None:
    """Return the query text following an @mention of *bot*, or ``None``.

    Handles both ``@BotUsername query`` and ``query @BotUsername`` patterns.

    Args:
        text: Raw message text from Telegram.
        bot: The ``Bot`` instance, used to fetch the current username.

    Returns:
        Stripped query string without the mention, or ``None`` if the message
        does not mention this bot.
    """
    username = bot.username
    if not username:
        return None

    mention = f"@{username}"
    if mention not in text:
        return None

    query = text.replace(mention, "").strip()
    return query if query else None


def _detect_language(user_lang_code: str | None, user_data: dict) -> str:
    """Resolve the effective language for a user.

    Priority order:
    1. Explicitly set language stored in ``user_data["language"]``.
    2. Telegram ``language_code`` field mapped to a supported language.
    3. ``settings.default_language`` as the final fallback.

    Args:
        user_lang_code: Value of ``update.effective_user.language_code``.
        user_data: The ``context.user_data`` dict (may be empty).

    Returns:
        A supported language code string (``"en"``, ``"ja"``, ``"ko"``, ``"tl"``).
    """
    if user_data.get("language"):
        return str(user_data["language"])

    if user_lang_code:
        # Accept both "ja" and "ja-JP" style codes.
        primary = user_lang_code.split("-")[0].lower()
        mapped = _LANGUAGE_CODE_MAP.get(primary)
        if mapped:
            user_data["language"] = mapped
            return mapped

    return settings.default_language


async def _stream_and_edit(
    placeholder: Message,
    chunks: list[str],
    lang: str,
) -> str:
    """Collect all streamed chunks and build the final text.

    Edits the placeholder message at regular intervals to show progress,
    then returns the complete accumulated text.

    Args:
        placeholder: The "Thinking..." message to edit with streamed content.
        chunks: Mutable list that receives text chunks as they arrive.
        lang: Language code used for i18n fallback messages.

    Returns:
        The complete response text after the stream ends.

    Note:
        This function is a helper that returns the full text so that the
        caller can format and send the final message with sources/buttons.
    """
    # chunks is filled externally; here we just accumulate and edit.
    accumulated = ""
    last_edit = time.monotonic()

    for chunk in chunks:
        accumulated += chunk
        now = time.monotonic()
        if now - last_edit >= _STREAM_EDIT_INTERVAL and accumulated:
            try:
                await placeholder.edit_text(
                    escape_markdown(accumulated + " \u25cf"),
                    parse_mode=ParseMode.MARKDOWN_V2,
                )
                last_edit = now
            except BadRequest:
                pass  # Message may be unchanged; not critical.

    return accumulated


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Route incoming text messages to the knowledge API.

    Behaviour differs by chat type:
    - *Private* chats: every message is treated as a knowledge query.
    - *Group / supergroup* chats: only messages that @mention the bot are
      processed; other messages are silently ignored to avoid noise.

    Rate limiting is enforced via ``context.user_data["last_request_time"]``:
    users who send messages faster than ``_RATE_LIMIT_SECONDS`` receive a
    polite notice instead of a duplicate API call.

    Args:
        update: Incoming Telegram update.
        context: Callback context provided by the dispatcher.
    """
    if update.message is None or update.effective_user is None:
        return

    message = update.message
    text = message.text or ""
    chat_type = message.chat.type
    bot = context.bot

    # ── Determine whether we should respond ───────────────────────────────────
    if chat_type == ChatType.PRIVATE:
        query = text.strip()
    elif chat_type in (ChatType.GROUP, ChatType.SUPERGROUP):
        query = _extract_mention_query(text, bot)
        if query is None:
            # Not addressed to us – ignore silently.
            return
    else:
        # Channel posts or other update types we do not handle.
        return

    user_data: dict = context.user_data if context.user_data is not None else {}
    lang = _detect_language(
        getattr(update.effective_user, "language_code", None),
        user_data,
    )

    if not query:
        await message.reply_text(
            escape_markdown(t("welcome", lang)),
            parse_mode=ParseMode.MARKDOWN_V2,
        )
        return

    # ── Rate limiting ─────────────────────────────────────────────────────────
    now = time.monotonic()
    last_request: float | None = user_data.get("last_request_time")
    if last_request is not None and (now - last_request) < _RATE_LIMIT_SECONDS:
        await message.reply_text(
            escape_markdown(t("rate_limit", lang)),
            parse_mode=ParseMode.MARKDOWN_V2,
        )
        return

    if context.user_data is not None:
        context.user_data["last_request_time"] = now

    # ── Show "typing…" indicator and streaming placeholder ────────────────────
    await message.chat.send_action(ChatAction.TYPING)

    conversation_id: str | None = user_data.get("conversation_id")

    # Send initial placeholder message for streaming updates.
    placeholder = await message.reply_text(
        escape_markdown(t("typing", lang)),
        parse_mode=ParseMode.MARKDOWN_V2,
    )

    accumulated = ""
    sources: list = []
    new_conversation_id: str | None = None
    last_edit = time.monotonic()

    try:
        async with CompanyBrainClient(
            settings.api_base_url, auth_token=settings.api_auth_token
        ) as client:
            # Stream chat; fall back to non-streaming chat on error.
            try:
                stream = await client.stream_chat(
                    message=query,
                    conversation_id=conversation_id,
                    language=lang,
                )
                async for chunk in stream:
                    accumulated += chunk
                    current = time.monotonic()
                    if current - last_edit >= _STREAM_EDIT_INTERVAL and accumulated:
                        try:
                            await placeholder.edit_text(
                                escape_markdown(accumulated + " \u25cf"),
                                parse_mode=ParseMode.MARKDOWN_V2,
                            )
                            last_edit = current
                        except BadRequest:
                            pass
            except (APIError, Exception) as stream_exc:
                logger.warning(
                    "Streaming failed for user %s, falling back to non-streaming: %s",
                    update.effective_user.id,
                    stream_exc,
                )
                # Fall back to standard chat call.
                response = await client.chat(
                    message=query,
                    conversation_id=conversation_id,
                    language=lang,
                )
                accumulated = response.message
                sources = list(response.sources)
                new_conversation_id = response.conversation_id

    except APIError as exc:
        logger.error(
            "API error handling message from user %s: %s",
            update.effective_user.id,
            exc,
            exc_info=True,
        )
        await asyncio.gather(
            placeholder.delete(),
            message.reply_text(
                format_error(t("error", lang)),
                parse_mode=ParseMode.MARKDOWN_V2,
            ),
            return_exceptions=True,
        )
        return
    except Exception as exc:
        logger.exception(
            "Unexpected error handling message from user %s: %s",
            update.effective_user.id,
            exc,
        )
        await asyncio.gather(
            placeholder.delete(),
            message.reply_text(
                format_error(t("error", lang)),
                parse_mode=ParseMode.MARKDOWN_V2,
            ),
            return_exceptions=True,
        )
        return

    # Persist conversation context for multi-turn follow-ups.
    if context.user_data is not None and new_conversation_id:
        context.user_data["conversation_id"] = new_conversation_id
    if context.user_data is not None and sources:
        context.user_data["last_sources"] = [
            {"title": getattr(s, "title", ""), "url": getattr(s, "url", ""), "snippet": getattr(s, "snippet", "")}
            for s in sources
        ]

    if not accumulated:
        with contextlib.suppress(BadRequest):
            await placeholder.edit_text(
                escape_markdown(t("no_results", lang)),
                parse_mode=ParseMode.MARKDOWN_V2,
            )
        return

    text_out, reply_markup = format_answer(accumulated, sources)
    try:
        await placeholder.edit_text(
            text_out,
            parse_mode=ParseMode.MARKDOWN_V2,
            reply_markup=reply_markup,
        )
    except BadRequest:
        # If edit fails (e.g. content unchanged), send a fresh reply instead.
        await message.reply_text(
            text_out,
            parse_mode=ParseMode.MARKDOWN_V2,
            reply_markup=reply_markup,
        )
