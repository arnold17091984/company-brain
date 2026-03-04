# Multi-LLM Routing & Knowledge Harvesting Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add multi-provider LLM routing (Claude/Gemini/OpenAI) with role-based selection, and a knowledge harvesting system for departing employees.

**Architecture:** Provider protocol abstraction with factory pattern. Role-based model router reads config from DB. Harvest system uses AI-generated questions delivered via Telegram Bot with Web dashboard for progress tracking.

**Tech Stack:** FastAPI, google-genai SDK, openai SDK, python-telegram-bot, Next.js 14, SQLAlchemy 2.0, Qdrant, pytest-asyncio

---

## Agent Team Assignment (10 agents)

| Agent # | Name | Type | Scope |
|---------|------|------|-------|
| 1 | `db-migration` | python-pro | Alembic migration + DB models |
| 2 | `llm-provider-protocol` | python-pro | LLMProvider protocol + factory |
| 3 | `gemini-provider` | python-pro | GeminiService implementation |
| 4 | `openai-provider` | python-pro | OpenAIService implementation |
| 5 | `model-router` | python-pro | Multi-provider router + config |
| 6 | `chat-integration` | python-pro | Chat endpoint provider-aware streaming |
| 7 | `harvest-backend` | python-pro | Harvest API routes + question generator |
| 8 | `harvest-bot` | python-pro | Telegram Bot harvest handler |
| 9 | `harvest-frontend` | nextjs-developer | Harvest dashboard + admin UI |
| 10 | `test-suite` | test-automator | All backend + frontend tests |

---

## Task 1: Database Migration & Models (Agent: `db-migration`)

**Files:**
- Create: `apps/api/alembic/versions/20260304_0002_multi_llm_harvest.py`
- Modify: `apps/api/app/models/database.py` (after line 253)
- Modify: `apps/api/app/services/types.py` (after line 69)

**Step 1: Add new enums to types.py**

Add after `UserRole` enum (line 69):

```python
class EmploymentStatus(StrEnum):
    """Employee lifecycle status."""
    ACTIVE = "active"
    DEPARTING = "departing"
    DEPARTED = "departed"

class HarvestStatus(StrEnum):
    """Knowledge harvest session status."""
    ACTIVE = "active"
    COMPLETED = "completed"
    PAUSED = "paused"

class HarvestCategory(StrEnum):
    """Knowledge harvest question categories."""
    PROJECT = "project"
    PROCESS = "process"
    CLIENT = "client"
    TOOL = "tool"
    TEAM = "team"
```

**Step 2: Add User model fields in database.py**

Add to `User` class after `role` field (around line 68):

```python
employment_status: Mapped[str] = mapped_column(
    String(20), nullable=False, default="active"
)
departure_date: Mapped[date | None] = mapped_column(Date, nullable=True)
departure_flagged_by: Mapped[uuid.UUID | None] = mapped_column(
    UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
)
departure_flagged_at: Mapped[datetime | None] = mapped_column(
    DateTime(timezone=True), nullable=True
)
job_title: Mapped[str | None] = mapped_column(String(200), nullable=True)
manager_id: Mapped[uuid.UUID | None] = mapped_column(
    UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
)
```

**Step 3: Add HarvestSession model in database.py**

```python
class HarvestSession(Base):
    """Knowledge harvest session for a departing employee."""
    __tablename__ = "harvest_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    target_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    total_questions: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    answered_questions: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    target_user: Mapped["User"] = relationship("User", foreign_keys=[target_user_id])
    questions: Mapped[list["HarvestQuestion"]] = relationship(back_populates="session")
```

**Step 4: Add HarvestQuestion model**

```python
class HarvestQuestion(Base):
    """Individual question in a knowledge harvest session."""
    __tablename__ = "harvest_questions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("harvest_sessions.id", ondelete="CASCADE"), nullable=False
    )
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    question: Mapped[str] = mapped_column(String, nullable=False)
    answer: Mapped[str | None] = mapped_column(String, nullable=True)
    answer_quality: Mapped[float | None] = mapped_column(Float, nullable=True)
    source: Mapped[str | None] = mapped_column(String(20), nullable=True)  # telegram / web
    asked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    answered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    session: Mapped["HarvestSession"] = relationship(back_populates="questions")
```

