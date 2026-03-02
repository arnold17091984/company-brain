# Company Brain: AI統合ナレッジエンジン 実装計画 v4

## Context

グループ会社（日本200名+フィリピン40名）で、ナレッジがGoogle Workspace、Telegram、Notion、ERP/CRM等に分散している。**まずフィリピンの40名規模のIT/開発会社（B-Ticketクーポンアプリ+その他サービス開発）に先行導入**し、検証後に日本の200名+の会社に展開する。

**フィリピン会社の特徴:**
- 従業員約40名、IT/ソフトウェア開発業
- コミュニケーション: **Telegram**（メイン）+ LINE（サブ）
- ツール: Google Workspace、Notion、ERP/会計、CRM
- 言語: 英語・日本語・韓国語の3言語混在
- コンプライアンス: 最小限（まず動くものを優先）

**3つの柱**: ナレッジ検索・Q&A / 業務自動化 / 意思決定支援

**レビュー完了**: 11名のエキスパートによる検証済み（日本200名版の知見を40名版に適用）

---

## アーキテクチャ概要

```
[従業員] → [Telegram Bot] or [Next.js Web UI] → [API Gateway (FastAPI on Railway)]
                                                        |
                                    +-------------------+-------------------+
                                    |                   |                   |
                             [Knowledge API]     [Automation API]    [Analytics API]
                                    |                   |                   |
                                    +-------------------+-------------------+
                                                        |
                                          [AI Orchestration Layer]
                                          LangGraph + Claude API
                                          (Model Router: Haiku→Sonnet)
                                                        |
                              +------------+------------+
                              |            |            |
                         [Qdrant]    [PostgreSQL]   [Redis]
                        (ベクトル)    (メタデータ     (セマンティック
                                      RBAC/監査)     キャッシュ)
                                                        |
                                          [Data Ingestion Pipeline]
                                          Inngest Workflows
                                                        |
                    +-------+-------+-------+-------+
                    |       |       |       |       |
                 Google   Telegram  Notion  ERP   CRM
                Workspace
```

**日本版からの簡素化:**
- ~~Neo4j Aura（GraphRAG）~~ → Phase 1では不要（40名なら組織構造はシンプル）
- ~~SpiceDB~~ → PostgreSQL RLSで十分（40名、部門数少ない）
- ~~Slack Bot~~ → **Telegram Bot**（python-telegram-bot）
- ~~7層セキュリティ~~ → 実用的な4層に簡素化
- ~~Phase 0（法務準備2週間）~~ → 最小限の同意で即開始

---

## 技術スタック

| レイヤー | 技術 | 選定理由 |
|---------|------|---------|
| **Backend** | Python 3.12+ / FastAPI | AI/MLライブラリ最豊富、async-first |
| **Frontend** | Next.js 14+ (App Router) on **Vercel** | SSR/SSE対応、shadcn/ui |
| **Telegram Bot** | python-telegram-bot v20+ | Phase 1のメインUI、async対応 |
| **Vector DB** | Qdrant (Cloud) | ハイブリッド検索、3言語対応 |
| **RDB** | PostgreSQL 16 (Supabase) | メタデータ、RLS、監査ログ |
| **Cache** | Redis (Upstash) | セマンティックキャッシュ（2層） |
| **LLM** | Claude Sonnet 4.6 + Haiku 4.5 | モデルルーター: Haiku分類→Sonnet生成 |
| **Embedding** | BGE-M3 via **Together AI API** | **英語・日本語・韓国語の3言語対応**、dense+sparse |
| **Contextual Retrieval** | Claude Haiku | チャンク前処理で文脈付加（精度+20-35%） |
| **Reranker** | Cohere Rerank v3 | 検索精度+5-15% |
| **Orchestration** | LangGraph | ステートフルなエージェントワークフロー |
| **Ingestion** | **Inngest** | イベントドリブン、サーバーレス |
| **Auth** | Google SSO (NextAuth.js v5) | 既存Google Workspace連携 |
| **Authorization** | **PostgreSQL RLS** | 40名規模ならRLSで十分（SpiceDB不要） |
| **Observability** | **Langfuse Cloud** + Sentry | LLMトレース + エラー監視 |
| **Infra** | **Railway** | ワンクリックデプロイ、CTO一人で運用可能 |
| **CI/CD** | GitHub Actions | 自動テスト・デプロイ |

