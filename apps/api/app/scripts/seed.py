"""Idempotent seed script for local development.

Usage
-----
    cd apps/api
    uv run python -m app.scripts.seed

The script connects using the same DATABASE_URL as the application and inserts
fixture data using ON CONFLICT DO NOTHING semantics so it can be run multiple
times without duplicating rows.

Seed data
---------
* 7 departments
* 1 test user per department (access level varies by role)
* 3–5 sample documents per connector type (google_drive, telegram, notion)
* 1 sample chat session with a short conversation and thumbs-up feedback
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import sys
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.core.database import AsyncSessionLocal, engine
from app.models.database import (
    AuditLog,
    ChatMessage,
    ChatSession,
    Department,
    Document,
    Feedback,
    User,
)

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)-8s %(message)s",
    stream=sys.stdout,
)

# ---------------------------------------------------------------------------
# Fixed UUIDs so the script is deterministic across runs
# ---------------------------------------------------------------------------

_DEPT: dict[str, uuid.UUID] = {
    "engineering": uuid.UUID("00000000-0000-4000-a000-000000000001"),
    "product": uuid.UUID("00000000-0000-4000-a000-000000000002"),
    "qa": uuid.UUID("00000000-0000-4000-a000-000000000003"),
    "bd": uuid.UUID("00000000-0000-4000-a000-000000000004"),
    "hr-admin": uuid.UUID("00000000-0000-4000-a000-000000000005"),
    "management": uuid.UUID("00000000-0000-4000-a000-000000000006"),
    "designer": uuid.UUID("00000000-0000-4000-a000-000000000007"),
}

_USER: dict[str, uuid.UUID] = {
    "alice": uuid.UUID("00000000-0000-4000-b000-000000000001"),
    "bob": uuid.UUID("00000000-0000-4000-b000-000000000002"),
    "carol": uuid.UUID("00000000-0000-4000-b000-000000000003"),
    "david": uuid.UUID("00000000-0000-4000-b000-000000000004"),
    "eve": uuid.UUID("00000000-0000-4000-b000-000000000005"),
    "frank": uuid.UUID("00000000-0000-4000-b000-000000000006"),
}

_SESSION_ID = uuid.UUID("00000000-0000-4000-c000-000000000001")

_NOW = datetime.now(UTC)


# ---------------------------------------------------------------------------
# Fixture data
# ---------------------------------------------------------------------------


def _sha256(text_: str) -> str:
    return hashlib.sha256(text_.encode()).hexdigest()


DEPARTMENTS: list[dict] = [
    {"id": _DEPT["engineering"], "name": "Engineering", "slug": "engineering"},
    {"id": _DEPT["product"], "name": "Product", "slug": "product"},
    {"id": _DEPT["qa"], "name": "QA", "slug": "qa"},
    {"id": _DEPT["bd"], "name": "Business Development", "slug": "bd"},
    {"id": _DEPT["hr-admin"], "name": "HR & Admin", "slug": "hr-admin"},
    {"id": _DEPT["management"], "name": "Management", "slug": "management"},
    {"id": _DEPT["designer"], "name": "Designer (UI/UX/Graphic)", "slug": "designer"},
]

USERS: list[dict] = [
    {
        "id": _USER["alice"],
        "email": "alice@company.ph",
        "name": "Alice Santos",
        "department_id": _DEPT["engineering"],
        "access_level": "all",
        "google_id": "google-alice-001",
    },
    {
        "id": _USER["bob"],
        "email": "bob@company.ph",
        "name": "Bob Reyes",
        "department_id": _DEPT["product"],
        "access_level": "department",
        "google_id": "google-bob-002",
    },
    {
        "id": _USER["carol"],
        "email": "carol@company.ph",
        "name": "Carol Cruz",
        "department_id": _DEPT["qa"],
        "access_level": "department",
        "google_id": "google-carol-003",
    },
    {
        "id": _USER["david"],
        "email": "david@company.ph",
        "name": "David Lim",
        "department_id": _DEPT["bd"],
        "access_level": "department",
        "google_id": "google-david-004",
    },
    {
        "id": _USER["eve"],
        "email": "eve@company.ph",
        "name": "Eve Garcia",
        "department_id": _DEPT["hr-admin"],
        "access_level": "department",
        "google_id": "google-eve-005",
    },
    {
        "id": _USER["frank"],
        "email": "frank@company.ph",
        "name": "Frank Tan",
        "department_id": _DEPT["management"],
        "access_level": "all",
        "google_id": "google-frank-006",
    },
]

# fmt: off
DOCUMENTS: list[dict] = [
    # ── Google Drive ──────────────────────────────────────────────────────────
    {
        "id": uuid.UUID("00000000-0000-4000-d000-000000000001"),
        "source_type": "google_drive",
        "source_id": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms",
        "title": "Company Onboarding Guide 2026",
        "content_hash": _sha256("onboarding-guide-v1"),
        "access_level": "public",
        "department_id": _DEPT["hr-admin"],
        "metadata": {"mime_type": "application/vnd.google-apps.document", "author": "Eve Garcia"},
    },
    {
        "id": uuid.UUID("00000000-0000-4000-d000-000000000002"),
        "source_type": "google_drive",
        "source_id": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upmX",
        "title": "Engineering Runbook: Deployments",
        "content_hash": _sha256("engineering-runbook-deployments-v1"),
        "access_level": "department",
        "department_id": _DEPT["engineering"],
        "metadata": {"mime_type": "application/vnd.google-apps.document", "author": "Alice Santos"},
    },
    {
        "id": uuid.UUID("00000000-0000-4000-d000-000000000003"),
        "source_type": "google_drive",
        "source_id": "1CxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms",
        "title": "Q1 2026 OKRs",
        "content_hash": _sha256("q1-2026-okrs-v1"),
        "access_level": "department",
        "department_id": _DEPT["management"],
        "metadata": {"mime_type": "application/vnd.google-apps.spreadsheet", "author": "Frank Tan"},
    },
    {
        "id": uuid.UUID("00000000-0000-4000-d000-000000000004"),
        "source_type": "google_drive",
        "source_id": "1DxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms",
        "title": "Product Roadmap H1 2026",
        "content_hash": _sha256("product-roadmap-h1-2026-v1"),
        "access_level": "department",
        "department_id": _DEPT["product"],
        "metadata": {
            "mime_type": "application/vnd.google-apps.presentation",
            "author": "Bob Reyes",
        },
    },
    # ── Telegram ─────────────────────────────────────────────────────────────
    {
        "id": uuid.UUID("00000000-0000-4000-d000-000000000005"),
        "source_type": "telegram",
        "source_id": "msg_1001",
        "title": "Telegram: #engineering – Deploy v2.3.0",
        "content_hash": _sha256("telegram-msg-1001"),
        "access_level": "department",
        "department_id": _DEPT["engineering"],
        "metadata": {"channel": "engineering", "message_id": 1001, "sender": "alice"},
    },
    {
        "id": uuid.UUID("00000000-0000-4000-d000-000000000006"),
        "source_type": "telegram",
        "source_id": "msg_2001",
        "title": "Telegram: #general – Company all-hands recap",
        "content_hash": _sha256("telegram-msg-2001"),
        "access_level": "public",
        "department_id": None,
        "metadata": {"channel": "general", "message_id": 2001, "sender": "frank"},
    },
    {
        "id": uuid.UUID("00000000-0000-4000-d000-000000000007"),
        "source_type": "telegram",
        "source_id": "msg_3001",
        "title": "Telegram: #qa – Regression test summary Jan 2026",
        "content_hash": _sha256("telegram-msg-3001"),
        "access_level": "department",
        "department_id": _DEPT["qa"],
        "metadata": {"channel": "qa", "message_id": 3001, "sender": "carol"},
    },
    # ── Notion ────────────────────────────────────────────────────────────────
    {
        "id": uuid.UUID("00000000-0000-4000-d000-000000000008"),
        "source_type": "notion",
        "source_id": "notion-page-aaaabbbb",
        "title": "Notion: HR Policies 2026",
        "content_hash": _sha256("notion-page-aaaabbbb"),
        "access_level": "public",
        "department_id": _DEPT["hr-admin"],
        "metadata": {"page_id": "aaaabbbb", "workspace": "company-brain"},
    },
    {
        "id": uuid.UUID("00000000-0000-4000-d000-000000000009"),
        "source_type": "notion",
        "source_id": "notion-page-ccccdddd",
        "title": "Notion: Engineering Architecture Decisions",
        "content_hash": _sha256("notion-page-ccccdddd"),
        "access_level": "department",
        "department_id": _DEPT["engineering"],
        "metadata": {"page_id": "ccccdddd", "workspace": "company-brain"},
    },
    {
        "id": uuid.UUID("00000000-0000-4000-d000-000000000010"),
        "source_type": "notion",
        "source_id": "notion-page-eeeeffff",
        "title": "Notion: BD Deal Tracker Q1 2026",
        "content_hash": _sha256("notion-page-eeeeffff"),
        "access_level": "department",
        "department_id": _DEPT["bd"],
        "metadata": {"page_id": "eeeeffff", "workspace": "company-brain"},
    },
    {
        "id": uuid.UUID("00000000-0000-4000-d000-000000000011"),
        "source_type": "notion",
        "source_id": "notion-page-00001111",
        "title": "Notion: Product Spec – AI Search v2",
        "content_hash": _sha256("notion-page-00001111"),
        "access_level": "department",
        "department_id": _DEPT["product"],
        "metadata": {"page_id": "00001111", "workspace": "company-brain"},
    },
]
# fmt: on

CHAT_SESSION: dict = {
    "id": _SESSION_ID,
    "user_id": _USER["alice"],
}

CHAT_MESSAGES: list[dict] = [
    {
        "id": uuid.UUID("00000000-0000-4000-e000-000000000001"),
        "session_id": _SESSION_ID,
        "role": "user",
        "content": "What is the engineering deployment process?",
        "sources": [],
        "created_at": _NOW - timedelta(minutes=5),
    },
    {
        "id": uuid.UUID("00000000-0000-4000-e000-000000000002"),
        "session_id": _SESSION_ID,
        "role": "assistant",
        "content": (
            "Based on the Engineering Runbook, the deployment process involves: "
            "1) merging a PR to main, 2) Railway auto-deploy triggers, "
            "3) health checks pass before traffic shifts."
        ),
        "sources": [
            {
                "document_id": "00000000-0000-4000-d000-000000000002",
                "title": "Engineering Runbook: Deployments",
                "score": 0.92,
            }
        ],
        "created_at": _NOW - timedelta(minutes=4, seconds=30),
    },
]

FEEDBACK: dict = {
    "id": uuid.UUID("00000000-0000-4000-f000-000000000001"),
    "message_id": uuid.UUID("00000000-0000-4000-e000-000000000002"),
    "user_id": _USER["alice"],
    "rating": "up",
    "created_at": _NOW - timedelta(minutes=4),
}

AUDIT_LOG: dict = {
    "id": uuid.UUID("00000000-0000-4000-a000-100000000001"),
    "user_id": _USER["alice"],
    "action": "knowledge_query",
    "query": "What is the engineering deployment process?",
    "metadata": {"latency_ms": 312, "model": "claude-haiku-4-5"},
    "created_at": _NOW - timedelta(minutes=5),
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _upsert(table, rows: list[dict], conflict_cols: list[str]):  # type: ignore[no-untyped-def]
    """Return an INSERT ... ON CONFLICT DO NOTHING statement."""
    stmt = pg_insert(table).values(rows)
    return stmt.on_conflict_do_nothing(index_elements=conflict_cols)


# ---------------------------------------------------------------------------
# Main seed coroutine
# ---------------------------------------------------------------------------


async def seed() -> None:
    logger.info("Starting database seed...")

    async with AsyncSessionLocal() as session:
        # Temporarily bypass RLS for the seeding session.
        # The 'dev' role is the table owner, so SET LOCAL works fine.
        await session.execute(text("SET LOCAL app.current_access_level = 'all';"))

        # 1. Departments
        await session.execute(_upsert(Department.__table__, DEPARTMENTS, ["slug"]))
        logger.info("  Upserted %d departments.", len(DEPARTMENTS))

        # 2. Users
        await session.execute(_upsert(User.__table__, USERS, ["email"]))
        logger.info("  Upserted %d users.", len(USERS))

        # 3. Documents
        await session.execute(_upsert(Document.__table__, DOCUMENTS, ["id"]))
        logger.info("  Upserted %d documents.", len(DOCUMENTS))

        # 4. Chat session
        await session.execute(_upsert(ChatSession.__table__, [CHAT_SESSION], ["id"]))
        logger.info("  Upserted 1 chat session.")

        # 5. Chat messages
        await session.execute(_upsert(ChatMessage.__table__, CHAT_MESSAGES, ["id"]))
        logger.info("  Upserted %d chat messages.", len(CHAT_MESSAGES))

        # 6. Feedback
        await session.execute(_upsert(Feedback.__table__, [FEEDBACK], ["id"]))
        logger.info("  Upserted 1 feedback record.")

        # 7. Audit log
        await session.execute(_upsert(AuditLog.__table__, [AUDIT_LOG], ["id"]))
        logger.info("  Upserted 1 audit log entry.")

        await session.commit()

    await engine.dispose()
    logger.info("Seed complete.")


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------


def main() -> None:
    asyncio.run(seed())


if __name__ == "__main__":
    main()