**Step 5: Write Alembic migration**

Create `apps/api/alembic/versions/20260304_0002_multi_llm_harvest.py` that:
- Adds 6 columns to `users` table (employment_status, departure_date, departure_flagged_by, departure_flagged_at, job_title, manager_id)
- Creates `harvest_sessions` table
- Creates `harvest_questions` table
- Adds indexes on `users.employment_status` and `harvest_sessions.target_user_id`

**Step 6: Commit**

```bash
git add apps/api/alembic/versions/20260304_0002_multi_llm_harvest.py apps/api/app/models/database.py apps/api/app/services/types.py
git commit -m "feat(db): add harvest tables and user departure fields"
```

---

## Task 2: LLM Provider Protocol & Factory (Agent: `llm-provider-protocol`)

**Files:**
- Create: `apps/api/app/services/llm/provider.py`
- Modify: `apps/api/app/services/llm/claude_service.py`

**Step 1: Create provider protocol**

Create `apps/api/app/services/llm/provider.py`:

```python
"""LLM Provider abstraction layer.

Defines a common protocol for all LLM providers (Claude, Gemini, OpenAI)
and a factory to instantiate the correct provider by name.
"""
from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Protocol, runtime_checkable

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class LLMResponse:
    """Unified response from any LLM provider."""
    text: str
    input_tokens: int
    output_tokens: int
    latency_ms: float
    model_id: str
    provider: str


@dataclass
class StreamMetrics:
    """Accumulator for streaming token metrics."""
    input_tokens: int = 0
    output_tokens: int = 0
    latency_ms: float = 0.0


@runtime_checkable
class LLMProvider(Protocol):
    """Protocol that all LLM provider services must implement."""

    provider_name: str

    async def generate(
        self,
        messages: list[dict[str, str]],
        *,
        model: str,
        system_prompt: str = "",
        max_tokens: int = 4096,
        temperature: float = 0.3,
    ) -> LLMResponse: ...

    async def stream(
        self,
        messages: list[dict[str, str]],
        *,
        model: str,
        system_prompt: str = "",
        max_tokens: int = 4096,
        temperature: float = 0.3,
        metrics: StreamMetrics | None = None,
    ) -> AsyncIterator[str]: ...

    def supports_thinking(self, model_id: str) -> bool: ...


class ProviderFactory:
    """Registry and factory for LLM providers."""

    _providers: dict[str, LLMProvider] = {}

    @classmethod
    def register(cls, provider: LLMProvider) -> None:
        cls._providers[provider.provider_name] = provider

    @classmethod
    def get(cls, name: str) -> LLMProvider:
        if name not in cls._providers:
            available = ", ".join(cls._providers.keys())
            raise ValueError(f"Unknown provider {name!r}. Available: {available}")
        return cls._providers[name]

    @classmethod
    def available(cls) -> list[str]:
        return list(cls._providers.keys())
```

**Step 2: Refactor ClaudeService to implement LLMProvider**

In `claude_service.py`, add `provider_name = "anthropic"` class attribute and ensure `generate()` and `stream()` match the protocol signature. Keep existing retry logic. Return the new `LLMResponse` from `provider.py` (import it).

**Step 3: Commit**

```bash
git add apps/api/app/services/llm/provider.py apps/api/app/services/llm/claude_service.py
git commit -m "feat(llm): add LLMProvider protocol and refactor ClaudeService"
```

---

## Task 3: Gemini Provider (Agent: `gemini-provider`)

**Files:**
- Create: `apps/api/app/services/llm/gemini_service.py`
- Modify: `apps/api/pyproject.toml` (add `google-genai>=1.0.0`)
- Modify: `apps/api/app/core/config.py` (add `gemini_api_key`)

**Step 1: Add dependency**

Add `"google-genai>=1.0.0"` to `pyproject.toml` dependencies (line 28).

**Step 2: Add config key**

In `config.py`, add after line 25 (LLM providers section):

```python
gemini_api_key: str = ""
```

**Step 3: Implement GeminiService**

