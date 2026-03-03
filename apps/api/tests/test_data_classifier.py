"""Tests for app.services.security.data_classifier.

Covers:
- Clean text produces LOW risk with no categories
- Credit card number detection (HIGH risk, credit_card category)
- Credential keyword detection (HIGH risk, credential_keyword category)
- Confidentiality marker detection (HIGH risk, confidentiality_marker category)
- Email address detection (MEDIUM risk, email category)
- Phone number detection (MEDIUM risk, phone category)
- Japanese honorific detection (MEDIUM risk, honorific_name category)
- Currency amount detection (MEDIUM risk, currency_amount category)
- Multiple categories detected in a single message
- HIGH risk always produces a warning_message; LOW/MEDIUM do not
- Warning language selection: Japanese text -> Japanese warning,
  Korean text -> Korean warning, Tagalog text -> Tagalog warning,
  English (default) -> English warning
"""

from __future__ import annotations

import pytest

from app.services.security.data_classifier import (
    DataClassification,
    DetectedCategory,
    RiskLevel,
    _detect_language,
    _warning_for_language,
    classify_input,
)

# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------


def _categories(result: DataClassification) -> set[DetectedCategory]:
    """Return detected categories as a set for order-independent assertions."""
    return set(result.detected_categories)


# ---------------------------------------------------------------------------
# Clean text
# ---------------------------------------------------------------------------


class TestCleanText:
    def test_plain_sentence_is_low_risk(self) -> None:
        result = classify_input("What is the leave policy for regular employees?")
        assert result.risk_level == RiskLevel.LOW

    def test_plain_sentence_has_no_categories(self) -> None:
        result = classify_input("What is the leave policy for regular employees?")
        assert result.detected_categories == []

    def test_plain_sentence_has_no_warning(self) -> None:
        result = classify_input("What is the leave policy for regular employees?")
        assert result.warning_message is None

    def test_empty_string_is_low_risk(self) -> None:
        result = classify_input("")
        assert result.risk_level == RiskLevel.LOW

    def test_empty_string_has_no_categories(self) -> None:
        result = classify_input("")
        assert result.detected_categories == []


# ---------------------------------------------------------------------------
# Credit card detection
# ---------------------------------------------------------------------------


class TestCreditCardDetection:
    def test_16_digit_card_is_high_risk(self) -> None:
        result = classify_input("My card number is 4111111111111111.")
        assert result.risk_level == RiskLevel.HIGH

    def test_16_digit_card_contains_credit_card_category(self) -> None:
        result = classify_input("My card number is 4111111111111111.")
        assert DetectedCategory.CREDIT_CARD in _categories(result)

    def test_space_separated_card_detected(self) -> None:
        result = classify_input("Card: 4111 1111 1111 1111")
        assert DetectedCategory.CREDIT_CARD in _categories(result)

    def test_dash_separated_card_detected(self) -> None:
        result = classify_input("Card: 4111-1111-1111-1111")
        assert DetectedCategory.CREDIT_CARD in _categories(result)

    def test_13_digit_card_detected(self) -> None:
        # 13-digit Visa-style number -- the pattern matches 13-16 digits
        result = classify_input("Old card: 4111111111111")
        assert DetectedCategory.CREDIT_CARD in _categories(result)

    def test_credit_card_risk_produces_warning(self) -> None:
        result = classify_input("Card 4111111111111111 please keep safe")
        assert result.warning_message is not None


# ---------------------------------------------------------------------------
# Credential keyword detection
# ---------------------------------------------------------------------------


class TestCredentialKeywordDetection:
    @pytest.mark.parametrize(
        "text",
        [
            "The password is hunter2",
            "Store the secret here",
            "Use api_key=abc123",
            "api key must be rotated",
            "Revoke the access_token now",
            "access token expired",
            "private_key should be kept offline",
            "private key file is missing",
            "The auth_token is invalid",
            "auth token has been compromised",
        ],
    )
    def test_credential_keyword_is_high_risk(self, text: str) -> None:
        result = classify_input(text)
        assert result.risk_level == RiskLevel.HIGH

    @pytest.mark.parametrize(
        "text",
        [
            "password reset link sent",
            "The API_KEY variable is missing",  # uppercase variant
        ],
    )
    def test_credential_keyword_detected_case_insensitive(self, text: str) -> None:
        result = classify_input(text)
        assert DetectedCategory.CREDENTIAL_KEYWORD in _categories(result)

    def test_credential_keyword_produces_warning(self) -> None:
        result = classify_input("The api_key must never be shared")
        assert result.warning_message is not None


