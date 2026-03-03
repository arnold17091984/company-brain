"""Analytics endpoints – aggregated usage metrics from the database."""

from __future__ import annotations

import logging
import re
import uuid
from collections import Counter
from datetime import UTC, date, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import User, get_current_user
from app.core.database import get_db
from app.models.database import AuditLog, ChatMessage, ChatSession, Department, Document
from app.models.database import KPIRecord, MonthlyROIReport, UsageMetricsDaily
from app.models.database import User as DBUser
from app.models.schemas import (
    ConnectorStatus,
    CorrelationDataPoint,
    DocumentRecommendation,
    KPIRecordCreate,
    KPIRecordResponse,
    LogEntry,
    LogListResponse,
    QuestionCluster,
    ROIReportResponse,
    UsageMetricResponse,
)
from app.services.types import ConnectorType

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

    # Total registered users
    total_users_stmt = select(func.count(DBUser.id))
    total_users_result = await db.execute(total_users_stmt)
    total_users: int = total_users_result.scalar_one() or 0

    return {
        "queries_today": queries_today,
        "active_users_today": active_users_today,
        "documents_this_week": documents_this_week,
        "total_users": total_users,
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

    return [{"department": row.department, "query_count": row.query_count} for row in rows]


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


# ---------------------------------------------------------------------------
# Helpers for Phase 3 endpoints
# ---------------------------------------------------------------------------

# Common English stop-words that carry no topical signal.
_STOP_WORDS: frozenset[str] = frozenset(
    {
        "a",
        "an",
        "the",
        "is",
        "are",
        "was",
        "were",
        "be",
        "been",
        "being",
        "have",
        "has",
        "had",
        "do",
        "does",
        "did",
        "will",
        "would",
        "could",
        "should",
        "may",
        "might",
        "shall",
        "can",
        "need",
        "dare",
        "ought",
        "used",
        "to",
        "of",
        "in",
        "on",
        "at",
        "by",
        "for",
        "with",
        "about",
        "against",
        "between",
        "into",
        "through",
        "during",
        "before",
        "after",
        "above",
        "below",
        "from",
        "up",
        "down",
        "out",
        "off",
        "over",
        "under",
        "again",
        "then",
        "once",
        "and",
        "but",
        "or",
        "nor",
        "so",
        "yet",
        "both",
        "either",
        "neither",
        "not",
        "only",
        "own",
        "same",
        "than",
        "too",
        "very",
        "just",
        "i",
        "me",
        "my",
        "we",
        "our",
        "you",
        "your",
        "he",
        "she",
        "it",
        "they",
        "them",
        "their",
        "what",
        "which",
        "who",
        "whom",
        "this",
        "that",
        "these",
        "those",
        "how",
        "when",
        "where",
        "why",
        "all",
        "each",
        "every",
        "no",
        "any",
        "more",
        "most",
        "other",
        "such",
        "if",
    }
)

# Phrases that indicate a zero-result / no-answer assistant reply.
_NO_ANSWER_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"not found in", re.IGNORECASE),
    re.compile(r"not find", re.IGNORECASE),
    re.compile(r"couldn.t find", re.IGNORECASE),
    re.compile(r"could not find", re.IGNORECASE),
    re.compile(r"no information", re.IGNORECASE),
    re.compile(r"no relevant", re.IGNORECASE),
    re.compile(r"don.t have information", re.IGNORECASE),
    re.compile(r"do not have information", re.IGNORECASE),
    re.compile(r"knowledge base does not", re.IGNORECASE),
    re.compile(r"answer was not found", re.IGNORECASE),
    re.compile(r"unable to find", re.IGNORECASE),
    re.compile(r"not available", re.IGNORECASE),
)

_MIN_KEYWORD_LEN = 3
_TOP_N = 10


def _extract_keywords(text: str) -> list[str]:
    """Return meaningful words from *text* after stripping stop-words.

    Args:
        text: Raw text from a chat message or query string.

    Returns:
        List of lower-cased alphabetic tokens that are not stop-words and
        are at least ``_MIN_KEYWORD_LEN`` characters long.
    """
    tokens = re.findall(r"[a-zA-Z]+", text.lower())
    return [t for t in tokens if t not in _STOP_WORDS and len(t) >= _MIN_KEYWORD_LEN]