### 日本200名版への拡張パス
フィリピン40名版をベースに、日本展開時に以下を追加:
- PostgreSQL RLS → SpiceDB（200名+の複雑な権限管理）
- Telegram Bot → Slack Bot（日本はSlack利用の場合）
- GraphRAG（Neo4j Aura）追加
- APPI対応、就業規則改定、全ベンダーDPA締結
- 7層セキュリティ強化

---

## セキュリティ設計（40名版: 実用的な4層）

### 3層アクセス制御

| レベル | 対象データ | アクセス権 |
|--------|-----------|-----------|
| **all** | 社内Wiki、公開チャンネル、一般ドキュメント | 全従業員 |
| **department** | 部門固有ドキュメント | 部門メンバー |
| **restricted** | 給与、評価、経営情報 | 指名された個人のみ |

### 4層セキュリティ

| 層 | 対策 |
|----|------|
| **1. 認証・認可** | Google SSO + PostgreSQL RLS |
| **2. データ保護** | 給与・評価データはベクトルストアに入れない → Text-to-SQL |
| **3. 出力防御** | PIIマスキング、引用検証 |
| **4. 監査** | 全クエリ記録（誰が・何を・いつ） |

### 最小限のプライバシー対応
- 従業員への簡易通知:「社内AIシステムがGoogle Drive・Telegram（グループのみ）・Notionを検索します」
- Telegram DM・プライベートチャットは**取り込まない**
- 給与・評価データはベクトルストアに入れない

---

## RAGパイプライン

```
ユーザークエリ（英語/日本語/韓国語）
  → [0] セマンティックキャッシュ確認（Redis）
  → [1] クエリ理解（Haikuでintent分類・言語検出・クエリ書き換え）
  → [2] ルーティング（RAG / Text-to-SQL / ハイブリッド）
  → [3] ハイブリッド検索（dense + sparse BM25、Qdrant）+ RLS必須フィルタ
  → [4] Reranking（Cohere、top-50 → top-10）
  → [5] コンテキスト組立（親ドキュメント取得、重複排除）
  → [6] 検索品質ゲート（不十分なら「情報が見つかりません」）
  → [7] LLM生成（Claude Sonnet、SSEストリーミング、引用付き）
       ※ クエリと同じ言語で回答（多言語自動対応）
  → [8] 後処理（引用検証、PIIマスキング、監査ログ）
  → [9] セマンティックキャッシュ保存
```

### 3言語対応のポイント
- **BGE-M3**: 英語・日本語・韓国語を同一ベクトル空間で扱える（cross-lingual retrieval）
- **クエリ言語自動検出**: Haikuで言語を判定し、回答も同じ言語で生成
- **Cross-lingual検索**: 日本語で質問しても英語ドキュメントがヒットする（BGE-M3の特性）
- **チャンキング**: 日本語は256-512トークン、韓国語は256-512トークン、英語は512-1024トークン

### Contextual Retrieval（精度+20-35%）
```
[原文チャンク] → Haiku「このチャンクはどのドキュメントの何について述べているか」
→ [文脈付きチャンク] → BGE-M3 embedding → Qdrant
```

### セマンティックキャッシュ（2層）
1. **Exact Cache**: クエリハッシュ + ユーザーロールで完全一致
2. **Semantic Cache**: 類似度 > 0.95 でヒット（RBACロール込み）

---

## プロダクト戦略

### ロールアウト（40名一括）
40名規模なら段階展開は不要。全員同時に導入し、密なフィードバックで改善。
1. **Week 1**: CTO + 開発チーム（10名）で内部テスト
2. **Week 2**: 全従業員40名に展開 + キックオフセッション
3. **Week 3-4**: フィードバック収集と改善サイクル

### Telegram Bot UX
```
グループチャット or DM:

ユーザー: @company_brain_bot B-Ticketの決済フローはどうなってる？

Company Brain Bot:
💡 B-Ticketの決済フローについて:

1. ユーザーがクーポンを選択
2. Stripe決済画面にリダイレクト
3. 決済完了 → QRコード生成
4. 店舗でQRスキャンして利用

📎 ソース:
• [B-Ticket決済仕様書](リンク) - 更新: 2025.12
• [Stripe連携ガイド](リンク) - 更新: 2025.10

この回答は役に立ちましたか？ 👍 / 👎
```

