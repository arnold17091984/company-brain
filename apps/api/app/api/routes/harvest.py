"""Harvest API endpoints for knowledge collection from suspended employees."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import User, get_current_user
from app.core.database import get_db
from app.models.database import User as DBUser
from app.models.schemas import (
    HarvestAnswerSubmit,
    HarvestQuestionDetail,
    HarvestSessionCreate,
    HarvestSessionDetail,
    HarvestSessionSummary,
)
from app.services.harvest import question_generator, session_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/harvest", tags=["harvest"])

_ALLOWED_ROLES: frozenset[str] = frozenset({"ceo", "executive", "hr", "manager", "admin"})


def _check_harvest_permission(user: User) -> None:
    """Raise 403 if user does not have harvest management permission.

    Args:
        user: The currently authenticated request user.

    Raises:
        HTTPException: 403 when the user's role is not in the allowed set.
    """
    if user.role not in _ALLOWED_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only CEO, HR, managers, and admins can manage harvest sessions.",
        )


async def _load_target_user(db: AsyncSession, target_user_id: object) -> DBUser:
    """Load a DB user by their UUID, raising 404 if not found.

    Args:
        db: Active database session.
        target_user_id: UUID (or UUID-compatible) of the target user.

    Returns:
        The matching DBUser ORM object.

    Raises:
        HTTPException: 404 when the user does not exist.
    """
    result = await db.execute(select(DBUser).where(DBUser.id == target_user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target user not found")
    return target


def _progress_pct(answered: int, total: int) -> float:
    """Compute rounded progress percentage.

    Args:
        answered: Number of answered questions.
        total: Total number of questions.

    Returns:
        Percentage rounded to one decimal place, or 0.0 when total is zero.
    """
    if not total:
        return 0.0
    return round(answered / total * 100, 1)


@router.post("/sessions", response_model=HarvestSessionSummary, status_code=status.HTTP_201_CREATED)
async def create_session(
    body: HarvestSessionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> HarvestSessionSummary:
    """Create a knowledge harvest session for a suspended employee.

    Flags the target employee as suspended, generates AI-powered questions
    using Claude Sonnet, and persists the session in a single transaction.

    Args:
        body: Target user ID and suspension date.
        current_user: Authenticated caller (must have harvest permission).
        db: Database session.

    Returns:
        Summary of the newly created harvest session.
    """
    _check_harvest_permission(current_user)

    session = await session_manager.create_session(
        db,
        target_user_id=body.target_user_id,
        created_by=current_user.id,
        suspension_date=body.suspension_date,
    )

    target = await _load_target_user(db, session.target_user_id)

    questions = await question_generator.generate_questions(
        db,
        user_name=target.name,
        job_title=target.job_title,
        department=None,
    )
    await session_manager.add_questions(db, session.id, questions)
    await db.commit()

    return HarvestSessionSummary(
        id=str(session.id),
        target_user_name=target.name,
        target_user_email=target.email,
        status=session.status,
        total_questions=len(questions),
        answered_questions=0,
        progress_percent=0.0,
        created_at=str(session.created_at),
        suspension_date=body.suspension_date,
    )


@router.get("/sessions", response_model=list[HarvestSessionSummary])
async def list_sessions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[HarvestSessionSummary]:
    """List all harvest sessions ordered by creation date descending.

    Args:
        current_user: Authenticated caller (must have harvest permission).
        db: Database session.

    Returns:
        List of session summaries.
    """
    _check_harvest_permission(current_user)

    sessions = await session_manager.list_sessions(db)
    results: list[HarvestSessionSummary] = []
    for s in sessions:
        result = await db.execute(select(DBUser).where(DBUser.id == s.target_user_id))
        target = result.scalar_one_or_none()
        results.append(
            HarvestSessionSummary(
                id=str(s.id),
                target_user_name=target.name if target else "Unknown",
                target_user_email=target.email if target else "",
                status=s.status,
                total_questions=s.total_questions,
                answered_questions=s.answered_questions,
                progress_percent=_progress_pct(s.answered_questions, s.total_questions),
                created_at=str(s.created_at),
                suspension_date=(
                    str(target.suspension_date) if target and target.suspension_date else None
                ),
            )
        )
    return results


@router.get("/sessions/{session_id}", response_model=HarvestSessionDetail)
async def get_session_detail(
    session_id: str,
    category: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> HarvestSessionDetail:
    """Get full session detail including all questions (optionally filtered).

    Args:
        session_id: UUID string of the harvest session.
        category: Optional category filter for questions.
        current_user: Authenticated caller (must have harvest permission).
        db: Database session.

    Returns:
        Full session detail with question list.

    Raises:
        HTTPException: 404 when the session does not exist.
    """
    _check_harvest_permission(current_user)

    session = await session_manager.get_session(db, session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    questions = await session_manager.get_session_questions(db, session_id, category)

    result = await db.execute(select(DBUser).where(DBUser.id == session.target_user_id))
    target = result.scalar_one_or_none()

    return HarvestSessionDetail(
        id=str(session.id),
        target_user_name=target.name if target else "Unknown",
        target_user_email=target.email if target else "",
        status=session.status,
        total_questions=session.total_questions,
        answered_questions=session.answered_questions,
        progress_percent=_progress_pct(session.answered_questions, session.total_questions),
        created_at=str(session.created_at),
        suspension_date=(
            str(target.suspension_date)
            if target and target.suspension_date
            else None
        ),
        questions=[
            HarvestQuestionDetail(
                id=str(q.id),
                category=q.category,
                question=q.question,
                answer=q.answer,
                answer_quality=q.answer_quality,
                source=q.source,
                asked_at=str(q.asked_at),
                answered_at=str(q.answered_at) if q.answered_at else None,
            )
            for q in questions
        ],
    )


@router.post("/answer", status_code=status.HTTP_200_OK)
async def submit_answer(
    body: HarvestAnswerSubmit,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Submit an answer to a harvest question.

    Args:
        body: Question ID, answer text, and source.
        current_user: Authenticated caller (any authenticated user may answer).
        db: Database session.

    Returns:
        Confirmation dict with status and question_id.

    Raises:
        HTTPException: 404 when the question does not exist.
    """
    question = await session_manager.submit_answer(db, body.question_id, body.answer, body.source)
    if not question:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")
    await db.commit()
    return {"status": "ok", "question_id": body.question_id}


@router.patch("/sessions/{session_id}/pause")
async def pause_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Pause an active harvest session.

    Args:
        session_id: UUID string of the session to pause.
        current_user: Authenticated caller (must have harvest permission).
        db: Database session.

    Returns:
        Confirmation dict with updated status.

    Raises:
        HTTPException: 400 when the session is not in "active" state.
    """
    _check_harvest_permission(current_user)
    ok = await session_manager.pause_session(db, session_id)
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Session cannot be paused (not found or not active)",
        )
    await db.commit()
    return {"status": "paused"}


@router.patch("/sessions/{session_id}/resume")
async def resume_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Resume a paused harvest session.

    Args:
        session_id: UUID string of the session to resume.
        current_user: Authenticated caller (must have harvest permission).
        db: Database session.

    Returns:
        Confirmation dict with updated status.

    Raises:
        HTTPException: 400 when the session is not in "paused" state.
    """
    _check_harvest_permission(current_user)
    ok = await session_manager.resume_session(db, session_id)
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Session cannot be resumed (not found or not paused)",
        )
    await db.commit()
    return {"status": "active"}
