"""Callback query handler for inline keyboard interactions."""

import logging

from telegram import Update
from telegram.constants import ParseMode
from telegram.ext import ContextTypes

from app.api_client import APIError, CompanyBrainClient
from app.config import settings
from app.formatters.response import escape_markdown, format_sources

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


async def _handle_feedback(
    query: object,
    context: ContextTypes.DEFAULT_TYPE,
    data: str,
) -> None:
    """Send user rating to the API and acknowledge with a toast notification.

    Args:
        query: The ``CallbackQuery`` object.
        context: Callback context provided by the dispatcher.
        data: Raw callback data string, e.g. ``"feedback:up"``.
    """
    from telegram import CallbackQuery

    if not isinstance(query, CallbackQuery):
        return

    rating = data.split(":", 1)[1]  # "up" or "down"

    user_data = context.user_data or {}
    conversation_id: str | None = user_data.get("conversation_id")
    message_id = str(query.message.message_id) if query.message else ""

    if conversation_id and message_id:
        try:
            async with CompanyBrainClient(settings.api_base_url) as client:
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

    ack_message = _FEEDBACK_ACK.get(rating, "Feedback recorded.")
    # Edit the reply markup to remove buttons after feedback is given,
    # preventing duplicate submissions.
    try:
        if query.message:
            await query.message.edit_reply_markup(reply_markup=None)
    except Exception:
        pass  # Non-critical; the edit may fail if the message is too old.

    await query.answer(text=ack_message, show_alert=False)


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

    user_data = context.user_data or {}
    sources = user_data.get("last_sources", [])

    if not sources:
        await query.message.reply_text(
            escape_markdown("No additional sources are available for this answer."),
            parse_mode=ParseMode.MARKDOWN_V2,
        )
        return

    text = format_sources(sources)
    await query.message.reply_text(text, parse_mode=ParseMode.MARKDOWN_V2)