# ---------------------------------------------------------------------------
# Confidentiality marker detection
# ---------------------------------------------------------------------------


class TestConfidentialityMarkerDetection:
    @pytest.mark.parametrize(
        "text",
        [
            "This document is confidential.",
            "Covered by NDA",
            "All proprietary information is restricted.",
            "このファイルは機密です。",  # Japanese: 機密
            "이 문서는 대외비입니다.",  # Korean: 대외비
        ],
    )
    def test_confidentiality_marker_is_high_risk(self, text: str) -> None:
        result = classify_input(text)
        assert result.risk_level == RiskLevel.HIGH

    def test_confidentiality_marker_category_present(self) -> None:
        result = classify_input("This report is confidential.")
        assert DetectedCategory.CONFIDENTIALITY_MARKER in _categories(result)

    def test_nda_keyword_category_present(self) -> None:
        result = classify_input("Covered by NDA agreement")
        assert DetectedCategory.CONFIDENTIALITY_MARKER in _categories(result)

    def test_japanese_kimitsu_category_present(self) -> None:
        result = classify_input("このファイルは機密資料です。")
        assert DetectedCategory.CONFIDENTIALITY_MARKER in _categories(result)

    def test_korean_daeoaebi_category_present(self) -> None:
        result = classify_input("이 문서는 대외비입니다.")
        assert DetectedCategory.CONFIDENTIALITY_MARKER in _categories(result)

    def test_confidentiality_marker_produces_warning(self) -> None:
        result = classify_input("All proprietary code is protected.")
        assert result.warning_message is not None

    def test_confidential_case_insensitive(self) -> None:
        result = classify_input("CONFIDENTIAL: do not distribute")
        assert DetectedCategory.CONFIDENTIALITY_MARKER in _categories(result)


# ---------------------------------------------------------------------------
# Email detection
# ---------------------------------------------------------------------------


class TestEmailDetection:
    def test_standard_email_is_medium_risk(self) -> None:
        result = classify_input("Contact me at alice@example.com for details.")
        assert result.risk_level == RiskLevel.MEDIUM

    def test_standard_email_category_present(self) -> None:
        result = classify_input("Send results to bob.smith+tag@company.co.ph")
        assert DetectedCategory.EMAIL in _categories(result)

    def test_email_alone_has_no_warning(self) -> None:
        # warning_message is only produced for HIGH risk
        result = classify_input("my email is user@domain.org")
        assert result.warning_message is None

    def test_email_subdomain_detected(self) -> None:
        result = classify_input("Forward to reports@mail.internal.corp")
        assert DetectedCategory.EMAIL in _categories(result)


# ---------------------------------------------------------------------------
# Phone number detection
# ---------------------------------------------------------------------------


class TestPhoneDetection:
    @pytest.mark.parametrize(
        "text",
        [
            "Call me at +63 917 123 4567",
            "Reach me on (02) 8123-4567",
            "Office: 09171234567",
            "International: +1 800 555 1234",
        ],
    )
    def test_phone_is_medium_risk(self, text: str) -> None:
        result = classify_input(text)
        assert result.risk_level == RiskLevel.MEDIUM

    def test_phone_category_present(self) -> None:
        result = classify_input("My number is 09171234567")
        assert DetectedCategory.PHONE in _categories(result)

    def test_phone_alone_has_no_warning(self) -> None:
        result = classify_input("Call 09171234567")
        assert result.warning_message is None


# ---------------------------------------------------------------------------
# Japanese honorific detection
# ---------------------------------------------------------------------------


