"""Harvest session lifecycle management."""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, date, datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import HarvestQuestion, HarvestSession, User

logger = logging.getLogger(__name__)


async def create_session(
    db: AsyncSession,
    target_user_id: str,
    created_by: str,
    suspension_date: str,
) -> HarvestSession:
    """Create a new harvest session and flag user as suspended.

    Args:
        db: Active database session.
        target_user_id: UUID string of the suspended employee.
        created_by: UUID string of the user initiating the session.
        suspension_date: ISO date string (e.g. "2026-06-30").

    Returns:
        The newly created HarvestSession ORM object (not yet committed).
    """
    target_uid = uuid.UUID(target_user_id)
    creator_uid = uuid.UUID(created_by)

    # Flag user as suspended
    await db.execute(
        update(User)
        .where(User.id == target_uid)
        .values(
            employment_status="suspended",
            suspension_date=date.fromisoformat(suspension_date),
            suspension_flagged_by=creator_uid,
            suspension_flagged_at=datetime.now(UTC),
        )
    )

    session = HarvestSession(
        target_user_id=target_uid,
        created_by=creator_uid,
        status="active",
    )
    db.add(session)
    await db.flush()
    return session


async def add_questions(
    db: AsyncSession,
    session_id: uuid.UUID,
    questions: list[dict[str, str]],
) -> int:
    """Add generated questions to a session.

    Args:
        db: Active database session.
        session_id: UUID of the harvest session.
        questions: List of dicts with "category" and "question" keys.

    Returns:
        The number of questions added.
    """
    for q in questions:
        db.add(
            HarvestQuestion(
                session_id=session_id,
                category=q["category"],
                question=q["question"],
            )
        )
    await db.flush()

    # Update total count
    await db.execute(
        update(HarvestSession)
        .where(HarvestSession.id == session_id)
        .values(total_questions=len(questions))
    )
    await db.flush()
    return len(questions)


async def submit_answer(
    db: AsyncSession,
    question_id: str,
    answer: str,
    source: str = "web",
) -> HarvestQuestion | None:
    """Record an answer to a harvest question.

    Args:
        db: Active database session.
        question_id: UUID string of the question being answered.
        answer: The answer text.
        source: Origin of the answer ("web" or "telegram").

    Returns:
        The updated HarvestQuestion, or None if the question was not found.
    """
    qid = uuid.UUID(question_id)
    result = await db.execute(select(HarvestQuestion).where(HarvestQuestion.id == qid))
    question = result.scalar_one_or_none()
    if not question:
        return None

    question.answer = answer
    question.source = source
    question.answered_at = datetime.now(UTC)

    # Update session answered count
    await db.execute(
        update(HarvestSession)
        .where(HarvestSession.id == question.session_id)
        .values(answered_questions=HarvestSession.answered_questions + 1)
    )
    await db.flush()
    return question


async def get_session(db: AsyncSession, session_id: str) -> HarvestSession | None:
    """Get a harvest session by ID.

    Args:
        db: Active database session.
        session_id: UUID string of the session.

    Returns:
        The HarvestSession, or None if not found.
    """
    result = await db.execute(
        select(HarvestSession).where(HarvestSession.id == uuid.UUID(session_id))
    )
    return result.scalar_one_or_none()


async def list_sessions(db: AsyncSession) -> list[HarvestSession]:
    """List all harvest sessions ordered by creation date descending.

    Args:
        db: Active database session.

    Returns:
        List of HarvestSession objects.
    """
    result = await db.execute(select(HarvestSession).order_by(HarvestSession.created_at.desc()))
    return list(result.scalars().all())


async def get_session_questions(
    db: AsyncSession,
    session_id: str,
    category: str | None = None,
) -> list[HarvestQuestion]:
    """Get questions for a session, optionally filtered by category.

    Args:
        db: Active database session.
        session_id: UUID string of the session.
        category: Optional category filter ("project", "process", "client",
            "tool", or "team").

    Returns:
        List of HarvestQuestion objects ordered by asked_at.
    """
    stmt = select(HarvestQuestion).where(HarvestQuestion.session_id == uuid.UUID(session_id))
    if category:
        stmt = stmt.where(HarvestQuestion.category == category)
    stmt = stmt.order_by(HarvestQuestion.asked_at)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def pause_session(db: AsyncSession, session_id: str) -> bool:
    """Pause an active harvest session.

    Args:
        db: Active database session.
        session_id: UUID string of the session to pause.

    Returns:
        True if the session was paused, False if it was not in "active" state.
    """
    result = await db.execute(
        update(HarvestSession)
        .where(
            HarvestSession.id == uuid.UUID(session_id),
            HarvestSession.status == "active",
        )
        .values(status="paused")
    )
    await db.flush()
    return result.rowcount > 0


async def resume_session(db: AsyncSession, session_id: str) -> bool:
    """Resume a paused harvest session.

    Args:
        db: Active database session.
        session_id: UUID string of the session to resume.

    Returns:
        True if the session was resumed, False if it was not in "paused" state.
    """
    result = await db.execute(
        update(HarvestSession)
        .where(
            HarvestSession.id == uuid.UUID(session_id),
            HarvestSession.status == "paused",
        )
        .values(status="active")
    )
    await db.flush()
    return result.rowcount > 0
