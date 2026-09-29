# ADR 0002 — Initial stack

**Status:** Accepted — reference-data storage (Postgres seed) superseded by ADR 0003; everything else stands.
**Date:** 2026-09-29

## Context

Jisr's MVP brief (`docs/product/jisr_mvp.md`) specified product scope but no technology. The product is a web app with SEO-relevant, trilingual content pages (fr/en/ar with RTL), a profile questionnaire, saved lists and per-user checklists, backed by curated relational data. Users are Moroccan students, often on mobile and slow connections; GDPR applies.

## Decision

- **Next.js 16 App Router + React 19** — Server Components mix static SEO pages with interactive flows; largest ecosystem; best-supported i18n.
- **Neon Postgres (EU) + Drizzle ORM** — relational data fits (universities → programs → requirements); SQL-first ORM with Postgres-specific features; users' data stays in the EU. Chosen over Supabase because Better Auth already provides auth and we don't need Supabase's BaaS surface, and over Prisma for lighter runtime and closer-to-SQL schema.
- **Better Auth** — users live in our own Postgres (GDPR-friendlier than a US-hosted SaaS), email/password + Google, active successor to Auth.js.
- **Tailwind v4 + shadcn/ui** — fast to build, accessible primitives, logical properties for RTL.
- **next-intl** — RSC-native routing and messages for fr/en/ar.
- **Zod, Vitest, Playwright, Biome, pnpm, Vercel (fra1)** — defaults picked without alternatives review; low switching cost.

## Alternatives considered

- **SvelteKit / Astro:** smaller bundles, but weaker auth/i18n ecosystem and more awkward for app-like flows.
- **Supabase (DB + auth):** bundled RLS and auth, but its free tier pauses idle projects and we'd duplicate what Better Auth gives us.
- **Clerk:** fastest setup, but user data in US infrastructure and vendor lock-in.
- **No accounts (local storage only):** rejected — no cross-device saves and weak validation data for Phase 4 student testing.

## Consequences

- Positive: one language across stack; own the user data; strong typed path from Zod/Drizzle to UI.
- Negative: Better Auth needs ~half a day of setup and hand-built auth pages; Next 16 is new (`proxy.ts`, async request APIs), so docs/examples online may be stale.
- Neutral: the Context7 MCP rejected its API key during scaffolding, so stack facts were first checked by web search; the `ctx7` CLI was installed afterwards and confirmed the Next 16 `middleware` → `proxy` rename. Use `ctx7` for library docs from now on.
- Locales: English, French and Modern Standard Arabic only — Darija was considered in the brief and explicitly dropped.

## How to revisit

ADRs are immutable once committed. If this decision turns out wrong, write a new ADR that supersedes this one — don't edit this in place.
