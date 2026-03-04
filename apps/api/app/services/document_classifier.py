"""AI-powered document classification using Claude Haiku.

Classifies uploaded documents into one of the known ``DocumentCategory``
values by sending a compact prompt to Claude Haiku and parsing the JSON
response.  Classification failures always fall back to ``"general"`` so
they never block an upload.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field

from app.services.llm.claude_service import ClaudeService, _DEFAULT_HAIKU
from app.services.types import DocumentCategory

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_ALL_CATEGORIES: list[str] = [cat.value for cat in DocumentCategory]

_FALLBACK_CATEGORY = DocumentCategory.GENERAL.value
_MIN_CONFIDENCE = 0.7

_SYSTEM_PROMPT = """\
You are a document classification assistant. Your job is to assign a single
category to a document based on its filename and a short text preview.

Available categories (choose exactly one):
  - general          : Miscellaneous / uncategorised documents.
  - hr_evaluation    : Employee performance reviews and evaluations.
  - hr_compensation  : Salary, bonuses, payroll, and compensation data.
  - hr_contract      : Employment contracts and agreements.
  - hr_attendance    : Attendance records, timesheets, and leave logs.
  - hr_skills        : Skill matrices, certifications, and training records.
  - hr_org           : Org charts, headcount plans, and reporting structures.
  - hr_compliance    : Labor-law compliance, audits, and regulatory filings.
  - engineering      : Technical documentation, architecture, code, APIs, and
                       infrastructure guides.
  - sales            : Sales pipelines, CRM exports, proposals, and revenue data.
  - marketing        : Marketing campaigns, brand assets, and market research.
  - finance          : Financial statements, budgets, invoices, and accounting.
  - policy           : Company-wide policies, procedures, and guidelines.
  - onboarding       : New-hire guides, orientation materials, and checklists.
  - project          : Project plans, status reports, and roadmaps.
  - meeting_notes    : Meeting minutes, agendas, and action items.

Respond with a single JSON object and nothing else. Example:
{"category": "engineering", "confidence": 0.92, "suggested_department": "engineering"}

Rules:
1. "category" must be one of the exact string values listed above.
2. "confidence" must be a float between 0.0 and 1.0 reflecting how certain
   you are about the classification.
3. "suggested_department" is the department slug most relevant to this
   document, or null if it is company-wide. Use lowercase slugs such as
   "engineering", "hr", "sales", "marketing", "finance", etc.
4. Never add extra keys or prose outside the JSON object.
"""


# ---------------------------------------------------------------------------
# Result dataclass
# ---------------------------------------------------------------------------


@dataclass
class ClassificationResult:
    """Outcome of a single document classification attempt.

    Attributes:
        category: The assigned ``DocumentCategory`` value string.
        confidence: Model confidence in [0.0, 1.0].
        suggested_department: Department slug or ``None`` for company-wide docs.
    """

    category: str
    confidence: float
    suggested_department: str | None = field(default=None)


# ---------------------------------------------------------------------------
# Classifier
# ---------------------------------------------------------------------------


class DocumentClassifier:
    """Classifies documents using Claude Haiku.

    Uses the lightweight Haiku model to keep latency and cost low.
    Classification is best-effort: any failure returns ``"general"``.

    Args:
        claude_service: An initialised ``ClaudeService`` instance.
    """

    def __init__(self, claude_service: ClaudeService) -> None:
        self._claude = claude_service

    async def classify(
        self,
        title: str,
        content_preview: str,
        filename: str | None = None,
    ) -> ClassificationResult:
        """Classify a document into a ``DocumentCategory``.

        Sends up to 2 000 characters of ``content_preview`` to Claude Haiku
        along with the document title (and optional filename) and parses the
        JSON response.

        Args:
            title: Human-readable document title.
            content_preview: Raw text preview of the document content.
                Only the first 2 000 characters are sent to the model.
            filename: Original filename, used as an additional signal.

        Returns:
            ClassificationResult with ``category``, ``confidence``, and
            ``suggested_department``.  Falls back to ``"general"`` with
            ``confidence=0.0`` on any error.
        """
        truncated_preview = content_preview[:2000]

        filename_line = f"Filename: {filename}\n" if filename else ""
        user_message = (
            f"{filename_line}"
            f"Title: {title}\n\n"
            f"Content preview:\n{truncated_preview}"
        )

        try:
            response = await self._claude.generate(
                messages=[{"role": "user", "content": user_message}],
                model=_DEFAULT_HAIKU,
                temperature=0.1,
                max_tokens=256,
                system_prompt=_SYSTEM_PROMPT,
            )
        except Exception:
            logger.exception(
                "Claude Haiku call failed during document classification for title=%r",
                title,
            )
            return _fallback_result()

        return _parse_response(response.text, title)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _fallback_result() -> ClassificationResult:
    """Return a safe fallback classification."""
    return ClassificationResult(
        category=_FALLBACK_CATEGORY,
        confidence=0.0,
        suggested_department=None,
    )


def _parse_response(raw_text: str, title: str) -> ClassificationResult:
    """Parse the JSON response from Claude and validate its fields.

    Args:
        raw_text: The full text returned by the model.
        title: Document title (used only for log messages).

    Returns:
        A validated ``ClassificationResult``, falling back to ``"general"``
        when parsing fails or confidence is below the threshold.
    """
    text = raw_text.strip()

    # Strip markdown code fences if the model wraps the JSON
    if text.startswith("```"):
        lines = text.splitlines()
        # Drop opening fence (and optional language tag) and closing fence
        inner_lines = [
            line for line in lines[1:] if not line.startswith("```")
        ]
        text = "\n".join(inner_lines).strip()

    try:
        payload: dict = json.loads(text)
    except json.JSONDecodeError:
        logger.warning(
            "Failed to parse classifier JSON for title=%r. Raw response: %r",
            title,
            raw_text[:200],
        )
        return _fallback_result()

    category = payload.get("category", "")
    if category not in _ALL_CATEGORIES:
        logger.warning(
            "Classifier returned unknown category %r for title=%r; falling back",
            category,
            title,
        )
        return _fallback_result()

    try:
        confidence = float(payload.get("confidence", 0.0))
    except (TypeError, ValueError):
        confidence = 0.0

    # Clamp to [0.0, 1.0]
    confidence = max(0.0, min(1.0, confidence))

    if confidence < _MIN_CONFIDENCE:
        logger.info(
            "Classifier confidence %.2f below threshold %.2f for title=%r; falling back to general",
            confidence,
            _MIN_CONFIDENCE,
            title,
        )
        return ClassificationResult(
            category=_FALLBACK_CATEGORY,
            confidence=confidence,
            suggested_department=None,
        )

    suggested_department = payload.get("suggested_department") or None
    if isinstance(suggested_department, str):
        suggested_department = suggested_department.strip() or None

    logger.debug(
        "Classified title=%r as category=%r (confidence=%.2f, dept=%r)",
        title,
        category,
        confidence,
        suggested_department,
    )

    return ClassificationResult(
        category=category,
        confidence=confidence,
        suggested_department=suggested_department,
    )