### 部門別ユースケース（IT/開発会社向け）

| 部門/役割 | キラーユースケース | 期待効果 |
|----------|------------------|---------|
| **開発者** | 技術仕様書検索、ADR検索、過去のインシデント対応 | ドキュメント検索60%削減 |
| **PM** | プロジェクト進捗、仕様確認、過去見積もり参照 | 情報収集50%削減 |
| **QA** | テスト仕様書検索、既知バグ検索 | テスト準備40%削減 |
| **営業/BD** | 提案資料検索、過去案件参照 | 提案書作成40%削減 |
| **HR/Admin** | 就業規則FAQ、手続きガイド | 問い合わせ50%削減 |
| **経営** | プロジェクト状況一覧、KPIダッシュボード | 会議準備50%削減 |
| **CTO(あなた)** | 全社のナレッジ可視化、意思決定支援 | 属人化解消 |

### KPIフレームワーク

| 指標 | 目標 |
|------|------|
| DAU/MAU比率 | >50%（40名なので高めに） |
| 回答精度（人間評価） | >85% |
| 情報検索時間の短縮 | 50%削減 |
| NPS | >30 |
| Telegram Bot利用率 | >70%（メインUIのため） |

---

## フェーズ計画

### Phase 1: MVP — Telegram Bot + ナレッジ検索 (Week 1-6)

**ゴール**: Google Drive + Notion + Telegramの内容を**Telegramから**AIで検索・回答できる

**Week 1-2: 基盤構築**
- [ ] monorepoセットアップ（Turborepo: Next.js + FastAPI）
- [ ] Railway + Supabase + Qdrant Cloud + Upstash Redis プロビジョニング
- [ ] Google SSO認証（NextAuth.js v5）
- [ ] PostgreSQL RLSで3層アクセス制御
- [ ] FastAPI + CI/CD（GitHub Actions → Railway auto-deploy）
- [ ] Langfuse Cloud + Sentry接続
- [ ] Telegram Bot骨格（python-telegram-bot、Railway上にデプロイ）

**Week 3-4: データ取り込み**
- [ ] Google Driveコネクタ（Docs, Sheets, PDF）
- [ ] Notionコネクタ（ページ + データベース）
- [ ] Telegramコネクタ（グループチャットのみ、DM除外）
- [ ] Contextual Retrieval実装（Haiku、3言語対応）
- [ ] BGE-M3 エンベディング（Together AI API、3言語）
- [ ] Inngest で初回フルシンク + インクリメンタルシンク

**Week 5-6: RAGパイプライン + 仕上げ**
- [ ] Qdrantハイブリッド検索（dense + sparse）+ RLSフィルタ
- [ ] Cohere Reranking
- [ ] モデルルーター（Haiku分類 → Sonnet生成）
- [ ] Claude API統合 + SSEストリーミング
- [ ] セマンティックキャッシュ（Redis 2層）
- [ ] 検索品質ゲート + 幻覚防止
- [ ] 引用リンク + 鮮度表示
- [ ] Telegram Bot完成（メンション・DM・インライン対応）
- [ ] Web チャットUI（Next.js + shadcn/ui）
- [ ] フィードバック機能（👍👎）
- [ ] 監査ログ
- [ ] 従業員への簡易通知
- [ ] **全40名展開 + キックオフ**

### Phase 2: 拡張 — 業務データ統合 (Week 7-12)

- [ ] ERP/会計コネクタ（読み取り専用）— Text-to-SQL経由
- [ ] CRMコネクタ（読み取り専用）
- [ ] Text-to-SQL（READ ONLYユーザー + RLS + クエリテンプレート）
- [ ] ロールベースインテリジェンス（役職に応じた回答調整）
- [ ] レポート自動生成エージェント
- [ ] 管理画面（コネクタ管理、利用状況）
- [ ] LINE Bot追加（LINE利用者向け）
- [ ] フィードバックに基づくRAG精度改善

### Phase 3: 日本グループ会社展開準備 (Month 4-6)

