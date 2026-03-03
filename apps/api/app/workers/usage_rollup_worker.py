"""Daily usage metrics rollup worker.

Scheduled via Inngest cron to run at 01:00 UTC every day.  Aggregates the
previous day's ``AuditLog`` entries (actions: ``chat`` / ``chat_stream``) into
per-user rows in the ``usage_metrics_daily`` table.  Existing rows for the
same (user_id, date) pair are updated in-place (upsert semantics).
"""

from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Any

import inngest
from sqlalchemy import func, select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.database import AuditLog, Feedback, UsageMetricsDaily, User

logger = logging.getLogger(__name__)

# ── Inngest client ────────────────────────────────────────────────────────────

inngest_client = inngest.Inngest(
    app_id="company-brain",
    event_key=settings.inngest_event_key or None,
    signing_key=settings.inngest_signing_key or None,
    is_production=settings.is_production,
)

# ── Chat actions that represent a billed LLM round-trip ──────────────────────

_CHAT_ACTIONS: tuple[str, ...] = ("chat", "chat_stream")


# ── Inngest function definition ───────────────────────────────────────────────


@inngest_client.create_function(
    fn_id="usage-daily-rollup",
    name="Usage Daily Rollup",
    trigger=inngest.TriggerCron(cron="0 1 * * *"),  # 01:00 UTC every day
    retries=2,
)
async def usage_daily_rollup(
    ctx: inngest.Context,
    step: inngest.Step,
) -> dict[str, Any]:
    """Aggregate the previous day's AuditLog entries into UsageMetricsDaily.

    For each user who performed at least one chat action yesterday, the
    function sums token counts and averages latency from the ``metadata``
    JSONB column, then upserts a row into ``usage_metrics_daily``.

    Args:
        ctx: Inngest execution context (provides event data and run ID).
        step: Inngest step helper for memoised execution.

    Returns:
        dict with the date processed and how many user rows were written.
    """
    yesterday: date = date.today() - timedelta(days=1)
    logger.info("Starting usage rollup for %s", yesterday)

    async with AsyncSessionLocal() as db:
        try:
            # ── Step 1: find all users who chatted yesterday ──────────────────
            user_counts_stmt = (
                select(
                    AuditLog.user_id,
                    func.count(AuditLog.id).label("query_count"),
                )
                .where(
                    func.date(AuditLog.created_at) == yesterday,
                    AuditLog.action.in_(_CHAT_ACTIONS),
                )
                .group_by(AuditLog.user_id)
            )
            user_counts_result = await db.execute(user_counts_stmt)
            user_rows = user_counts_result.all()

            if not user_rows:
                logger.info("No chat activity found for %s; skipping rollup.", yesterday)
                await db.commit()
                return {"date": str(yesterday), "users_processed": 0}

            processed = 0

            for row in user_rows:
                user_id = row.user_id
                query_count: int = row.query_count

                # ── Step 2: sum tokens + avg latency from JSONB metadata ──────
                token_stmt = select(
                    func.coalesce(
                        func.sum(AuditLog.metadata_["input_tokens"].as_integer()), 0
                    ).label("total_input"),
                    func.coalesce(
                        func.sum(AuditLog.metadata_["output_tokens"].as_integer()), 0
                    ).label("total_output"),
                    func.coalesce(
                        func.avg(AuditLog.metadata_["latency_ms"].as_float()), 0.0
                    ).label("avg_latency"),
                ).where(
                    AuditLog.user_id == user_id,
                    func.date(AuditLog.created_at) == yesterday,
                    AuditLog.action.in_(_CHAT_ACTIONS),
                )
                token_result = await db.execute(token_stmt)
                token_row = token_result.one()

                total_input: int = int(token_row.total_input)
                total_output: int = int(token_row.total_output)
                avg_latency: float = round(float(token_row.avg_latency), 1)

                # ── Step 3: resolve the user's department ─────────────────────
                user_stmt = select(User.department_id).where(User.id == user_id)
                user_result = await db.execute(user_stmt)
                user_row = user_result.one_or_none()
                dept_id = user_row.department_id if user_row else None

                # ── Step 4: count thumbs-up / thumbs-down from Feedback table ─
                # Feedback is linked to ChatMessages, not AuditLog.  We use the
                # Feedback.user_id + created date as a reasonable proxy for
                # "feedback given yesterday by this user."
                fb_stmt = select(
                    Feedback.rating,
                    func.count(Feedback.id).label("cnt"),
                ).where(
                    Feedback.user_id == user_id,
                    func.date(Feedback.created_at) == yesterday,
                ).group_by(Feedback.rating)
                fb_result = await db.execute(fb_stmt)
                fb_rows = fb_result.all()

                fb_up = 0
                fb_down = 0
                for fb_row in fb_rows:
                    if fb_row.rating == "up":
                        fb_up = int(fb_row.cnt)
                    elif fb_row.rating == "down":
                        fb_down = int(fb_row.cnt)

                # ── Step 5: upsert UsageMetricsDaily ─────────────────────────
                existing_stmt = select(UsageMetricsDaily).where(
                    UsageMetricsDaily.user_id == user_id,
                    UsageMetricsDaily.date == yesterday,
                )
                existing_result = await db.execute(existing_stmt)
                metrics = existing_result.scalar_one_or_none()

                if metrics is not None:
                    # Update existing row
                    metrics.department_id = dept_id
                    metrics.query_count = query_count
                    metrics.total_input_tokens = total_input
                    metrics.total_output_tokens = total_output
                    metrics.avg_latency_ms = avg_latency
                    metrics.feedback_up = fb_up
                    metrics.feedback_down = fb_down
                    logger.debug(
                        "Updated UsageMetricsDaily for user %s on %s", user_id, yesterday
                    )
                else:
                    # Insert new row
                    metrics = UsageMetricsDaily(
                        user_id=user_id,
                        department_id=dept_id,
                        date=yesterday,
                        query_count=query_count,
                        total_input_tokens=total_input,
                        total_output_tokens=total_output,
                        avg_latency_ms=avg_latency,
                        feedback_up=fb_up,
                        feedback_down=fb_down,
                    )
                    db.add(metrics)
                    logger.debug(
                        "Inserted UsageMetricsDaily for user %s on %s", user_id, yesterday
                    )

                processed += 1

            await db.commit()

        except Exception:
            await db.rollback()
            logger.exception("Usage rollup failed for %s; transaction rolled back.", yesterday)
            raise

    logger.info(
        "Usage rollup complete for %s: %d user(s) processed.", yesterday, processed
    )
    return {"date": str(yesterday), "users_processed": processed}
