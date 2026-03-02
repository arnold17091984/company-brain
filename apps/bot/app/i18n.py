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
        # ── Onboarding ──────────────────────────────────────────────────────────
        "onboarding_welcome": (
            "Welcome to Company Brain!\n\n"
            "I'm your AI-powered knowledge engine. I can instantly answer questions about "
            "company policies, processes, client history, and internal documentation "
            "in English, Japanese, Korean, and Filipino.\n\n"
            "Let's get you set up in just a few steps."
        ),
        "onboarding_lang_prompt": "Choose your preferred language:",
        "onboarding_dept_prompt": "Which team are you on?",
        "onboarding_dept_sales": "Sales",
        "onboarding_dept_dev": "Development",
        "onboarding_dept_backoffice": "Back Office",
        "onboarding_dept_marketing": "Marketing",
        "onboarding_wow_sales": (
            "Here's what I can do for your team:\n\n"
            "Try asking me: \"Draft a follow-up email for a client meeting about cloud migration\""
        ),
        "onboarding_wow_dev": (
            "Here's what I can do for your team:\n\n"
            "Try asking me: \"Explain our API authentication flow and suggest improvements\""
        ),
        "onboarding_wow_backoffice": (
            "Here's what I can do for your team:\n\n"
            "Try asking me: \"What is the process for submitting expense reports?\""
        ),
        "onboarding_wow_marketing": (
            "Here's what I can do for your team:\n\n"
            "Try asking me: \"Create 3 social media post ideas for our new AI product launch\""
        ),
        "onboarding_complete": "You're all set! Start chatting with me anytime.",
        "onboarding_tip": (
            "Tip: The more context you give me, the better my answers. "
            "Include relevant details like client names, project codes, or timeframes."
        ),
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
        # ── Onboarding ──────────────────────────────────────────────────────────
        "onboarding_welcome": (
            "Company Brainへようこそ！\n\n"
            "AIを活用した社内知識エンジンです。会社のポリシー、プロセス、顧客履歴、"
            "社内ドキュメントに関する質問に、英語・日本語・韓国語・フィリピン語で即座に回答します。\n\n"
            "いくつかの簡単なステップで設定を完了しましょう。"
        ),
        "onboarding_lang_prompt": "ご希望の言語を選択してください:",
        "onboarding_dept_prompt": "所属チームを選択してください:",
        "onboarding_dept_sales": "営業",
        "onboarding_dept_dev": "開発",
        "onboarding_dept_backoffice": "バックオフィス",
        "onboarding_dept_marketing": "マーケティング",
        "onboarding_wow_sales": (
            "営業チームへのサポート例:\n\n"
            "こんな質問を試してみてください: \"クラウド移行の打ち合わせ後のフォローアップメールを作成してください\""
        ),
        "onboarding_wow_dev": (
            "開発チームへのサポート例:\n\n"
            "こんな質問を試してみてください: \"APIの認証フローを説明し、改善案を提案してください\""
        ),
        "onboarding_wow_backoffice": (
            "バックオフィスへのサポート例:\n\n"
            "こんな質問を試してみてください: \"経費精算の申請手順を教えてください\""
        ),
        "onboarding_wow_marketing": (
            "マーケティングチームへのサポート例:\n\n"
            "こんな質問を試してみてください: \"新しいAI製品ローンチ向けのSNS投稿アイデアを3つ作成してください\""
        ),
        "onboarding_complete": "設定が完了しました！いつでもチャットを始めてください。",
        "onboarding_tip": (
            "ヒント: 詳細な情報を伝えるほど、より良い回答が得られます。"
            "顧客名、プロジェクトコード、期間などの関連情報を含めてください。"
        ),
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
        # ── Onboarding ──────────────────────────────────────────────────────────
        "onboarding_welcome": (
            "Company Brain에 오신 것을 환영합니다!\n\n"
            "AI 기반 지식 엔진으로 회사 정책, 프로세스, 고객 이력, 사내 문서에 관한 질문에 "
            "영어, 일본어, 한국어, 필리핀어로 즉시 답변해 드립니다.\n\n"
            "몇 가지 간단한 단계로 설정을 완료해 보세요."
        ),
        "onboarding_lang_prompt": "선호하는 언어를 선택하세요:",
        "onboarding_dept_prompt": "어느 팀에 속해 계신가요?",
        "onboarding_dept_sales": "영업",
        "onboarding_dept_dev": "개발",
        "onboarding_dept_backoffice": "백오피스",
        "onboarding_dept_marketing": "마케팅",
        "onboarding_wow_sales": (
            "영업팀을 위한 활용 예시:\n\n"
            "이렇게 질문해 보세요: \"클라우드 마이그레이션 관련 고객 미팅 후 팔로업 이메일을 작성해 주세요\""
        ),
        "onboarding_wow_dev": (
            "개발팀을 위한 활용 예시:\n\n"
            "이렇게 질문해 보세요: \"API 인증 흐름을 설명하고 개선 방안을 제안해 주세요\""
        ),
        "onboarding_wow_backoffice": (
            "백오피스를 위한 활용 예시:\n\n"
            "이렇게 질문해 보세요: \"경비 보고서 제출 절차가 어떻게 되나요?\""
        ),
        "onboarding_wow_marketing": (
            "마케팅팀을 위한 활용 예시:\n\n"
            "이렇게 질문해 보세요: \"새 AI 제품 출시를 위한 소셜 미디어 게시물 아이디어 3가지를 만들어 주세요\""
        ),
        "onboarding_complete": "설정이 완료되었습니다! 언제든지 대화를 시작하세요.",
        "onboarding_tip": (
            "팁: 더 많은 컨텍스트를 제공할수록 더 좋은 답변을 받을 수 있습니다. "
            "고객명, 프로젝트 코드, 날짜 범위 등 관련 세부 정보를 포함해 보세요."
        ),
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
        # ── Onboarding ──────────────────────────────────────────────────────────
        "onboarding_welcome": (
            "Maligayang pagdating sa Company Brain!\n\n"
            "Ako ang inyong AI-powered na knowledge engine. Agad akong makakatulong sa mga "
            "tanong tungkol sa mga patakaran ng kumpanya, proseso, kasaysayan ng kliyente, "
            "at panloob na dokumentasyon sa English, Japanese, Korean, at Filipino.\n\n"
            "Gawin nating kumpleto ang setup sa ilang hakbang."
        ),
        "onboarding_lang_prompt": "Piliin ang inyong gustong wika:",
        "onboarding_dept_prompt": "Sa anong team kayo naroroon?",
        "onboarding_dept_sales": "Sales",
        "onboarding_dept_dev": "Development",
        "onboarding_dept_backoffice": "Back Office",
        "onboarding_dept_marketing": "Marketing",
        "onboarding_wow_sales": (
            "Narito ang maaari kong gawin para sa inyong team:\n\n"
            "Subukan itanong: \"Gumawa ng follow-up email para sa client meeting tungkol sa cloud migration\""
        ),
        "onboarding_wow_dev": (
            "Narito ang maaari kong gawin para sa inyong team:\n\n"
            "Subukan itanong: \"Ipaliwanag ang aming API authentication flow at magmungkahi ng mga pagpapabuti\""
        ),
        "onboarding_wow_backoffice": (
            "Narito ang maaari kong gawin para sa inyong team:\n\n"
            "Subukan itanong: \"Ano ang proseso ng pag-submit ng expense reports?\""
        ),
        "onboarding_wow_marketing": (
            "Narito ang maaari kong gawin para sa inyong team:\n\n"
            "Subukan itanong: \"Gumawa ng 3 ideya para sa social media post para sa aming bagong AI product launch\""
        ),
        "onboarding_complete": "Handa ka na! Makipag-chat sa akin anumang oras.",
        "onboarding_tip": (
            "Tip: Mas maraming konteksto ang ibinibigay mo, mas maganda ang aking mga sagot. "
            "Isama ang mga detalye tulad ng mga pangalan ng kliyente, project code, o timeframe."
        ),
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