Create `apps/api/app/services/llm/gemini_service.py`:

```python
"""Google Gemini LLM provider implementation."""
from __future__ import annotations

import logging
import time
from collections.abc import AsyncIterator

from google import genai
from google.genai import types

from app.core.config import settings
from app.services.llm.provider import LLMProvider, LLMResponse, StreamMetrics

logger = logging.getLogger(__name__)


class GeminiService:
    """Gemini LLM provider using the google-genai SDK."""

    provider_name = "google"

    def __init__(self) -> None:
        self._client = genai.Client(api_key=settings.gemini_api_key)

    async def generate(
        self,
        messages: list[dict[str, str]],
        *,
        model: str = "gemini-2.0-flash",
        system_prompt: str = "",
        max_tokens: int = 4096,
        temperature: float = 0.3,
    ) -> LLMResponse:
        start = time.perf_counter()
        contents = self._build_contents(messages)
        config = types.GenerateContentConfig(
            system_instruction=system_prompt or None,
            max_output_tokens=max_tokens,
            temperature=temperature,
        )
        response = await self._client.aio.models.generate_content(
            model=model, contents=contents, config=config,
        )
        latency = (time.perf_counter() - start) * 1000
        usage = response.usage_metadata
        return LLMResponse(
            text=response.text or "",
            input_tokens=usage.prompt_token_count or 0,
            output_tokens=usage.candidates_token_count or 0,
            latency_ms=latency,
            model_id=model,
            provider=self.provider_name,
        )

    async def stream(
        self,
        messages: list[dict[str, str]],
        *,
        model: str = "gemini-2.0-flash",
        system_prompt: str = "",
        max_tokens: int = 4096,
        temperature: float = 0.3,
        metrics: StreamMetrics | None = None,
    ) -> AsyncIterator[str]:
        start = time.perf_counter()
        contents = self._build_contents(messages)
        config = types.GenerateContentConfig(
            system_instruction=system_prompt or None,
            max_output_tokens=max_tokens,
            temperature=temperature,
        )
        async for chunk in await self._client.aio.models.generate_content_stream(
            model=model, contents=contents, config=config,
        ):
            if chunk.text:
                if metrics:
                    metrics.output_tokens += len(chunk.text.split())  # approximate
                yield chunk.text
        if metrics:
            metrics.latency_ms = (time.perf_counter() - start) * 1000

    def supports_thinking(self, model_id: str) -> bool:
        return False  # Gemini doesn't support extended thinking

    @staticmethod
    def _build_contents(messages: list[dict[str, str]]) -> list[types.Content]:
        """Convert OpenAI-style messages to Gemini Content objects."""
        contents = []
        for msg in messages:
            role = "model" if msg["role"] == "assistant" else "user"
            contents.append(types.Content(role=role, parts=[types.Part(text=msg["content"])]))
        return contents
```

**Step 4: Commit**

```bash
git add apps/api/app/services/llm/gemini_service.py apps/api/pyproject.toml apps/api/app/core/config.py
git commit -m "feat(llm): add Gemini provider service"
```

---

## Task 4: OpenAI Provider (Agent: `openai-provider`)

**Files:**
- Create: `apps/api/app/services/llm/openai_service.py`
- Modify: `apps/api/pyproject.toml` (add `openai>=1.0.0`)
- Modify: `apps/api/app/core/config.py` (add `openai_api_key`)

**Step 1: Add dependency and config**

Add `"openai>=1.0.0"` to `pyproject.toml`. Add `openai_api_key: str = ""` to config.py LLM section.

**Step 2: Implement OpenAIService**

Create `apps/api/app/services/llm/openai_service.py`:

