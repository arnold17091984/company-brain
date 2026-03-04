# Multi-LLM Routing & Knowledge Harvesting Design

**Date:** 2026-03-04
**Status:** Approved
**Author:** Claude (AI) + Arnold (Product Owner)

---

## 1. Overview

Two features to be implemented:

1. **Multi-LLM Provider Routing** — Role-based routing across Claude, Gemini, and OpenAI to optimize cost while maintaining quality for management.
2. **Knowledge Harvesting** — AI-driven structured interview system to extract tacit knowledge from departing employees via Telegram Bot and Web UI.

---

## 2. Feature 1: Multi-LLM Provider Routing

### 2.1 Architecture

```
Chat/Search Endpoint
        │
        ▼
   ModelRouter (role + difficulty)
        │
        ├─── ClaudeProvider (Anthropic SDK)
        ├─── GeminiProvider (Google GenAI SDK)
        └─── OpenAIProvider (OpenAI SDK)
```

All providers implement a common `LLMProvider` protocol:

```python
class LLMProvider(Protocol):
    async def generate(self, messages, system, model_id, max_tokens, temperature) -> LLMResponse
    async def stream(self, messages, system, model_id, max_tokens, temperature) -> AsyncIterator[str]
    def supports_thinking(self, model_id) -> bool
```

### 2.2 Model Registry

| Provider  | Model               | Use Case                     | Input $/1M | Output $/1M |
|-----------|---------------------|------------------------------|------------|-------------|
| Anthropic | claude-sonnet-4-6   | Management, high-quality     | $3.00      | $15.00      |
| Anthropic | claude-haiku-4-5    | Escalation, admin tasks      | $0.80      | $4.00       |
| Google    | gemini-2.0-flash    | Employee default             | $0.075     | $0.30       |
| Google    | gemini-2.0-flash-lite | Classification, lightweight | $0.0375    | $0.15       |
| OpenAI    | gpt-4o-mini         | Fallback                     | $0.15      | $0.60       |

### 2.3 Routing Rules

| Role              | Default Model        | Escalation                              |
|-------------------|----------------------|-----------------------------------------|
| CEO / Executive   | claude-sonnet-4-6    | None (always highest quality)           |
| HR / Manager      | claude-sonnet-4-6    | None (handles confidential HR data)     |
| Employee          | gemini-2.0-flash     | claude-haiku-4-5 if confidence < 0.6    |
| Admin             | claude-haiku-4-5     | None                                    |

### 2.4 Escalation Logic

For `employee` role only:
1. Generate initial response with Gemini Flash
2. Evaluate response confidence (RAG chunk scores + response coherence)
3. If confidence < threshold (default 0.6), re-generate with Claude Haiku
4. Return the higher-quality response

### 2.5 Admin Configuration

Add to `system_settings` table:
- `llm_routing_rules` — JSON mapping of role → default model
- `llm_escalation_threshold` — Float threshold for escalation (default 0.6)
- `llm_fallback_provider` — Provider to use when primary fails

### 2.6 Config Changes

New environment variables:
- `GEMINI_API_KEY` — Google AI Studio API key
- `OPENAI_API_KEY` — OpenAI API key

---

## 3. Feature 2: Knowledge Harvesting

### 3.1 Data Model

**User table additions:**
- `employment_status` — enum: active / departing / departed (default: active)
- `departure_date` — Date, nullable
- `departure_flagged_by` — UUID FK to users, nullable
- `departure_flagged_at` — Timestamp, nullable
- `job_title` — VARCHAR(200), nullable
- `manager_id` — UUID FK to users, nullable

**New tables:**

```sql
harvest_sessions:
  id UUID PK
  target_user_id UUID FK(users)
  status VARCHAR(20) DEFAULT 'active'  -- active / completed / paused
  total_questions INT DEFAULT 0
  answered_questions INT DEFAULT 0
  created_by UUID FK(users)
  created_at TIMESTAMP
  completed_at TIMESTAMP NULL

harvest_questions:
  id UUID PK
  session_id UUID FK(harvest_sessions)
  category VARCHAR(50)       -- project / process / client / tool / team
  question TEXT NOT NULL
  answer TEXT NULL
  answer_quality FLOAT NULL  -- AI evaluation score 0-1
  source VARCHAR(20)         -- telegram / web
  asked_at TIMESTAMP
  answered_at TIMESTAMP NULL
```

