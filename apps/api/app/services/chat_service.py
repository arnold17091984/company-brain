"""Chat persistence service.

Provides async functions for creating and querying chat sessions and
messages backed by the PostgreSQL database via SQLAlchemy 2.0 async ORM.

All UUID primary keys are returned as plain ``str`` values so they can
be serialised directly in JSON responses.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import ChatMessage, ChatSession

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Session operations
# ---------------------------------------------------------------------------


async def create_session(db: AsyncSession, user_id: str) -> str:
    """Create a new chat session for the given user.

    Args:
        db: Active database session.
        user_id: String UUID of the owning user.

    Returns:
        The new session UUID as a string.
    """
    session = ChatSession(user_id=uuid.UUID(user_id))
    db.add(session)
    await db.flush()  # populate session.id without a full commit
    session_id = str(session.id)
    logger.debug("Created chat session %s for user %s", session_id, user_id)
    return session_id


async def list_sessions(
    db: AsyncSession,
    user_id: str,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """List the most recent chat sessions for a user.

    The *title* of each session is derived from the first user message,
    truncated to 50 characters.  Sessions without any messages show an
    empty title.

    Args:
        db: Active database session.
        user_id: String UUID of the requesting user.
        limit: Maximum number of sessions to return.

    Returns:
        A list of dicts with keys ``id``, ``title``, ``updated_at``, and
        ``message_count``, ordered by ``updated_at`` descending.
    """
    # Subquery: first user message per session (lowest created_at)
    first_msg_subq = (
        select(
            ChatMessage.session_id,
            func.min(ChatMessage.created_at).label("first_ts"),
        )
        .where(ChatMessage.role == "user")
        .group_by(ChatMessage.session_id)
        .subquery("first_msg")
    )

    # Subquery: first user message content per session
    first_content_subq = (
        select(
            ChatMessage.session_id,
            ChatMessage.content,
        )
        .join(
            first_msg_subq,
            (ChatMessage.session_id == first_msg_subq.c.session_id)
            & (ChatMessage.created_at == first_msg_subq.c.first_ts),
        )
        .where(ChatMessage.role == "user")
        .subquery("first_content")
    )

    # Subquery: message count per session
    msg_count_subq = (
        select(
            ChatMessage.session_id,
            func.count(ChatMessage.id).label("message_count"),
        )
        .group_by(ChatMessage.session_id)
        .subquery("msg_count")
    )

    stmt = (
        select(
            ChatSession.id,
            ChatSession.updated_at,
            first_content_subq.c.content,
            msg_count_subq.c.message_count,
        )
        .where(ChatSession.user_id == uuid.UUID(user_id))
        .outerjoin(first_content_subq, ChatSession.id == first_content_subq.c.session_id)
        .outerjoin(msg_count_subq, ChatSession.id == msg_count_subq.c.session_id)
        .order_by(ChatSession.updated_at.desc())
        .limit(limit)
    )

    result = await db.execute(stmt)
    rows = result.all()

    sessions: list[dict[str, Any]] = []
    for row in rows:
        raw_content: str = row.content or ""
        title = raw_content[:50] + ("..." if len(raw_content) > 50 else "")
        sessions.append(
            {
                "id": str(row.id),
                "title": title,
                "updated_at": row.updated_at.isoformat(),
                "message_count": row.message_count or 0,
            }
        )
    return sessions


async def delete_session(db: AsyncSession, session_id: str, user_id: str) -> bool:
    """Delete a chat session and all its messages.

    The ``CASCADE`` constraint on ``chat_messages.session_id`` removes
    associated messages automatically at the database level.

    Args:
        db: Active database session.
        session_id: String UUID of the session to delete.
        user_id: String UUID of the requesting user (ownership check).

    Returns:
        ``True`` if the session was found and deleted, ``False`` otherwise.
    """
    stmt = (
        delete(ChatSession)
        .where(
            ChatSession.id == uuid.UUID(session_id),
            ChatSession.user_id == uuid.UUID(user_id),
        )
        .returning(ChatSession.id)
    )
    result = await db.execute(stmt)
    deleted = result.scalar_one_or_none()
    if deleted is not None:
        logger.debug("Deleted chat session %s for user %s", session_id, user_id)
        return True
    logger.debug("Session %s not found for user %s (delete no-op)", session_id, user_id)
    return False


# ---------------------------------------------------------------------------
# Message operations
# ---------------------------------------------------------------------------


async def add_message(
    db: AsyncSession,
    session_id: str,
    role: str,
    content: str,
    sources: list[Any] | None = None,
) -> str:
    """Append a message to an existing chat session.

    Args:
        db: Active database session.
        session_id: String UUID of the target session.
        role: ``"user"`` or ``"assistant"``.
        content: Text content of the message.
        sources: Optional list of source dicts to serialise as JSONB.

    Returns:
        The new message UUID as a string.
    """
    message = ChatMessage(
        session_id=uuid.UUID(session_id),
        role=role,
        content=content,
        sources=sources or [],
    )
    db.add(message)
    await db.flush()
    message_id = str(message.id)
    logger.debug("Added %s message %s to session %s", role, message_id, session_id)
    return message_id


async def get_session_messages(
    db: AsyncSession,
    session_id: str,
    user_id: str,
) -> list[dict[str, Any]]:
    """Return all messages for a session in chronological order.

    Verifies that the session belongs to ``user_id`` before returning
    any data — returns an empty list if the session does not exist or is
    not owned by the requesting user.

    Args:
        db: Active database session.
        session_id: String UUID of the target session.
        user_id: String UUID of the requesting user.

    Returns:
        Ordered list of message dicts with keys ``id``, ``role``,
        ``content``, ``sources``, and ``created_at``.
    """
    # Verify ownership
    session_stmt = select(ChatSession.id).where(
        ChatSession.id == uuid.UUID(session_id),
        ChatSession.user_id == uuid.UUID(user_id),
    )
    session_result = await db.execute(session_stmt)
    if session_result.scalar_one_or_none() is None:
        return []

    msg_stmt = (
        select(ChatMessage)
        .where(ChatMessage.session_id == uuid.UUID(session_id))
        .order_by(ChatMessage.created_at.asc())
    )
    result = await db.execute(msg_stmt)
    messages = result.scalars().all()

    return [
        {
            "id": str(msg.id),
            "role": msg.role,
            "content": msg.content,
            "sources": msg.sources or [],
            "created_at": msg.created_at.isoformat(),
        }
        for msg in messages
    ]


# ---------------------------------------------------------------------------
# Ownership helpers
# ---------------------------------------------------------------------------


async def session_belongs_to_user(
    db: AsyncSession,
    session_id: str,
    user_id: str,
) -> bool:
    """Check whether a session exists and belongs to the given user.

    Args:
        db: Active database session.
        session_id: String UUID of the target session.
        user_id: String UUID of the requesting user.

    Returns:
        ``True`` if the session exists and is owned by ``user_id``.
    """
    stmt = select(ChatSession.id).where(
        ChatSession.id == uuid.UUID(session_id),
        ChatSession.user_id == uuid.UUID(user_id),
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none() is not None


# ---------------------------------------------------------------------------
# Context helpers
# ---------------------------------------------------------------------------


async def get_session_context_messages(
    db: AsyncSession,
    session_id: str,
    user_id: str,
) -> list[dict[str, str]]:
    """Return messages formatted for the LLM conversation context.

    Fetches all messages in the session (after ownership verification)
    and returns them as a list of ``{"role": ..., "content": ...}``
    dicts suitable for passing to the LLM service.

    Args:
        db: Active database session.
        session_id: String UUID of the target session.
        user_id: String UUID of the requesting user.

    Returns:
        List of ``{"role", "content"}`` dicts ordered by creation time.
        Empty list if the session does not exist or is not owned by the user.
    """
    raw = await get_session_messages(db, session_id, user_id)
    return [{"role": m["role"], "content": m["content"]} for m in raw]
