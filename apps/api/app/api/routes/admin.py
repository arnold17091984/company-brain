"""Admin endpoints for system configuration, user management, and health.

All endpoints require a valid Bearer token.  In development mode the
``dev-token`` shortcut is accepted.
"""

from __future__ import annotations

import logging
import time
import uuid
from datetime import UTC, date, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.api_keys import MANAGED_KEYS, mask_key
from app.core.auth import User, get_admin_user
from app.core.config import settings
from app.core.database import get_db
from app.core.encryption import decrypt_value, encrypt_value
from app.models.database import SafetyViolation, SystemSetting, UsageMetricsDaily
from app.models.database import User as DBUser
from app.models.schemas import (
    APIKeyStatus,
    APIKeyUpdate,
    HealthCheck,
    PerformanceMetrics,
    SafetyStats,
    SafetyViolationListResponse,
    SafetyViolationResponse,
    SystemSettings,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])

# ---------------------------------------------------------------------------
# DB-backed settings store
# ---------------------------------------------------------------------------

_DEFAULT_SETTINGS: dict[str, dict[str, Any]] = {
    "rag": {"chunk_size": 2000, "overlap": 200, "top_k": 10},
    "llm": {"default_model": "sonnet", "temperature": 0.7, "max_tokens": 4096},
    "agent": {"thinking_budget": 8000, "confidence_threshold": 0.5},
}


async def _load_settings(db: AsyncSession) -> dict[str, Any]:
    """Load all system settings from the database, falling back to defaults.

    Args:
        db: Async database session.

    Returns:
        dict[str, Any]: Merged settings with defaults for any missing keys.
    """
    result = await db.execute(select(SystemSetting))
    rows = {row.key: row.value for row in result.scalars().all()}
    return {
        "rag": rows.get("rag", _DEFAULT_SETTINGS["rag"]),
        "llm": rows.get("llm", _DEFAULT_SETTINGS["llm"]),
        "agent": rows.get("agent", _DEFAULT_SETTINGS["agent"]),
    }


# ---------------------------------------------------------------------------
# GET /api/v1/admin/settings
# ---------------------------------------------------------------------------