class TestHonorificNameDetection:
    @pytest.mark.parametrize(
        "text",
        [
            "田中様にご連絡ください。",  # 様 (sama)
            "山田さんがいます。",  # さん (san)
            "鈴木氏のプレゼンです。",  # 氏 (shi)
            "김씨가 도착했습니다.",  # 씨 (ssi, Korean)
            "박님이 요청했습니다.",  # 님 (nim, Korean)
        ],
    )
    def test_honorific_name_is_medium_risk(self, text: str) -> None:
        result = classify_input(text)
        assert result.risk_level == RiskLevel.MEDIUM

    def test_honorific_category_present(self) -> None:
        result = classify_input("田中様、よろしくお願いします。")
        assert DetectedCategory.HONORIFIC_NAME in _categories(result)

    def test_honorific_alone_has_no_warning(self) -> None:
        result = classify_input("田中様へ")
        assert result.warning_message is None


# ---------------------------------------------------------------------------
# Currency amount detection
# ---------------------------------------------------------------------------


class TestCurrencyAmountDetection:
    @pytest.mark.parametrize(
        "text",
        [
            "Budget is PHP 50,000",
            "Cost: USD 1,200.50",
            "Fee: JPY 3000",
            "Amount: KRW 500000",
            "Total: ₱1,500",
            "Price: $99.99",
            "Fee: ¥300",
            "Withdrawal: ₩50000",
            "Pay 2500 pesos now",
            "Received 1,000.00 dollars",
            "Cost 200 yen per item",
            "Transfer 50000 won",
        ],
    )
    def test_currency_amount_is_medium_risk(self, text: str) -> None:
        result = classify_input(text)
        assert result.risk_level == RiskLevel.MEDIUM

    def test_currency_category_present(self) -> None:
        result = classify_input("We budgeted PHP 25,000 for Q1.")
        assert DetectedCategory.CURRENCY_AMOUNT in _categories(result)

    def test_currency_alone_has_no_warning(self) -> None:
        result = classify_input("The budget is $500.")
        assert result.warning_message is None

    def test_currency_case_insensitive_word_form(self) -> None:
        result = classify_input("He paid 1500 Pesos in cash.")
        assert DetectedCategory.CURRENCY_AMOUNT in _categories(result)


# ---------------------------------------------------------------------------
# Multiple categories in one text
# ---------------------------------------------------------------------------


class TestMultipleCategories:
    def test_email_and_phone_both_detected(self) -> None:
        text = "Contact alice@example.com or call 09171234567."
        result = classify_input(text)
        cats = _categories(result)
        assert DetectedCategory.EMAIL in cats
        assert DetectedCategory.PHONE in cats

    def test_email_and_phone_risk_is_medium(self) -> None:
        text = "Contact alice@example.com or call 09171234567."
        result = classify_input(text)
        assert result.risk_level == RiskLevel.MEDIUM

    def test_credential_and_email_risk_is_high(self) -> None:
        text = "Send the api_key to alice@example.com"
        result = classify_input(text)
        assert result.risk_level == RiskLevel.HIGH

    def test_credential_and_email_both_detected(self) -> None:
        text = "Send the api_key to alice@example.com"
        result = classify_input(text)
        cats = _categories(result)
        assert DetectedCategory.CREDENTIAL_KEYWORD in cats
        assert DetectedCategory.EMAIL in cats

    def test_high_risk_overrides_medium_risk(self) -> None:
        # Starts with a medium category (email), then hits a high category (password)
        text = "user@domain.com shared the password: letmein"
        result = classify_input(text)
        assert result.risk_level == RiskLevel.HIGH

    def test_all_three_high_risk_categories_in_one_message(self) -> None:
        text = "NDA protected. Card 4111111111111111. API_KEY=abc123."
        result = classify_input(text)
        cats = _categories(result)
        assert DetectedCategory.CONFIDENTIALITY_MARKER in cats
        assert DetectedCategory.CREDIT_CARD in cats
        assert DetectedCategory.CREDENTIAL_KEYWORD in cats
        assert result.risk_level == RiskLevel.HIGH

    def test_multiple_medium_categories_produce_no_warning(self) -> None:
        text = "email: dev@corp.ph, phone: 09171234567, budget: PHP 10,000"
        result = classify_input(text)
        assert result.risk_level == RiskLevel.MEDIUM
        assert result.warning_message is None


