# ADR 0003 — Static data plane, pure domain core, solo-friendly build

**Status:** Accepted (partially supersedes ADR 0002 on where reference data lives)
**Date:** 2026-09-29

## Context

Jisr is a free, non-commercial product with no revenue, built and run by one developer, closed source for now, but expected to grow (more origin countries, destination countries, fields, languages, and eventually other contributors). Traffic is spiky (Bac results, application deadlines). Running cost must stay near zero as traffic grows, and operations work must fit one person. The product's value is trustworthy, verified data.

## Decision

1. **Reference data is files in the repo, not database rows.** `data/**/*.yaml`, validated by Zod, edited in an editor and reviewed in git. Every fact carries provenance (source URL, info kind, last-verified date). Git history is the audit trail. No admin app exists.
2. **A publish step turns the files into versioned, immutable JSON snapshots** (`pnpm data:build`), sharded by destination country and field, plus a manifest. The snapshot format is the contract between data and app. Later the source of truth can move to Postgres plus an admin app without touching the web app.
3. **The domain core is pure TypeScript** in `src/domain/` (matching, costs, checklist, eligibility). No React, Next, DB, `fs` or network imports, enforced by a Biome `noRestrictedImports` override. It runs in the browser against a cached snapshot, so the core journey (profile → matches → costs → compare) needs no per-request server or database work.
4. **Postgres (Neon, EU) + Drizzle hold user data only:** auth tables, profile, saved programs, checklist state, feedback reports. A `role` column (default `student`) exists on `user`; no admin UI is built.
5. **Guest-first:** the profile lives in localStorage; accounts (Better Auth, Google + magic link) come after the guest journey works and import the local profile on signup.
6. **Eligibility is modelled origin-agnostically:** `admission route = (origin credential country, credential type) → (destination country, level)`, then program-level requirements as rules-as-data. Morocco/Bac is the first origin, not a hard-coded assumption.
7. **Single Next.js app, no monorepo.** Module boundaries (`src/domain`, `src/db`, `src/lib`) are the seams; extract packages only when a second app exists.
8. **Hosting: Vercel + Neon while small,** with spend limits, avoiding Vercel-only services (KV, Edge Config, etc.) so the app can move to a fixed-price host behind Cloudflare if bills grow.
9. **Data upkeep is automated, not administered:** `pnpm data:check` (schema + staleness) and a scheduled job that fetches each record's `source_url`, hashes it, and opens an issue in the private repo when an official page changed. A "report outdated info" button on every fact writes a feedback row.
10. **Closed source for now.** Keep `data/` self-contained with its own schema so licensing or open-sourcing later is a packaging task.

## Alternatives considered

- **Postgres as source of truth + admin app + worker + monorepo:** the right shape for a team; too much to build and operate solo, and no one to use the admin.
- **Server-side matching against the database on every request:** simpler to write, but every visitor costs compute and DB connections, and spikes hurt.
- **Fixed-price VPS with Coolify from day one:** cheaper at scale, but adds ops work for a solo developer; keep as the exit route.
- **Microservices / queues / search engine now:** no current need; add when a measured bottleneck appears.

## Consequences

- Positive: near-zero marginal cost per student; static/CDN-cacheable pages; offline-capable PWA is feasible; data changes are reviewable diffs; small operational surface for one developer.
- Negative: content editing requires a developer (no non-technical editors) until an admin exists; data volume must stay modest enough to ship as snapshots (fine for thousands of programs when sharded); saved programs must reference stable slugs and snapshot versions.
- Growth path: when a second person edits data, import `data/` into Postgres, build the admin, and keep publishing the same snapshot format.

## Deliberately not built (revisit with an ADR when needed)

Admin app, worker service, job queue, search engine, B2B/multi-tenancy, payments, WhatsApp API, monorepo, student-facing AI, native mobile apps.

## How to revisit

ADRs are immutable once committed. If this decision turns out wrong, write a new ADR that supersedes this one — don't edit this in place.
