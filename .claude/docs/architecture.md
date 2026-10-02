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
  Browser (en / fr / ar-RTL) ◄── Next.js 16 pages (static generation) ─────────────────┤
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
| Web | `src/app/[locale]/` | pages built so far: Home, `/profile`, `/matches`, `/programs/[slug]`, `/plan` (Scholarships and Compare are M4); `src/app/global-not-found.tsx` is the 404 page |
| Snapshot access | `src/lib/snapshot/` | `client.ts` (browser: manifest, shards, integrity, version pinning), `use-snapshot.ts` (hook), `plan.ts` (which shards a page needs, as functions of the manifest), `manifest.ts` (hand-written manifest guard), `text.ts` (locale text lookup with fallback notes), `shard-names.ts`, `errors.ts`, `server.ts` (`server-only` build-time reader used by program pages) |
| Guest profile | `src/lib/profile/` | `storage.ts` + `store.ts` (localStorage `jisr.profile`, `jisr.profile-draft`; `useProfile` in `use-profile.ts`), `validate.ts` / `draft-validate.ts` (hand-written, Zod-free), `reference-checks.ts` / `reference-lookups.ts` (profile against the core shard), `form/` (pure form model: state, options, step validation, `buildProfile`) |
| Saved programs | `src/lib/saved/` | `saved.ts` (`jisr.saved`: `{ schemaVersion, items: [{ slug, country, field, snapshotVersion, savedAt }] }`, hand-written Zod-free parser, max 12; country and field are public attributes the plan page needs to pick the program shard), `store.ts` (the store), `actions.ts` (`toggleSaved`, `removeFromPlan`: removing also forgets the ticks), `use-saved.ts` (`useSaved`; `toggle` is async and imports `actions.ts` on the first click), `use-saved-count.ts` (`useSavedCount`, what the nav needs) |
| Plan progress | `src/lib/plan/` | `progress.ts` (`jisr.plan`: slug to ticked step ids, in checklist order), `store.ts`, `use-plan-progress.ts`. Only ticks are stored; the steps themselves are derived by `generateChecklist` on every render |
| Local JSON store | `src/lib/local-store.ts`, `src/lib/local-storage.ts`, `src/lib/local-data.ts` | `createLocalJsonStore` (the `useSyncExternalStore` store shared by `jisr.saved` and `jisr.plan`: unhydrated server snapshot, in-memory fallback when the device blocks storage, `storage` event sync); `clearAllLocalData` (what Clear my data runs: the profile store removes every `jisr.` key, the other stores re-read) |
| Journey view models | `src/lib/journey/` | pure: `matches-view.ts` (`groupOf`, `routeKeyOf`, `topReasons`, `buildMatchesView`), `plan-view.ts` (`buildPlanView`: the program page's personal result run for each saved program, plus `generateChecklist`; a saved slug the data no longer lists becomes a `missing` entry), `reasons.ts` / `requirements.ts` (reasons and rules as message keys plus preformatted params), `page-facts.ts`, `freshness.ts` |
| UI helpers | `src/lib/i18n/`, `src/lib/format.ts`, `src/lib/clock.ts`, `src/lib/constants.ts`, `src/lib/guards.ts` | domain vocabulary + `pickMessages`; `Intl` money/date/grade formatting (`ar` uses Latin digits); `todayIso()` (browser only); Zod-free constants and guards for client code |
| Auth | `src/lib/auth/`, `src/app/api/auth/` | Better Auth (phase 2) |
| User DB | `src/db/` | Drizzle schema + migrations, user data only |
| i18n | `src/i18n/`, `messages/` | next-intl routing, en/fr/ar messages |
| UI | `src/components/` | `ui/` (shadcn: `button`, `alert-dialog`), shell (header, footer, locale switcher, clear-data), trust primitives (`SourceBadge`, `FreshnessMark`, `MatchStatusBadge`, `DeadlineStatus`, `ExternalLink`, `LocalizedDataText`, `EmptyState`), composites (`MatchCard`, `CostBreakdown`, `ReasonList`), `SaveProgramButton` (labelled Save / Saved toggle on every match card and in the program page header; strings arrive as props via `use-save-copy.ts`), header nav with the saved-count badge (`nav-links.tsx`), page folders `profile/`, `matches/`, `program/`, `plan/` (the `/plan` island: `plan-client.tsx`, `program-switcher.tsx`, `program-plan.tsx`, `step-row.tsx`, `skipped-steps.tsx`, `missing-program.tsx`, `plan-states.tsx`) |
| Perf / e2e tooling | `scripts/perf/`, `scripts/e2e/`, `tests/e2e/` | `pnpm perf:js` (gzipped first-load JS per prerendered route + Zod marker scan), fixture build for e2e, Playwright specs (journey, plan, errors, privacy, a11y, perf) |

## Data model essentials

- **Fact:** any displayed claim = value + `source_url` + `info_kind` (`official | estimate | guidance`) + `last_verified_at` (+ optional `basis`). Stable slug ids.
- **Admission route:** `(origin country, credential type) → (destination country, level)` with outcome (`direct | foundation | not_eligible | check`), conditions, and its own source. Origin-agnostic; Morocco/Bac is the first origin.
- **Program:** institution, city, field, degree, language(s), tuition, intakes/deadlines, application channel, documents, requirement rules (data, not code), links to scholarships.
- **Translations:** structural data is language-neutral (enums, numbers, dates, official names). Short text is an inline `LocalizedText` map (`fr` required and the fallback; `en`, `ar` optional; each `draft` or `reviewed`). Long-form guides are MDX in `content/<locale>/`. Snapshots ship text as a separate shard per locale.

## Data flow

1. Edit YAML → `pnpm data:check` (schema, provenance, staleness) → `pnpm data:build` → snapshots + manifest in `public/snapshots`, deployed with the site (content-hashed, immutable).
2. At `next build`, program pages are generated from those files (`src/lib/snapshot/server.ts`). In the browser, Profile and Matches load the manifest and the shards for the student's credential country, fields and destinations, and run `src/domain` locally.
3. Guest profile in localStorage (`jisr.profile`, plus `jisr.profile-draft` while the form is in use). The saved list and the ticked steps live next to it in `jisr.saved` and `jisr.plan`; nothing is sent anywhere, and Clear my data (`clearAllLocalData`) empties all of them. Saving to an account (phase 2) will write profile/saved/progress rows via Server Actions, referencing program slug + snapshot version.
4. Weekly job fetches sources, hashes content, opens a private-repo issue for changed pages.

## Data access boundary (M3)

- **Static at build time:** `/[locale]/programs/[slug]` is generated with `generateStaticParams` (slugs from the snapshot; the `[locale]` layout supplies the locales) and `dynamicParams = false`. The page starts with `import "server-only"` and reads `public/snapshots` through `src/lib/snapshot/server.ts` (length, SHA-256 and shape checked, memoised per process). The HTML holds only what does not depend on the clock or the student: name, institution, languages, tuition value, rules described in general terms, intake dates as published, channel, documents, cost ranges without a budget, scholarships, official links, and each SourceBadge's static part. `dynamicParams = false` is mandatory: on Vercel `public/` is not traced into functions, so a request-time render could not read the snapshot. With an empty `data/` the route has no pages and the real build still passes.
- **Client leaves on that page:** freshness marks, the aging/stale banner, the next deadline and the personal result (`PersonalMatch`: status, route text, reasons, budget fit, nationality-filtered scholarships) read the browser clock and the profile. Their server output is a neutral placeholder, so an old build never claims to be fresh and nothing about a student is in the HTML. The matching code is a separate chunk (`personal-outcome.ts`, loaded with `import()` once a profile and a bundle exist; if that download fails the box shows a network error with Retry, which imports it again).
- **Plan page:** `/[locale]/plan` is a static shell (title and a neutral skeleton) with one client island (`PlanClient`). The island reads the profile, `jisr.saved` and `jisr.plan`, asks `shardsForPlan(items, credentialCountry, manifest)` for the shards (the union of what `shardsForProgram` loads for each saved program) and imports `plan-view.ts` (the matching and checklist code) lazily, only once a saved program and a profile exist. A saved slug missing from the loaded shards shows a "no longer in our data" card with a Remove button; the same applies when the whole program shard is gone from the manifest. Nothing about the student is in the HTML.
- **Static shell, client island:** `/profile` and `/matches` render a static page and mount one client island that reads the store and loads a snapshot bundle. Home has one small client leaf (the "See my matches" link).
- **Snapshot client (`client.ts`):** one manifest per browser session (`cache: "no-cache"`), shards fetched by the names it lists and kept in an in-memory cache of verified JSON, plus the HTTP cache (`/snapshots/s/*` is `immutable`, the manifest `no-cache`: `src/lib/snapshot-headers.ts`). The trust boundary is integrity: byte length, SHA-256 via `crypto.subtle` (length only if it is missing), then a structural guard that the shard's kind and names match the manifest entry. A missing shard triggers one manifest refetch; if the version changed, the whole bundle is rebuilt from the new manifest (a plan is a function of the manifest, so added or removed program shards are respected), otherwise the error is `network`; a second change gives `version_changed_twice`. A bundle never mixes versions. Failures are never cached, error messages are fixed strings (never a body or profile value), and `SnapshotError.shard` names a profile-derived shard (for example `routes.XX`), so keep it out of Sentry extras.
- **Hook contract:** `useSnapshotBundle({ key, plan } | null, locale)`: `key` must change whenever any input the plan closure captures changes (matches: credential country and fields; program: program and credential country).
- **Privacy note:** request paths name the shards, so the host's access logs show the origin country, the destination countries and the field slugs of each student (never grades or nationality; nothing reaches analytics or a query string). The plan page adds the countries and fields of the saved programs to that list, because it requests `programs.<country>.<field>` for each of them (plus the destination's institutions, costs and scholarships shards); it never requests a path that names a program slug or a checklist step, and the e2e privacy spec checks that no request, header, cookie, `sessionStorage` or IndexedDB entry carries one. The privacy notice must say so.
- **Messages in islands:** the `[locale]` layout provides `messages={null}`; the shell's client leaves get their strings as props. A page with a client island adds a nested `NextIntlClientProvider` with an explicit `locale` and `pickMessages(messages, NAMESPACES)`; the namespace lists live next to the island (`components/matches/namespaces.ts`, `components/program/client-namespaces.ts`). Server components keep using `useTranslations` under `messages={null}`.

