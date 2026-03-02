"""Callback query handler for inline keyboard interactions."""

from __future__ import annotations

import contextlib
import logging

from telegram import Update
from telegram.constants import ParseMode
from telegram.ext import ContextTypes

from app.api_client import APIError, CompanyBrainClient
from app.config import settings
from app.formatters.response import escape_markdown, format_sources
from app.i18n import t

logger = logging.getLogger(__name__)

_FEEDBACK_ACK: dict[str, str] = {
    "up": "Thanks for the positive feedback!",
    "down": "Thanks for the feedback. We'll work on improving.",
}


async def handle_callback_query(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Dispatch inline button presses to the appropriate sub-handler.

    Callback data format:
    - ``"feedback:<up|down>"`` – thumbs up / thumbs down rating.
    - ``"sources:more"`` – expand the full source list.

    Args:
        update: Incoming Telegram update containing the callback query.
        context: Callback context provided by the dispatcher.
    """
    query = update.callback_query
    if query is None:
        return

    # Acknowledge promptly to remove the loading spinner on the client.
    await query.answer()

    data: str = query.data or ""

    if data.startswith("feedback:"):
        await _handle_feedback(query, context, data)
    elif data == "sources:more":
        await _handle_show_more_sources(query, context)
    else:
        logger.warning("Received unknown callback data: %r", data)
        try:
            if query.message:
                await query.message.reply_text(
                    escape_markdown(t("error", "en")),
                    parse_mode=ParseMode.MARKDOWN_V2,
                )
        except Exception as exc:
            logger.warning("Failed to send unknown-callback fallback: %s", exc)


async def _handle_feedback(
    query: object,
    context: ContextTypes.DEFAULT_TYPE,
    data: str,
) -> None:
    """Send user rating to the API and update message to remove buttons.

    After feedback is recorded the original message text is preserved but the
    inline keyboard is replaced with a plain "Thanks for your feedback!" line,
    preventing duplicate submissions.

    Args:
        query: The ``CallbackQuery`` object.
        context: Callback context provided by the dispatcher.
        data: Raw callback data string, e.g. ``"feedback:up"``.
    """
    from telegram import CallbackQuery

    if not isinstance(query, CallbackQuery):
        return

    lang: str = (context.user_data or {}).get("language") or settings.default_language
    rating = data.split(":", 1)[1]  # "up" or "down"

    user_data = context.user_data or {}
    conversation_id: str | None = user_data.get("conversation_id")
    message_id = str(query.message.message_id) if query.message else ""

    if conversation_id and message_id:
        try:
            async with CompanyBrainClient(
                settings.api_base_url, auth_token=settings.api_auth_token
            ) as client:
                await client.send_feedback(
                    conversation_id=conversation_id,
                    message_id=message_id,
                    rating=rating,
                )
        except APIError as exc:
            logger.error("Failed to send feedback to API: %s", exc, exc_info=True)
            # Do not surface API errors to the user for feedback – just log.
        except Exception as exc:
            logger.exception("Unexpected error sending feedback: %s", exc)

    # Append the acknowledgement text to the original message and remove keyboard.
    thanks_text = escape_markdown(t("feedback_thanks", lang))
    try:
        if query.message:
            original_text = query.message.text or ""
            updated_text = f"{original_text}\n\n{thanks_text}"
            await query.message.edit_text(
                updated_text,
                parse_mode=ParseMode.MARKDOWN_V2,
                reply_markup=None,
            )
    except Exception as exc:
        logger.warning("Failed to edit message after feedback: %s", exc)
        # Non-critical: attempt to at least remove buttons.
        try:
            if query.message:
                await query.message.edit_reply_markup(reply_markup=None)
        except Exception:
            pass


async def _handle_show_more_sources(
    query: object,
    context: ContextTypes.DEFAULT_TYPE,
) -> None:
    """Reply with all sources for the answer that triggered this button.

    Sources are stored in ``context.user_data["last_sources"]`` by the message
    and command handlers.  If they are absent the handler sends a graceful
    fallback.

    Args:
        query: The ``CallbackQuery`` object.
        context: Callback context provided by the dispatcher.
    """
    from telegram import CallbackQuery

    if not isinstance(query, CallbackQuery) or query.message is None:
        return

    lang: str = (context.user_data or {}).get("language") or settings.default_language
    user_data = context.user_data or {}
    sources = user_data.get("last_sources", [])

    if not sources:
        try:
            await query.message.reply_text(
                escape_markdown("No additional sources are available for this answer."),
                parse_mode=ParseMode.MARKDOWN_V2,
            )
        except Exception as exc:
            logger.warning("Failed to send no-sources fallback: %s", exc)
        return

    try:
        text = format_sources(sources)
        await query.message.reply_text(text, parse_mode=ParseMode.MARKDOWN_V2)
    except Exception as exc:
        logger.error("Failed to show more sources: %s", exc, exc_info=True)
        with contextlib.suppress(Exception):
            await query.message.reply_text(
                escape_markdown(t("error", lang)),
                parse_mode=ParseMode.MARKDOWN_V2,
            )