```python
"""OpenAI LLM provider implementation."""
from __future__ import annotations

import logging
import time
from collections.abc import AsyncIterator

from openai import AsyncOpenAI

from app.core.config import settings
from app.services.llm.provider import LLMResponse, StreamMetrics

logger = logging.getLogger(__name__)


class OpenAIService:
    """OpenAI LLM provider using the openai SDK."""

    provider_name = "openai"

    def __init__(self) -> None:
        self._client = AsyncOpenAI(api_key=settings.openai_api_key)

    async def generate(
        self,
        messages: list[dict[str, str]],
        *,
        model: str = "gpt-4o-mini",
        system_prompt: str = "",
        max_tokens: int = 4096,
        temperature: float = 0.3,
    ) -> LLMResponse:
        start = time.perf_counter()
        all_messages = []
        if system_prompt:
            all_messages.append({"role": "system", "content": system_prompt})
        all_messages.extend(messages)

        response = await self._client.chat.completions.create(
            model=model, messages=all_messages, max_tokens=max_tokens, temperature=temperature,
        )
        latency = (time.perf_counter() - start) * 1000
        choice = response.choices[0]
        usage = response.usage
        return LLMResponse(
            text=choice.message.content or "",
            input_tokens=usage.prompt_tokens if usage else 0,
            output_tokens=usage.completion_tokens if usage else 0,
            latency_ms=latency,
            model_id=model,
            provider=self.provider_name,
        )

    async def stream(
        self,
        messages: list[dict[str, str]],
        *,
        model: str = "gpt-4o-mini",
        system_prompt: str = "",
        max_tokens: int = 4096,
        temperature: float = 0.3,
        metrics: StreamMetrics | None = None,
    ) -> AsyncIterator[str]:
        start = time.perf_counter()
        all_messages = []
        if system_prompt:
            all_messages.append({"role": "system", "content": system_prompt})
        all_messages.extend(messages)

        stream = await self._client.chat.completions.create(
            model=model, messages=all_messages, max_tokens=max_tokens,
            temperature=temperature, stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta if chunk.choices else None
            if delta and delta.content:
                if metrics:
                    metrics.output_tokens += 1
                yield delta.content
        if metrics:
            metrics.latency_ms = (time.perf_counter() - start) * 1000

    def supports_thinking(self, model_id: str) -> bool:
        return False
```

**Step 3: Commit**

```bash
git add apps/api/app/services/llm/openai_service.py apps/api/pyproject.toml apps/api/app/core/config.py
git commit -m "feat(llm): add OpenAI provider service"
```

---

## Task 5: Multi-Provider Model Router (Agent: `model-router`)

**Files:**
- Modify: `apps/api/app/services/llm/model_router.py`
- Modify: `apps/api/app/models/schemas.py` (add routing config schemas)

**Step 1: Expand _MODEL_REGISTRY**

Replace current registry (lines 21-45) with multi-provider registry:

```python
_MODEL_REGISTRY: dict[str, ModelConfig] = {
    # Anthropic
    "claude-sonnet-4-6": ModelConfig(
        model_id="claude-sonnet-4-6", provider="anthropic",
        max_tokens=8192, temperature=0.3,
        cost_per_1k_input=3.0, cost_per_1k_output=15.0,
        supports_streaming=True, supports_thinking=True,
        context_window=200_000, tasks=["chat", "analysis", "code"],
    ),
    "claude-haiku-4-5-20251001": ModelConfig(
        model_id="claude-haiku-4-5-20251001", provider="anthropic",
        max_tokens=4096, temperature=0.3,
        cost_per_1k_input=0.8, cost_per_1k_output=4.0,
        supports_streaming=True, supports_thinking=False,
        context_window=200_000, tasks=["chat", "classify", "escalation"],
    ),
    # Google
    "gemini-2.0-flash": ModelConfig(
        model_id="gemini-2.0-flash", provider="google",
        max_tokens=8192, temperature=0.3,
        cost_per_1k_input=0.075, cost_per_1k_output=0.3,
        supports_streaming=True, supports_thinking=False,
        context_window=1_000_000, tasks=["chat", "classify"],
    ),
    "gemini-2.0-flash-lite": ModelConfig(
        model_id="gemini-2.0-flash-lite", provider="google",
        max_tokens=4096, temperature=0.3,
        cost_per_1k_input=0.0375, cost_per_1k_output=0.15,
        supports_streaming=True, supports_thinking=False,
        context_window=1_000_000, tasks=["classify"],
    ),
    # OpenAI
    "gpt-4o-mini": ModelConfig(
        model_id="gpt-4o-mini", provider="openai",
        max_tokens=4096, temperature=0.3,
        cost_per_1k_input=0.15, cost_per_1k_output=0.6,
        supports_streaming=True, supports_thinking=False,
        context_window=128_000, tasks=["chat", "fallback"],
    ),
}
```

