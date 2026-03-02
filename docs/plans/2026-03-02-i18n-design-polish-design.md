# i18n + Design Polish Design

## Scope
- 3-language support (EN, JA, KO) using next-intl
- Dark mode with class-based toggle + system preference detection
- Mobile responsive sidebar (hamburger menu < md)
- Design polish: typography, micro-interactions, spacing

## i18n Architecture
- next-intl with App Router `[locale]` segment
- Translation files: `messages/{en,ja,ko}.json`
- Middleware: locale detection (Accept-Language) + auth combined
- Language switcher: header right side dropdown (EN/JA/KO)
- Default: English, saved to cookie

## Route Structure
```
app/[locale]/(auth)/login/page.tsx
app/[locale]/(dashboard)/layout.tsx
app/[locale]/(dashboard)/chat/page.tsx
app/[locale]/(dashboard)/search/page.tsx
app/[locale]/(dashboard)/analytics/page.tsx
app/[locale]/(dashboard)/admin/page.tsx
app/[locale]/(dashboard)/admin/privacy/page.tsx
```

## Fonts
- Inter (Latin) + Noto Sans JP + Noto Sans KR
- CSS: `font-family: var(--font-inter), var(--font-noto-jp), var(--font-noto-kr), sans-serif`

## Dark Mode
- Class-based: `<html class="dark">`
- CSS custom properties switch between light/dark values
- Toggle in header (sun/moon icon)
- Persist to localStorage + cookie

## Mobile Responsive
- Sidebar: fixed (lg+), icon-only (md), hamburger overlay (< md)
- Stats cards: 4-col → 2-col → 1-col
- Chat suggestions: 2-col → 1-col on mobile

## Design Polish
- CJK typography: word-break, line-break rules
- Card hover: -translate-y-0.5 + shadow lift
- Button press: active:scale-[0.98]
- Page content: animate-fade-in
- Spacing: unified p-6 cards, space-y-10 sections
