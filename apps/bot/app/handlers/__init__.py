"""Handler registration for the Company Brain Telegram bot."""

from telegram.ext import Application, CallbackQueryHandler, MessageHandler, filters

from app.handlers.callback import handle_callback_query
from app.handlers.command import (
    handle_ask,
    handle_help,
    handle_lang,
    handle_search,
    handle_start,
)
from app.handlers.message import handle_message


def register_handlers(application: Application) -> None:  # type: ignore[type-arg]
    """Attach all handlers to *application* in priority order.

    Command handlers are registered before the catch-all message handler so
    that explicit commands take precedence.

    Args:
        application: The ``python-telegram-bot`` ``Application`` instance
            returned by ``ApplicationBuilder``.
    """
    # ── Commands ───────────────────────────────────────────────────────────────
    from telegram.ext import CommandHandler

    application.add_handler(CommandHandler("start", handle_start))
    application.add_handler(CommandHandler("help", handle_help))
    application.add_handler(CommandHandler("ask", handle_ask))
    application.add_handler(CommandHandler("search", handle_search))
    application.add_handler(CommandHandler("lang", handle_lang))

    # ── Callback queries (inline keyboard buttons) ─────────────────────────────
    application.add_handler(CallbackQueryHandler(handle_callback_query))

    # ── Plain messages (DMs + group @mentions) ─────────────────────────────────
    application.add_handler(
        MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message)
    )
