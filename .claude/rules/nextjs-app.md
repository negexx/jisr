---
paths:
  - "src/app/**/*.{ts,tsx}"
  - "src/components/**/*.{ts,tsx}"
  - "instrumentation*.ts"
  - "sentry.*.config.ts"
---

# Next.js 16 App Router + Tailwind/shadcn

- Before building or restyling any page/component/form, invoke `impeccable:impeccable`; design for phone-first, slow connections, and all three locales (`en`, `fr`, `ar`-RTL).

- Server Components by default. Add `"use client"` only for state, effects or browser APIs, and keep client components as small leaves.
- In Next 16 `params`, `searchParams`, `cookies()` and `headers()` are async — `await` them. In `[locale]` pages/layouts call `setRequestLocale(locale)` so pages can render statically.
- Request interception lives in `src/proxy.ts` (exports `proxy`), not `middleware.ts`. It is an optimistic gate only — never the sole auth check.
- Mutations are Server Actions: parse input with Zod, re-check the session (`auth.api.getSession`), then touch the DB. Never call the DB from a client component.
- Use the locale-aware `Link`/`redirect`/`useRouter` exported from `@/i18n/navigation`, not the ones from `next/link` / `next/navigation`.
- RTL: use Tailwind logical utilities only — `ms-*`, `me-*`, `ps-*`, `pe-*`, `text-start`, `start-*`, `border-s`. Never `ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`, `text-left`. Mirror directional icons with `rtl:rotate-180`. Root layout sets `<html lang dir>` from the locale.
- Any component that shows a university, program, scholarship or cost figure renders `<SourceBadge>` (info kind + official link + last-verified date). No fact without it.
- Format dates as DD/MM/YYYY and money via `Intl.NumberFormat` with the active locale; never format by hand.
- shadcn components are copied into `src/components/ui/` — edit them there, don't wrap-and-fight them. Add new ones with the shadcn CLI.
- `src/proxy.ts` matcher must exclude `_next`, static assets and snapshot files: on Vercel Hobby every proxied request counts toward edge/function caps (verify). Guest journey pages must not need a server action or function call.
- Analytics is the GoatCounter script only; journey steps are events (`profile-started`, `profile-completed`, `matches-viewed`, `program-saved`, `plan-opened`). Never put grades, nationality or other profile values in paths, query strings or event names.
- Sentry: `sendDefaultPii: false`, `tracesSampleRate: 0`, no replay, `beforeSend` strips request bodies, cookies and URL query strings; EU DSN only. Check the client bundle stays within budget (initial JS ≤ 150 KB gzipped). Confirm the Next 16 SDK setup with `ctx7`.
- Every new page needs `generateMetadata` with a translated title/description (SEO matters for content pages).
