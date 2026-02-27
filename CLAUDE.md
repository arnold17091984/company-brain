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
