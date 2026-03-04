# Design System Reset: Linear/Vercel Style

**Goal:** Transform the Company Brain UI from "Warm Intelligence" (stone/indigo/amber) to a clean, minimal Linear/Vercel-inspired design system across all pages.

**Approach:** Full design token reset (Approach B) — replace color palette, typography, spacing, and component patterns globally.

**Scope:** All pages — Admin, Chat, Search, Documents, Analytics, Templates, Recipes, Agent.

---

## 1. Color System

### Light Mode

| Token | Value | Role |
|-------|-------|------|
| `--color-bg` | `#ffffff` | Page background |
| `--color-surface` | `#fafafa` (zinc-50) | Cards, sections |
| `--color-surface-elevated` | `#ffffff` | Modals, dropdowns |
| `--color-border` | `#e4e4e7` (zinc-200) | Default borders |
| `--color-border-subtle` | `#f4f4f5` (zinc-100) | Table row separators |
| `--color-text-primary` | `#09090b` (zinc-950) | Headings, primary text |
| `--color-text-secondary` | `#71717a` (zinc-500) | Descriptions, meta |
| `--color-text-tertiary` | `#a1a1aa` (zinc-400) | Disabled, hints |
| `--color-primary` | `#6366f1` (indigo-500) | CTAs, active states |
| `--color-primary-hover` | `#4f46e5` (indigo-600) | Button hover |
| `--color-danger` | `#ef4444` | Errors, delete |
| `--color-success` | `#22c55e` | Success states |
| `--color-warning` | `#f59e0b` | Warnings |

### Dark Mode

| Token | Value |
|-------|-------|
| `--color-bg` | `#09090b` (zinc-950) |
| `--color-surface` | `#18181b` (zinc-900) |
| `--color-surface-elevated` | `#27272a` (zinc-800) |
| `--color-border` | `#3f3f46` (zinc-700) |
| `--color-border-subtle` | `#27272a` (zinc-800) |
| `--color-text-primary` | `#fafafa` (zinc-50) |
| `--color-text-secondary` | `#a1a1aa` (zinc-400) |
| `--color-text-tertiary` | `#52525b` (zinc-600) |
| `--color-primary` | `#818cf8` (indigo-400) |
| `--color-primary-hover` | `#6366f1` (indigo-500) |

### Sidebar
- `bg-zinc-950 border-r border-zinc-800` (flat dark, no gradient)

---

## 2. Typography

| Element | Style |
|---------|-------|
| Page Title | `text-xl font-semibold tracking-tight text-zinc-950` |
| Section Heading | `text-sm font-medium text-zinc-950` |
| Card Title | `text-sm font-medium` |
| Body | `text-sm text-zinc-500` |
| Label | `text-xs font-medium text-zinc-500 uppercase tracking-wider` |
| Table Header | `text-[11px] font-medium text-zinc-400 uppercase tracking-widest` |
| Mono | `font-mono text-[13px]` |

**Key principle:** `font-semibold` → `font-medium` across most elements.

**Font:** Inter (maintained) + Noto Sans JP/KR (maintained). Add `tracking-tight` to headings.

---

## 3. Spacing

| Context | Before | After |
|---------|--------|-------|
| Page padding | `p-6` | `p-8` |
| Card padding | `p-6` | `p-5` |
| Section gap | `space-y-6` | `space-y-8` |
| Table cell | `px-4 py-3` | `px-4 py-3.5` |

---

## 4. Component Patterns

### Cards
```
bg-zinc-50 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-5
hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors
```
No shadows. Border-only containment.

### Buttons
```
Primary:   bg-indigo-500 text-white rounded-md px-3.5 py-2 text-sm font-medium hover:bg-indigo-600
Secondary: bg-zinc-100 dark:bg-zinc-800 text-zinc-700 rounded-md px-3.5 py-2 border border-zinc-200
Ghost:     text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 rounded-md px-3 py-1.5
Danger:    bg-red-500/10 text-red-600 border border-red-200/50 rounded-md
```

### Badges
```
inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full
Active:  bg-emerald-50 text-emerald-600 border border-emerald-200/50
Warning: bg-amber-50 text-amber-600 border border-amber-200/50
Error:   bg-red-50 text-red-600 border border-red-200/50
Info:    bg-indigo-50 text-indigo-600 border border-indigo-200/50
```

### Tabs (Pill/Segment style)
```
Container: bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1 inline-flex
Active:    bg-white dark:bg-zinc-700 rounded-md shadow-sm text-zinc-950 font-medium px-3 py-1.5
Inactive:  text-zinc-500 hover:text-zinc-700 px-3 py-1.5
```

### Tables
```
Container: rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden
Header:    bg-zinc-50 dark:bg-zinc-800/50 text-[11px] uppercase tracking-widest text-zinc-400
Row:       border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 transition-colors
```

### Inputs
```
bg-white dark:bg-zinc-900 rounded-md border border-zinc-200 dark:border-zinc-700
px-3 py-2 text-sm placeholder:text-zinc-400
focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500
```

### Modals
```
Overlay: bg-black/60 backdrop-blur-sm
Content: bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 shadow-xl p-6
```

---

## 5. Layout Changes

### Sidebar
- `bg-zinc-950 border-r border-zinc-800` (flat, no gradient)
- Logo: Keep BrainLogo, switch gradient to indigo flat
- Nav active: `bg-zinc-800 text-white border-l-2 border-indigo-500`
- Nav hover: `text-zinc-300 hover:bg-zinc-900 hover:text-white`
- User footer: `border-t border-zinc-800`

### Header
- `bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md border-b border-zinc-200`

### Admin Tabs
- Pill/segment style replacing underline style

---

## 6. Micro-Interactions

- All interactive: `transition-colors duration-150`
- Card hover: border color shift only
- Button hover: color shift only (no transform/scale)
- Focus: `focus-visible:ring-2 ring-indigo-500/30 ring-offset-2`
- Skeleton: `animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded`
- Modal: `animate-fade-in` (150ms)

---

## 7. Files to Modify

### Foundation (apply first)
1. `apps/web/src/app/globals.css` — Full token reset
2. `apps/web/src/components/layout/sidebar.tsx` — Sidebar redesign
3. `apps/web/src/components/layout/header.tsx` — Header redesign

### Pages (apply per-page)
4. `apps/web/src/app/[locale]/(dashboard)/admin/page.tsx` — Admin tabs + all sub-tabs
5. `apps/web/src/app/[locale]/(dashboard)/chat/page.tsx` — Chat bubbles + input
6. `apps/web/src/app/[locale]/(dashboard)/search/page.tsx` — Search bar + results
7. `apps/web/src/app/[locale]/(dashboard)/documents/page.tsx` — Upload + table
8. `apps/web/src/app/[locale]/(dashboard)/analytics/page.tsx` — Charts + stats
9. `apps/web/src/app/[locale]/(dashboard)/templates/page.tsx` — Template cards
10. `apps/web/src/app/[locale]/(dashboard)/recipes/page.tsx` — Recipe cards
11. `apps/web/src/app/[locale]/(dashboard)/agent/page.tsx` — Agent dashboard

### Auth
12. `apps/web/src/app/[locale]/(auth)/login/page.tsx` — Login page