- [ ] SpiceDBへのアップグレード（200名+の権限管理）
- [ ] Slack Botの追加開発（日本はSlack利用の場合）
- [ ] APPI法務対応（DPA締結、就業規則改定、プライバシーノーティス）
- [ ] 7層セキュリティ強化
- [ ] GraphRAG（Neo4j Aura）追加
- [ ] 日本語チャンキング最適化（Sudachi Mode C）
- [ ] 日本グループ会社パイロット（15名）開始

---

## プロジェクト構成

```
company-brain/
├── apps/
│   ├── web/                      # Next.js frontend (Vercel)
│   │   ├── app/
│   │   │   ├── (auth)/           # 認証ページ
│   │   │   ├── (dashboard)/
│   │   │   │   ├── chat/         # Q&Aインターフェース
│   │   │   │   ├── search/       # 検索結果
│   │   │   │   └── admin/        # 管理画面
│   │   │   └── api/              # BFF
│   │   └── components/
│   ├── api/                      # FastAPI backend (Railway)
│   │   ├── app/
│   │   │   ├── api/routes/       # エンドポイント
│   │   │   ├── core/             # 設定、認証、RLS
│   │   │   ├── models/           # DB/Pydanticモデル
│   │   │   ├── services/
│   │   │   │   ├── rag/          # RAGパイプライン
│   │   │   │   │   ├── pipeline.py
│   │   │   │   │   ├── retriever.py
│   │   │   │   │   ├── reranker.py
│   │   │   │   │   ├── cache.py
│   │   │   │   │   └── contextual.py
│   │   │   │   ├── agents/       # LangGraphエージェント
│   │   │   │   ├── llm/          # LLMクライアント + モデルルーター
│   │   │   │   └── security/     # PII検知
│   │   │   └── connectors/
│   │   │       ├── google_drive.py
│   │   │       ├── telegram.py
│   │   │       ├── notion.py
│   │   │       ├── erp.py        # Text-to-SQL (Phase 2)
│   │   │       └── crm.py        # Phase 2
│   │   └── workers/              # Inngest ワークフロー
│   └── bot/                      # Telegram Bot (Railway)
│       ├── app.py
│       ├── handlers/
│       │   ├── message.py        # メッセージ処理
│       │   ├── command.py        # /ask, /search コマンド
│       │   └── callback.py       # フィードバックボタン
│       └── formatters/
│           └── response.py       # Markdown整形
├── packages/                     # 共有パッケージ
├── infra/                        # Docker Compose (dev) + Railway設定
└── turbo.json
```

---

## コスト見積もり（月額、40名運用時）

| 項目 | 金額 | 備考 |
|------|------|------|
| Claude API (Sonnet + Haiku) | ¥20K - ¥60K | 40名、モデルルーター+キャッシュ |
| Together AI (BGE-M3) | ¥1K - ¥3K | 40名分のEmbedding |
| Cohere Rerank | ¥2K - ¥5K | |
| Qdrant Cloud | ¥0 - ¥15K | Free Tier → Starter |
| PostgreSQL (Supabase) | ¥0 - ¥4K | Free → Pro |
| Redis (Upstash) | ¥0 - ¥3K | Free Tier |
| Railway (API + Bot) | ¥5K - ¥15K | |
| Vercel (Frontend) | ¥0 | Free Tier |
| Langfuse Cloud | ¥0 | Free Tier |
| **合計** | **¥30K - ¥105K/月** | |
| **一人あたり** | **¥750 - ¥2,625/月** | |

**初期はFree Tierを最大活用 → 実際のコストは¥30K-50K/月から開始可能**

---

## 検証方法

### Phase 1完了時の検証（全40名）
1. **Telegram Bot動作**: メンション → 正確な回答+引用リンク（3言語で確認）
2. **Cross-lingual検索**: 日本語で質問 → 英語ドキュメントがヒット
3. **RLS検証**: restricted権限のないユーザーが給与情報にアクセスできない
4. **Web UI動作**: ブラウザからチャット → SSEストリーミング表示
5. **キャッシュ動作**: 同じ質問2回目 → 高速応答
6. **Langfuseトレース**: 全ステップが記録されている
7. **パフォーマンス**: 5同時ユーザーでレスポンスタイム < 5秒
8. **KPI**: DAU/MAU >50%、Telegram Bot利用率 >70%

