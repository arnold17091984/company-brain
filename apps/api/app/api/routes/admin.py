"""Admin endpoints for system configuration, user management, and health.

All endpoints require a valid Bearer token.  In development mode the
``dev-token`` shortcut is accepted.
"""

from __future__ import annotations

import logging
import time
from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import User, get_current_user
from app.core.database import get_db
from app.models.database import Department
from app.models.database import User as DBUser
from app.models.schemas import HealthCheck, PerformanceMetrics, SystemSettings, UserSummary

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])

# ---------------------------------------------------------------------------
# In-memory settings store (mock persistence — no DB table required)
# ---------------------------------------------------------------------------

_SETTINGS: dict[str, Any] = {
    "rag": {
        "chunk_size": 2000,
        "overlap": 200,
        "top_k": 10,
    },
    "llm": {
        "default_model": "sonnet",
        "temperature": 0.7,
        "max_tokens": 4096,
    },
    "agent": {
        "thinking_budget": 8000,
        "confidence_threshold": 0.5,
    },
}


# ---------------------------------------------------------------------------
# GET /api/v1/admin/settings
# ---------------------------------------------------------------------------


@router.get("/settings", response_model=SystemSettings)
async def get_settings(
    current_user: User = Depends(get_current_user),
) -> SystemSettings:
    """Return the current system configuration.

    Args:
        current_user: Injected authenticated user.

    Returns:
        SystemSettings: Current RAG, LLM, and agent configuration.
    """
    logger.info("Admin settings read", extra={"user": current_user.email})
    return SystemSettings(**_SETTINGS)


# ---------------------------------------------------------------------------
# PUT /api/v1/admin/settings
# ---------------------------------------------------------------------------


@router.put("/settings", response_model=SystemSettings)
async def update_settings(
    body: SystemSettings,
    current_user: User = Depends(get_current_user),
) -> SystemSettings:
    """Update and persist system configuration (in-process store).

    The update is a deep-merge: only the sub-sections present in the request
    body are modified; omitted sub-sections retain their current values.

    Args:
        body: New configuration values.
        current_user: Injected authenticated user.

    Returns:
        SystemSettings: The updated configuration after applying the changes.
    """
    logger.info("Admin settings updated", extra={"user": current_user.email})

    if body.rag:
        _SETTINGS["rag"].update(body.rag)
    if body.llm:
        _SETTINGS["llm"].update(body.llm)
    if body.agent:
        _SETTINGS["agent"].update(body.agent)

    return SystemSettings(**_SETTINGS)


# ---------------------------------------------------------------------------
# GET /api/v1/admin/users
# ---------------------------------------------------------------------------


@router.get("/users", response_model=list[UserSummary])
async def list_users(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[UserSummary]:
    """Return a summary list of all registered users.

    Joins ``users`` with ``departments`` to resolve the department name for
    each user.

    Args:
        current_user: Injected authenticated user.
        db: Injected database session.

    Returns:
        list[UserSummary]: All users ordered by creation date (newest first).
    """
    logger.info("Admin users list requested", extra={"user": current_user.email})

    stmt = (
        select(
            DBUser.id,
            DBUser.email,
            DBUser.name,
            Department.name.label("department_name"),
            DBUser.access_level,
            DBUser.created_at,
        )
        .outerjoin(Department, DBUser.department_id == Department.id)
        .order_by(DBUser.created_at.desc())
    )

    result = await db.execute(stmt)
    rows = result.all()

    return [
        UserSummary(
            id=str(row.id),
            email=row.email,
            name=row.name,
            department=row.department_name,
            access_level=row.access_level,
            created_at=row.created_at.isoformat(),
        )
        for row in rows
    ]


# ---------------------------------------------------------------------------
# GET /api/v1/admin/metrics
# ---------------------------------------------------------------------------


@router.get("/metrics", response_model=PerformanceMetrics)
async def get_metrics(
    current_user: User = Depends(get_current_user),
) -> PerformanceMetrics:
    """Return aggregated performance metrics.

    Values are mocked/estimated figures; replace with real telemetry when an
    observability backend (e.g. Langfuse, Prometheus) is available.

    Args:
        current_user: Injected authenticated user.

    Returns:
        PerformanceMetrics: Latency, token usage, accuracy, and query counts.
    """
    logger.info("Admin metrics requested", extra={"user": current_user.email})

    return PerformanceMetrics(
        avg_latency_ms=320.5,
        total_tokens_today=48200,
        accuracy_pct=87.3,
        queries_today=142,
    )


# ---------------------------------------------------------------------------
# GET /api/v1/admin/health
# ---------------------------------------------------------------------------


@router.get("/health", response_model=list[HealthCheck])
async def get_health(
    request: Request,
    current_user: User = Depends(get_current_user),
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
