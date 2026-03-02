"""Interactive onboarding tutorial for new Company Brain users.

Guides new users through a 3-step ConversationHandler flow:
  1. Language selection
  2. Department selection
  3. Department-specific "wow" example

Once complete, ``context.user_data["onboarded"]`` is set to ``True`` so
subsequent messages fall through to the regular :mod:`app.handlers.message`
handler.
"""

from __future__ import annotations

import logging

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.constants import ParseMode
from telegram.ext import (
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    ConversationHandler,
    MessageHandler,
    filters,
)

from app.formatters.response import escape_markdown
from app.i18n import t

logger = logging.getLogger(__name__)

# ── Conversation states ────────────────────────────────────────────────────────
LANG_SELECT: int = 0
DEPT_SELECT: int = 1
TUTORIAL_COMPLETE: int = 2

# ── Supported languages displayed during onboarding ───────────────────────────
_LANG_OPTIONS: list[tuple[str, str]] = [
    ("en", "🇺🇸 English"),
    ("ja", "🇯🇵 日本語"),
    ("ko", "🇰🇷 한국어"),
    ("tl", "🇵🇭 Filipino"),
]

# ── Department options ─────────────────────────────────────────────────────────
_DEPT_OPTIONS: list[tuple[str, str]] = [
    ("sales", "💼 Sales"),
    ("dev", "💻 Development"),
    ("backoffice", "📋 Back Office"),
    ("marketing", "📢 Marketing"),
]


def _lang_keyboard() -> InlineKeyboardMarkup:
    """Build the language-selection inline keyboard.

    Returns:
        Two-column inline keyboard with language choices.
    """
    buttons = [
        InlineKeyboardButton(label, callback_data=f"onboard:lang:{code}")
        for code, label in _LANG_OPTIONS
    ]
    # Arrange as 2 buttons per row.
    rows = [buttons[i : i + 2] for i in range(0, len(buttons), 2)]
    return InlineKeyboardMarkup(rows)


def _dept_keyboard() -> InlineKeyboardMarkup:
    """Build the department-selection inline keyboard.

    Returns:
        Two-column inline keyboard with department choices.
    """
    buttons = [
        InlineKeyboardButton(label, callback_data=f"onboard:dept:{slug}")
        for slug, label in _DEPT_OPTIONS
    ]
    rows = [buttons[i : i + 2] for i in range(0, len(buttons), 2)]
    return InlineKeyboardMarkup(rows)


def _get_lang(context: ContextTypes.DEFAULT_TYPE) -> str:
    """Return the current language from user_data, defaulting to ``"en"``."""
    user_data: dict = context.user_data if context.user_data is not None else {}
    return str(user_data.get("language", "en"))


# ── Entry point handlers ───────────────────────────────────────────────────────