def _is_no_answer_reply(content: str) -> bool:
    """Return True when an assistant message indicates no useful result was found.

    Args:
        content: The assistant message text to evaluate.

    Returns:
        ``True`` when the content matches any of the no-answer heuristic patterns.
    """
    return any(pat.search(content) for pat in _NO_ANSWER_PATTERNS)


# ---------------------------------------------------------------------------
# Phase 3 endpoints
# ---------------------------------------------------------------------------


@router.get("/clusters", response_model=list[QuestionCluster])
async def get_question_clusters(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[QuestionCluster]:
    """Return clusters of similar questions from the last 7 days of chat history.

    Groups user messages by their most frequent non-stop keyword to produce
    topic clusters without requiring an ML pipeline.  Returns the top 10
    clusters ordered by descending message count.

    Args:
        current_user: Injected authenticated user.
        db: Injected database session.

    Returns:
        list[QuestionCluster]: Top clusters with label, count and up to 3
        representative sample queries.
    """
    logger.info("Question clusters requested", extra={"user": current_user.email})

    window_start = _start_of_day(datetime.now(tz=UTC) - timedelta(days=6))
    stmt = select(ChatMessage.content).where(
        ChatMessage.role == "user",
        ChatMessage.created_at >= window_start,
    )
    result = await db.execute(stmt)
    messages: list[str] = [row[0] for row in result.all()]

    if not messages:
        return []

    # Map each message to its single most-representative keyword.
    keyword_to_queries: dict[str, list[str]] = {}
    for msg in messages:
        keywords = _extract_keywords(msg)
        if not keywords:
            continue
        # Use the most common keyword in the message as the cluster label.
        keyword_counter: Counter[str] = Counter(keywords)
        top_keyword = keyword_counter.most_common(1)[0][0]
        keyword_to_queries.setdefault(top_keyword, []).append(msg)

    # Build top-N clusters sorted by message count descending.
    sorted_clusters = sorted(keyword_to_queries.items(), key=lambda kv: len(kv[1]), reverse=True)

    clusters: list[QuestionCluster] = []
    for label, queries in sorted_clusters[:_TOP_N]:
        clusters.append(
            QuestionCluster(
                label=label,
                count=len(queries),
                sample_queries=queries[:3],
            )
        )

    return clusters


@router.get("/recommendations", response_model=list[DocumentRecommendation])
async def get_recommendations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[DocumentRecommendation]:
    """Return document gap recommendations derived from unanswered queries.

    Identifies assistant messages that matched no-answer heuristics and maps
    them back to the preceding user message.  Groups unanswered queries by
    keyword to surface content gaps, assigning priority based on query volume.

    Args:
        current_user: Injected authenticated user.
        db: Injected database session.

    Returns:
        list[DocumentRecommendation]: Top content gaps ordered by descending
        query count with high/medium/low priority labels.
    """
    logger.info("Recommendations requested", extra={"user": current_user.email})

    window_start = _start_of_day(datetime.now(tz=UTC) - timedelta(days=6))

    # Fetch all messages from the window ordered by session and creation time.
    stmt = (
        select(ChatMessage.session_id, ChatMessage.role, ChatMessage.content)
        .where(ChatMessage.created_at >= window_start)
        .order_by(ChatMessage.session_id, ChatMessage.created_at)
    )
    result = await db.execute(stmt)
    rows = result.all()

    # Pair each assistant no-answer reply with the previous user message.
    unanswered_queries: list[str] = []
    last_user_msg: dict[Any, str] = {}
    for session_id, role, content in rows:
        if role == "user":
            last_user_msg[session_id] = content
        elif role == "assistant" and _is_no_answer_reply(content):
            prior = last_user_msg.get(session_id)
            if prior:
                unanswered_queries.append(prior)

    if not unanswered_queries:
        return []

    # Cluster by dominant keyword.
    keyword_counts: Counter[str] = Counter()
    for query in unanswered_queries:
        keywords = _extract_keywords(query)
        if keywords:
            keyword_counter: Counter[str] = Counter(keywords)
            top_keyword = keyword_counter.most_common(1)[0][0]
            keyword_counts[top_keyword] += 1

    recommendations: list[DocumentRecommendation] = []
    for topic, count in keyword_counts.most_common(_TOP_N):
        if count >= 5:
            priority = "high"
        elif count >= 2:
            priority = "medium"
        else:
            priority = "low"
        recommendations.append(
            DocumentRecommendation(topic=topic, query_count=count, priority=priority)
        )

    return recommendations


@router.get("/ingestion-status", response_model=list[ConnectorStatus])
async def get_ingestion_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ConnectorStatus]:
    """Return the sync status and document counts for each connector.

    Queries the ``documents`` table grouped by ``source_type`` — mirroring
    the ``/knowledge/sources`` logic — and merges the result with the static
    connector registry so every connector always appears in the response.

    Args:
        current_user: Injected authenticated user.
        db: Injected database session.

    Returns:
        list[ConnectorStatus]: One entry per connector with status, document
        count and the ISO-8601 timestamp of the most recent index operation.
    """
    logger.info("Ingestion status requested", extra={"user": current_user.email})

    stmt = select(
        Document.source_type,
        func.count(Document.id).label("document_count"),
        func.max(Document.indexed_at).label("last_synced_at"),
    ).group_by(Document.source_type)
    result = await db.execute(stmt)
    rows = result.all()

    db_data: dict[str, dict[str, Any]] = {}
    for row in rows:
        db_data[row.source_type] = {
            "document_count": row.document_count,
            "last_synced": row.last_synced_at.isoformat() if row.last_synced_at else None,
        }

    connectors = [ConnectorType.GOOGLE_DRIVE, ConnectorType.TELEGRAM, ConnectorType.NOTION]
    statuses: list[ConnectorStatus] = []
    for connector in connectors:
        row_data = db_data.get(connector, {})
        doc_count: int = row_data.get("document_count", 0)
        statuses.append(
            ConnectorStatus(
                connector=connector,
                status="active" if doc_count > 0 else "inactive",
                document_count=doc_count,
                last_synced=row_data.get("last_synced"),
                error=None,
            )
        )

    return statuses