---

## CTO側の事前準備

### 技術準備
1. **Google Workspace API** クレデンシャル発行（OAuth 2.0 + Service Account）
2. **Telegram Bot** 作成（BotFather経由、Bot Token取得）
3. **Notion Integration** 作成（Internal Integration Token）
4. **Anthropic API** キー発行
5. **Together AI API** キー発行
6. **Cohere API** キー発行

### 組織準備
7. 全従業員への簡易通知（AIシステム導入の案内）
8. Telegram グループチャットの整理（検索対象グループの確認）
9. Google Driveのフォルダ構造・権限の確認

## 開発環境ポータビリティ（別PCでスムーズに開発を継続するための設計）

### 新PCセットアップの全体フロー（所要時間: 約15分）

```
1. dotfiles clone + install.sh     → Claude Code skills + MCP定義インストール
2. /setup-environment 実行          → 20個のMCPサーバー自動設定
3. company-brain clone              → プロジェクトコード取得
4. docker compose up                → ローカル開発環境一発起動
5. Claude Code 起動                 → CLAUDE.md自動読み込み → コンテキスト復元
```

### 3つのリポジトリ構成

| リポジトリ | 用途 | 場所 |
|-----------|------|------|
| **dotfiles** | Claude Code skills + MCP設定の管理 | github.com/arnold17091984/dotfiles（既存） |
| **ai-knowledge** | プロジェクト計画・設計ドキュメント | github.com/arnold17091984/ai-knowledge（要git init） |
| **company-brain** | 本体アプリケーション（monorepo） | github.com/arnold17091984/company-brain（Phase 1で作成） |

### ai-knowledge リポジトリ（計画管理）

現在 `/Users/arnold/Documents/ai-knowledge/` はgitリポジトリではない。以下を実施:

```
ai-knowledge/
├── CLAUDE.md                    # Claude Code プロジェクト指示（既存）
├── docs/
│   └── plans/
│       ├── company-brain-v4.md  # ← 現在のプラン（~/.claude/plans/ からコピー）
│       └── ...                  # 他の設計ドキュメント
└── tasks/
    ├── todo.md                  # タスク管理
    └── lessons.md               # 学びの記録
```

**やること:**
- [ ] `git init` + GitHub リポジトリ作成 + push
- [ ] 現在のプラン（v4）を `docs/plans/company-brain-v4.md` に保存
- [ ] `.gitignore` 作成（`.claude/plans/` 等のローカルファイル除外）

### company-brain リポジトリ（ポータブル開発環境）

Phase 1開始時にmonorepoを作成。**どのPCでもclone → docker compose up で開発開始**できる設計:

```
company-brain/
├── CLAUDE.md                          # Claude Code プロジェクト指示
├── .claude/
│   └── settings.local.json            # プロジェクト固有の設定（gitignore）
├── .devcontainer/
│   └── devcontainer.json              # VS Code / Cursor Remote Containers対応
├── .env.example                       # 環境変数テンプレート（シークレットなし）
├── .env                               # 実際の環境変数（gitignore）
├── docker-compose.yml                 # ローカル開発: PostgreSQL + Redis + Qdrant
├── docker-compose.override.yml        # ローカル用オーバーライド（gitignore）
├── Makefile                           # ショートカットコマンド集
├── apps/
│   ├── api/                           # FastAPI (Python)
│   │   ├── pyproject.toml             # uv / pip 依存管理
│   │   ├── Dockerfile                 # Railway用 + ローカル用
│   │   └── ...
│   ├── web/                           # Next.js (TypeScript)
│   │   ├── package.json
│   │   ├── Dockerfile
│   │   └── ...
│   └── bot/                           # Telegram Bot (Python)
│       ├── pyproject.toml
│       ├── Dockerfile
│       └── ...
├── packages/                          # 共有パッケージ
├── infra/
│   ├── railway.toml                   # Railway デプロイ設定
│   └── scripts/
│       └── seed.sh                    # テストデータ投入
└── turbo.json                         # Turborepo設定
```

### .env.example（環境変数テンプレート）