## No Zod in client bundles

Zod costs about 100 KB gzipped in any client chunk. Client-reachable code (`src/components`, `src/domain`, `src/lib/{profile,snapshot,journey,i18n,design}` and the Zod-free helper files) therefore imports no `zod` and nothing from `@/data-schema` except types and the zod-free `dates` and `staleness` modules. The profile, draft and manifest validators are hand-written and proven equal to the Zod schemas by differential tests with seeded fuzzing (`tests/lib/profile/validate.test.ts`, `draft-validate.test.ts`, `tests/lib/snapshot/manifest-guard.test.ts`). `tests/lib/client-imports.test.ts` walks the runtime import graph from every client root with the TypeScript AST and fails with the import chain. `pnpm perf:js` adds a backstop that scans `.next/static` for `ZodError`/`_zod` after a build (the CI `verify` job runs it after `pnpm build`; the e2e perf spec separately asserts that no script the browser loads contains the markers). When `src/instrumentation-client.ts` arrives with Sentry it must become a root of the guard.

## Client JS size (target 150 KB gzipped initial JS; ADR 0007)

Measured on the fixture build, gzip, noModule polyfill excluded. Build = `pnpm perf:js`; browser = Playwright perf spec ("initial" is what the HTML asks for, "until idle" adds the chunks Next prefetches for linked pages):

