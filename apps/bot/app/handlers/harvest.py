"""Harvest question delivery and answer collection handler.

Intercepts messages from users who have active knowledge harvest sessions,
delivering questions one at a time and recording answers via the API.

State stored in ``context.user_data``:
    - ``harvest_active``: bool — True when a harvest session is in progress.
    - ``harvest_session_id``: str — UUID of the active harvest session.
    - ``harvest_question_id``: str — UUID of the question currently being answered.
    - ``harvest_question_text``: str — Full text of the current question.
    - ``harvest_question_index``: int — 0-based index of the current question in the
      unanswered questions list (used to track position within the session).
    - ``harvest_total``: int — Total number of questions in the session.
    - ``harvest_answered``: int — Number of already-answered questions.
"""

from __future__ import annotations

import logging

from telegram import Update
from telegram.constants import ChatAction, ParseMode
from telegram.ext import ContextTypes

from app.api_client import APIError, CompanyBrainClient
from app.config import settings
from app.formatters.response import escape_markdown
from app.i18n import t

logger = logging.getLogger(__name__)


def _get_lang(context: ContextTypes.DEFAULT_TYPE) -> str:
    """Resolve the user's preferred language from context.

    Args:
        context: Handler callback context.

    Returns:
        Language code string, falling back to ``settings.default_language``.
    """
    user_data: dict = context.user_data if context.user_data is not None else {}
    return str(user_data.get("language") or settings.default_language)


def _get_unanswered_questions(session_detail: dict) -> list[dict]:
    """Extract unanswered questions from a session detail dict.

    Args:
        session_detail: Full session detail from the API including ``questions`` list.

    Returns:
        List of question dicts where ``answer`` is ``None`` or empty, ordered
        by ``asked_at``.
    """
    questions: list[dict] = session_detail.get("questions", [])
    return [q for q in questions if not q.get("answer")]


async def _send_question(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
    question: dict,
    current: int,
    total: int,
    lang: str,
    *,
    include_greeting: bool = False,
) -> None:
    """Send a harvest question to the user and persist state.

    Args:
        update: Incoming Telegram update with a message to reply to.
        context: Handler callback context.
        question: Question dict with ``id``, ``category``, and ``question`` keys.
        current: 1-based position of this question in the session.
        total: Total number of questions in the session.
        lang: Language code for i18n.
        include_greeting: When ``True``, prepend the harvest greeting message.
    """
    if update.message is None:
        return

    if context.user_data is not None:
        context.user_data["harvest_question_id"] = question["id"]
        context.user_data["harvest_question_text"] = question["question"]

    parts: list[str] = []
    if include_greeting:
        parts.append(escape_markdown(t("harvest_greeting", lang)))
        parts.append("")

    question_text = t(
        "harvest_question",
        lang,
        current=str(current),
        total=str(total),
        category=question.get("category", "general"),
        question=question["question"],
    )
    parts.append(escape_markdown(question_text))

    await update.message.reply_text(
        "\n".join(parts),
        parse_mode=ParseMode.MARKDOWN_V2,
    )


async def harvest_check(update: Update, context: ContextTypes.DEFAULT_TYPE) -> bool:
    """Check if the user has an active harvest session and initialise state.

    Should be called at the start of ``handle_message`` for private chats.
    When a session is found, it stores session state in ``context.user_data``
    and sends the first unanswered question.

    Args:
        update: Incoming Telegram update.
        context: Handler callback context.

    Returns:
        ``True`` when a harvest session was found and the flow was activated,
        ``False`` otherwise (caller should proceed with normal chat handling).
    """
    if update.effective_user is None:
        return False

    user_data: dict = context.user_data if context.user_data is not None else {}
    lang = _get_lang(context)

    # Already in harvest mode — the answer submission is handled in handle_harvest_answer.
    if user_data.get("harvest_active"):
        return True

    # Check API for active sessions. The bot auth token must have sufficient
    # privileges (admin/service account) to list sessions.
    try:
        async with CompanyBrainClient(
            settings.api_base_url, auth_token=settings.api_auth_token
        ) as client:
            sessions = await client.get_harvest_sessions()
    except APIError as exc:
        logger.error(
            "API error checking harvest sessions for user %s: %s",
            update.effective_user.id,
            exc,
        )
        return False
    except Exception as exc:
        logger.exception(
            "Unexpected error checking harvest sessions for user %s: %s",
            update.effective_user.id,
            exc,
        )
        return False

    # Filter to active sessions only. The API may return all statuses.
    active_sessions = [s for s in sessions if s.get("status") == "active"]
    if not active_sessions:
        return False

    # Use the most recently created active session.
    session_summary = active_sessions[0]
    session_id: str = session_summary["id"]

    # Fetch full session detail to get unanswered questions.
    try:
        async with CompanyBrainClient(
            settings.api_base_url, auth_token=settings.api_auth_token
        ) as client:
            session_detail = await client.get_harvest_session_detail(session_id)
    except APIError as exc:
        logger.error(
            "API error fetching harvest session %s for user %s: %s",
            session_id,
            update.effective_user.id,
            exc,
        )
        return False
    except Exception as exc:
        logger.exception(
            "Unexpected error fetching harvest session %s: %s",
            session_id,
            exc,
        )
        return False

    unanswered = _get_unanswered_questions(session_detail)
    if not unanswered:
        # All questions already answered — no harvest mode needed.
        return False

    total: int = session_detail.get("total_questions", len(session_detail.get("questions", [])))
    answered: int = session_detail.get("answered_questions", 0)
    current_number = answered + 1

    if context.user_data is not None:
        context.user_data["harvest_active"] = True
        context.user_data["harvest_session_id"] = session_id
        context.user_data["harvest_total"] = total
        context.user_data["harvest_answered"] = answered

    await _send_question(
        update,
        context,
        unanswered[0],
        current=current_number,
        total=total,
        lang=lang,
        include_greeting=True,
    )
    return True


