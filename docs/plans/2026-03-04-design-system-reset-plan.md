# Design System Reset: Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the Company Brain UI from "Warm Intelligence" (stone/indigo/amber) to a clean, minimal Linear/Vercel-inspired design system.

**Architecture:** Full design token reset using Tailwind CSS v4 custom properties in globals.css, then page-by-page class replacement across 12 files. Foundation files first (CSS tokens → sidebar → header), then pages alphabetically.

**Tech Stack:** Next.js 14 (App Router), Tailwind CSS v4 (CSS-based config), TypeScript, Biome linter

**Design Spec:** `docs/plans/2026-03-04-design-system-reset-design.md`

---

## Master Replacement Map

These atomic replacements apply across ALL files. Each task references this map.

### Color Classes (stone → zinc)
```
stone-50   → zinc-50      stone-500  → zinc-500
stone-100  → zinc-100     stone-600  → zinc-600
stone-200  → zinc-200     stone-700  → zinc-700
stone-300  → zinc-300     stone-800  → zinc-800
stone-400  → zinc-400     stone-900  → zinc-900
stone-500  → zinc-500     stone-950  → zinc-950
```

### Structural Replacements
```
rounded-xl  → rounded-lg     (cards, inputs, dropdowns)
rounded-2xl → rounded-xl     (login card, modals)
shadow-sm   → (remove)       (cards — border-only)
shadow-md   → (remove)       (cards — border-only)
shadow-lg   → shadow-xl      (modals only)
font-semibold → font-medium  (section headings, card titles)
font-bold   → font-semibold  (page titles only)
p-6         → p-5            (card padding)
```

### Keep Unchanged
- `indigo-*` classes on buttons, active states, badges (stays as accent)
- `red-*`, `green-*`, `amber-*`, `emerald-*` status colors
- Font family (Inter + Noto Sans JP/KR)
- All SVG icons

---

## Task 1: globals.css — Full Token Reset

**Files:**
- Modify: `apps/web/src/app/globals.css` (257 lines)

**Step 1: Replace CSS custom properties**

Replace the entire `:root` block (lines 8-54) with:

```css
:root {
	/* Primary — Indigo */
	--color-primary: #6366f1;
	--color-primary-hover: #4f46e5;
	--color-primary-light: #e0e7ff;
	--color-primary-foreground: #ffffff;

	/* Accent — removed (unified under primary) */

	/* Neutral backgrounds — cool zinc tones */
	--color-bg-base: #ffffff;
	--color-bg-subtle: #fafafa;
	--color-bg-muted: #f4f4f5;
	--color-bg-sidebar: #09090b;

	/* Neutral foregrounds — cool grays */
	--color-fg-base: #09090b;
	--color-fg-muted: #71717a;
	--color-fg-subtle: #a1a1aa;
	--color-fg-on-dark: #fafafa;

	/* Borders — cool */
	--color-border: #e4e4e7;
	--color-border-strong: #d4d4d8;

	/* Status */
	--color-success: #22c55e;
	--color-warning: #f59e0b;
	--color-danger: #ef4444;

	/* Radius — tighter */
	--radius-sm: 0.375rem;
	--radius-md: 0.5rem;
	--radius-lg: 0.75rem;
	--radius-xl: 1rem;

	/* Shadows — minimal */
	--shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.03);
	--shadow-md: 0 4px 12px -2px rgb(0 0 0 / 0.05);
	--shadow-lg: 0 8px 24px -4px rgb(0 0 0 / 0.08);
	--shadow-glow: 0 0 20px rgb(99 102 241 / 0.12);
}
```

**Step 2: Replace dark mode tokens**

Replace `.dark` block (lines 58-70) with:

