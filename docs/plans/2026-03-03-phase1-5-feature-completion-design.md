# Company Brain - Feature Completion Design

**Date:** 2026-03-03
**Status:** Approved

## Context

The codebase is ~95% complete for core functionality. This design covers remaining bug fixes and new feature implementation across 5 phases.

## Phase 0: Bug Fixes (Immediate)

### Issues
1. **Lint 31 errors** — JSON formatting (ko.json, en.json) + header.tsx a11y violations
2. **Analytics `total_users` missing** — Backend endpoint doesn't return it, frontend expects it
3. **Analytics mock data** — use-cases.tsx and milestones.tsx use hardcoded data
4. **Web tests missing** — No Vitest test files exist
5. **todo.md outdated** — Many completed items still unchecked

### Approach
Fix all issues directly. No architectural decisions needed.

---

## Phase 1: Chat Enhancements

### New Features
- **CoT Thinking Process Display** — Accordion component showing Chain-of-Thought reasoning
- **Confidence Badge** — Score display (0-100%) on each AI response
- **Enhanced Source Cards** — Rich card display for referenced documents

### Backend Changes
- Return `thinking` field in chat SSE stream (separate event type)
- Compute confidence score from RAG relevance scores + model certainty
- Return structured source metadata (title, snippet, date, URL, relevance)

### Frontend Changes
- New `ThinkingAccordion` component (collapsible, animated)
- `ConfidenceBadge` component with color-coded score
- `SourceCard` component with document preview

---

## Phase 2: Document Management

### New Features
- **Drag & Drop Upload** — PDF/Word/Excel/Image support
- **Upload Progress** — Real-time progress bar
- **Document List** — Searchable, filterable, sortable table
- **Status Badges** — Processing/Indexed/Error states

### Backend Changes
- `POST /api/v1/documents/upload` — Multipart file upload, store to local/S3
- `GET /api/v1/documents` — List with pagination, search, filters
- `DELETE /api/v1/documents/:id` — Soft delete
- Background processing: parse → chunk → embed → index to Qdrant

### Frontend Changes
- New `/documents` page with drag-and-drop zone
- `DocumentTable` component with column sorting
- `UploadProgress` component with cancel support
- `StatusBadge` component (processing spinner / green check / red error)

---

## Phase 3: AI Agent Dashboard

### New Features
- **Question Clustering** — Scatter/bubble chart visualization (recharts)
- **Document Recommendations** — Priority-scored list of missing documents
- **Auto-Index Status** — External source ingestion monitoring
- **Log Viewer** — Agent execution log browsing

### Backend Changes
- `GET /api/v1/analytics/clusters` — Question clustering (TF-IDF + DBSCAN)
- `GET /api/v1/analytics/recommendations` — Gap analysis on query failures
- `GET /api/v1/analytics/ingestion-status` — Connector sync status
- `GET /api/v1/analytics/logs` — Paginated agent execution logs

### Frontend Changes
- New `/agent` dashboard page
- Recharts scatter/bubble chart components
- Recommendation list with priority badges
- Log viewer with filters and search

---

## Phase 4: Admin Panel Enhancement

### New Features
- **System Settings** — RAG/Agent/LLM parameter configuration
- **User Management** — CRUD with role assignment
- **Metrics Dashboard** — Accuracy/latency/token usage charts
- **Health Check** — Real-time service status monitoring

### Backend Changes
- `GET/PUT /api/v1/admin/settings` — System configuration CRUD
- `GET/POST/PUT/DELETE /api/v1/admin/users` — User management
- `GET /api/v1/admin/metrics` — Aggregated performance metrics
- `GET /api/v1/admin/health` — Service health checks (DB, Qdrant, Redis)

### Frontend Changes
- Enhanced `/admin` page with tabbed interface
- Settings form with validation
- User management table with role dropdowns
- Metrics charts (recharts)
- Health status cards with real-time polling

---

## Tech Stack (Unchanged)
- Backend: FastAPI + SQLAlchemy 2.0 + Pydantic v2
- Frontend: Next.js 14 + shadcn/ui + Tailwind + Recharts
- Testing: pytest (API) + Vitest (Web)