| Route | build KB | browser initial KB | until idle KB | gap to 150 (initial) |
|---|---|---|---|---|
| `/fr`, `/en`, `/ar` | 168.6 | 168.8 | 213.6 | +18.8 |
| `/[locale]/profile` | 184.9 | 185.3 | 214.8 | +35.3 |
| `/[locale]/matches` | 191.3 | 191.6 | 214.8 | +41.6 |
| `/[locale]/plan` (one saved program) | 185.1 | 185.4 | 240.6 | +35.4 |
| `/[locale]/programs/<slug>` | 183.2 | 183.4 | 237.4 | +33.4 |

Last measured 2026-10-02, after Save and the plan page (M4a). Against the previous table (build, initial): home +2.1 KB, profile +1.8, matches +3.1, program +3.0. The nav's saved-count badge costs about 2 KB on every page (`useSavedCount`, kept apart from `useSaved`); matches and program add the Save button and the hook. The toggle code and the plan's tick store behind it (`actions.ts`, `plan/store.ts`) are loaded on the first click (`useSaved.toggle` does `import("./actions")`; if that fails nothing changes and the button shows an alert), so they are in no initial chunk. The plan page's matching and checklist code (`plan-view.ts`) is a lazy chunk, loaded only when a program is saved and a profile exists, and the nav prefetches `/plan` only once something is saved (without that gate every page paid about 20 KB until idle for the plan's code). The program page's until-idle total has 0.6 KB of room under its ratchet row (238).