```css
.dark {
	--color-bg-base: #09090b;
	--color-bg-subtle: #18181b;
	--color-bg-muted: #27272a;
	--color-bg-surface: #27272a;
	--color-fg-base: #fafafa;
	--color-fg-muted: #a1a1aa;
	--color-fg-subtle: #52525b;
	--color-fg-on-dark: #fafafa;
	--color-border: #3f3f46;
	--color-border-strong: #52525b;
	--color-sidebar-bg: #09090b;
}
```

**Step 3: Replace gradient utilities**

Replace `.bg-warm-gradient` (lines 94-101):
```css
.bg-warm-gradient {
	background: var(--color-bg-subtle);
}
```

Replace `.bg-sidebar-gradient` (lines 103-109):
```css
.bg-sidebar-gradient {
	background: #09090b;
}

.dark .bg-sidebar-gradient {
	background: #09090b;
}
```

Replace `.bg-hero-gradient` (lines 111-117):
```css
.bg-hero-gradient {
	background: radial-gradient(
			ellipse at 50% 0%,
			rgb(99 102 241 / 0.06) 0%,
			transparent 60%
		), var(--color-bg-subtle);
}
```

**Step 4: Replace glass morphism**

Replace `.glass` (lines 121-131):
```css
.glass {
	background: rgb(255 255 255 / 0.8);
	backdrop-filter: blur(12px);
	-webkit-backdrop-filter: blur(12px);
	border: 1px solid var(--color-border);
}

.dark .glass {
	background: rgba(24, 24, 27, 0.8);
	border: 1px solid rgba(63, 63, 70, 0.5);
}
```

**Step 5: Replace shimmer animations**

Replace `.animate-shimmer` light (lines 220-229):
```css
.animate-shimmer {
	background: linear-gradient(
		90deg,
		rgb(228 228 231 / 0.4) 25%,
		rgb(228 228 231 / 0.8) 50%,
		rgb(228 228 231 / 0.4) 75%
	);
	background-size: 200% 100%;
	animation: shimmer 1.5s ease-in-out infinite;
}
```

Replace `.animate-shimmer` dark (lines 231-239):
```css
:is(.dark) .animate-shimmer {
	background: linear-gradient(
		90deg,
		rgb(63 63 70 / 0.4) 25%,
		rgb(63 63 70 / 0.8) 50%,
		rgb(63 63 70 / 0.4) 75%
	);
	background-size: 200% 100%;
}
```

**Step 6: Update animation durations**

Replace `animation: fade-in 0.4s` with `animation: fade-in 0.15s` (line 183).
Replace `animation: fade-in-scale 0.3s` with `animation: fade-in-scale 0.15s` (line 187).

**Step 7: Remove button scale feedback**

Remove the entire `button:active:not(:disabled)` block (lines 243-246). Linear/Vercel style uses color-only feedback, no transforms.

**Step 8: Verify**

Run: `cd apps/web && npx biome check src/app/globals.css`
Expected: No errors

**Step 9: Commit**

```bash
git add apps/web/src/app/globals.css
git commit -m "refactor(design): reset design tokens from warm stone to cool zinc"
```

---

## Task 2: Sidebar — Flat Dark Redesign

**Files:**
- Modify: `apps/web/src/components/layout/sidebar.tsx` (474 lines)

**Step 1: Update desktop sidebar container**

Line 422 — replace:
```tsx
className="hidden lg:flex flex-col w-60 shrink-0 bg-sidebar-gradient text-indigo-100"
```
with:
```tsx
className="hidden lg:flex flex-col w-60 shrink-0 bg-zinc-950 text-zinc-300 border-r border-zinc-800"
```

**Step 2: Update mobile sidebar container**

Line 446 — replace:
```tsx
className="fixed inset-y-0 left-0 z-50 flex flex-col w-64 bg-sidebar-gradient text-indigo-100 lg:hidden animate-slide-in-left"
```
with:
```tsx
className="fixed inset-y-0 left-0 z-50 flex flex-col w-64 bg-zinc-950 text-zinc-300 border-r border-zinc-800 lg:hidden animate-slide-in-left"
```

