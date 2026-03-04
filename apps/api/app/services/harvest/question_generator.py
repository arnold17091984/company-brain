"""AI-driven question generation for knowledge harvesting."""

from __future__ import annotations

import json
import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.llm.claude_service import ClaudeService

logger = logging.getLogger(__name__)

_QUESTION_PROMPT = """You are generating knowledge-capture questions for a departing employee.

Employee info:
- Name: {name}
- Job title: {job_title}
- Department: {department}

Generate 15-30 targeted questions across these 5 categories:
1. **project** - Design decisions, architecture rationale, project status
2. **process** - Business workflows, reporting procedures, daily operations
3. **client** - Client contacts, vendor relationships, key stakeholders
4. **tool** - Tools, systems, configurations, access credentials (not passwords)
5. **team** - Team dynamics, training materials, institutional knowledge

Return a JSON array of objects with "category" and "question" keys.
Example: [{{"category": "project", "question": "What are the key design decisions behind X?"}}, ...]

Return ONLY the JSON array, no other text."""

_FALLBACK_QUESTIONS = [
    {
        "category": cat,
        "question": (
            f"What are the most important things to know about your {cat}-related responsibilities?"
        ),
    }
    for cat in ["project", "process", "client", "tool", "team"]
]


async def generate_questions(
    db: AsyncSession,
    user_name: str,
    job_title: str | None = None,
    department: str | None = None,
) -> list[dict[str, str]]:
    """Generate targeted harvest questions using Claude Sonnet.

    Calls the Claude API with a structured prompt to produce role-specific
    knowledge-capture questions. Falls back to a minimal generic set when
    the LLM response cannot be parsed.

    Args:
        db: Active database session (reserved for future use, e.g. context
            loading from the DB).
        user_name: Display name of the departing employee.
        job_title: Optional job title for more targeted questions.
        department: Optional department name for departmental context.

    Returns:
        List of dicts with "category" and "question" keys.
    """
    prompt = _QUESTION_PROMPT.format(
        name=user_name,
        job_title=job_title or "Unknown",
        department=department or "Unknown",
    )

    service = ClaudeService()
    response = await service.generate(
        [{"role": "user", "content": prompt}],
        model="claude-sonnet-4-6",
        max_tokens=4096,
        temperature=0.7,
    )

    try:
        questions = json.loads(response.text)
        if isinstance(questions, list):
            return [
                {
                    "category": q.get("category", "project"),
                    "question": q.get("question", ""),
                }
                for q in questions
                if q.get("question")
            ]
    except (json.JSONDecodeError, KeyError):
        logger.exception("Failed to parse question generation response")

    # Fallback: return a minimal set of generic questions
    return list(_FALLBACK_QUESTIONS)
