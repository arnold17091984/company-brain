"""Analytics endpoints – aggregated usage metrics from the database."""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import User, get_current_user
from app.core.database import get_db
from app.models.database import ChatMessage, ChatSession, Department, Document, User as DBUser

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/analytics", tags=["analytics"])


def _start_of_day(dt: datetime) -> datetime:
    """Return midnight UTC for the given datetime.

    Args:
        dt: Any UTC-aware or naive datetime.

    Returns:
        A timezone-aware datetime at 00:00:00 UTC for the same calendar date.
    """
    return datetime(dt.year, dt.month, dt.day, tzinfo=UTC)


def _start_of_week(dt: datetime) -> datetime:
    """Return midnight UTC for the Monday of the ISO week containing ``dt``.

    Args:
        dt: Any UTC-aware or naive datetime.

    Returns:
        A timezone-aware datetime at 00:00:00 UTC for the Monday of that week.
    """
    iso_day = dt.weekday()  # Monday=0, Sunday=6
    monday = dt - timedelta(days=iso_day)
    return datetime(monday.year, monday.month, monday.day, tzinfo=UTC)


@router.get("/overview")
async def get_overview(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Return high-level usage metrics for the Company Brain dashboard.

    Queries live data from the database for:

    - **queries_today**: Total user messages sent today (UTC).
    - **active_users_today**: Distinct users who had an active session today.
    - **documents_this_week**: Documents indexed since the start of the
      current ISO week.

    Args:
        current_user: Injected authenticated user.
        db: Injected database session.

    Returns:
        dict: Overview metrics with integer counts and the timestamp at
        which the snapshot was taken.
    """
    logger.info("Analytics overview requested", extra={"user": current_user.email})

    now = datetime.now(tz=UTC)
    today_start = _start_of_day(now)
    week_start = _start_of_week(now)

    # Total user messages today
    queries_today_stmt = select(func.count(ChatMessage.id)).where(
        ChatMessage.role == "user",
        ChatMessage.created_at >= today_start,
    )
    queries_today_result = await db.execute(queries_today_stmt)
    queries_today: int = queries_today_result.scalar_one() or 0

    # Distinct users with activity today (via ChatSession.updated_at)
    active_users_stmt = select(func.count(func.distinct(ChatSession.user_id))).where(
        ChatSession.updated_at >= today_start,
    )
    active_users_result = await db.execute(active_users_stmt)
    active_users_today: int = active_users_result.scalar_one() or 0

    # Documents indexed this week
    docs_this_week_stmt = select(func.count(Document.id)).where(
        Document.indexed_at >= week_start,
    )
    docs_this_week_result = await db.execute(docs_this_week_stmt)
    documents_this_week: int = docs_this_week_result.scalar_one() or 0

    return {
        "queries_today": queries_today,
        "active_users_today": active_users_today,
        "documents_this_week": documents_this_week,
        "snapshot_at": now.isoformat(),
    }


@router.get("/departments")
async def get_department_activity(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """Return per-department query counts for the current ISO week.

    Joins ``ChatMessage`` -> ``ChatSession`` -> ``User`` -> ``Department``
    to count user-role messages grouped by department name.  Sessions
    whose users have no department are grouped under ``"Unassigned"``.

    Args:
        current_user: Injected authenticated user.
        db: Injected database session.

    Returns:
        list[dict]: Each entry has ``department`` (str) and
        ``query_count`` (int), sorted descending by count.
    """
    logger.info("Department activity requested", extra={"user": current_user.email})

    week_start = _start_of_week(datetime.now(tz=UTC))

    # Join chain: ChatMessage -> ChatSession -> DBUser -> Department (left join)
    stmt = (
        select(
            func.coalesce(Department.name, "Unassigned").label("department"),
            func.count(ChatMessage.id).label("query_count"),
        )
        .join(ChatSession, ChatMessage.session_id == ChatSession.id)
        .join(DBUser, ChatSession.user_id == DBUser.id)
        .outerjoin(Department, DBUser.department_id == Department.id)
        .where(
            ChatMessage.role == "user",
            ChatMessage.created_at >= week_start,
        )
        .group_by(Department.name)
        .order_by(func.count(ChatMessage.id).desc())
    )

    result = await db.execute(stmt)
    rows = result.all()

    return [
        {"department": row.department, "query_count": row.query_count}
        for row in rows
    ]


@router.get("/usage")
async def get_usage_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """Return daily query counts for the last 7 calendar days (UTC).

    Generates entries for every day in the window (even days with zero
    queries), so the frontend can always render a full 7-day sparkline
    without needing to handle missing dates.

    Args:
        current_user: Injected authenticated user.
        db: Injected database session.

    Returns:
        list[dict]: Entries ordered oldest-first with ``date`` (ISO 8601
        date string) and ``count`` (int).
    """
    logger.info("Usage stats requested", extra={"user": current_user.email})

    now = datetime.now(tz=UTC)
    # Build the 7-day window: [6 days ago 00:00 UTC .. now)
    window_start = _start_of_day(now - timedelta(days=6))

    # Cast created_at to a date and count per day
    stmt = (
        select(
            func.date(ChatMessage.created_at).label("query_date"),
            func.count(ChatMessage.id).label("count"),
        )
        .where(
            ChatMessage.role == "user",
            ChatMessage.created_at >= window_start,
        )
        .group_by(func.date(ChatMessage.created_at))
        .order_by(func.date(ChatMessage.created_at))
    )

    result = await db.execute(stmt)
    rows = result.all()

    # Build a lookup from the DB results
    db_counts: dict[date, int] = {row.query_date: row.count for row in rows}

    # Produce one entry per day, filling zeros where no data exists
    daily_stats: list[dict[str, Any]] = []
    for days_back in range(6, -1, -1):
        target_date = (now - timedelta(days=days_back)).date()
        daily_stats.append(
            {
                "date": target_date.isoformat(),
                "count": db_counts.get(target_date, 0),
            }
        )

    return daily_stats