@router.get("/logs", response_model=LogListResponse)
async def get_logs(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    page: int = Query(default=1, ge=1, description="Page number (1-indexed)."),
    page_size: int = Query(default=50, ge=1, le=200, description="Rows per page."),
) -> LogListResponse:
    """Return paginated agent execution logs from the AuditLog table.

    Joins ``AuditLog`` with ``User`` to resolve the email address of the
    acting user.  Results are ordered newest-first.

    Args:
        current_user: Injected authenticated user.
        db: Injected database session.
        page: 1-indexed page number (default 1).
        page_size: Number of rows per page (default 50, max 200).

    Returns:
        LogListResponse: Paginated log entries with total row count.
    """
    logger.info("Agent logs requested", extra={"user": current_user.email, "page": page})

    offset = (page - 1) * page_size

    # Total row count
    count_stmt = select(func.count(AuditLog.id))
    count_result = await db.execute(count_stmt)
    total: int = count_result.scalar_one() or 0

    # Paginated rows joined to users for the email
    rows_stmt = (
        select(
            AuditLog.id,
            DBUser.email.label("user_email"),
            AuditLog.action,
            AuditLog.query,
            AuditLog.created_at,
            AuditLog.metadata_,
        )
        .join(DBUser, AuditLog.user_id == DBUser.id)
        .order_by(AuditLog.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    rows_result = await db.execute(rows_stmt)
    rows = rows_result.all()

    log_entries: list[LogEntry] = [
        LogEntry(
            id=str(row.id),
            user_email=row.user_email,
            action=row.action,
            query=row.query,
            created_at=row.created_at.isoformat(),
            metadata=row.metadata_ or {},
        )
        for row in rows
    ]

    return LogListResponse(
        logs=log_entries,
        total=total,
        page=page,
        page_size=page_size,
    )


# ---------------------------------------------------------------------------
# Feature 4: ROI Analytics endpoints
# ---------------------------------------------------------------------------


@router.get("/usage-metrics", response_model=list[UsageMetricResponse])
async def get_usage_metrics(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    period: str | None = Query(
        default=None,
        description="ISO period string e.g. '2026-03'. Omit for all time.",
        pattern=r"^\d{4}-\d{2}$",
    ),
    department_id: str | None = Query(
        default=None,
        description="Filter by department UUID.",
    ),
) -> list[UsageMetricResponse]:
    """Return per-user daily usage metrics from the usage_metrics_daily table.

    Optionally filtered by period (YYYY-MM) and/or department.  The response
    joins ``User`` and ``Department`` to resolve human-readable names.

    Args:
        current_user: Injected authenticated user.
        db: Injected database session.
        period: Optional month filter in ``YYYY-MM`` format.
        department_id: Optional department UUID to filter results.

    Returns:
        list[UsageMetricResponse]: Rows ordered newest-first.
    """
    logger.info(
        "Usage metrics requested",
        extra={"user": current_user.email, "period": period, "department_id": department_id},
    )

    stmt = (
        select(
            UsageMetricsDaily,
            DBUser.name.label("user_name"),
            DBUser.email.label("user_email"),
            Department.name.label("department_name"),
        )
        .join(DBUser, UsageMetricsDaily.user_id == DBUser.id)
        .outerjoin(Department, UsageMetricsDaily.department_id == Department.id)
    )

    if period:
        # Parse "2026-03" into first and last day of that month
        try:
            year_str, month_str = period.split("-")
            year, month = int(year_str), int(month_str)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="period must be in YYYY-MM format",
            )
        from calendar import monthrange

        first_day = date(year, month, 1)
        last_day = date(year, month, monthrange(year, month)[1])
        stmt = stmt.where(
            UsageMetricsDaily.date >= first_day,
            UsageMetricsDaily.date <= last_day,
        )

    if department_id:
        try:
            dept_uuid = uuid.UUID(department_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="department_id must be a valid UUID",
            )
        stmt = stmt.where(UsageMetricsDaily.department_id == dept_uuid)

    stmt = stmt.order_by(UsageMetricsDaily.date.desc())

    result = await db.execute(stmt)
    rows = result.all()

    return [
        UsageMetricResponse(
            user_id=str(row.UsageMetricsDaily.user_id),
            user_name=row.user_name or "",
            user_email=row.user_email or "",
            department_name=row.department_name,
            date=row.UsageMetricsDaily.date.isoformat(),
            query_count=row.UsageMetricsDaily.query_count,
            total_input_tokens=row.UsageMetricsDaily.total_input_tokens,
            total_output_tokens=row.UsageMetricsDaily.total_output_tokens,
            avg_latency_ms=row.UsageMetricsDaily.avg_latency_ms,
            feedback_up=row.UsageMetricsDaily.feedback_up,
            feedback_down=row.UsageMetricsDaily.feedback_down,
        )
        for row in rows
    ]


@router.get("/correlation", response_model=list[CorrelationDataPoint])
async def get_correlation(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    period: str = Query(
        ...,
        description="ISO period string e.g. '2026-03'.",
        pattern=r"^\d{4}-\d{2}$",
    ),
) -> list[CorrelationDataPoint]:
    """Return AI usage vs KPI scatter data for the given period.

    Sums ``usage_metrics_daily`` per user for the period, then joins with
    ``kpi_records`` to produce one data point per user who has both usage and
    KPI data.

    Args:
        current_user: Injected authenticated user.
        db: Injected database session.
        period: Month filter in ``YYYY-MM`` format (required).

    Returns:
        list[CorrelationDataPoint]: One scatter point per matched user.
    """
    logger.info(
        "Correlation data requested", extra={"user": current_user.email, "period": period}
    )

    try:
        year_str, month_str = period.split("-")
        year, month = int(year_str), int(month_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="period must be in YYYY-MM format",
        )

    from calendar import monthrange

    first_day = date(year, month, 1)
    last_day = date(year, month, monthrange(year, month)[1])

    # Aggregate usage per user for the period
    usage_stmt = (
        select(
            UsageMetricsDaily.user_id,
            func.sum(UsageMetricsDaily.query_count).label("query_count"),
            func.sum(
                UsageMetricsDaily.total_input_tokens + UsageMetricsDaily.total_output_tokens
            ).label("total_tokens"),
        )
        .where(
            UsageMetricsDaily.date >= first_day,
            UsageMetricsDaily.date <= last_day,
        )
        .group_by(UsageMetricsDaily.user_id)
    )
    usage_result = await db.execute(usage_stmt)
    usage_rows = usage_result.all()

    if not usage_rows:
        return []

    # Build a user_id -> (query_count, total_tokens) lookup
    usage_map: dict[str, dict[str, int]] = {
        str(r.user_id): {
            "query_count": int(r.query_count),
            "total_tokens": int(r.total_tokens),
        }
        for r in usage_rows
    }

    # Fetch KPI records for the period and average achievement per user
    kpi_stmt = (
        select(
            KPIRecord.user_id,
            func.avg(KPIRecord.achievement_pct).label("avg_achievement"),
        )
        .where(KPIRecord.period == period)
        .group_by(KPIRecord.user_id)
    )
    kpi_result = await db.execute(kpi_stmt)
    kpi_rows = kpi_result.all()

    if not kpi_rows:
        return []

    # Join with user info and build response
    points: list[CorrelationDataPoint] = []
    for kpi_row in kpi_rows:
        uid = str(kpi_row.user_id)
        if uid not in usage_map:
            # No usage data for this user in the period – skip
            continue

        # Fetch user name and department
        user_stmt = (
            select(DBUser.name, Department.name.label("dept_name"))
            .outerjoin(Department, DBUser.department_id == Department.id)
            .where(DBUser.id == kpi_row.user_id)
        )
        user_result = await db.execute(user_stmt)
        user_row = user_result.one_or_none()
        user_name = user_row.name if user_row else uid
        department_name: str | None = user_row.dept_name if user_row else None

        usage = usage_map[uid]
        points.append(
            CorrelationDataPoint(
                user_id=uid,
                user_name=user_name,
                department_name=department_name,
                query_count=usage["query_count"],
                total_tokens=usage["total_tokens"],
                kpi_achievement_pct=round(float(kpi_row.avg_achievement), 1),
            )
        )

    return points


@router.get("/roi-reports", response_model=list[ROIReportResponse])
async def get_roi_reports(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ROIReportResponse]:
    """Return all monthly ROI reports ordered by period descending.

    Args:
        current_user: Injected authenticated user.
        db: Injected database session.

    Returns:
        list[ROIReportResponse]: All available monthly ROI reports,
        newest period first.
    """
    logger.info("ROI reports requested", extra={"user": current_user.email})

    stmt = select(MonthlyROIReport).order_by(MonthlyROIReport.period.desc())
    result = await db.execute(stmt)
    reports = result.scalars().all()

    return [
        ROIReportResponse(
            id=str(report.id),
            period=report.period,
            total_queries=report.total_queries,
            total_tokens=report.total_tokens,
            active_users=report.active_users,
            avg_satisfaction_pct=report.avg_satisfaction_pct,
            estimated_hours_saved=report.estimated_hours_saved,
            estimated_cost_usd=report.estimated_cost_usd,
            department_breakdown=report.department_breakdown,
            kpi_correlation=report.kpi_correlation,
            report_markdown=report.report_markdown,
            created_at=report.created_at.isoformat(),
        )
        for report in reports
    ]


@router.post("/kpi", response_model=KPIRecordResponse, status_code=status.HTTP_201_CREATED)
async def create_kpi_record(
    body: KPIRecordCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> KPIRecordResponse:
    """Manually input a KPI record for a user.

    Calculates ``achievement_pct`` as ``(actual_value / target_value) * 100``
    when ``target_value > 0``, otherwise defaults to ``0.0``.

    Args:
        body: KPI record creation payload.
        current_user: Injected authenticated user.
        db: Injected database session.

    Returns:
        KPIRecordResponse: The newly created KPI record.
    """
    logger.info(
        "KPI record creation requested",
        extra={"user": current_user.email, "period": body.period, "kpi_name": body.kpi_name},
    )

    # Validate user_id
    try:
        user_uuid = uuid.UUID(body.user_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="user_id must be a valid UUID",
        )

    dept_uuid: uuid.UUID | None = None
    if body.department_id:
        try:
            dept_uuid = uuid.UUID(body.department_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="department_id must be a valid UUID",
            )

    # Calculate achievement percentage
    if body.target_value > 0:
        achievement_pct = round(body.actual_value / body.target_value * 100, 2)
    else:
        achievement_pct = 0.0

    kpi_record = KPIRecord(
        user_id=user_uuid,
        department_id=dept_uuid,
        period=body.period,
        kpi_name=body.kpi_name,
        target_value=body.target_value,
        actual_value=body.actual_value,
        achievement_pct=achievement_pct,
    )
    db.add(kpi_record)
    await db.flush()  # populate kpi_record.id before committing

    # Resolve user name for response
    user_name_result = await db.execute(
        select(DBUser.name).where(DBUser.id == user_uuid)
    )
    user_name_row = user_name_result.one_or_none()
    user_name = user_name_row.name if user_name_row else ""

    await db.commit()

    logger.info(
        "KPI record created for user %s, period %s, achievement %.1f%%",
        body.user_id,
        body.period,
        achievement_pct,
    )

    return KPIRecordResponse(
        id=str(kpi_record.id),
        user_id=str(kpi_record.user_id),
        user_name=user_name,
        department_id=str(kpi_record.department_id) if kpi_record.department_id else None,
        period=kpi_record.period,
        kpi_name=kpi_record.kpi_name,
        target_value=kpi_record.target_value,
        actual_value=kpi_record.actual_value,
        achievement_pct=kpi_record.achievement_pct,
    )


@router.put("/kpi/{kpi_id}", response_model=KPIRecordResponse)
async def update_kpi_record(
    kpi_id: str,
    body: KPIRecordCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> KPIRecordResponse:
    """Update an existing KPI record."""
    try:
        kid = uuid.UUID(kpi_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="kpi_id must be a valid UUID",
        )

    result = await db.execute(select(KPIRecord).where(KPIRecord.id == kid))
    kpi = result.scalar_one_or_none()
    if kpi is None:
        raise HTTPException(status_code=404, detail="KPI record not found.")

    # Validate user_id
    try:
        user_uuid = uuid.UUID(body.user_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="user_id must be a valid UUID",
        )

    dept_uuid: uuid.UUID | None = None
    if body.department_id:
        try:
            dept_uuid = uuid.UUID(body.department_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="department_id must be a valid UUID",
            )

    if body.target_value > 0:
        achievement_pct = round(body.actual_value / body.target_value * 100, 2)
    else:
        achievement_pct = 0.0

    kpi.user_id = user_uuid
    kpi.department_id = dept_uuid
    kpi.period = body.period
    kpi.kpi_name = body.kpi_name
    kpi.target_value = body.target_value
    kpi.actual_value = body.actual_value
    kpi.achievement_pct = achievement_pct

    await db.flush()

    user_name_result = await db.execute(select(DBUser.name).where(DBUser.id == user_uuid))
    user_name_row = user_name_result.one_or_none()
    user_name = user_name_row.name if user_name_row else ""

    await db.commit()

    return KPIRecordResponse(
        id=str(kpi.id),
        user_id=str(kpi.user_id),
        user_name=user_name,
        department_id=str(kpi.department_id) if kpi.department_id else None,
        period=kpi.period,
        kpi_name=kpi.kpi_name,
        target_value=kpi.target_value,
        actual_value=kpi.actual_value,
        achievement_pct=kpi.achievement_pct,
    )


@router.delete("/kpi/{kpi_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_kpi_record(
    kpi_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a KPI record."""
    try:
        kid = uuid.UUID(kpi_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="kpi_id must be a valid UUID",
        )

    result = await db.execute(select(KPIRecord).where(KPIRecord.id == kid))
    kpi = result.scalar_one_or_none()
    if kpi is None:
        raise HTTPException(status_code=404, detail="KPI record not found.")

    await db.delete(kpi)
    await db.commit()
    logger.info("KPI record %s deleted by %s", kpi_id, current_user.email)
