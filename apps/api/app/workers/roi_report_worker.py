"""Monthly ROI report auto-generator.

Scheduled via Inngest cron to run at 03:00 UTC on the 1st of every month.
Reads the previous month's ``usage_metrics_daily`` rows, correlates them with
``kpi_records``, and writes (or overwrites) a ``monthly_roi_reports`` row for
that period.

Token cost assumptions (Claude Sonnet 4.6, per-1k-token pricing as of 2026):
    - Input:  $0.003 / 1k tokens
    - Output: $0.015 / 1k tokens

Time-saving assumption:
    - Each resolved query saves an average of 6 minutes (0.1 hours) of
      manual research.
"""

from __future__ import annotations

import logging
from calendar import monthrange
from datetime import date
from typing import Any

import inngest
from sqlalchemy import func, select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.database import Department, KPIRecord, MonthlyROIReport, UsageMetricsDaily, User

logger = logging.getLogger(__name__)

# ── Inngest client ────────────────────────────────────────────────────────────

inngest_client = inngest.Inngest(
    app_id="company-brain",
    event_key=settings.inngest_event_key or None,
    signing_key=settings.inngest_signing_key or None,
    is_production=settings.is_production,
)

# ── Pricing constants (per 1 000 tokens) ─────────────────────────────────────

_COST_PER_1K_INPUT_USD: float = 0.003
_COST_PER_1K_OUTPUT_USD: float = 0.015

# Hours saved per query (10 minutes)
_HOURS_SAVED_PER_QUERY: float = 0.1


# ── Helpers ──────────────────────────────────────────────────────────────────


def _previous_month(today: date) -> tuple[int, int]:
    """Return (year, month) for the calendar month before *today*.

    Args:
        today: The reference date (typically ``date.today()``).

    Returns:
        Tuple of (year, month) for the previous calendar month.
    """
    if today.month == 1:
        return today.year - 1, 12
    return today.year, today.month - 1


def _period_date_range(year: int, month: int) -> tuple[date, date]:
    """Return the first and last day of a given year/month.

    Args:
        year: Four-digit calendar year.
        month: Month number (1-12).

    Returns:
        Tuple of (first_day, last_day) as ``date`` objects.
    """
    first_day = date(year, month, 1)
    last_day = date(year, month, monthrange(year, month)[1])
    return first_day, last_day


def _build_markdown(
    period: str,
    total_queries: int,
    total_input: int,
    total_output: int,
    active_users: int,
    satisfaction_pct: float,
    hours_saved: float,
    cost_usd: float,
    dept_breakdown: dict[str, Any],
    kpi_corr: dict[str, Any],
) -> str:
    """Render a Markdown report string from the aggregated metrics.

    Args:
        period: ISO period string, e.g. ``"2026-02"``.
        total_queries: Total queries across all users for the period.
        total_input: Sum of all input tokens.
        total_output: Sum of all output tokens.
        active_users: Distinct user count.
        satisfaction_pct: Average positive-feedback rate (0–100).
        hours_saved: Estimated hours saved across all users.
        cost_usd: Estimated LLM API cost in USD.
        dept_breakdown: Per-department query / token summary dict.
        kpi_corr: KPI correlation summary dict (may be empty).

    Returns:
        A multi-line Markdown string suitable for storage in ``report_markdown``.
    """
    lines: list[str] = [
        f"# ROI Report – {period}",
        "",
        "## Summary",
        "",
        "| Metric | Value |",
        "|--------|-------|",
        f"| Active users | {active_users} |",
        f"| Total queries | {total_queries:,} |",
        f"| Total tokens (in/out) | {total_input:,} / {total_output:,} |",
        f"| Estimated hours saved | {hours_saved:,.1f} h |",
        f"| Estimated LLM cost | ${cost_usd:,.2f} |",
        f"| Avg satisfaction | {satisfaction_pct:.1f}% |",
        "",
        "## Department Breakdown",
        "",
    ]

    if dept_breakdown:
        lines += [
            "| Department | Queries | Input tokens | Output tokens |",
            "|------------|---------|--------------|---------------|",
        ]
        for dept_name, stats in sorted(
            dept_breakdown.items(), key=lambda kv: -kv[1].get("queries", 0)
        ):
            lines.append(
                f"| {dept_name} "
                f"| {stats.get('queries', 0):,} "
                f"| {stats.get('input_tokens', 0):,} "
                f"| {stats.get('output_tokens', 0):,} |"
            )
    else:
        lines.append("_No department data available._")

    lines += ["", "## KPI Correlation", ""]

    if kpi_corr.get("points"):
        lines += [
            "| User | AI queries | KPI achievement |",
            "|------|------------|-----------------|",
        ]
        for point in kpi_corr["points"]:
            lines.append(
                f"| {point.get('user_name', point.get('user_id', '?'))} "
                f"| {point.get('query_count', 0):,} "
                f"| {point.get('kpi_achievement_pct', 0.0):.1f}% |"
            )
        avg_ach = kpi_corr.get("avg_achievement_pct", 0.0)
        lines += ["", f"**Average KPI achievement:** {avg_ach:.1f}%"]
    else:
        lines.append("_No KPI records found for this period._")

    lines += [
        "",
        "---",
        f"_Generated automatically by Company Brain on {date.today().isoformat()}_",
    ]
    return "\n".join(lines)