@router.get("/settings", response_model=SystemSettings)
async def get_settings(
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> SystemSettings:
    """Return the current system configuration.

    Args:
        current_user: Injected authenticated user.
        db: Injected database session.

    Returns:
        SystemSettings: Current RAG, LLM, and agent configuration.
    """
    logger.info("Admin settings read", extra={"user": current_user.email})
    data = await _load_settings(db)
    return SystemSettings(**data)


# ---------------------------------------------------------------------------
# PUT /api/v1/admin/settings
# ---------------------------------------------------------------------------


@router.put("/settings", response_model=SystemSettings)
async def update_settings(
    body: SystemSettings,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> SystemSettings:
    """Update and persist system configuration to the database.

    The update is a deep-merge: only the sub-sections present in the request
    body are modified; omitted sub-sections retain their current values.

    Args:
        body: New configuration values.
        current_user: Injected authenticated user.
        db: Injected database session.

    Returns:
        SystemSettings: The updated configuration after applying the changes.
    """
    logger.info("Admin settings updated", extra={"user": current_user.email})

    for section_key, section_data in [
        ("rag", body.rag),
        ("llm", body.llm),
        ("agent", body.agent),
    ]:
        if section_data:
            result = await db.execute(select(SystemSetting).where(SystemSetting.key == section_key))
            setting = result.scalar_one_or_none()
            if setting:
                merged = {**setting.value, **section_data}
                setting.value = merged
            else:
                db.add(SystemSetting(key=section_key, value=section_data))

    await db.commit()

    data = await _load_settings(db)
    return SystemSettings(**data)


# ---------------------------------------------------------------------------
# GET /api/v1/admin/api-keys
# ---------------------------------------------------------------------------


@router.get("/api-keys", response_model=list[APIKeyStatus])
async def get_api_keys(
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> list[APIKeyStatus]:
    """Return the status of all managed API keys."""
    logger.info(
        "Admin API keys status requested",
        extra={"user": current_user.email},
    )

    statuses: list[APIKeyStatus] = []
    for key_name in MANAGED_KEYS:
        # Check DB
        result = await db.execute(
            select(SystemSetting).where(SystemSetting.key == f"api_key:{key_name}")
        )
        db_row = result.scalar_one_or_none()
        if db_row and db_row.value.get("encrypted_value"):
            try:
                plaintext = decrypt_value(db_row.value["encrypted_value"])
                statuses.append(
                    APIKeyStatus(
                        key_name=key_name,
                        source="db",
                        masked_value=mask_key(plaintext),
                    )
                )
                continue
            except (ValueError, RuntimeError):
                pass

        # Check env
        env_val = getattr(settings, key_name, "")
        if env_val:
            statuses.append(
                APIKeyStatus(
                    key_name=key_name,
                    source="env",
                    masked_value=mask_key(env_val),
                )
            )
        else:
            statuses.append(
                APIKeyStatus(
                    key_name=key_name,
                    source="none",
                    masked_value=None,
                )
            )

    return statuses


# ---------------------------------------------------------------------------
# PUT /api/v1/admin/api-keys
# ---------------------------------------------------------------------------


@router.put("/api-keys", response_model=list[APIKeyStatus])
async def update_api_keys(
    body: APIKeyUpdate,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> list[APIKeyStatus]:
    """Update API keys. Empty string deletes DB value (reverts to env)."""
    logger.info("Admin API keys update", extra={"user": current_user.email})

    updates = body.model_dump(exclude_unset=True)
    for key_name, value in updates.items():
        db_key = f"api_key:{key_name}"
        result = await db.execute(select(SystemSetting).where(SystemSetting.key == db_key))
        existing = result.scalar_one_or_none()

        if value == "":
            # Delete DB entry -> revert to env fallback
            if existing:
                await db.delete(existing)
        elif value is not None:
            encrypted = encrypt_value(value)
            if existing:
                existing.value = {"encrypted_value": encrypted}
            else:
                db.add(
                    SystemSetting(
                        key=db_key,
                        value={"encrypted_value": encrypted},
                    )
                )

    await db.commit()

    # Return fresh status
    return await get_api_keys(current_user=current_user, db=db)


# ---------------------------------------------------------------------------
# GET /api/v1/admin/metrics
# ---------------------------------------------------------------------------


@router.get("/metrics", response_model=PerformanceMetrics)
async def get_metrics(
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> PerformanceMetrics:
    """Return aggregated performance metrics sourced from UsageMetricsDaily.

    Queries the daily usage metrics table for today's date and aggregates
    totals across all users.  Returns zeros when no data exists for today.

    Args:
        current_user: Injected authenticated user.
        db: Injected database session.

    Returns:
        PerformanceMetrics: Latency, token usage, accuracy, and query counts.
    """
    logger.info("Admin metrics requested", extra={"user": current_user.email})

    today = date.today()

    stmt = select(
        func.coalesce(func.sum(UsageMetricsDaily.query_count), 0).label("queries_today"),
        func.coalesce(
            func.sum(UsageMetricsDaily.total_input_tokens + UsageMetricsDaily.total_output_tokens),
            0,
        ).label("total_tokens_today"),
        func.coalesce(func.avg(UsageMetricsDaily.avg_latency_ms), 0.0).label("avg_latency_ms"),
        func.coalesce(func.sum(UsageMetricsDaily.feedback_up), 0).label("feedback_up"),
        func.coalesce(func.sum(UsageMetricsDaily.feedback_down), 0).label("feedback_down"),
    ).where(UsageMetricsDaily.date == today)

    result = await db.execute(stmt)
    row = result.one()

    total_feedback = (row.feedback_up or 0) + (row.feedback_down or 0)
    accuracy_pct = (row.feedback_up / total_feedback * 100.0) if total_feedback > 0 else 0.0

    return PerformanceMetrics(
        avg_latency_ms=round(float(row.avg_latency_ms), 2),
        total_tokens_today=int(row.total_tokens_today),
        accuracy_pct=round(accuracy_pct, 1),
        queries_today=int(row.queries_today),
    )


# ---------------------------------------------------------------------------
# GET /api/v1/admin/health
# ---------------------------------------------------------------------------


@router.get("/health", response_model=list[HealthCheck])
async def get_health(
    request: Request,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> list[HealthCheck]:
    """Perform live health checks for PostgreSQL, Qdrant, and Redis.

    Each check measures the round-trip latency in milliseconds and classifies
    the service as ``healthy``, ``degraded`` (high latency), or ``down``
    (unreachable).

    Args:
        request: FastAPI request object (provides access to ``app.state``).
        current_user: Injected authenticated user.
        db: Injected database session.

    Returns:
        list[HealthCheck]: One entry per service with status and latency.
    """
    logger.info("Admin health check requested", extra={"user": current_user.email})

    checks: list[HealthCheck] = []

    # --- PostgreSQL ---
    pg_start = time.perf_counter()
    try:
        await db.execute(text("SELECT 1"))
        pg_latency = (time.perf_counter() - pg_start) * 1000
        pg_status = "degraded" if pg_latency > 500 else "healthy"
    except Exception as exc:  # noqa: BLE001
        logger.warning("PostgreSQL health check failed: %s", exc)
        pg_latency = (time.perf_counter() - pg_start) * 1000
        pg_status = "down"

    checks.append(
        HealthCheck(service="postgresql", status=pg_status, latency_ms=round(pg_latency, 2))
    )

    # --- Qdrant ---
    qdrant = getattr(request.app.state, "qdrant", None)
    if qdrant is not None:
        q_start = time.perf_counter()
        try:
            await qdrant.get_collections()
            q_latency = (time.perf_counter() - q_start) * 1000
            q_status = "degraded" if q_latency > 500 else "healthy"
        except Exception as exc:  # noqa: BLE001
            logger.warning("Qdrant health check failed: %s", exc)
            q_latency = (time.perf_counter() - q_start) * 1000
            q_status = "down"
    else:
        q_latency = 0.0
        q_status = "down"

    checks.append(HealthCheck(service="qdrant", status=q_status, latency_ms=round(q_latency, 2)))

    # --- Redis ---
    redis = getattr(request.app.state, "redis", None)
    if redis is not None:
        r_start = time.perf_counter()
        try:
            await redis.ping()
            r_latency = (time.perf_counter() - r_start) * 1000
            r_status = "degraded" if r_latency > 200 else "healthy"
        except Exception as exc:  # noqa: BLE001
            logger.warning("Redis health check failed: %s", exc)
            r_latency = (time.perf_counter() - r_start) * 1000
            r_status = "down"
    else:
        r_latency = 0.0
        r_status = "down"

    checks.append(HealthCheck(service="redis", status=r_status, latency_ms=round(r_latency, 2)))

    return checks


# ---------------------------------------------------------------------------
# GET /api/v1/admin/safety/violations
# ---------------------------------------------------------------------------


@router.get("/safety/violations", response_model=SafetyViolationListResponse)
async def list_safety_violations(
    page: int = 1,
    page_size: int = 20,
    risk_level: str | None = None,
    action_taken: str | None = None,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> SafetyViolationListResponse:
    """Return a paginated list of safety violations.

    Joins with the User table to resolve the email address for each violation.
    Optional ``risk_level`` and ``action_taken`` query parameters narrow the
    results.

    Args:
        page: 1-based page number.
        page_size: Number of records per page (default 20).
        risk_level: Optional filter by risk level (e.g. ``"high"``, ``"medium"``).
        action_taken: Optional filter by action taken (e.g. ``"blocked"``).
        current_user: Injected authenticated user.
        db: Injected database session.

    Returns:
        SafetyViolationListResponse: Paginated violation records with user emails.
    """
    logger.info("Admin safety violations list requested", extra={"user": current_user.email})

    base_stmt = select(SafetyViolation, DBUser.email.label("user_email")).outerjoin(
        DBUser, SafetyViolation.user_id == DBUser.id
    )

    if risk_level is not None:
        base_stmt = base_stmt.where(SafetyViolation.risk_level == risk_level)
    if action_taken is not None:
        base_stmt = base_stmt.where(SafetyViolation.action_taken == action_taken)

    # Total count before pagination
    count_stmt = select(func.count()).select_from(base_stmt.subquery())
    total: int = (await db.execute(count_stmt)).scalar_one()

    # Paginated results ordered newest first
    offset = (page - 1) * page_size
    rows_result = await db.execute(
        base_stmt.order_by(SafetyViolation.created_at.desc()).offset(offset).limit(page_size)
    )
    rows = rows_result.all()

    violations = [
        SafetyViolationResponse(
            id=str(sv.id),
            user_id=str(sv.user_id),
            user_email=user_email or "",
            session_id=str(sv.session_id) if sv.session_id else None,
            violation_type=sv.violation_type,
            risk_level=sv.risk_level,
            detected_categories=sv.detected_categories or [],
            context_snippet=sv.context_snippet,
            action_taken=sv.action_taken,
            source=sv.source,
            created_at=sv.created_at.isoformat(),
            resolved_at=sv.resolved_at.isoformat() if sv.resolved_at else None,
            resolved_by=str(sv.resolved_by) if sv.resolved_by else None,
        )
        for sv, user_email in rows
    ]

    return SafetyViolationListResponse(
        violations=violations,
        total=total,
        page=page,
        page_size=page_size,
    )


# ---------------------------------------------------------------------------
# GET /api/v1/admin/safety/stats
# ---------------------------------------------------------------------------


@router.get("/safety/stats", response_model=SafetyStats)
async def get_safety_stats(
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> SafetyStats:
    """Return aggregated safety statistics.

    Computes total and today's violation counts, a breakdown by action taken,
    and the top 5 most frequent violation types.

    Args:
        current_user: Injected authenticated user.
        db: Injected database session.

    Returns:
        SafetyStats: Violation counts, action breakdown, and top violation types.
    """
    logger.info("Admin safety stats requested", extra={"user": current_user.email})

    today = date.today()

    # Total violations
    total_result = await db.execute(select(func.count(SafetyViolation.id)))
    total_violations: int = total_result.scalar_one()

    # Violations recorded today
    today_result = await db.execute(
        select(func.count(SafetyViolation.id)).where(func.date(SafetyViolation.created_at) == today)
    )
    violations_today: int = today_result.scalar_one()

    # Count per action_taken
    action_result = await db.execute(
        select(SafetyViolation.action_taken, func.count(SafetyViolation.id).label("cnt")).group_by(
            SafetyViolation.action_taken
        )
    )
    action_counts: dict[str, int] = {row.action_taken: row.cnt for row in action_result.all()}

    # Top 5 violation types
    top_types_result = await db.execute(
        select(
            SafetyViolation.violation_type,
            func.count(SafetyViolation.id).label("cnt"),
        )
        .group_by(SafetyViolation.violation_type)
        .order_by(func.count(SafetyViolation.id).desc())
        .limit(5)
    )
    top_violation_types = [
        {"violation_type": row.violation_type, "count": row.cnt} for row in top_types_result.all()
    ]

    return SafetyStats(
        total_violations=total_violations,
        violations_today=violations_today,
        blocked_count=action_counts.get("blocked", 0),
        masked_count=action_counts.get("masked", 0),
        warned_count=action_counts.get("warned", 0),
        top_violation_types=top_violation_types,
    )


# ---------------------------------------------------------------------------
# POST /api/v1/admin/safety/violations/{violation_id}/resolve
# ---------------------------------------------------------------------------


@router.post("/safety/violations/{violation_id}/resolve", status_code=204)
async def resolve_safety_violation(
    violation_id: str,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Mark a safety violation as resolved.

    Sets ``resolved_at`` to the current UTC timestamp and ``resolved_by`` to
    the authenticated user's ID.  Returns 404 when the violation does not
    exist.

    Args:
        violation_id: UUID string of the violation to resolve.
        current_user: Injected authenticated user.
        db: Injected database session.

    Raises:
        HTTPException: 404 if no violation with the given ID exists.
    """
    logger.info(
        "Admin resolving safety violation %s", violation_id, extra={"user": current_user.email}
    )

    try:
        vid = uuid.UUID(violation_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Invalid violation_id format.") from exc

    result = await db.execute(select(SafetyViolation).where(SafetyViolation.id == vid))
    violation = result.scalar_one_or_none()

    if violation is None:
        raise HTTPException(status_code=404, detail="Safety violation not found.")

    violation.resolved_at = datetime.now(UTC)
    violation.resolved_by = uuid.UUID(str(current_user.id))

    await db.flush()
    await db.commit()
    logger.info("Safety violation %s resolved by %s", violation_id, current_user.email)