```bash
# === AI / LLM ===
ANTHROPIC_API_KEY=          # Claude API
TOGETHER_AI_API_KEY=        # BGE-M3 embedding
COHERE_API_KEY=             # Reranker

# === Data Sources ===
GOOGLE_CLIENT_ID=           # Google OAuth
GOOGLE_CLIENT_SECRET=
GOOGLE_SERVICE_ACCOUNT_KEY= # base64 encoded JSON
TELEGRAM_BOT_TOKEN=         # BotFather
NOTION_INTEGRATION_TOKEN=

# === Infrastructure ===
DATABASE_URL=               # PostgreSQL (Supabase)
REDIS_URL=                  # Upstash Redis
QDRANT_URL=                 # Qdrant Cloud
QDRANT_API_KEY=

# === Monitoring ===
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
SENTRY_DSN=

# === Auth ===
NEXTAUTH_SECRET=            # openssl rand -base64 32
NEXTAUTH_URL=http://localhost:3000
```

### docker-compose.yml（ローカル開発用）

ローカル開発では外部サービスをDockerで再現:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: company_brain
      POSTGRES_USER: dev
      POSTGRES_PASSWORD: dev
    volumes: ["pgdata:/var/lib/postgresql/data"]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  qdrant:
    image: qdrant/qdrant:latest
    ports: ["6333:6333", "6334:6334"]
    volumes: ["qdrant_data:/qdrant/storage"]

volumes:
  pgdata:
  qdrant_data:
```

### Makefile（開発コマンド集）

```makefile
.PHONY: setup dev test clean

setup:                    ## 初回セットアップ
	cp .env.example .env
	docker compose up -d
	cd apps/api && uv sync
	cd apps/web && npm install
	cd apps/bot && uv sync

dev:                      ## 開発サーバー起動
	docker compose up -d
	turbo dev

test:                     ## テスト実行
	turbo test

clean:                    ## クリーンアップ
	docker compose down -v
```

### CLAUDE.md（company-brain用）

プロジェクト固有のClaude Code指示を含む:
- プロジェクト構成の説明
- コーディング規約（Python: Ruff, TypeScript: Biome）
- テスト方針
- デプロイフロー
- よく使うコマンド一覧

### dotfiles（既存 — 変更不要）

```
dotfiles/
├── install.sh                         # symlinks作成
└── claude/
    └── skills/
        └── setup-environment/
            └── SKILL.md               # 20個のMCPサーバー定義
```

新PCでの手順:
1. `git clone https://github.com/arnold17091984/dotfiles ~/dotfiles`
2. `cd ~/dotfiles && ./install.sh`
3. Claude Code起動 → `/setup-environment` 実行

---

## 運用ルール: プランの永続化

**プランモードで作成した計画は、常に `docs/plans/` に保存する。**
- `~/.claude/plans/` はPC固有 → 別PCでは参照不可
- `docs/plans/` にコピーすることでgit経由で全PCから参照可能
- ファイル名: `YYYY-MM-DD-<topic>.md`

---

## 次のアクション（今すぐ実行 → 別PCで継続可能にする）

### 今すぐ: ai-knowledge リポジトリ整備
1. `git init` + `.gitignore` 作成
2. 現在のプラン（v4）を `docs/plans/2026-02-28-company-brain-v4.md` に保存
3. GitHub リポジトリ作成 + push
4. dotfiles が最新か確認

### 別PCでの再開手順
```bash
# 1. dotfiles（Claude Code環境）
git clone https://github.com/arnold17091984/dotfiles ~/dotfiles
cd ~/dotfiles && ./install.sh
# Claude Code 起動 → /setup-environment 実行 → MCP設定完了

# 2. ai-knowledge（計画ドキュメント）
git clone https://github.com/arnold17091984/ai-knowledge ~/Documents/ai-knowledge
# Claude Code で開く → CLAUDE.md自動読み込み → コンテキスト復元

# 3. 「プランを読み込んで続きをやって」と伝える
#    → docs/plans/2026-02-28-company-brain-v4.md を参照して再開
```

### その後: company-brain monorepo 作成（Phase 1開始）
1. GitHub リポジトリ作成
2. Turborepo + Docker Compose + .env.example + Makefile
3. CLAUDE.md + .devcontainer
4. Telegram Bot骨格
5. CTO: クレデンシャル準備 + Telegramグループ整理
6. 目標: **6週間でフィリピン40名に展開完了**
