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
- [x] company-brain: Verify end-to-end (lint pass, 24 tests pass, docker compose valid)

### Week 1-2: Foundation
- [ ] Railway + Supabase + Qdrant Cloud + Upstash Redis provisioning
- [ ] Google SSO auth (NextAuth.js v5)
- [ ] PostgreSQL RLS (3-tier access control)
- [ ] FastAPI core + CI/CD (GitHub Actions -> Railway auto-deploy)
- [ ] Langfuse Cloud + Sentry integration
- [ ] Telegram Bot core handlers

### Week 3-4: Data Ingestion
- [ ] Google Drive connector (Docs, Sheets, PDF)
- [ ] Notion connector (pages + databases)
- [ ] Telegram connector (group chats only, exclude DMs)
- [ ] Contextual Retrieval (Haiku, 3-language)
- [ ] BGE-M3 embedding (Together AI API, 3-language)
- [ ] Inngest full sync + incremental sync

### Week 5-6: RAG Pipeline + Polish
- [ ] Qdrant hybrid search (dense + sparse) + RLS filter
- [ ] Cohere Reranking
- [ ] Model router (Haiku classify -> Sonnet generate)
- [ ] Claude API + SSE streaming
- [ ] Semantic cache (Redis 2-tier)
- [ ] Search quality gate + hallucination prevention
- [ ] Citation links + freshness display
- [ ] Telegram Bot complete (mention, DM, inline)
- [ ] Web chat UI (Next.js + shadcn/ui)
- [ ] Feedback (thumbs up/down)
- [ ] Audit logging
- [ ] Employee notification
- [ ] Full 40-person deployment + kickoff