**Step 3: Update brand header**

Line 297 — replace:
```tsx
className="flex items-center gap-2.5 px-4 py-5 border-b border-indigo-800/40"
```
with:
```tsx
className="flex items-center gap-2.5 px-4 py-5 border-b border-zinc-800"
```

**Step 4: Update nav items — active and inactive states**

Lines 316-320 — replace nav link className:
```tsx
className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
    isActive
        ? "bg-indigo-600 text-white shadow-sm shadow-indigo-900/30 border-l-[3px] border-white/40"
        : "text-indigo-300 hover:text-white hover:bg-indigo-800/40 border-l-[3px] border-transparent"
}`}
```
with:
```tsx
className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
    isActive
        ? "bg-zinc-800 text-white border-l-2 border-indigo-500"
        : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 border-l-2 border-transparent"
}`}
```

**Step 5: Update recent chats section**

Line 232 — loading skeleton: replace `bg-indigo-800/40` → `bg-zinc-800`
Line 240 — no chats text: replace `text-indigo-500` → `text-zinc-500`
Line 261-265 — chat link active/inactive: replace:
```tsx
isActive
    ? "bg-indigo-600/50 text-white"
    : "text-indigo-400 hover:text-indigo-200 hover:bg-indigo-800/30"
```
with:
```tsx
isActive
    ? "bg-zinc-800 text-white"
    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
```

**Step 6: Update section borders and labels**

Line 332 — recent chats container: replace `border-indigo-800/40` → `border-zinc-800`
Line 334 — section label: replace `text-indigo-400` → `text-zinc-500`
Line 340 — new chat button: replace `text-indigo-400 hover:text-indigo-200` → `text-zinc-500 hover:text-zinc-300`

**Step 7: Update user footer**

Line 367 — footer border: replace `border-indigo-800/40` → `border-zinc-800`
Line 369 — avatar bg: replace `bg-indigo-800` → `bg-zinc-800`
Line 371 — avatar icon: replace `text-indigo-300` → `text-zinc-400`
Line 386 — user name: replace `text-indigo-200` → `text-zinc-200`
Line 389 — user email: replace `text-indigo-400` → `text-zinc-500`
Line 395 — sign out: replace `text-indigo-400 hover:text-indigo-200 hover:bg-indigo-800/40` → `text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50`

**Step 8: Update close button (mobile)**

Line 451 — close button: replace `text-indigo-400 hover:text-white hover:bg-indigo-800/40` → `text-zinc-500 hover:text-white hover:bg-zinc-800`

**Step 9: Verify**

Run: `cd apps/web && npx biome check src/components/layout/sidebar.tsx`
Expected: No errors

**Step 10: Commit**

```bash
git add apps/web/src/components/layout/sidebar.tsx
git commit -m "refactor(design): sidebar from indigo gradient to flat zinc-950"
```

---

## Task 3: Header — Stone to Zinc

**Files:**
- Modify: `apps/web/src/components/layout/header.tsx` (255 lines)

**Step 1: Apply stone → zinc replacement across entire file**

Use `replace_all` for each pattern:
- `stone-500` → `zinc-500`
- `stone-700` → `zinc-700`
- `stone-100` → `zinc-100`
- `stone-400` → `zinc-400`
- `stone-200` → `zinc-200`
- `stone-800` → `zinc-800`
- `stone-900` → `zinc-900`
- `stone-300` → `zinc-300`
- `stone-50` → `zinc-50`

**Step 2: Update header container**

Line 223 — replace:
```tsx
className="relative z-30 flex items-center justify-between h-12 px-4 bg-white/80 dark:bg-stone-900/80 backdrop-blur-sm border-b border-stone-200/60 dark:border-stone-700/60 shrink-0"
```
with:
```tsx
className="relative z-30 flex items-center justify-between h-12 px-4 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800 shrink-0"
```

**Step 3: Update language dropdown**