### 3.2 Question Generation

When a user is flagged as `departing`:
1. Collect their past chat history, related documents, and department projects
2. Use Claude Sonnet (one-time) to generate 15-30 targeted questions across 5 categories:
   - **Project knowledge** — Design decisions, architecture rationale
   - **Business processes** — Client workflows, reporting procedures
   - **Troubleshooting** — Incident response, known issues
   - **Contacts & relationships** — Client contacts, vendor relationships
   - **Improvement suggestions** — Recommendations for their domain

### 3.3 Telegram Bot Flow

```
[CEO/HR/Manager flags user as departing in admin UI]
  → harvest_session created
  → AI generates question list (Claude Sonnet)
  → Bot sends intro DM to target user
  → Daily at 10:00 AM: Bot sends 3-5 unanswered questions
  → Target replies → answer stored + vectorized → indexed in Qdrant
  → AI evaluates answer quality → adds follow-up if insufficient
  → All questions answered OR departure_date reached
  → Session completed → report sent to HR/Manager
```

### 3.4 Web UI

**Admin Harvest Dashboard (/admin/harvest):**
- List of flagged users with progress bars
- Per-user question/answer detail view
- "Flag for departure" button with date picker
- Export report (summary of collected knowledge)

**Target user experience:**
- No special UI — questions arrive via Telegram Bot
- Answers visible in their normal chat history
- Web chat also accepts harvest question responses

### 3.5 Security & Compliance

- Harvested data: `access_level = "restricted"` + ACL for CEO/HR/direct manager only
- Target user can view own answers but cannot edit
- All access logged in `audit_logs`
- RA 10173 (Philippines Data Privacy Act) compliance: notify target of purpose and retention
- Data retained permanently as company knowledge asset

### 3.6 Vectorization

Harvested answers are:
1. Chunked and embedded via BGE-M3 (same as regular documents)
2. Stored in Qdrant with payload:
   - `source_type: "harvest"`
   - `category: harvest_question.category`
   - `related_employee_id: target_user_id`
   - `access_level: "restricted"`
3. Searchable by authorized users through normal RAG pipeline

---

## 4. Implementation Scope

### New Files
- `apps/api/app/services/llm/gemini_service.py` — Gemini provider
- `apps/api/app/services/llm/openai_service.py` — OpenAI provider
- `apps/api/app/services/llm/provider.py` — LLMProvider protocol + factory
- `apps/api/app/services/harvest/question_generator.py` — AI question generation
- `apps/api/app/services/harvest/session_manager.py` — Harvest session lifecycle
- `apps/api/app/api/routes/harvest.py` — Harvest API endpoints
- `apps/api/alembic/versions/YYYYMMDD_multi_llm_harvest.py` — DB migration
- `apps/web/src/app/[locale]/(dashboard)/admin/harvest/page.tsx` — Harvest dashboard
- `apps/bot/app/handlers/harvest.py` — Bot harvest message handler

### Modified Files
- `apps/api/app/services/llm/model_router.py` — Multi-provider routing
- `apps/api/app/core/config.py` — New API keys
- `apps/api/app/models/database.py` — User fields + new tables
- `apps/api/app/api/routes/chat.py` — Provider-aware streaming
- `apps/api/app/api/routes/admin.py` — Harvest management UI endpoints
- `apps/bot/app/handlers/message.py` — Harvest question detection
- `apps/web/messages/{en,ja,ko}.json` — i18n for harvest UI

### Tests
- `apps/api/tests/test_multi_llm_routing.py`
- `apps/api/tests/test_harvest_system.py`
- `apps/web/src/__tests__/harvest-dashboard.test.ts`
