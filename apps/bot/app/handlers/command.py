"""Command handlers for the Company Brain Telegram bot."""

import logging

from telegram import Update
from telegram.constants import ChatAction, ParseMode
from telegram.ext import ContextTypes

from app.api_client import APIError, CompanyBrainClient
from app.config import settings
from app.formatters.response import escape_markdown, format_answer, format_error

logger = logging.getLogger(__name__)

_SUPPORTED_LANGUAGES: dict[str, str] = {
    "en": "English",
    "ja": "Japanese (日本語)",
    "ko": "Korean (한국어)",
}

_WELCOME_TEXT = (
    "Welcome to *Company Brain* \\- your AI-powered company knowledge engine\\!\n\n"
    "I can answer questions about company policies, processes, and documentation "
    "in *English*, *Japanese*, and *Korean*\\.\n\n"
    "Here's how to get started:\n"
    "• /ask `<question>` \\- Ask anything about the company\n"
    "• /search `<query>` \\- Search for specific documents\n"
    "• /lang `<en|ja|ko>` \\- Set your preferred language\n"
    "• /help \\- Show all available commands\n\n"
    "You can also just send me a message directly\\!"
)

_HELP_TEXT = (
    "*Available commands:*\n\n"
    "/start \\- Show welcome message\n"
    "/ask `<question>` \\- Ask a question and get an AI answer with sources\n"
    "  _Example:_ /ask What is the remote work policy\\?\n\n"
    "/search `<query>` \\- Search company knowledge base\n"
    "  _Example:_ /search onboarding checklist\n\n"
    "/lang `<en|ja|ko>` \\- Set preferred response language\n"
    "  _Example:_ /lang ja\n\n"
    "/help \\- Show this message\n\n"
    "*In group chats:* mention me with @botname followed by your question\\."
)


async def handle_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Send a welcome message explaining the bot's capabilities.

    Args:
        update: Incoming Telegram update.
        context: Callback context provided by the dispatcher.
    """
    if update.message is None:
        return
    await update.message.reply_text(_WELCOME_TEXT, parse_mode=ParseMode.MARKDOWN_V2)


async def handle_help(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Show all available commands with usage examples.

    Args:
        update: Incoming Telegram update.
        context: Callback context provided by the dispatcher.
    """
    if update.message is None:
        return
    await update.message.reply_text(_HELP_TEXT, parse_mode=ParseMode.MARKDOWN_V2)


async def handle_ask(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Forward a question to the API and reply with the answer and sources.

    Usage: /ask <question>

    Args:
        update: Incoming Telegram update.
        context: Callback context provided by the dispatcher.
    """
    if update.message is None or update.effective_user is None:
        return

    args = context.args or []
    question = " ".join(args).strip()

    if not question:
        await update.message.reply_text(
            escape_markdown("Please provide a question. Example: /ask What is our leave policy?"),
            parse_mode=ParseMode.MARKDOWN_V2,
        )
        return

    await update.message.chat.send_action(ChatAction.TYPING)

    language: str | None = context.user_data.get("language") if context.user_data else None

    try:
        async with CompanyBrainClient(settings.api_base_url) as client:
            response = await client.query(
                text=question,
                user_id=str(update.effective_user.id),
                language=language,
            )
    except APIError as exc:
        logger.error("API error during /ask: %s", exc, exc_info=True)
        await update.message.reply_text(
            format_error("The knowledge API is unavailable. Please try again later."),
            parse_mode=ParseMode.MARKDOWN_V2,
        )
        return
    except Exception as exc:
        logger.exception("Unexpected error during /ask: %s", exc)
        await update.message.reply_text(
            format_error("An unexpected error occurred."),
            parse_mode=ParseMode.MARKDOWN_V2,
        )
        return

    text, reply_markup = format_answer(response.answer, response.sources)
    await update.message.reply_text(
        text,
        parse_mode=ParseMode.MARKDOWN_V2,
        reply_markup=reply_markup,
    )


async def handle_search(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Search the knowledge base and return the top matching documents.

    Usage: /search <query>

    Args:
        update: Incoming Telegram update.
        context: Callback context provided by the dispatcher.
    """
    if update.message is None or update.effective_user is None:
        return

    args = context.args or []
    query = " ".join(args).strip()

    if not query:
        await update.message.reply_text(
            escape_markdown(
                "Please provide a search term. Example: /search onboarding checklist"
            ),
            parse_mode=ParseMode.MARKDOWN_V2,
        )
        return

    await update.message.chat.send_action(ChatAction.TYPING)

    language: str | None = context.user_data.get("language") if context.user_data else None

    try:
        async with CompanyBrainClient(settings.api_base_url) as client:
            # The query endpoint returns both an answer and ranked sources.
            # For /search we surface the sources list directly.
            response = await client.query(
                text=query,
                user_id=str(update.effective_user.id),
                language=language,
            )
    except APIError as exc:
        logger.error("API error during /search: %s", exc, exc_info=True)
        await update.message.reply_text(
            format_error("Search is temporarily unavailable. Please try again later."),
            parse_mode=ParseMode.MARKDOWN_V2,
        )
        return
    except Exception as exc:
        logger.exception("Unexpected error during /search: %s", exc)
        await update.message.reply_text(
            format_error("An unexpected error occurred."),
            parse_mode=ParseMode.MARKDOWN_V2,
        )
        return

    if not response.sources:
        await update.message.reply_text(
            escape_markdown(f"No results found for: {query}"),
            parse_mode=ParseMode.MARKDOWN_V2,
        )
        return

    from app.formatters.response import format_sources

    text = (
        escape_markdown(f"Top results for: {query}")
        + "\n\n"
        + format_sources(response.sources)
    )
    await update.message.reply_text(text, parse_mode=ParseMode.MARKDOWN_V2)


async def handle_lang(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Set the user's preferred response language.

    Usage: /lang <en|ja|ko>

    The chosen language code is persisted in ``context.user_data`` so it is
    sent with subsequent query and chat requests.

    Args:
        update: Incoming Telegram update.
        context: Callback context provided by the dispatcher.
    """
    if update.message is None:
        return

    args = context.args or []
    code = args[0].strip().lower() if args else ""

    if code not in _SUPPORTED_LANGUAGES:
        options = ", ".join(
            f"`{k}` \\({escape_markdown(v)}\\)" for k, v in _SUPPORTED_LANGUAGES.items()
        )
        await update.message.reply_text(
            f"Please choose a supported language: {options}",
            parse_mode=ParseMode.MARKDOWN_V2,
        )
        return

    if context.user_data is not None:
        context.user_data["language"] = code

    lang_name = escape_markdown(_SUPPORTED_LANGUAGES[code])
    await update.message.reply_text(
        f"Language set to *{lang_name}*\\. Answers will now be returned in {lang_name}\\.",
        parse_mode=ParseMode.MARKDOWN_V2,
    )
