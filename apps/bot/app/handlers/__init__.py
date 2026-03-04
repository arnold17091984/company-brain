"""Handler registration for the Company Brain Telegram bot."""

from __future__ import annotations

from telegram.ext import Application, CallbackQueryHandler, CommandHandler, MessageHandler, filters

from app.handlers.callback import handle_callback_query
from app.handlers.command import (
    handle_ask,
    handle_clear,
    handle_help,
    handle_history,
    handle_lang,
    handle_search,
    handle_start,
)
from app.handlers.harvest import (
    handle_harvest_pause,
    handle_harvest_skip,
    handle_harvest_status,
)
from app.handlers.message import handle_message
from app.handlers.onboarding import build_onboarding_handler


def register_handlers(application: Application) -> None:  # type: ignore[type-arg]
    """Attach all handlers to *application* in priority order.

    Registration order determines precedence (lower group number = higher
    priority).  The onboarding ``ConversationHandler`` is added to group -1
    so it intercepts ``/start`` and the first message from any new user before
    any other handler sees those updates.  Once a user's
    ``context.user_data["onboarded"]`` is ``True``, the ConversationHandler's
    entry-point filter no longer matches and normal handlers take over.

    Args:
        application: The ``python-telegram-bot`` ``Application`` instance
            returned by ``ApplicationBuilder``.
    """
    # ── Onboarding (highest priority – must run before commands/messages) ──────
    # group=-1 ensures this ConversationHandler is checked before all handlers
    # in the default group (0).
    application.add_handler(build_onboarding_handler(), group=-1)

    # ── Commands ───────────────────────────────────────────────────────────────
    application.add_handler(CommandHandler("start", handle_start))
    application.add_handler(CommandHandler("help", handle_help))
    application.add_handler(CommandHandler("ask", handle_ask))
    application.add_handler(CommandHandler("search", handle_search))
    application.add_handler(CommandHandler("lang", handle_lang))
    application.add_handler(CommandHandler("language", handle_lang))
    application.add_handler(CommandHandler("history", handle_history))
    application.add_handler(CommandHandler("clear", handle_clear))

    # ── Harvest commands ────────────────────────────────────────────────────────
    application.add_handler(CommandHandler("harvest", handle_harvest_status))
    application.add_handler(CommandHandler("skip", handle_harvest_skip))
    application.add_handler(CommandHandler("pause_harvest", handle_harvest_pause))

    # ── Callback queries (inline keyboard buttons) ─────────────────────────────
    application.add_handler(CallbackQueryHandler(handle_callback_query))

    # ── Plain messages (DMs + group @mentions) ─────────────────────────────────
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
