# Architecture — Jisr

> A map for AI agents and humans. Update when the shape of the system changes, not for every leaf-level edit. Rationale: ADR 0003.

## One-paragraph overview

Jisr is a free web app that turns a Moroccan Bac graduate's profile into a realistic, costed path to a European Bachelor's degree. Curated, provenance-tagged reference data lives as YAML files in the repo; a build step validates it and publishes immutable JSON snapshots. A pure TypeScript domain core (eligibility, matching, costs, checklist) runs in the browser against a cached snapshot, so the main journey costs almost nothing to serve at any scale. A small Neon Postgres database stores only user data (accounts, saved programs, checklist progress, feedback). The UI is trilingual (en, fr, ar with RTL). Built by one developer, closed source, designed so data sources, origin countries, destinations and contributors can grow without rewrites.

## System diagram

```
  data/**/*.yaml ──(pnpm data:build: Zod validate + provenance check)──► snapshots + manifest
   (git = audit trail)                                                       │
                                                                             ▼
                                                                   CDN / static assets
                                                                             │
  Browser (en / fr / ar-RTL) ◄── Next.js 16 pages (SSG/ISR) ─────────────────┤
     │  src/domain (pure TS) runs here on the snapshot:                      │
     │  eligibility → matching → costs → checklist                           │
     │  guest profile in localStorage                                        │
     ▼                                                                       │
  Server Actions / route handlers (Zod + session check)                      │
     │  save profile, save program, checklist state, feedback                │
     ▼                                                                       │
  Drizzle ─► Neon Postgres (EU): user data only ◄─ Better Auth (phase 2)     │
                                                                             │
  scheduled job: fetch each source_url ─ hash ─ open issue if changed ───────┘
```

## Modules (single Next.js app)

| Module | Path | Purpose |
|--------|------|---------|
| Reference data | `data/` | institutions, programs, admission routes, cost profiles, scholarships (YAML) |
| Data schema | `src/data-schema/` | Zod schemas shared by build script, domain and tests |
| Data build/check | `scripts/data/` | validate, snapshot, manifest, staleness report, source-change watcher |
| Domain core | `src/domain/` | eligibility routes, matching, costs, checklist. Pure; no framework/DB/fs/network |
| Web | `src/app/[locale]/` | pages: Home, Profile, Matches, Program, Scholarships, Compare, Plan |
| Data access (client/server) | `src/lib/snapshot/` | load manifest + snapshots, cache, version pinning |
| Auth | `src/lib/auth/`, `src/app/api/auth/` | Better Auth (phase 2) |
| User DB | `src/db/` | Drizzle schema + migrations, user data only |
| i18n | `src/i18n/`, `messages/` | next-intl routing, en/fr/ar messages |
| UI | `src/components/` | shadcn/ui + `SourceBadge`, `MatchCard`, `CostBreakdown` |

## Data model essentials

- **Fact:** any displayed claim = value + `source_url` + `info_kind` (`official | estimate | guidance`) + `last_verified_at` (+ optional `basis`). Stable slug ids.
- **Admission route:** `(origin country, credential type) → (destination country, level)` with outcome (`direct | foundation | not_eligible | check`), conditions, and its own source. Origin-agnostic; Morocco/Bac is the first origin.
- **Program:** institution, city, field, degree, language(s), tuition, intakes/deadlines, application channel, documents, requirement rules (data, not code), links to scholarships.
- **Translations:** structural data is language-neutral (enums, numbers, dates, official names). Short text is an inline `LocalizedText` map (`fr` required and the fallback; `en`, `ar` optional; each `draft` or `reviewed`). Long-form guides are MDX in `content/<locale>/`. Snapshots ship text as a separate shard per locale.

## Data flow

1. Edit YAML → `pnpm data:check` (schema, provenance, staleness) → `pnpm data:build` → snapshots + manifest deployed with the site (content-hashed, immutable).
2. Client loads the manifest, fetches the shards for the student's chosen field/countries, runs `src/domain` locally.
3. Guest profile in localStorage; saving to an account (phase 2) writes profile/saved rows via Server Actions, referencing program slug + snapshot version.
4. Weekly job fetches sources, hashes content, opens a private-repo issue for changed pages.

## External dependencies

| Service | Purpose | Failure mode |
|---------|---------|--------------|
| Vercel Hobby (+ Cloudflare R2/Pages if usage nears caps) | hosting, CDN | at a Hobby cap the project pauses until the cycle resets; 60% rule in ADR 0004 |
| Neon Postgres (EU) | user data | accounts/saves unavailable; guest journey unaffected |
| Google OAuth / email (magic link) | sign-in (phase 2) | other method still works |
| Official sources | manual data inputs, change watcher | staleness visible via `last_verified_at` |
| GoatCounter (EU) | cookieless analytics, journey events | analytics lost; app unaffected |
| Sentry (EU, free plan) | error reporting | quota exhausted ⇒ errors dropped; app unaffected |

## Cross-cutting concerns

- **Trust:** provenance on every fact; estimates are ranges; unknown ⇒ ⚠️.
- **i18n/RTL:** next-intl; logical CSS properties only.
- **Privacy:** guest mode stores nothing server-side; accounts gated on CNDP declaration + en/fr/ar privacy notice, unticked consent, age ≥ 16, cascade delete + export; data stays in the EU (ADR 0004). Not legal advice — verify before launch.
- **Freshness:** volatile facts aging 120d / stale 270d; stable aging 270d / stale 545d; stale data yields only ⚠️.
- **Analytics:** GoatCounter, event-based journey counts, no personal data in paths.
- **Error reporting:** Sentry EU, scrubbed, tracing off; no other observability until needed.
- **Roles:** `user.role` defaults to `student`; no admin UI exists.

## Growth seams (what changes when the team grows)

Source of truth: YAML → Postgres + admin app, still publishing the same snapshot format. Extract `packages/domain` when a second app needs it. Add a search engine, worker, or Cloudflare/VPS hosting only when a measured need appears.

## What this doc is NOT

- Not an exhaustive file list — that's discoverable
- Not API documentation — that lives near the code
- Not a tutorial — see the README for getting started