**Step 2: Add role-based routing**

Add `select_model_for_role()` method to `ClaudeModelRouter` (rename class to `MultiModelRouter`):

```python
# Default routing rules (overridable via system_settings)
_DEFAULT_ROLE_ROUTING: dict[str, str] = {
    "ceo": "claude-sonnet-4-6",
    "executive": "claude-sonnet-4-6",
    "hr": "claude-sonnet-4-6",
    "manager": "claude-sonnet-4-6",
    "employee": "gemini-2.0-flash",
    "admin": "claude-haiku-4-5-20251001",
}

def select_model_for_role(self, role: str, task: str = "chat") -> ModelConfig:
    """Select model based on user role with optional DB override."""
    model_id = _DEFAULT_ROLE_ROUTING.get(role, "gemini-2.0-flash")
    return self.get_model_config(model_id)
```

**Step 3: Commit**

```bash
git add apps/api/app/services/llm/model_router.py
git commit -m "feat(llm): multi-provider model registry with role-based routing"
```

---

## Task 6: Chat Endpoint Provider Integration (Agent: `chat-integration`)

**Files:**
- Modify: `apps/api/app/api/routes/chat.py`
- Modify: `apps/api/app/main.py` (register providers at startup)

**Step 1: Update main.py startup to register providers**

In `main.py` lifespan, after existing setup, add:

```python
from app.services.llm.provider import ProviderFactory
from app.services.llm.claude_service import ClaudeService
if settings.gemini_api_key:
    from app.services.llm.gemini_service import GeminiService
    ProviderFactory.register(GeminiService())
if settings.openai_api_key:
    from app.services.llm.openai_service import OpenAIService
    ProviderFactory.register(OpenAIService())
ProviderFactory.register(ClaudeService())
```

**Step 2: Update chat stream endpoint**

In `chat.py` stream endpoint, replace direct `ClaudeService()` usage with:

```python
from app.services.llm.provider import ProviderFactory
from app.services.llm.model_router import MultiModelRouter

router_svc = MultiModelRouter()
model_config = router_svc.select_model_for_role(current_user.role)
provider = ProviderFactory.get(model_config.provider)
```

Then use `provider.stream()` or `provider.generate()` instead of `service.stream()`.

Keep `stream_with_thinking()` as Claude-only path (check `provider.supports_thinking(model_config.model_id)`).

**Step 3: Add model info to SSE final event**

Include `provider` and `model_id` in the final SSE event data so the frontend can display which model answered.

**Step 4: Commit**

```bash
git add apps/api/app/api/routes/chat.py apps/api/app/main.py
git commit -m "feat(chat): provider-aware streaming with role-based model selection"
```

---

## Task 7: Harvest Backend API (Agent: `harvest-backend`)

**Files:**
- Create: `apps/api/app/services/harvest/question_generator.py`
- Create: `apps/api/app/services/harvest/session_manager.py`
- Create: `apps/api/app/api/routes/harvest.py`
- Modify: `apps/api/app/api/routes/__init__.py` (register harvest router)
- Modify: `apps/api/app/models/schemas.py` (harvest schemas)

**Step 1: Add Pydantic schemas**

In `schemas.py`, add:

```python
class HarvestSessionCreate(BaseModel):
    target_user_id: str
    departure_date: str  # ISO date

class HarvestSessionSummary(BaseModel):
    id: str
    target_user_name: str
    target_user_email: str
    status: str
    total_questions: int
    answered_questions: int
    progress_percent: float
    created_at: str
    departure_date: str | None

class HarvestQuestionDetail(BaseModel):
    id: str
    category: str
    question: str
    answer: str | None
    answer_quality: float | None
    source: str | None
    asked_at: str
    answered_at: str | None

class HarvestAnswerSubmit(BaseModel):
    question_id: str
    answer: str
    source: str = "web"
```

