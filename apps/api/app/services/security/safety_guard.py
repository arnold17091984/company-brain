"""SafetyGuard: pre- and post-LLM safety checks.

Orchestrates PII masking, prompt injection detection, and violation logging.
"""

from __future__ import annotations

import logging
import re
import uuid
from dataclasses import dataclass, field

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import SafetyViolation
from app.services.security.data_classifier import (
    RiskLevel,
    classify_input,
    mask_pii,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Prompt injection detection patterns
# ---------------------------------------------------------------------------

_INJECTION_PATTERNS: list[re.Pattern[str]] = [
    re.compile(
        r"(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|above|prior)\s+(?:instructions?|prompts?|context)",
        re.IGNORECASE,
    ),
    re.compile(
        r"you\s+are\s+now\s+(?:a\s+)?(?:DAN|jailbreak|evil|unrestricted)",
        re.IGNORECASE,
    ),
    re.compile(
        r"system\s*:\s*you\s+are",
        re.IGNORECASE,
    ),
    re.compile(
        r"(?:override|bypass)\s+(?:safety|content|security)\s+(?:filters?|policies?|guidelines?)",
        re.IGNORECASE,
    ),
]


@dataclass
class SafetyCheckResult:
    """Result of a safety pre- or post-check."""

    blocked: bool = False
    masked_text: str | None = None
    warning_message: str | None = None
    detected_categories: list[str] = field(default_factory=list)
    action_taken: str = "logged"


class SafetyGuard:
    """Pre- and post-LLM safety guard.

    Usage::

        guard = SafetyGuard(db)
        pre = await guard.pre_check(text, user_id, session_id)
        if pre.blocked:
            return pre.warning_message
        safe_input = pre.masked_text or text
        # ... call LLM ...
        post = await guard.post_check(llm_output, user_id, session_id)
    """

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def pre_check(
        self,
        text: str,
        user_id: str | uuid.UUID,
        session_id: str | uuid.UUID | None = None,
        source: str = "chat",
    ) -> SafetyCheckResult:
        """Run safety checks on user input before LLM processing.

        1. Classify input for sensitive data.
        2. Detect prompt injection attempts.
        3. Mask PII if medium-risk.
        4. Block if high-risk.
        """
        result = SafetyCheckResult()
        classification = classify_input(text)

        # Check for prompt injection
        injection_detected = any(p.search(text) for p in _INJECTION_PATTERNS)

        if injection_detected:
            result.blocked = True
            result.warning_message = (
                "Your message appears to contain a prompt injection attempt. "
                "This has been logged for security review."
            )
            result.detected_categories = ["prompt_injection"]
            result.action_taken = "blocked"
            await self._log_violation(
                user_id=user_id,
                session_id=session_id,
                violation_type="prompt_injection",
                risk_level="high",
                categories=["prompt_injection"],
                snippet=text[:200],
                action="blocked",
                source=source,
            )
            return result

        # High-risk: block
        if classification.risk_level == RiskLevel.HIGH:
            result.blocked = True
            result.warning_message = classification.warning_message
            result.detected_categories = [c.value for c in classification.detected_categories]
            result.action_taken = "blocked"
            await self._log_violation(
                user_id=user_id,
                session_id=session_id,
                violation_type="sensitive_data_input",
                risk_level="high",
                categories=result.detected_categories,
                snippet=text[:200],
                action="blocked",
                source=source,
            )
            return result

        # Medium-risk: mask PII and continue
        if classification.risk_level == RiskLevel.MEDIUM:
            masked_text, found = mask_pii(text)
            if found:
                result.masked_text = masked_text
                result.detected_categories = [c.value for c in found]
                result.action_taken = "masked"
                await self._log_violation(
                    user_id=user_id,
                    session_id=session_id,
                    violation_type="pii_detected_input",
                    risk_level="medium",
                    categories=result.detected_categories,
                    snippet=masked_text[:200],
                    action="masked",
                    source=source,
                )

        return result

    async def post_check(
        self,
        text: str,
        user_id: str | uuid.UUID,
        session_id: str | uuid.UUID | None = None,
        source: str = "chat",
    ) -> SafetyCheckResult:
        """Run safety checks on LLM output before returning to user.

        Scans for PII that the LLM may have generated in its response.
        """
        result = SafetyCheckResult()
        masked_text, found = mask_pii(text)
        if found:
            result.masked_text = masked_text
            result.detected_categories = [c.value for c in found]
            result.action_taken = "masked"
            await self._log_violation(
                user_id=user_id,
                session_id=session_id,
                violation_type="pii_in_response",
                risk_level="medium",
                categories=result.detected_categories,
                snippet=masked_text[:200],
                action="masked",
                source=source,
            )
        return result

    async def _log_violation(
        self,
        *,
        user_id: str | uuid.UUID,
        session_id: str | uuid.UUID | None,
        violation_type: str,
        risk_level: str,
        categories: list[str],
        snippet: str,
        action: str,
        source: str,
    ) -> None:
        """Persist a safety violation record."""
        try:
            uid = uuid.UUID(str(user_id)) if not isinstance(user_id, uuid.UUID) else user_id
            sid = None
            if session_id:
                sid = (
                    uuid.UUID(str(session_id))
                    if not isinstance(session_id, uuid.UUID)
                    else session_id
                )

            violation = SafetyViolation(
                user_id=uid,
                session_id=sid,
                violation_type=violation_type,
                risk_level=risk_level,
                detected_categories=categories,
                context_snippet=snippet,
                action_taken=action,
                source=source,
            )
            self._db.add(violation)
            await self._db.flush()
        except Exception:
            logger.exception("Failed to log safety violation")