Every page is over target, home included (the shell is about 168 KB before any page code). The ratchet in `tests/e2e/support/js-budget.ts` is the current value rounded up plus 3 KB, only ever lowered, and the perf spec prints the gap on each run. What was tried, the remaining levers and the open decision are in ADR 0007.

## Match presentation (UI side of ADR 0005)

- `groupOf(match)` in `src/lib/journey/matches-view.ts` is the only place a match meets a page group: `satisfied` is `ok`, a `foundation` route is `foundation` (tested before `check`), `check` is `check`, `not_satisfied` (including a `not_eligible` route) is `failed`. The failed group is shown collapsed with its count. `MatchStatusBadge` is the only place a group maps to icon, colour and text (never colour alone).
- Within a group, programs sort by next upcoming deadline (closed and unknown after), then slug. Programs hidden by preferences are counted per mismatch kind and can be revealed with their reasons.
- Route wording always goes through `routeKeyOf(match)`, never `domain.route.${match.route}`: it names `direct` or `not_eligible` only when the route reason is decisive, and says "source not re-verified" or "not an official source" otherwise.
- `topReasons(match, max)` sorts fail, then to-check, then pass, and always keeps the `foundation` route reason and the coverage reason whatever `max` is. Cards show the top reasons; the program page shows all of them.

## Routing and 404

One trilingual 404 (`src/app/global-not-found.tsx`, experimental Next flag `globalNotFound`) answers every unmatched path; ADR 0006 records the trade-offs and the upgrade checklist. Match cards link to program pages with `prefetch={false}` and the locale switcher does not prefetch the current page (Next's prefetch added tens of KB per page); the primary nav still prefetches.

## Tests

Vitest (`tests/**`, jsdom per file for components) mirrors `src/`. Playwright (`tests/e2e/`, phone and desktop projects, fr and ar) runs against `next start` on a build of the synthetic fixture `tests/fixtures/data/e2e-journey` (`pnpm build:e2e`, which overwrites `public/snapshots`; restore with `pnpm data:build`), with the clock pinned. Specs: smoke, journey, plan (save, tick, unsave, clear, missing slug, full list, no profile), empty-and-errors, privacy, a11y (axe, including every plan state), perf.

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