# ---------------------------------------------------------------------------
# Warning message language detection
# ---------------------------------------------------------------------------


class TestWarningLanguage:
    """Warning messages are only emitted at HIGH risk and use the detected language."""

    # -- Language detection helper directly --

    def test_detect_language_japanese(self) -> None:
        assert _detect_language("このファイルは機密です。") == "ja"

    def test_detect_language_korean(self) -> None:
        assert _detect_language("이 문서는 대외비입니다.") == "ko"

    def test_detect_language_tagalog_two_markers(self) -> None:
        # "ang" and "na" are both Tagalog markers -> tl
        assert _detect_language("Ang dokumento na ito ay pribado.") == "tl"

    def test_detect_language_tagalog_needs_two_markers(self) -> None:
        # Only one marker ("ang") -> falls back to en
        assert _detect_language("ang word") == "en"

    def test_detect_language_english_default(self) -> None:
        assert _detect_language("Please review the attached document.") == "en"

    def test_detect_language_hiragana_counts_as_japanese(self) -> None:
        # Hiragana range U+3040-U+30FF
        assert _detect_language("これはひらがなです。") == "ja"

    # -- Warning language mapping directly --

    def test_warning_for_japanese(self) -> None:
        msg = _warning_for_language("ja")
        assert "警告" in msg

    def test_warning_for_korean(self) -> None:
        msg = _warning_for_language("ko")
        assert "경고" in msg

    def test_warning_for_tagalog(self) -> None:
        msg = _warning_for_language("tl")
        assert "Babala" in msg

    def test_warning_for_english_default(self) -> None:
        msg = _warning_for_language("en")
        assert "Warning" in msg

    def test_warning_for_unknown_lang_falls_back_to_english(self) -> None:
        msg = _warning_for_language("fr")
        assert "Warning" in msg

    # -- End-to-end: classify_input picks the right warning language --

    def test_japanese_high_risk_message_gets_japanese_warning(self) -> None:
        # 機密 is a confidentiality marker AND triggers Japanese language detection
        result = classify_input("このファイルは機密です。")
        assert result.warning_message is not None
        assert "警告" in result.warning_message

    def test_korean_high_risk_message_gets_korean_warning(self) -> None:
        # 대외비 is a confidentiality marker AND triggers Korean language detection
        result = classify_input("이 보고서는 대외비입니다.")
        assert result.warning_message is not None
        assert "경고" in result.warning_message

    def test_tagalog_high_risk_message_gets_tagalog_warning(self) -> None:
        # "Ang" + "na" are Tagalog markers (>=2); "password" is a credential keyword
        result = classify_input("Ang password na ito ay sikreto.")
        assert result.warning_message is not None
        assert "Babala" in result.warning_message

    def test_english_high_risk_message_gets_english_warning(self) -> None:
        result = classify_input("Please keep the password safe.")
        assert result.warning_message is not None
        assert "Warning" in result.warning_message

    def test_medium_risk_never_has_warning_regardless_of_language(self) -> None:
        # Japanese text with only MEDIUM-risk category (email)
        result = classify_input("田中様にメールをお送りします user@example.com")
        # honorific_name + email both medium -> no warning even in Japanese
        assert result.warning_message is None


# ---------------------------------------------------------------------------
# Return type contract
# ---------------------------------------------------------------------------


class TestReturnType:
    def test_returns_data_classification_instance(self) -> None:
        result = classify_input("Hello world")
        assert isinstance(result, DataClassification)

    def test_risk_level_is_risk_level_enum(self) -> None:
        result = classify_input("Hello world")
        assert isinstance(result.risk_level, RiskLevel)

    def test_detected_categories_is_list(self) -> None:
        result = classify_input("Hello world")
        assert isinstance(result.detected_categories, list)

    def test_no_duplicate_categories(self) -> None:
        # A text that triggers the same pattern multiple times should not
        # produce duplicate categories in the output list.
        result = classify_input("password here and password there")
        cats = result.detected_categories
        assert len(cats) == len(set(cats))
