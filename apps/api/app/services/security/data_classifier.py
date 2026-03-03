"""Sensitive data classifier for user-submitted queries.

Uses regex patterns to detect categories of sensitive information and
assign a risk level. Designed to gate or warn before content reaches
the LLM and knowledge store.
"""

from __future__ import annotations

import re
from enum import StrEnum
from typing import Final

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Risk levels and detection categories
# ---------------------------------------------------------------------------


class RiskLevel(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class DetectedCategory(StrEnum):
    EMAIL = "email"
    PHONE = "phone"
    CREDIT_CARD = "credit_card"
    HONORIFIC_NAME = "honorific_name"
    CURRENCY_AMOUNT = "currency_amount"
    CREDENTIAL_KEYWORD = "credential_keyword"
    CONFIDENTIALITY_MARKER = "confidentiality_marker"


# ---------------------------------------------------------------------------
# Detection patterns
# ---------------------------------------------------------------------------

_PATTERNS: Final[list[tuple[DetectedCategory, RiskLevel, re.Pattern[str]]]] = [
    # High risk
    (
        DetectedCategory.CREDIT_CARD,
        RiskLevel.HIGH,
        re.compile(r"\b(?:\d[ -]?){13,16}\b"),
    ),
    (
        DetectedCategory.CREDENTIAL_KEYWORD,
        RiskLevel.HIGH,
        re.compile(
            r"\b(?:password|secret|api[_\s-]?key|access[_\s-]?token|private[_\s-]?key|auth[_\s-]?token)\b",
            re.IGNORECASE,
        ),
    ),
    (
        DetectedCategory.CONFIDENTIALITY_MARKER,
        RiskLevel.HIGH,
        re.compile(
            # \b word boundaries work for ASCII; CJK tokens have no spaces so
            # we match them without anchors via a non-capturing alternation.
            r"(?:\b(?:NDA|confidential|proprietary)\b|機密|대외비)",
            re.IGNORECASE,
        ),
    ),
    # Medium risk
    (
        DetectedCategory.EMAIL,
        RiskLevel.MEDIUM,
        re.compile(r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b"),
    ),
    (
        DetectedCategory.PHONE,
        RiskLevel.MEDIUM,
        re.compile(
            r"(?:\+?\d{1,3}[\s\-.]?)?"  # optional country code
            r"(?:\(?\d{2,4}\)?[\s\-.]?)"  # area code
            r"\d{3,4}[\s\-.]?\d{4}\b"
        ),
    ),
    (
        DetectedCategory.HONORIFIC_NAME,
        RiskLevel.MEDIUM,
        re.compile(
            r"[\u3040-\u30FF\u4E00-\u9FFF\uAC00-\uD7A3]{1,10}(?:様|さん|氏|씨|님)",
        ),
    ),
    (
        DetectedCategory.CURRENCY_AMOUNT,
        RiskLevel.MEDIUM,
        re.compile(
            r"(?:PHP|USD|JPY|KRW|₱|\$|¥|₩)\s?\d[\d,]*(?:\.\d{1,2})?"
            r"|\d[\d,]*(?:\.\d{1,2})?\s?(?:pesos?|dollars?|yen|won)\b",
            re.IGNORECASE,
        ),
    ),
]


# ---------------------------------------------------------------------------
# Warning messages per detected language / risk level
# ---------------------------------------------------------------------------

_WARNING_EN = (
    "Warning: Your message may contain sensitive information. "
    "Please remove personal data, credentials, or confidential details before submitting."
)
_WARNING_JA = (
    "警告: メッセージに個人情報や機密情報が含まれている可能性があります。"
    "送信前に個人データや認証情報を削除してください。"
)
_WARNING_KO = (
    "경고: 메시지에 개인 정보 또는 기밀 정보가 포함될 수 있습니다. "
    "제출하기 전에 개인 데이터나 인증 정보를 제거해 주세요."
)
_WARNING_TL = (
    "Babala: Ang iyong mensahe ay maaaring naglalaman ng sensitibong impormasyon. "
    "Mangyaring alisin ang personal na datos o kumpidensyal na detalye bago isumite."
)

_JAPANESE_PATTERN: Final = re.compile(r"[\u3040-\u30FF\u4E00-\u9FFF]")
_KOREAN_PATTERN: Final = re.compile(r"[\uAC00-\uD7A3]")
_TAGALOG_MARKERS: Final = re.compile(r"\b(?:ang|ng|na|sa|at|mga|po|opo)\b", re.IGNORECASE)


def _detect_language(text: str) -> str:
    """Heuristically detect the primary language of a text snippet.

    Args:
        text: Input text.

    Returns:
        BCP-47 language code: "ja", "ko", "tl", or "en".
    """
    if _JAPANESE_PATTERN.search(text):
        return "ja"
    if _KOREAN_PATTERN.search(text):
        return "ko"
    if len(_TAGALOG_MARKERS.findall(text)) >= 2:
        return "tl"
    return "en"


def _warning_for_language(lang: str) -> str:
    mapping = {"ja": _WARNING_JA, "ko": _WARNING_KO, "tl": _WARNING_TL}
    return mapping.get(lang, _WARNING_EN)


# ---------------------------------------------------------------------------
# Public model and classifier
# ---------------------------------------------------------------------------


class DataClassification(BaseModel):
    """Result of classifying a piece of user-submitted text.

    Attributes:
        risk_level: Overall risk level for the text.
        detected_categories: List of sensitive data categories found.
        warning_message: Optional human-readable warning in the user's language.
            Present only when risk_level is "high".
    """

    risk_level: RiskLevel = Field(default=RiskLevel.LOW)
    detected_categories: list[DetectedCategory] = Field(default_factory=list)
    warning_message: str | None = Field(default=None)


def mask_pii(text: str) -> tuple[str, list[DetectedCategory]]:
    """Replace detected PII patterns with labelled placeholders.

    Args:
        text: The raw input text.

    Returns:
        A tuple of (masked_text, list_of_detected_categories).
        If no PII is found, returns the original text unchanged.
    """
    masked = text
    found: list[DetectedCategory] = []
    counters: dict[str, int] = {}

    # Only mask medium-risk PII (emails, phones, names, amounts).
    # High-risk items (credit cards, credentials) should be blocked, not masked.
    pii_categories = {
        DetectedCategory.EMAIL,
        DetectedCategory.PHONE,
        DetectedCategory.HONORIFIC_NAME,
        DetectedCategory.CURRENCY_AMOUNT,
    }

    for category, risk, pattern in _PATTERNS:
        if category not in pii_categories:
            continue
        matches = list(pattern.finditer(masked))
        if matches:
            found.append(category)
            label = category.value.upper()
            # Replace in reverse to preserve indices
            for match in reversed(matches):
                counter = counters.get(label, 0) + 1
                counters[label] = counter
                placeholder = f"[{label}_{counter}]"
                masked = masked[: match.start()] + placeholder + masked[match.end() :]

    return masked, found


def classify_input(text: str) -> DataClassification:
    """Classify user input for sensitive data patterns.

    The function is synchronous because regex matching is CPU-bound.
    It is safe to call from async code via ``asyncio.to_thread`` for
    very large inputs, but typical query lengths do not require it.

    Args:
        text: The raw user query or message text.

    Returns:
        A :class:`DataClassification` describing the risk assessment.
    """
    detected: list[DetectedCategory] = []
    highest_risk = RiskLevel.LOW

    for category, risk, pattern in _PATTERNS:
        if pattern.search(text):
            detected.append(category)
            if risk == RiskLevel.HIGH:
                highest_risk = RiskLevel.HIGH
            elif risk == RiskLevel.MEDIUM and highest_risk == RiskLevel.LOW:
                highest_risk = RiskLevel.MEDIUM

    warning: str | None = None
    if highest_risk == RiskLevel.HIGH:
        lang = _detect_language(text)
        warning = _warning_for_language(lang)

    return DataClassification(
        risk_level=highest_risk,
        detected_categories=detected,
        warning_message=warning,
    )
