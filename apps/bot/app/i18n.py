"""Multilingual string templates for the Company Brain Telegram bot.

Supported languages:
    - ``"en"`` English (default)
    - ``"ja"`` Japanese (日本語)
    - ``"ko"`` Korean (한국어)
    - ``"tl"`` Tagalog (Filipino)

Usage::

    from app.i18n import t

    msg = t("welcome", lang="ja")
    msg = t("language_set", lang="en", language="Japanese")
"""

from __future__ import annotations

_TRANSLATIONS: dict[str, dict[str, str]] = {
    "en": {
        "welcome": (
            "Welcome to Company Brain! I'm your AI-powered company knowledge engine.\n\n"
            "Ask me anything about company policies, processes, and documentation.\n\n"
            "Available commands:\n"
            "/ask <question> - Ask anything\n"
            "/search <query> - Search documents\n"
            "/lang <en|ja|ko|tl> - Set language\n"
            "/history - Show conversation summary\n"
            "/clear - Reset conversation\n"
            "/help - Show all commands"
        ),
        "error": "Sorry, something went wrong. Please try again.",
        "typing": "Thinking...",
        "no_results": "No results found for your query.",
        "feedback_thanks": "Thanks for your feedback!",
        "help": (
            "Available commands:\n\n"
            "/ask <question> - Ask a question and get an AI answer with sources\n"
            "/search <query> - Search company knowledge base\n"
            "/lang <en|ja|ko|tl> - Set preferred response language\n"
            "/language <en|ja|ko|tl> - Alias for /lang\n"
            "/history - Show recent conversation summary\n"
            "/clear - Reset conversation and start fresh\n"
            "/help - Show this message\n\n"
            "In group chats: mention me with @botname followed by your question."
        ),
        "rate_limit": "Please wait a moment before sending another message.",
        "language_set": "Language set to {language}.",
        "history_empty": "No conversation history yet.",
        "conversation_cleared": "Conversation cleared. Start fresh!",
    },
    "ja": {
        "welcome": (
            "Company Brainへようこそ！AI搭載の社内知識エンジンです。\n\n"
            "会社のポリシー、プロセス、ドキュメントについて何でもお聞きください。\n\n"
            "利用可能なコマンド:\n"
            "/ask <質問> - 質問する\n"
            "/search <検索ワード> - ドキュメントを検索\n"
            "/lang <en|ja|ko|tl> - 言語を設定\n"
            "/history - 会話履歴を表示\n"
            "/clear - 会話をリセット\n"
            "/help - 全コマンドを表示"
        ),
        "error": "申し訳ありません。エラーが発生しました。もう一度お試しください。",
        "typing": "考え中...",
        "no_results": "お探しの情報が見つかりませんでした。",
        "feedback_thanks": "フィードバックありがとうございます！",
        "help": (
            "利用可能なコマンド:\n\n"
            "/ask <質問> - AIによる回答と情報源を取得\n"
            "/search <検索ワード> - 社内知識ベースを検索\n"
            "/lang <en|ja|ko|tl> - 回答言語を設定\n"
            "/language <en|ja|ko|tl> - /langのエイリアス\n"
            "/history - 最近の会話履歴を表示\n"
            "/clear - 会話をリセットして最初から始める\n"
            "/help - このメッセージを表示\n\n"
            "グループチャットでは: @botname に続けて質問してください。"
        ),
        "rate_limit": "しばらく待ってからメッセージを送信してください。",
        "language_set": "言語を{language}に設定しました。",
        "history_empty": "まだ会話履歴がありません。",
        "conversation_cleared": "会話をリセットしました。新しく始めましょう！",
    },
    "ko": {
        "welcome": (
            "Company Brain에 오신 것을 환영합니다! AI 기반 회사 지식 엔진입니다.\n\n"
            "회사 정책, 프로세스, 문서에 대해 무엇이든 질문하세요.\n\n"
            "사용 가능한 명령어:\n"
            "/ask <질문> - 질문하기\n"
            "/search <검색어> - 문서 검색\n"
            "/lang <en|ja|ko|tl> - 언어 설정\n"
            "/history - 대화 요약 보기\n"
            "/clear - 대화 초기화\n"
            "/help - 모든 명령어 보기"
        ),
        "error": "죄송합니다. 오류가 발생했습니다. 다시 시도해 주세요.",
        "typing": "생각 중...",
        "no_results": "검색 결과를 찾을 수 없습니다.",
        "feedback_thanks": "피드백 감사합니다!",
        "help": (
            "사용 가능한 명령어:\n\n"
            "/ask <질문> - AI 답변 및 출처 받기\n"
            "/search <검색어> - 회사 지식 베이스 검색\n"
            "/lang <en|ja|ko|tl> - 응답 언어 설정\n"
            "/language <en|ja|ko|tl> - /lang의 별칭\n"
            "/history - 최근 대화 요약 보기\n"
            "/clear - 대화 초기화 후 새로 시작\n"
            "/help - 이 메시지 보기\n\n"
            "그룹 채팅에서: @botname 뒤에 질문을 입력하세요."
        ),
        "rate_limit": "잠시 후 다시 메시지를 보내주세요.",
        "language_set": "언어가 {language}(으)로 설정되었습니다.",
        "history_empty": "아직 대화 기록이 없습니다.",
        "conversation_cleared": "대화가 초기화되었습니다. 새로 시작하세요!",
    },
    "tl": {
        "welcome": (
            "Maligayang pagdating sa Company Brain! "
            "Ako ang inyong AI-powered na knowledge engine.\n\n"
            "Magtanong tungkol sa mga patakaran ng kumpanya, proseso, at dokumentasyon.\n\n"
            "Mga available na command:\n"
            "/ask <tanong> - Magtanong\n"
            "/search <query> - Maghanap ng dokumento\n"
            "/lang <en|ja|ko|tl> - Itakda ang wika\n"
            "/history - Ipakita ang buod ng usapan\n"
            "/clear - I-reset ang usapan\n"
            "/help - Ipakita ang lahat ng command"
        ),
        "error": "Paumanhin, may nangyaring mali. Subukan muli.",
        "typing": "Nag-iisip...",
        "no_results": "Walang nahanap na resulta para sa inyong tanong.",
        "feedback_thanks": "Salamat sa inyong feedback!",
        "help": (
            "Mga available na command:\n\n"
            "/ask <tanong> - Magtanong at makakuha ng AI na sagot na may mga pinagkukunan\n"
            "/search <query> - Maghanap sa knowledge base ng kumpanya\n"
            "/lang <en|ja|ko|tl> - Itakda ang wika ng sagot\n"
            "/language <en|ja|ko|tl> - Katumbas ng /lang\n"
            "/history - Ipakita ang buod ng kamakailang usapan\n"
            "/clear - I-reset ang usapan at magsimulang muli\n"
            "/help - Ipakita ang mensaheng ito\n\n"
            "Sa mga group chat: banggitin ako ng @botname at ang inyong tanong."
        ),
        "rate_limit": "Mangyaring maghintay ng sandali bago magpadala ng bagong mensahe.",
        "language_set": "Ang wika ay nakatakda na sa {language}.",
        "history_empty": "Wala pang kasaysayan ng usapan.",
        "conversation_cleared": "Nai-reset na ang usapan. Magsimula muli!",
    },
}

_FALLBACK_LANG = "en"


def t(key: str, lang: str = "en", **kwargs: str) -> str:
    """Get a translated string by key and language code.

    Falls back to English when the requested language or key is not found.
    Supports ``str.format``-style placeholders via ``kwargs``.

    Args:
        key: Translation key (e.g. ``"welcome"``, ``"error"``).
        lang: BCP-47 language code (``"en"``, ``"ja"``, ``"ko"``, ``"tl"``).
        **kwargs: Named format arguments substituted into the template string.

    Returns:
        Translated and formatted string.

    Example::

        t("language_set", lang="en", language="Japanese")
        # "Language set to Japanese."
    """
    lang_dict = _TRANSLATIONS.get(lang) or _TRANSLATIONS[_FALLBACK_LANG]
    template = lang_dict.get(key) or _TRANSLATIONS[_FALLBACK_LANG].get(key, key)
    if kwargs:
        try:
            return template.format(**kwargs)
        except KeyError:
            return template
    return template
