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
- Island message-pick pattern: the `[locale]` layout provides `<NextIntlClientProvider messages={null}>`, and the shell's client leaves take their strings as props from the server. A page with a client island wraps it in a nested `<NextIntlClientProvider locale={locale} messages={pickMessages(messages, NAMESPACES)}>` (explicit `locale`, namespace list exported next to the island: `components/matches/namespaces.ts`, `components/program/client-namespaces.ts`). Server components, including the shared trust components, keep calling `useTranslations` under `messages={null}`; a test for a client leaf renders it with the same picked namespaces.
- SSG boundary: pages under `src/app/[locale]/` are static. Anything that depends on the clock (`todayIso()`, freshness, deadline status) or on the profile (localStorage) is a small `"use client"` leaf that renders a neutral placeholder on the server and computes after mount; the static HTML must contain no status, route, budget or freshness claim (the program page tests assert this). A page that reads `src/lib/snapshot/server.ts` starts with `import "server-only"`, has `generateStaticParams` and keeps `dynamicParams = false` (ADR 0006: `public/` is not traced into Vercel functions). The `[locale]` layout sets `dynamicParams = false` for its children: a dynamic child without `generateStaticParams` must set `dynamicParams = true`.
- Client bundles: no `zod` and no runtime `@/data-schema` import in client-reachable code (hand-written validators in `src/lib`, `tests/lib/client-imports.test.ts` enforces it). After UI changes run `pnpm build` and `pnpm perf:js` and compare with the table in `.claude/docs/architecture.md`; the e2e perf spec ratchet only goes down.
- `buttonVariants()` returns a merged class string, so it is safe on a `Link`; use `prefetch={false}` on links whose target is heavy and not the likely next step (match cards, current-locale link).
- Every new page needs `generateMetadata` with a translated title/description (SEO matters for content pages).