Line 179 — dropdown container: replace `rounded-xl` → `rounded-lg`, apply stone→zinc:
```tsx
className="absolute right-0 top-full mt-1.5 z-20 min-w-30 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg shadow-zinc-900/10 py-1 overflow-hidden"
```

**Step 4: Verify**

Run: `cd apps/web && npx biome check src/components/layout/header.tsx`
Expected: No errors

**Step 5: Commit**

```bash
git add apps/web/src/components/layout/header.tsx
git commit -m "refactor(design): header stone to zinc with backdrop-blur-md"
```

---

## Task 4: Login Page — Clean Minimal Auth

**Files:**
- Modify: `apps/web/src/app/[locale]/(auth)/login/page.tsx` (112 lines)

**Step 1: Apply stone → zinc replacement**

All `stone-*` → `zinc-*` (same mapping as Master Replacement Map).

**Step 2: Update card**

Line 36 — replace `rounded-2xl` → `rounded-xl`, `shadow-lg shadow-stone-900/5` → `shadow-lg shadow-zinc-900/5`:
```tsx
className="glass rounded-xl p-8 shadow-lg shadow-zinc-900/5"
```

**Step 3: Update title**

Line 29 — replace `font-bold` → `font-semibold`, add `tracking-tight`:
```tsx
className="text-2xl font-semibold text-zinc-900 tracking-tight"
```

**Step 4: Update heading in card**

Line 37 — replace `font-semibold` → `font-medium`:
```tsx
className="text-lg font-medium text-zinc-800 mb-1"
```

**Step 5: Update input**

Line 57 — replace `rounded-xl` → `rounded-md`:
```tsx
className="w-full px-4 py-3 rounded-md border border-zinc-200 text-sm text-zinc-900 mb-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
```

**Step 6: Update CTA buttons**

Lines 60-62 and 77-79 — replace `rounded-xl bg-indigo-700` → `rounded-md bg-indigo-500`, replace `hover:bg-indigo-800 active:bg-indigo-900` → `hover:bg-indigo-600`:
```tsx
className="w-full flex items-center justify-center gap-3 px-4 py-3.5 rounded-md bg-indigo-500 text-white font-medium text-sm hover:bg-indigo-600 transition-colors shadow-md shadow-indigo-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/20 focus-visible:ring-offset-2"
```

**Step 7: Update dev note color**

Line 65 — replace `text-amber-600` → `text-zinc-500`

**Step 8: Verify**

Run: `cd apps/web && npx biome check src/app/\\[locale\\]/\\(auth\\)/login/page.tsx`
Expected: No errors

**Step 9: Commit**

```bash
git add apps/web/src/app/\\[locale\\]/\\(auth\\)/login/page.tsx
git commit -m "refactor(design): login page to minimal zinc aesthetic"
```

---

## Task 5: Chat Page — Clean Conversation UI

**Files:**
- Modify: `apps/web/src/app/[locale]/(dashboard)/chat/page.tsx` (176 lines)

**Step 1: Apply stone → zinc replacement across entire file**

All `stone-*` → `zinc-*`.

**Step 2: Update page header strip**

Line 45 — replace:
```tsx
className="border-b border-stone-200/60 bg-white/80 dark:bg-stone-900/80 dark:border-stone-700/60 backdrop-blur-sm px-6 py-4 shrink-0 flex items-center justify-between"
```
with:
```tsx
className="border-b border-zinc-200 bg-white/80 dark:bg-zinc-950/80 dark:border-zinc-800 backdrop-blur-md px-8 py-4 shrink-0 flex items-center justify-between"
```

**Step 3: Update page title**

Line 47 — replace `font-semibold` → `font-medium`, add `tracking-tight`:
```tsx
className="text-lg font-medium text-zinc-900 dark:text-zinc-100 tracking-tight"
```

**Step 4: Update suggestion cards**