**Step 2: Create question generator service**

`apps/api/app/services/harvest/question_generator.py`:
- `generate_questions(target_user, db, provider)` → list of questions
- Collects user's chat history and related documents
- Builds a prompt for Claude Sonnet to generate 15-30 questions across 5 categories
- Returns structured list with category and question text

**Step 3: Create session manager service**

`apps/api/app/services/harvest/session_manager.py`:
- `create_session(target_user_id, created_by, departure_date, db)` → HarvestSession
- `get_pending_questions(session_id, limit, db)` → list[HarvestQuestion]
- `submit_answer(question_id, answer, source, db)` → HarvestQuestion
- `complete_session(session_id, db)` → HarvestSession
- `get_session_progress(session_id, db)` → dict with progress stats

**Step 4: Create harvest API routes**

`apps/api/app/api/routes/harvest.py`:
- `POST /harvest/sessions` — Create session (CEO/HR/Manager only), triggers question generation
- `GET /harvest/sessions` — List all sessions (CEO/HR/Manager)
- `GET /harvest/sessions/{id}` — Get session detail with questions
- `POST /harvest/answer` — Submit answer (target user or via bot)
- `PATCH /harvest/sessions/{id}/pause` — Pause session
- `PATCH /harvest/sessions/{id}/resume` — Resume session

**Step 5: Register router in __init__.py**

Add: `from app.api.routes.harvest import router as harvest_router`
Add: `api_router.include_router(harvest_router)`

**Step 6: Commit**

```bash
git add apps/api/app/services/harvest/ apps/api/app/api/routes/harvest.py apps/api/app/api/routes/__init__.py apps/api/app/models/schemas.py
git commit -m "feat(harvest): backend API for knowledge harvesting sessions"
```

---

## Task 8: Telegram Bot Harvest Handler (Agent: `harvest-bot`)

**Files:**
- Create: `apps/bot/app/handlers/harvest.py`
- Modify: `apps/bot/app/handlers/message.py`
- Modify: `apps/bot/app/__main__.py`

**Step 1: Create harvest handler**

`apps/bot/app/handlers/harvest.py`:
- `harvest_check(update, context)` — Called before normal message handler
- Checks if user has active harvest session via API
- If pending questions exist, sends next question
- Detects if user message is a harvest answer (context tracks `current_harvest_question_id`)
- Submits answer via API, sends confirmation + next question

**Step 2: Modify message handler**

In `message.py`, add harvest check at the top of the message handler:
- Before processing as normal chat query, check if user has active harvest session
- If yes, route to harvest handler
- If no, proceed with normal chat flow

**Step 3: Register handler in __main__.py**

Add harvest conversation handler with higher priority than general message handler.

**Step 4: Commit**

```bash
git add apps/bot/app/handlers/harvest.py apps/bot/app/handlers/message.py apps/bot/app/__main__.py
git commit -m "feat(bot): telegram harvest question delivery and answer collection"
```

---

## Task 9: Harvest Frontend Dashboard (Agent: `harvest-frontend`)

**Files:**
- Create: `apps/web/src/app/[locale]/(dashboard)/admin/harvest/page.tsx`
- Modify: `apps/web/src/app/[locale]/(dashboard)/admin/page.tsx` (add Harvest tab)
- Modify: `apps/web/messages/en.json`, `ja.json`, `ko.json`
- Modify: `apps/web/src/types/index.ts`

**Step 1: Add TypeScript types**

In `types/index.ts`:

```typescript
export interface HarvestSession {
  id: string;
  target_user_name: string;
  target_user_email: string;
  status: "active" | "completed" | "paused";
  total_questions: number;
  answered_questions: number;
  progress_percent: number;
  created_at: string;
  departure_date: string | null;
}

export interface HarvestQuestion {
  id: string;
  category: string;
  question: string;
  answer: string | null;
  answer_quality: number | null;
  source: string | null;
  asked_at: string;
  answered_at: string | null;
}
```

**Step 2: Add i18n keys**

Add `"harvest"` section to all 3 locale files:

