# Company Brain - AI Knowledge Engine

## Project Overview
AI-powered knowledge engine for a 40-person Philippine IT company. Unifies knowledge from Google Workspace, Telegram, and Notion via Telegram Bot and Web UI.

## Architecture
- **Backend**: FastAPI (Python 3.12+) on Railway
- **Frontend**: Next.js 14+ (App Router) on Vercel
- **Telegram Bot**: python-telegram-bot v20+ on Railway
- **Vector DB**: Qdrant (hybrid search, 3-language)
- **RDB**: PostgreSQL 16 (Supabase) with RLS
- **Cache**: Redis (Upstash) for semantic caching
- **LLM**: Claude Sonnet 4.6 + Haiku 4.5 (model router)
- **Embedding**: BGE-M3 via Together AI (EN/JA/KO)
- **Orchestration**: LangGraph
- **Ingestion**: Inngest (event-driven)

## Project Structure
```
apps/api/    - FastAPI backend (Python)
apps/web/    - Next.js frontend (TypeScript)
apps/bot/    - Telegram Bot (Python)
packages/    - Shared packages
infra/       - Docker Compose + Railway config
```

## Coding Conventions

### Python (apps/api/, apps/bot/)
- Formatter/Linter: **Ruff** (ruff check, ruff format)
- Type hints required on all function signatures
- Async-first: use `async def` for I/O operations
- Pydantic v2 for all data models
- SQLAlchemy 2.0 style (mapped_column, select())

### TypeScript (apps/web/)
- Formatter/Linter: **Biome**
- Strict TypeScript (strict: true)
- Server Components by default, 'use client' only when needed
- shadcn/ui for UI components

## Common Commands
```bash
make setup     # First-time setup (copies .env, starts docker, installs deps)
make dev       # Start all dev servers
make test      # Run all tests
make lint      # Run all linters
make clean     # Stop services, remove volumes
make db-migrate # Run Alembic migrations
```

## Local Development
```bash
# Start infrastructure
docker compose up -d

# API (FastAPI)
cd apps/api && uv run uvicorn app.main:app --reload --port 8000

# Web (Next.js)
cd apps/web && npm run dev

# Bot (Telegram)
cd apps/bot && uv run python -m app
```

## Environment Variables
See `.env.example` for all required variables. Copy to `.env` and fill in values.

## Deploy
- **API + Bot**: Railway (auto-deploy from main branch)
- **Web**: Vercel (auto-deploy from main branch)
- **DB**: Supabase (managed PostgreSQL)

## Testing
- Python: pytest with async support (pytest-asyncio)
- TypeScript: Vitest
- Integration tests use docker compose services

## Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately – don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes – don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests – then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Task Management

1. **Plan First:** Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan:** Check in before starting implementation
3. **Track Progress:** Mark items complete as you go
4. **Explain Changes:** High-level summary at each step
5. **Document Results:** Add review section to `tasks/todo.md`
6. **Capture Lessons:** Update `tasks/lessons.md` after corrections

## Agent Team Rules
- Each teammate must own separate files — no two teammates edit the same file
- Report progress via task list updates
- Do NOT modify files outside your assigned scope
- Coordinate via SendMessage, not by reading each other's files

## Core Principles

- **Simplicity First:** Make every change as simple as possible. Impact minimal code.
- **No Laziness:** Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact:** Changes should only touch what's necessary. Avoid introducing bugs.