Lines 118, 130, 142, 154 — replace card classes:
```tsx
className="text-left p-3 rounded-lg border border-zinc-200 bg-white hover:border-zinc-300 transition-colors group dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600"
```

Replace group-hover text colors: `group-hover:text-indigo-700` → `group-hover:text-zinc-900`, `dark:group-hover:text-indigo-300` → `dark:group-hover:text-zinc-200`

**Step 5: Update empty state icon container**

Line 90 — replace `rounded-2xl bg-indigo-50 dark:bg-indigo-950/50` → `rounded-xl bg-zinc-100 dark:bg-zinc-800`
Line 93 — replace amber icon: `text-amber-400` → `text-indigo-500`

**Step 6: Update input footer**

Line 171 — replace:
```tsx
className="shrink-0 border-t border-stone-200/60 dark:border-stone-700/60 bg-white/80 dark:bg-stone-900/80 backdrop-blur-sm px-6 py-4"
```
with:
```tsx
className="shrink-0 border-t border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md px-8 py-4"
```

**Step 7: Verify**

Run: `cd apps/web && npx biome check src/app/\\[locale\\]/\\(dashboard\\)/chat/page.tsx`
Expected: No errors

**Step 8: Commit**

```bash
git add apps/web/src/app/\\[locale\\]/\\(dashboard\\)/chat/page.tsx
git commit -m "refactor(design): chat page stone to zinc"
```

---

## Task 6: Search Page — Clean Results

**Files:**
- Modify: `apps/web/src/app/[locale]/(dashboard)/search/page.tsx` (493 lines)

**Step 1: Apply stone → zinc replacement**

All `stone-*` → `zinc-*` across entire file.

**Step 2: Update structural patterns**

- All `rounded-xl` → `rounded-lg` (search bar, result cards)
- All `shadow-sm` → remove (cards)
- All `shadow-md` → remove (hover states)
- `font-semibold` → `font-medium` (headings)
- `p-6` → `p-5` (card padding where applicable)

**Step 3: Update page header strip**

Same pattern as chat — add `backdrop-blur-md`, use `border-zinc-200`, `px-8`

**Step 4: Update RAG answer pane**

Replace `border-indigo-200 bg-indigo-50/50` → `border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900`

**Step 5: Update hover states**

Replace `hover:shadow-md` → `hover:border-zinc-300 dark:hover:border-zinc-600` (border-only hover)

**Step 6: Verify**

Run: `cd apps/web && npx biome check src/app/\\[locale\\]/\\(dashboard\\)/search/page.tsx`
Expected: No errors

**Step 7: Commit**

```bash
git add apps/web/src/app/\\[locale\\]/\\(dashboard\\)/search/page.tsx
git commit -m "refactor(design): search page stone to zinc, border-only cards"
```

---

## Task 7: Documents Page — Clean Table UI

**Files:**
- Modify: `apps/web/src/app/[locale]/(dashboard)/documents/page.tsx` (1,196 lines)

**Step 1: Apply stone → zinc replacement**

All `stone-*` → `zinc-*`.

**Step 2: Apply structural replacements**

- `rounded-xl` → `rounded-lg`
- `shadow-sm` → remove
- `font-semibold` → `font-medium` (headings)
- `p-6` → `p-5` (cards)

**Step 3: Update upload zone**

Replace `border-stone-300` → `border-zinc-300`, `border-dashed` stays.

**Step 4: Update page header strip**

Same pattern as other pages — `backdrop-blur-md`, `border-zinc-200`, `px-8`.

**Step 5: Verify**

Run: `cd apps/web && npx biome check src/app/\\[locale\\]/\\(dashboard\\)/documents/page.tsx`
Expected: No errors

**Step 6: Commit**

```bash
git add apps/web/src/app/\\[locale\\]/\\(dashboard\\)/documents/page.tsx
git commit -m "refactor(design): documents page stone to zinc"
```

---