async def _start_onboarding(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Entry point: send the welcome message and ask for language choice.

    Triggered by ``/start`` or the first plain-text message from a user who
    has not yet completed onboarding.

    Args:
        update: Incoming Telegram update.
        context: Callback context provided by the dispatcher.

    Returns:
        ``LANG_SELECT`` conversation state.
    """
    if update.effective_message is None:
        return ConversationHandler.END

    lang = _get_lang(context)
    welcome_text = escape_markdown(t("onboarding_welcome", lang))
    prompt_text = escape_markdown(t("onboarding_lang_prompt", lang))
    full_text = f"{welcome_text}\n\n{prompt_text}"

    await update.effective_message.reply_text(
        full_text,
        parse_mode=ParseMode.MARKDOWN_V2,
        reply_markup=_lang_keyboard(),
    )
    return LANG_SELECT


# ── Step 1: Language selection ─────────────────────────────────────────────────


async def _handle_lang_selection(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> int:
    """Handle the language inline-button press and advance to dept selection.

    Callback data: ``onboard:lang:<code>``

    Args:
        update: Incoming Telegram update containing the callback query.
        context: Callback context provided by the dispatcher.

    Returns:
        ``DEPT_SELECT`` conversation state, or ``LANG_SELECT`` on bad data.
    """
    query = update.callback_query
    if query is None:
        return LANG_SELECT

    await query.answer()

    data: str = query.data or ""
    # Expected format: onboard:lang:<code>
    parts = data.split(":")
    if len(parts) != 3 or parts[0] != "onboard" or parts[1] != "lang":
        logger.warning("Unexpected lang callback data: %r", data)
        return LANG_SELECT

    lang_code = parts[2]
    valid_codes = {code for code, _ in _LANG_OPTIONS}
    if lang_code not in valid_codes:
        logger.warning("Unknown language code from onboarding: %r", lang_code)
        return LANG_SELECT

    if context.user_data is not None:
        context.user_data["language"] = lang_code

    prompt_text = escape_markdown(t("onboarding_dept_prompt", lang_code))
    await query.edit_message_text(
        prompt_text,
        parse_mode=ParseMode.MARKDOWN_V2,
        reply_markup=_dept_keyboard(),
    )
    return DEPT_SELECT


# ── Step 2: Department selection ───────────────────────────────────────────────


async def _handle_dept_selection(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> int:
    """Handle the department inline-button press and show the wow example.

    Callback data: ``onboard:dept:<slug>``

    Args:
        update: Incoming Telegram update containing the callback query.
        context: Callback context provided by the dispatcher.

    Returns:
        ``TUTORIAL_COMPLETE`` conversation state, or ``DEPT_SELECT`` on bad data.
    """
    query = update.callback_query
    if query is None:
        return DEPT_SELECT

    await query.answer()

    data: str = query.data or ""
    parts = data.split(":")
    if len(parts) != 3 or parts[0] != "onboard" or parts[1] != "dept":
        logger.warning("Unexpected dept callback data: %r", data)
        return DEPT_SELECT

    dept_slug = parts[2]
    valid_slugs = {slug for slug, _ in _DEPT_OPTIONS}
    if dept_slug not in valid_slugs:
        logger.warning("Unknown department slug from onboarding: %r", dept_slug)
        return DEPT_SELECT

    if context.user_data is not None:
        context.user_data["department"] = dept_slug

    lang = _get_lang(context)

    wow_key = f"onboarding_wow_{dept_slug}"
    tip_key = "onboarding_tip"
    complete_key = "onboarding_complete"

    wow_text = escape_markdown(t(wow_key, lang))
    tip_text = escape_markdown(t(tip_key, lang, department=dept_slug))
    complete_text = escape_markdown(t(complete_key, lang))

    full_message = f"{wow_text}\n\n{tip_text}\n\n{complete_text}"

    await query.edit_message_text(
        full_message,
        parse_mode=ParseMode.MARKDOWN_V2,
    )

    # Mark onboarding complete so the regular message handler takes over.
    if context.user_data is not None:
        context.user_data["onboarded"] = True

    return ConversationHandler.END


# ── Fallback: already onboarded ────────────────────────────────────────────────


async def _skip_if_onboarded(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> int:
    """Return END immediately when the user has already completed onboarding.

    This fallback prevents the ConversationHandler from capturing messages
    from users who finished the tutorial in a previous session.

    Args:
        update: Incoming Telegram update.
        context: Callback context provided by the dispatcher.

    Returns:
        ``ConversationHandler.END`` if already onboarded, else ``LANG_SELECT``.
    """
    user_data: dict = context.user_data if context.user_data is not None else {}
    if user_data.get("onboarded"):
        return ConversationHandler.END
    # Not yet onboarded — start the flow.
    return await _start_onboarding(update, context)


# ── ConversationHandler factory ────────────────────────────────────────────────


def build_onboarding_handler() -> ConversationHandler:  # type: ignore[type-arg]
    """Construct and return the onboarding ``ConversationHandler``.

    The handler is designed to be registered with **higher priority** than the
    regular message handler.  Once ``context.user_data["onboarded"]`` is
    ``True``, the entry-point filter will not match new messages and the
    regular handler resumes control.

    Returns:
        Configured ``ConversationHandler`` for the tutorial flow.
    """

    def _not_onboarded(update: Update, context: ContextTypes.DEFAULT_TYPE) -> bool:
        """Filter: True only when the user has NOT yet completed onboarding."""
        user_data: dict = context.user_data if context.user_data is not None else {}
        return not user_data.get("onboarded", False)

    entry_points = [
        # /start always triggers onboarding for new users.
        CommandHandler("start", _skip_if_onboarded),
        # First plain-text message from a new user.
        MessageHandler(
            filters.TEXT & ~filters.COMMAND & filters.UpdateFilter(_not_onboarded),
            _skip_if_onboarded,
        ),
    ]

    states = {
        LANG_SELECT: [
            CallbackQueryHandler(
                _handle_lang_selection,
                pattern=r"^onboard:lang:",
            ),
        ],
        DEPT_SELECT: [
            CallbackQueryHandler(
                _handle_dept_selection,
                pattern=r"^onboard:dept:",
            ),
        ],
    }

    fallbacks = [
        # If the user sends /start again mid-flow, restart from the top.
        CommandHandler("start", _start_onboarding),
    ]

    return ConversationHandler(
        entry_points=entry_points,
        states=states,
        fallbacks=fallbacks,
        # Allow re-entry so /start always restarts for non-onboarded users.
        allow_reentry=True,
        # Do not persist state across bot restarts (in-memory only).
        persistent=False,
    )
