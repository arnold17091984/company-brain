# Company Brain - Task Tracking

## Current: Phase 1 MVP (Week 1-6)

### Repo Setup
- [x] ai-knowledge: git init + GitHub push
- [x] Save v4 plan to docs/plans/
- [x] company-brain: monorepo scaffold
- [x] company-brain: FastAPI backend skeleton
- [x] company-brain: Next.js frontend skeleton
- [x] company-brain: Telegram Bot skeleton
- [x] company-brain: CI/CD + infra config
- [x] company-brain: Verify end-to-end (lint pass, 254 tests pass, docker compose valid)

### Week 1-2: Foundation
- [ ] Railway + Supabase + Qdrant Cloud + Upstash Redis provisioning
- [x] Google SSO auth (NextAuth.js v5)
- [x] PostgreSQL RLS (3-tier access control)
- [x] FastAPI core + CI/CD (GitHub Actions -> Railway auto-deploy)
- [x] Langfuse Cloud + Sentry integration
- [x] Telegram Bot core handlers

### Week 3-4: Data Ingestion
- [x] Google Drive connector (Docs, Sheets, PDF)
- [x] Notion connector (pages + databases)
- [x] Telegram connector (group chats only, exclude DMs)
- [x] Contextual Retrieval (Haiku, 3-language)
- [x] BGE-M3 embedding (Together AI API, 3-language)
- [x] Inngest full sync + incremental sync

### Week 5-6: RAG Pipeline + Polish
- [x] Qdrant hybrid search (dense + sparse) + RLS filter
- [x] Cohere Reranking
- [x] Model router (Haiku classify -> Sonnet generate)
- [x] Claude API + SSE streaming
- [x] Semantic cache (Redis 2-tier)
- [x] Search quality gate + hallucination prevention
- [x] Citation links + freshness display
- [x] Telegram Bot complete (mention, DM, inline)
- [x] Web chat UI (Next.js + shadcn/ui)
- [x] Feedback (thumbs up/down)
- [x] Audit logging
- [ ] Employee notification
- [ ] Full 40-person deployment + kickoff

### Phase 0: Bug Fixes (2026-03-03)
- [x] Fix Biome lint errors (31 errors: JSON formatting, a11y, imports)
- [x] Fix Ruff lint errors (line length, import ordering)
- [x] Fix analytics `total_users` missing from backend
- [x] Fix auth.ts non-null assertion
- [x] Add Vitest config + web API tests (10 tests)
- [x] Update todo.md to reflect actual progress

## Next: Feature Completion Phases

### Phase 1: Chat Enhancements ✅
- [x] CoT thinking process display (accordion)
- [x] Confidence badge (score display)
- [x] Enhanced source cards (type icon, relevance score)
- [x] Backend: thinking tokens + confidence score
- [x] i18n (EN/JA/KO) for new UI strings
- [x] Backend + frontend tests (17 Python + 14 TS)

### Phase 2: Document Management ✅
- [x] Backend: Document CRUD API (upload/list/get/delete)
- [x] Frontend: /documents page with drag & drop upload
- [x] Document table with search/filter/pagination
- [x] Status badges (processing/indexed/error)
- [x] Source type icons (G/N/T/U)
- [x] i18n (EN/JA/KO)
- [x] Backend tests (41 tests)
- [x] Nav item added to sidebar

### Phase 3: AI Agent Dashboard ✅
- [x] Backend: clusters, recommendations, ingestion-status, logs endpoints
- [x] Frontend: /agent dashboard with 4 sections
- [x] Question clusters (grid cards with sample queries)
- [x] Document recommendations (priority-sorted table)
- [x] Ingestion status (connector cards)
- [x] Agent logs (paginated table)
- [x] i18n (EN/JA/KO)
- [x] Backend tests (31 tests)
- [x] Nav item added to sidebar

### Phase 4: Admin Panel Enhancement ✅
- [x] Backend: settings, users, metrics, health endpoints
- [x] Frontend: tabbed admin interface (Sources/Settings/Users/Health)
- [x] System settings form (RAG/LLM/Agent parameters, save)
- [x] User management table
- [x] Health check cards (PostgreSQL/Qdrant/Redis, live ping)
- [x] i18n (EN/JA/KO)
- [x] Backend tests (35 tests)