## Task 8: Admin Page — Largest File, Tab Redesign

**Files:**
- Modify: `apps/web/src/app/[locale]/(dashboard)/admin/page.tsx` (3,336 lines)

This is the largest file. Apply changes systematically:

**Step 1: Apply stone → zinc replacement across entire file**

All `stone-*` → `zinc-*`. This is a bulk replacement (most impactful single change).

**Step 2: Apply structural replacements across entire file**

- All `rounded-xl` → `rounded-lg`
- All `shadow-sm` → remove (except intentional shadows)
- `font-semibold` → `font-medium` (section headings, card titles — NOT page title)
- `p-6` → `p-5` (card padding)

**Step 3: Redesign tab bar (lines ~3263-3296)**

Replace the underline-style tab bar with pill/segment style.

Current tab container pattern:
```tsx
<div className="border-b border-stone-200 dark:border-stone-700">
    <div className="flex gap-0 overflow-x-auto">
```

Replace with:
```tsx
<div className="bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1 inline-flex gap-0.5 overflow-x-auto">
```

Current active tab button pattern:
```tsx
border-b-2 border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400
```

Replace with:
```tsx
bg-white dark:bg-zinc-700 rounded-md shadow-sm text-zinc-950 dark:text-zinc-100 font-medium
```

Current inactive tab button pattern:
```tsx
border-b-2 border-transparent text-stone-500 hover:text-stone-700 hover:border-stone-300
```

Replace with:
```tsx
text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 rounded-md
```

Tab button base — remove `border-b-2`, add `px-3 py-1.5 rounded-md text-sm transition-colors`.

**Step 4: Update page header strip**

Same pattern — `backdrop-blur-md`, `border-zinc-200`, `px-8`.

**Step 5: Update all card instances (~30)**

Pattern: `bg-white dark:bg-stone-800 rounded-xl border border-stone-200 p-6 shadow-sm`
→ `bg-zinc-50 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-5`

Add hover where interactive: `hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors`

**Step 6: Update all modals**

Replace modal overlays: `bg-black/50` → `bg-black/60 backdrop-blur-sm`
Replace modal content: add `shadow-xl`, use `rounded-lg border border-zinc-200 dark:border-zinc-800`

**Step 7: Update table patterns**

Table containers: add `rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden`
Table headers: add `bg-zinc-50 dark:bg-zinc-800/50 text-[11px] uppercase tracking-widest text-zinc-400`
Table rows: `border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 transition-colors`

**Step 8: Update input patterns**

All inputs: `rounded-xl` → `rounded-md`, add `focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500`

**Step 9: Verify**

Run: `cd apps/web && npx biome check src/app/\\[locale\\]/\\(dashboard\\)/admin/page.tsx`
Expected: No errors

**Step 10: Commit**

```bash
git add apps/web/src/app/\\[locale\\]/\\(dashboard\\)/admin/page.tsx
git commit -m "refactor(design): admin page stone to zinc with pill tabs"
```

---

## Task 9: Analytics Page — Clean Charts

**Files:**
- Modify: `apps/web/src/app/[locale]/(dashboard)/analytics/page.tsx` (595 lines)

**Step 1: Apply stone → zinc replacement**

All `stone-*` → `zinc-*`.

**Step 2: Apply structural replacements**

- `rounded-xl` → `rounded-lg`
- `shadow-sm` → remove
- `font-semibold` → `font-medium`
- `p-6` → `p-5`

**Step 3: Update tab bar (if present)**

Same pill/segment transformation as admin page.

**Step 4: Update page header strip**

Same pattern as other pages.

**Step 5: Verify**

Run: `cd apps/web && npx biome check src/app/\\[locale\\]/\\(dashboard\\)/analytics/page.tsx`
Expected: No errors

**Step 6: Commit**

```bash
git add apps/web/src/app/\\[locale\\]/\\(dashboard\\)/analytics/page.tsx
git commit -m "refactor(design): analytics page stone to zinc"
```