# ── Inngest function definition ───────────────────────────────────────────────


@inngest_client.create_function(
    fn_id="monthly-roi-report",
    name="Monthly ROI Report",
    trigger=inngest.TriggerCron(cron="0 3 1 * *"),  # 03:00 UTC on 1st of month
    retries=2,
)
async def monthly_roi_report(
    ctx: inngest.Context,
    step: inngest.Step,
) -> dict[str, Any]:
    """Generate the previous month's ROI report from aggregated metrics.

    Reads ``usage_metrics_daily`` for the previous calendar month, aggregates
    totals and per-department breakdowns, correlates with ``kpi_records``, and
    upserts a ``monthly_roi_reports`` row.  If a report for the period already
    exists it is overwritten so re-runs are idempotent.

    Args:
        ctx: Inngest execution context.
        step: Inngest step helper for memoised execution.

    Returns:
        dict with the period string and generation status.
    """
    today = date.today()
    year, month = _previous_month(today)
    period = f"{year}-{month:02d}"
    first_day, last_day = _period_date_range(year, month)

    logger.info("Generating ROI report for period %s", period)

    async with AsyncSessionLocal() as db:
        try:
            # ── Step 1: overall aggregates ────────────────────────────────────
            agg_stmt = select(
                func.coalesce(func.sum(UsageMetricsDaily.query_count), 0).label("total_queries"),
                func.coalesce(func.sum(UsageMetricsDaily.total_input_tokens), 0).label(
                    "total_input"
                ),
                func.coalesce(func.sum(UsageMetricsDaily.total_output_tokens), 0).label(
                    "total_output"
                ),
                func.count(func.distinct(UsageMetricsDaily.user_id)).label("active_users"),
            ).where(
                UsageMetricsDaily.date >= first_day,
                UsageMetricsDaily.date <= last_day,
            )
            agg_result = await db.execute(agg_stmt)
            agg_row = agg_result.one()

            total_queries: int = int(agg_row.total_queries)
            total_input: int = int(agg_row.total_input)
            total_output: int = int(agg_row.total_output)
            active_users: int = int(agg_row.active_users)

            # ── Step 2: average satisfaction from feedback ratio ───────────────
            # satisfaction_pct = feedback_up / (feedback_up + feedback_down) * 100
            fb_stmt = select(
                func.coalesce(func.sum(UsageMetricsDaily.feedback_up), 0).label("total_up"),
                func.coalesce(func.sum(UsageMetricsDaily.feedback_down), 0).label("total_down"),
            ).where(
                UsageMetricsDaily.date >= first_day,
                UsageMetricsDaily.date <= last_day,
            )
            fb_result = await db.execute(fb_stmt)
            fb_row = fb_result.one()
            total_up: int = int(fb_row.total_up)
            total_down: int = int(fb_row.total_down)
            total_rated = total_up + total_down
            satisfaction_pct: float = (
                round(total_up / total_rated * 100, 1) if total_rated > 0 else 0.0
            )

            # ── Step 3: department breakdown ──────────────────────────────────
            dept_agg_stmt = (
                select(
                    func.coalesce(Department.name, "Unassigned").label("dept_name"),
                    func.sum(UsageMetricsDaily.query_count).label("queries"),
                    func.sum(UsageMetricsDaily.total_input_tokens).label("input_tokens"),
                    func.sum(UsageMetricsDaily.total_output_tokens).label("output_tokens"),
                )
                .outerjoin(Department, UsageMetricsDaily.department_id == Department.id)
                .where(
                    UsageMetricsDaily.date >= first_day,
                    UsageMetricsDaily.date <= last_day,
                )
                .group_by(Department.name)
                .order_by(func.sum(UsageMetricsDaily.query_count).desc())
            )
            dept_result = await db.execute(dept_agg_stmt)
            dept_rows = dept_result.all()

            dept_breakdown: dict[str, Any] = {
                row.dept_name: {
                    "queries": int(row.queries),
                    "input_tokens": int(row.input_tokens),
                    "output_tokens": int(row.output_tokens),
                }
                for row in dept_rows
            }

            # ── Step 4: KPI correlation ───────────────────────────────────────
            # Per-user: sum queries for the period, join with kpi_records for the period
            user_usage_stmt = (
                select(
                    UsageMetricsDaily.user_id,
                    func.sum(UsageMetricsDaily.query_count).label("query_count"),
                    func.sum(
                        UsageMetricsDaily.total_input_tokens
                        + UsageMetricsDaily.total_output_tokens
                    ).label("total_tokens"),
                )
                .where(
                    UsageMetricsDaily.date >= first_day,
                    UsageMetricsDaily.date <= last_day,
                )
                .group_by(UsageMetricsDaily.user_id)
            )
            user_usage_result = await db.execute(user_usage_stmt)
            user_usage_rows = user_usage_result.all()

            # Build a lookup of user_id -> (query_count, total_tokens)
            user_usage: dict[str, dict[str, int]] = {
                str(r.user_id): {
                    "query_count": int(r.query_count),
                    "total_tokens": int(r.total_tokens),
                }
                for r in user_usage_rows
            }

            # Fetch KPI records for this period
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

            # Resolve user names for correlation points
            corr_points: list[dict[str, Any]] = []
            achievement_totals: list[float] = []

            for kpi_row in kpi_rows:
                uid = str(kpi_row.user_id)
                achievement = round(float(kpi_row.avg_achievement), 1)
                usage = user_usage.get(uid, {"query_count": 0, "total_tokens": 0})

                # Fetch user name
                user_name_result = await db.execute(
                    select(User.name).where(User.id == kpi_row.user_id)
                )
                user_name_row = user_name_result.one_or_none()
                user_name = user_name_row.name if user_name_row else uid

                corr_points.append({
                    "user_id": uid,
                    "user_name": user_name,
                    "query_count": usage["query_count"],
                    "total_tokens": usage["total_tokens"],
                    "kpi_achievement_pct": achievement,
                })
                achievement_totals.append(achievement)

            avg_achievement = (
                round(sum(achievement_totals) / len(achievement_totals), 1)
                if achievement_totals
                else 0.0
            )

            kpi_corr: dict[str, Any] = {
                "points": corr_points,
                "avg_achievement_pct": avg_achievement,
            }

            # ── Step 5: derive summary figures ────────────────────────────────
            hours_saved: float = round(total_queries * _HOURS_SAVED_PER_QUERY, 1)
            cost_usd: float = round(
                (total_input * _COST_PER_1K_INPUT_USD + total_output * _COST_PER_1K_OUTPUT_USD)
                / 1000,
                2,
            )

            # ── Step 6: build markdown report ─────────────────────────────────
            markdown = _build_markdown(
                period=period,
                total_queries=total_queries,
                total_input=total_input,
                total_output=total_output,
                active_users=active_users,
                satisfaction_pct=satisfaction_pct,
                hours_saved=hours_saved,
                cost_usd=cost_usd,
                dept_breakdown=dept_breakdown,
                kpi_corr=kpi_corr,
            )

            # ── Step 7: upsert MonthlyROIReport ───────────────────────────────
            existing_stmt = select(MonthlyROIReport).where(MonthlyROIReport.period == period)
            existing_result = await db.execute(existing_stmt)
            report = existing_result.scalar_one_or_none()

            if report is not None:
                # Overwrite – re-runs must be idempotent
                report.total_queries = total_queries
                report.total_tokens = total_input + total_output
                report.active_users = active_users
                report.avg_satisfaction_pct = satisfaction_pct
                report.estimated_hours_saved = hours_saved
                report.estimated_cost_usd = cost_usd
                report.department_breakdown = dept_breakdown
                report.kpi_correlation = kpi_corr
                report.report_markdown = markdown
                logger.info("Updated existing ROI report for period %s", period)
            else:
                report = MonthlyROIReport(
                    period=period,
                    total_queries=total_queries,
                    total_tokens=total_input + total_output,
                    active_users=active_users,
                    avg_satisfaction_pct=satisfaction_pct,
                    estimated_hours_saved=hours_saved,
                    estimated_cost_usd=cost_usd,
                    department_breakdown=dept_breakdown,
                    kpi_correlation=kpi_corr,
                    report_markdown=markdown,
                )
                db.add(report)
                logger.info("Created new ROI report for period %s", period)

            await db.commit()

        except Exception:
            await db.rollback()
            logger.exception(
                "ROI report generation failed for %s; transaction rolled back.", period
            )
            raise

    logger.info(
        "ROI report complete for %s: %d queries, %d active users, $%.2f estimated cost.",
        period,
        total_queries,
        active_users,
        cost_usd,
    )
    return {"period": period, "status": "generated"}