async def handle_harvest_answer(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Submit the user's message as an answer to the current harvest question.

    Stores the answer via the API, then either delivers the next question or
    sends a completion message when all questions are answered.

    Args:
        update: Incoming Telegram update containing the user's answer.
        context: Handler callback context with harvest state in ``user_data``.
    """
    if update.message is None or update.effective_user is None:
        return

    user_data: dict = context.user_data if context.user_data is not None else {}
    lang = _get_lang(context)
    answer_text = (update.message.text or "").strip()
    question_id: str | None = user_data.get("harvest_question_id")
    session_id: str | None = user_data.get("harvest_session_id")

    if not question_id or not session_id:
        logger.warning(
            "harvest_answer called but no question_id/session_id in user_data for user %s",
            update.effective_user.id,
        )
        _clear_harvest_state(context)
        return

    await update.message.chat.send_action(ChatAction.TYPING)

    # Submit the answer to the API.
    try:
        async with CompanyBrainClient(
            settings.api_base_url, auth_token=settings.api_auth_token
        ) as client:
            await client.submit_harvest_answer(
                question_id=question_id,
                answer=answer_text,
                source="telegram",
            )
    except APIError as exc:
        logger.error(
            "API error submitting harvest answer from user %s: %s",
            update.effective_user.id,
            exc,
        )
        await update.message.reply_text(
            escape_markdown(t("error", lang)),
            parse_mode=ParseMode.MARKDOWN_V2,
        )
        return
    except Exception as exc:
        logger.exception(
            "Unexpected error submitting harvest answer from user %s: %s",
            update.effective_user.id,
            exc,
        )
        await update.message.reply_text(
            escape_markdown(t("error", lang)),
            parse_mode=ParseMode.MARKDOWN_V2,
        )
        return

    # Acknowledge the answer.
    await update.message.reply_text(
        escape_markdown(t("harvest_answer_received", lang)),
        parse_mode=ParseMode.MARKDOWN_V2,
    )

    # Fetch refreshed session detail to get the updated unanswered list.
    try:
        async with CompanyBrainClient(
            settings.api_base_url, auth_token=settings.api_auth_token
        ) as client:
            session_detail = await client.get_harvest_session_detail(session_id)
    except APIError as exc:
        logger.error(
            "API error re-fetching session %s after answer: %s",
            session_id,
            exc,
        )
        _clear_harvest_state(context)
        return
    except Exception as exc:
        logger.exception(
            "Unexpected error re-fetching session %s: %s",
            session_id,
            exc,
        )
        _clear_harvest_state(context)
        return

    unanswered = _get_unanswered_questions(session_detail)
    total: int = session_detail.get("total_questions", 0)
    answered: int = session_detail.get("answered_questions", 0)

    if not unanswered:
        # All questions answered — session complete.
        _clear_harvest_state(context)
        await update.message.reply_text(
            escape_markdown(t("harvest_complete", lang)),
            parse_mode=ParseMode.MARKDOWN_V2,
        )
        return

    # More questions remain — deliver the next one.
    if context.user_data is not None:
        context.user_data["harvest_total"] = total
        context.user_data["harvest_answered"] = answered

    current_number = answered + 1
    await update.message.reply_text(
        escape_markdown(t("harvest_next", lang)),
        parse_mode=ParseMode.MARKDOWN_V2,
    )
    await _send_question(
        update,
        context,
        unanswered[0],
        current=current_number,
        total=total,
        lang=lang,
    )


async def handle_harvest_skip(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Skip the current harvest question and advance to the next one.

    Triggered by the ``/skip`` command while a harvest session is active.

    Args:
        update: Incoming Telegram update.
        context: Handler callback context.
    """
    if update.message is None or update.effective_user is None:
        return

    user_data: dict = context.user_data if context.user_data is not None else {}
    lang = _get_lang(context)

    if not user_data.get("harvest_active"):
        await update.message.reply_text(
            escape_markdown(t("harvest_no_session", lang)),
            parse_mode=ParseMode.MARKDOWN_V2,
        )
        return

    session_id: str | None = user_data.get("harvest_session_id")
    if not session_id:
        _clear_harvest_state(context)
        return

    await update.message.reply_text(
        escape_markdown(t("harvest_skip", lang)),
        parse_mode=ParseMode.MARKDOWN_V2,
    )

    # Re-fetch session to find the current state of unanswered questions.
    # Skip means we move forward without submitting an answer; the current
    # question remains unanswered but we advance the pointer by storing the
    # next question in user_data.
    try:
        async with CompanyBrainClient(
            settings.api_base_url, auth_token=settings.api_auth_token
        ) as client:
            session_detail = await client.get_harvest_session_detail(session_id)
    except APIError as exc:
        logger.error(
            "API error fetching session %s during skip: %s",
            session_id,
            exc,
        )
        _clear_harvest_state(context)
        return
    except Exception as exc:
        logger.exception(
            "Unexpected error fetching session %s during skip: %s",
            session_id,
            exc,
        )
        _clear_harvest_state(context)
        return

    unanswered = _get_unanswered_questions(session_detail)
    total: int = session_detail.get("total_questions", 0)
    answered: int = session_detail.get("answered_questions", 0)

    # Move past the question we are currently on (it remains unanswered).
    current_question_id: str | None = user_data.get("harvest_question_id")
    remaining = [q for q in unanswered if q["id"] != current_question_id]

    if not remaining:
        # No more questions to present right now.
        _clear_harvest_state(context)
        await update.message.reply_text(
            escape_markdown(t("harvest_complete", lang)),
            parse_mode=ParseMode.MARKDOWN_V2,
        )
        return

    current_number = answered + 1
    await _send_question(
        update,
        context,
        remaining[0],
        current=current_number,
        total=total,
        lang=lang,
    )


async def handle_harvest_pause(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Pause the active harvest session.

    Triggered by the ``/pause_harvest`` command.

    Args:
        update: Incoming Telegram update.
        context: Handler callback context.
    """
    if update.message is None or update.effective_user is None:
        return

    user_data: dict = context.user_data if context.user_data is not None else {}
    lang = _get_lang(context)

    if not user_data.get("harvest_active"):
        await update.message.reply_text(
            escape_markdown(t("harvest_no_session", lang)),
            parse_mode=ParseMode.MARKDOWN_V2,
        )
        return

    session_id: str | None = user_data.get("harvest_session_id")
    if not session_id:
        _clear_harvest_state(context)
        return

    try:
        async with CompanyBrainClient(
            settings.api_base_url, auth_token=settings.api_auth_token
        ) as client:
            await client.pause_harvest_session(session_id)
    except APIError as exc:
        logger.error(
            "API error pausing harvest session %s for user %s: %s",
            session_id,
            update.effective_user.id,
            exc,
        )
        await update.message.reply_text(
            escape_markdown(t("error", lang)),
            parse_mode=ParseMode.MARKDOWN_V2,
        )
        return
    except Exception as exc:
        logger.exception(
            "Unexpected error pausing session %s: %s",
            session_id,
            exc,
        )
        await update.message.reply_text(
            escape_markdown(t("error", lang)),
            parse_mode=ParseMode.MARKDOWN_V2,
        )
        return

    _clear_harvest_state(context)
    await update.message.reply_text(
        escape_markdown(t("harvest_paused", lang)),
        parse_mode=ParseMode.MARKDOWN_V2,
    )


async def handle_harvest_status(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Show harvest status or resume a paused session.

    Triggered by the ``/harvest`` command. When no session is active,
    checks the API for paused sessions and offers to resume.

    Args:
        update: Incoming Telegram update.
        context: Handler callback context.
    """
    if update.message is None or update.effective_user is None:
        return

    user_data: dict = context.user_data if context.user_data is not None else {}
    lang = _get_lang(context)

    # If already active, re-send the current question.
    if user_data.get("harvest_active"):
        session_id: str | None = user_data.get("harvest_session_id")
        if not session_id:
            _clear_harvest_state(context)
            return

        try:
            async with CompanyBrainClient(
                settings.api_base_url, auth_token=settings.api_auth_token
            ) as client:
                session_detail = await client.get_harvest_session_detail(session_id)
        except (APIError, Exception) as exc:
            logger.error("Error fetching session %s on /harvest: %s", session_id, exc)
            _clear_harvest_state(context)
            return

        unanswered = _get_unanswered_questions(session_detail)
        total: int = session_detail.get("total_questions", 0)
        answered: int = session_detail.get("answered_questions", 0)

        if unanswered:
            await _send_question(
                update,
                context,
                unanswered[0],
                current=answered + 1,
                total=total,
                lang=lang,
            )
        else:
            _clear_harvest_state(context)
            await update.message.reply_text(
                escape_markdown(t("harvest_complete", lang)),
                parse_mode=ParseMode.MARKDOWN_V2,
            )
        return

    # Not active — check for paused sessions to resume.
    try:
        async with CompanyBrainClient(
            settings.api_base_url, auth_token=settings.api_auth_token
        ) as client:
            sessions = await client.get_harvest_sessions()
    except (APIError, Exception) as exc:
        logger.error(
            "Error listing harvest sessions on /harvest for user %s: %s",
            update.effective_user.id,
            exc,
        )
        await update.message.reply_text(
            escape_markdown(t("error", lang)),
            parse_mode=ParseMode.MARKDOWN_V2,
        )
        return

    # Active sessions take priority; then check paused.
    active = [s for s in sessions if s.get("status") == "active"]
    paused = [s for s in sessions if s.get("status") == "paused"]

    if not active and not paused:
        await update.message.reply_text(
            escape_markdown(t("harvest_no_session", lang)),
            parse_mode=ParseMode.MARKDOWN_V2,
        )
        return

    target_session = (active or paused)[0]
    session_id = target_session["id"]

    # For paused sessions, resume first.
    if not active and paused:
        try:
            async with CompanyBrainClient(
                settings.api_base_url, auth_token=settings.api_auth_token
            ) as client:
                await client.resume_harvest_session(session_id)
        except (APIError, Exception) as exc:
            logger.error("Error resuming session %s: %s", session_id, exc)
            await update.message.reply_text(
                escape_markdown(t("error", lang)),
                parse_mode=ParseMode.MARKDOWN_V2,
            )
            return

        await update.message.reply_text(
            escape_markdown(t("harvest_resumed", lang)),
            parse_mode=ParseMode.MARKDOWN_V2,
        )

    # Fetch detail and activate.
    try:
        async with CompanyBrainClient(
            settings.api_base_url, auth_token=settings.api_auth_token
        ) as client:
            session_detail = await client.get_harvest_session_detail(session_id)
    except (APIError, Exception) as exc:
        logger.error("Error fetching session detail %s: %s", session_id, exc)
        return

    unanswered = _get_unanswered_questions(session_detail)
    if not unanswered:
        await update.message.reply_text(
            escape_markdown(t("harvest_complete", lang)),
            parse_mode=ParseMode.MARKDOWN_V2,
        )
        return

    total = session_detail.get("total_questions", 0)
    answered = session_detail.get("answered_questions", 0)

    if context.user_data is not None:
        context.user_data["harvest_active"] = True
        context.user_data["harvest_session_id"] = session_id
        context.user_data["harvest_total"] = total
        context.user_data["harvest_answered"] = answered

    await _send_question(
        update,
        context,
        unanswered[0],
        current=answered + 1,
        total=total,
        lang=lang,
        include_greeting=not paused,  # Only show greeting for fresh activation.
    )


def _clear_harvest_state(context: ContextTypes.DEFAULT_TYPE) -> None:
    """Remove all harvest-related keys from ``context.user_data``.

    Args:
        context: Handler callback context.
    """
    if context.user_data is None:
        return
    for key in (
        "harvest_active",
        "harvest_session_id",
        "harvest_question_id",
        "harvest_question_text",
        "harvest_total",
        "harvest_answered",
    ):
        context.user_data.pop(key, None)