---

## Task 10: Templates Page — Clean Cards

**Files:**
- Modify: `apps/web/src/app/[locale]/(dashboard)/templates/page.tsx` (520 lines)

**Step 1: Apply stone → zinc replacement**

All `stone-*` → `zinc-*`.

**Step 2: Apply structural replacements**

- `rounded-xl` → `rounded-lg`
- `shadow-sm` → remove
- `font-semibold` → `font-medium`
- `p-6` → `p-5`

**Step 3: Remove hover transforms**

Replace `hover:-translate-y-0.5` → remove (border-only hover instead)
Add `hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors`

**Step 4: Update page header strip**

Same pattern.

**Step 5: Verify**

Run: `cd apps/web && npx biome check src/app/\\[locale\\]/\\(dashboard\\)/templates/page.tsx`
Expected: No errors

**Step 6: Commit**

```bash
git add apps/web/src/app/\\[locale\\]/\\(dashboard\\)/templates/page.tsx
git commit -m "refactor(design): templates page stone to zinc, no hover transforms"
```

---

## Task 11: Recipes Page — Clean Expandable Cards

**Files:**
- Modify: `apps/web/src/app/[locale]/(dashboard)/recipes/page.tsx` (493 lines)

**Step 1: Apply stone → zinc replacement**

All `stone-*` → `zinc-*`.

**Step 2: Apply structural replacements**

- `rounded-xl` → `rounded-lg`
- `shadow-sm` → remove
- `font-semibold` → `font-medium`
- `p-6` → `p-5`

**Step 3: Update code blocks**

Replace `bg-stone-50 dark:bg-stone-900/40 rounded-lg p-3 border border-stone-100`
→ `bg-zinc-50 dark:bg-zinc-900 rounded-md p-3 border border-zinc-100 dark:border-zinc-800`

**Step 4: Verify**

Run: `cd apps/web && npx biome check src/app/\\[locale\\]/\\(dashboard\\)/recipes/page.tsx`
Expected: No errors

**Step 5: Commit**

```bash
git add apps/web/src/app/\\[locale\\]/\\(dashboard\\)/recipes/page.tsx
git commit -m "refactor(design): recipes page stone to zinc"
```

---

## Task 12: Agent Page — Clean Dashboard

**Files:**
- Modify: `apps/web/src/app/[locale]/(dashboard)/agent/page.tsx` (793 lines)

**Step 1: Apply stone → zinc replacement**

All `stone-*` → `zinc-*`.

**Step 2: Apply structural replacements**

- `rounded-xl` → `rounded-lg`
- `shadow-sm` → remove
- `font-semibold` → `font-medium`
- `p-6` → `p-5`

**Step 3: Update page header strip**

Same pattern.

**Step 4: Verify**

Run: `cd apps/web && npx biome check src/app/\\[locale\\]/\\(dashboard\\)/agent/page.tsx`
Expected: No errors

**Step 5: Commit**

```bash
git add apps/web/src/app/\\[locale\\]/\\(dashboard\\)/agent/page.tsx
git commit -m "refactor(design): agent page stone to zinc"
```

---

## Task 13: Final Verification

**Step 1: Run full lint**

```bash
cd apps/web && npx biome check .
```
Expected: No errors

**Step 2: Run TypeScript compilation**

```bash
cd apps/web && npx tsc --noEmit
```
Expected: No type errors

**Step 3: Run tests**

```bash
cd apps/web && npx vitest run
```
Expected: All tests pass

**Step 4: Visual check**

Start dev server and visually verify:
- Sidebar: flat zinc-950, no gradient
- Header: clean backdrop-blur
- Admin: pill/segment tabs
- Cards: border-only, no shadows
- Typography: font-medium, tracking-tight headings
- Dark mode: zinc-based, consistent

**Step 5: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "refactor(design): final design system reset polish"
```
