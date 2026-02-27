"""Plain-message handler for DMs and group @mentions."""

import logging

from telegram import Bot, Update
from telegram.constants import ChatAction, ChatType, ParseMode
from telegram.ext import ContextTypes

from app.api_client import APIError, CompanyBrainClient
from app.config import settings
from app.formatters.response import escape_markdown, format_answer, format_error

logger = logging.getLogger(__name__)


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


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Route incoming text messages to the knowledge API.

    Behaviour differs by chat type:
    - *Private* chats: every message is treated as a knowledge query.
    - *Group / supergroup* chats: only messages that @mention the bot are
      processed; other messages are silently ignored to avoid noise.

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

    if not query:
        await message.reply_text(
            escape_markdown("Please send me a question and I'll find the answer for you."),
            parse_mode=ParseMode.MARKDOWN_V2,
        )
        return

    # ── Show "typing…" indicator while waiting ────────────────────────────────
    await message.chat.send_action(ChatAction.TYPING)

    language: str | None = context.user_data.get("language") if context.user_data else None
    conversation_id: str | None = (
        context.user_data.get("conversation_id") if context.user_data else None
    )

    try:
        async with CompanyBrainClient(settings.api_base_url) as client:
            response = await client.chat(
                message=query,
                user_id=str(update.effective_user.id),
                conversation_id=conversation_id,
                language=language,
            )
    except APIError as exc:
        logger.error(
            "API error handling message from user %s: %s",
            update.effective_user.id,
            exc,
            exc_info=True,
        )
        await message.reply_text(
            format_error("The knowledge API is unavailable right now. Please try again later."),
            parse_mode=ParseMode.MARKDOWN_V2,
        )
        return
    except Exception as exc:
        logger.exception(
            "Unexpected error handling message from user %s: %s",
            update.effective_user.id,
            exc,
        )
        await message.reply_text(
            format_error("An unexpected error occurred. Please try again."),
            parse_mode=ParseMode.MARKDOWN_V2,
        )
        return

    # Persist conversation context for multi-turn follow-ups.
    if context.user_data is not None:
        context.user_data["conversation_id"] = response.conversation_id

    text_out, reply_markup = format_answer(response.message, response.sources)
    await message.reply_text(
        text_out,
        parse_mode=ParseMode.MARKDOWN_V2,
        reply_markup=reply_markup,
    )