```json
"harvest": {
  "title": "Knowledge Harvest",
  "description": "Manage knowledge collection from departing employees",
  "flagUser": "Flag for Departure",
  "departureDate": "Last Working Day",
  "progress": "Progress",
  "questions": "Questions",
  "answered": "Answered",
  "pending": "Pending",
  "categories": {
    "project": "Project Knowledge",
    "process": "Business Processes",
    "client": "Client Relations",
    "tool": "Tools & Systems",
    "team": "Team Knowledge"
  },
  "status": {
    "active": "Active",
    "completed": "Completed",
    "paused": "Paused"
  },
  "noSessions": "No harvest sessions yet",
  "createSession": "Start Knowledge Harvest"
}
```

**Step 3: Create harvest dashboard page**

`apps/web/src/app/[locale]/(dashboard)/admin/harvest/page.tsx`:
- Session list with progress bars (green = answered, gray = pending)
- "Flag for Departure" button → modal with user selector + date picker
- Click session → detail view with questions/answers
- Category filter tabs (project/process/client/tool/team)
- Pause/Resume session buttons

**Step 4: Add Harvest tab to admin page**

In the admin page, add a 5th tab "ナレッジ回収" linking to `/admin/harvest`.

**Step 5: Commit**

```bash
git add apps/web/src/app/[locale]/(dashboard)/admin/harvest/ apps/web/messages/ apps/web/src/types/index.ts apps/web/src/app/[locale]/(dashboard)/admin/page.tsx
git commit -m "feat(web): harvest dashboard with progress tracking and user flagging"
```

---

## Task 10: Test Suite (Agent: `test-suite`)

**Files:**
- Create: `apps/api/tests/test_multi_llm_routing.py`
- Create: `apps/api/tests/test_harvest_system.py`
- Create: `apps/web/src/__tests__/harvest-dashboard.test.ts`

**Step 1: Multi-LLM routing tests**

`test_multi_llm_routing.py` (target: 30+ tests):
- Test LLMProvider protocol conformance for all 3 services
- Test ProviderFactory register/get/available
- Test model registry has all expected models
- Test role-based routing: CEO→Sonnet, Employee→Gemini, etc.
- Test fallback when provider unavailable
- Test escalation logic (confidence < 0.6 triggers re-query)
- Test chat endpoint returns model_id/provider in response

**Step 2: Harvest system tests**

`test_harvest_system.py` (target: 40+ tests):
- Test HarvestSession/HarvestQuestion ORM models
- Test create session (permissions: CEO/HR/Manager can, Employee cannot)
- Test question generation (mock LLM, verify 15-30 questions generated)
- Test answer submission (updates answered_questions count)
- Test session completion (status transitions)
- Test harvest API endpoints (create, list, detail, answer, pause, resume)
- Test user flagging (employment_status changes)
- Test security (only authorized roles can view harvest data)

**Step 3: Frontend harvest tests**

`harvest-dashboard.test.ts` (target: 15+ tests):
- Test HarvestSession/HarvestQuestion types
- Test progress calculation
- Test category filtering
- Test status badge rendering
- Test form validation for departure date

**Step 4: Run full suite and fix**

```bash
cd apps/api && uv run pytest --tb=short -q
cd apps/web && npx vitest run
```

**Step 5: Commit**

```bash
git add apps/api/tests/test_multi_llm_routing.py apps/api/tests/test_harvest_system.py apps/web/src/__tests__/harvest-dashboard.test.ts
git commit -m "test: multi-LLM routing and harvest system test suites"
```

---

## Dependency Order

```
Task 1 (DB migration) ─────┬──── Task 7 (Harvest backend) ──── Task 8 (Harvest bot)
                            │
                            └──── Task 9 (Harvest frontend)
Task 2 (Provider protocol) ─┬── Task 3 (Gemini)
                             ├── Task 4 (OpenAI)
                             └── Task 5 (Router) ──── Task 6 (Chat integration)

Task 10 (Tests) ──── runs after all others
```

**Parallelizable groups:**
- Group A (simultaneous): Tasks 1, 2
- Group B (after A): Tasks 3, 4, 5, 7, 9
- Group C (after B): Tasks 6, 8
- Group D (after C): Task 10
