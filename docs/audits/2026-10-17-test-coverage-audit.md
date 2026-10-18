# Test-coverage audit — 2026-10-17: what is not covered, and how to gate it

**Audit:** Track T4 (coverage)
**Baseline commit:** `f0cc00efed2f74e7e8a816ea59585d7462f4eebe` (merge PR #60, `feat/sign-in-single-flow`)
**Worktree:** `.worktrees/audit-coverage` — branch `audit/scratch-coverage`
**Scope:** Vitest unit tests (`tests/**/*.test.{ts,tsx}`) and Playwright e2e (`tests/e2e`, `tests/e2e-accounts`). Read-only; the only mutation was a coverage dev-dependency in this worktree.
**Date:** 2026-10-17

## 0. Method and raw evidence

- Coverage provider was **absent**. Installed in this worktree only: `@vitest/coverage-v8` **5.0.5** (`pnpm add -D @vitest/coverage-v8@5`). `vitest` is **5.0.2** — pnpm reports an unmet peer (`@vitest/coverage-v8@5.0.5` wants `vitest@5.0.5`, and `vitest@5.0.2` wants `@vitest/coverage-v8@5.0.2`). The mismatch is a warning; the run passed. **A committed gate should pin `@vitest/coverage-v8@5.0.2`** to silence it (see §5).
- Full suite run once, with coverage, `include=src/**`:

  ```
  pnpm exec vitest run --coverage \
    --coverage.reporter=text-summary --coverage.reporter=text \
    --coverage.include=src/**
  ```

  Raw output: `docs/audits/assets/coverage/run.txt` (1895 lines).
- Result: **328 test files passed, 10 skipped (338 total)**; **8030 tests passed, 25 skipped (8055 total)**; duration 185.21 s; 840 modules evaluated.
- The task brief expected "~328 unit test files, 14 e2e specs". Both are now measured: **338** unit test files (not 328 — 328 is the *passing* count) and **15** e2e specs (not 14). Counts include `tests/db-race/*` (10 files, env-gated).

> Note on scope: `--coverage.include=src/**` instruments `src/` only. The `scripts/` tree (81 test files protecting the data importers, snapshot build and ops tools) is **not measured at all** by this run.

---

## 1. Coverage by area

Overall (all of `src/`, `include=src/**`):

| Scope | % Stmts | % Branch | % Funcs | % Lines |
|---|---:|---:|---:|---:|
| **All files** | **95.42** | **90.61** | **96.47** | **96.60** |

Per area. "Risk" is the trust/blast-radius weight if this area regresses (Critical = wrong eligibility/cost/trust fact or data loss; High = user data or a core journey step; Medium = presentation/UX; Low = thin wrapper covered by e2e).

| Area | % Stmts | % Branch | % Funcs | % Lines | Risk | Notes |
|---|---:|---:|---:|---:|---|---|
| `src/domain` | 98.33 | 98.45 | 100 | 97.98 | **Critical** | eligibility, matching, costs, checklist, scholarships. `grades.ts` 90% lines (34-35), `match.ts` 94.44. |
| `src/data-schema` | 100 | 100 | 100 | 100 | **High** | `resolved.ts` shows 0 % but is types-only (0/0 statements, excluded from the aggregate). Records 100 %. |
| `src/db` | 100 | 100 | 100 | 100 | **High** | `index.ts`, `pool.ts` 100. |
| `src/db/schema` | 86 | 100 | 70.83 | 84.09 | High | `app.ts` 89.28 (36,43,147), `auth.ts` 75 (28-34,47,73), `index.ts` re-export 0. Schema is exercised through the DB specs, not by direct import. |
| `src/lib/snapshot` | 96.95 | **86.05** | 100 | 98.91 | **Critical** | strongest integrity suite in the repo (§2); `server.ts` branch **66.21** (59-60,77) is the weak spot. |
| `src/lib/server` | 97.36 | 90.94 | 99.25 | 99.22 | **Critical** | account store/erasure/import/signup; `account-store.ts` 87.5 branch, `import-store.ts` 95.65 line 182. |
| `src/lib/auth` | 96 | 92.5 | 100 | 97.3 | **Critical** | deletion, export, consent, magic-link; `client.ts` 0 (browser client, always mocked). |
| `src/lib/profile` (+`/form`) | 98.89 / 99.17 | 96.84 / 96.85 | 100 | 99.46 / 99.48 | **High** | v1→v2 migration and one-shot seed covered (§3). `types.ts` 0 (type-only). |
| `src/lib/plan` | 100 | 96.87 | 100 | 100 | High | `progress.ts` branch 39. |
| `src/lib/journey` | 97.43 | 91.53 | 99.2 | 97.73 | **High** | `plan-view.ts` branch **71.87** (58,65,88-114,127); `reasons.ts`, `page-facts.ts` ~87-94 branch. |
| `src/lib/matches` | 99.11 | 98.79 | 100 | 100 | Medium | filter URL/store + filters. |
| `src/lib/saved` | 98.66 | 92.98 | 95.83 | 98.36 | Medium | `use-saved-count.ts` 80/50. |
| `src/lib/account-sync` | 92.77 | **84.11** | 93.4 | 95 | Medium | `client.ts` 85, `sync.ts` 95.78. |
| `src/lib/account-import` | 93.87 | 93.1 | 100 | 97.56 | **High** | guest keep/replace. |
| `src/lib` (other: format/clock/guards/seo/security-headers/site-env/analytics/local-store/punycode) | ~97.4 | ~94.1 | 100 | ~98.4 | Medium | `punycode.ts` 88.88/82.22; `local-store.ts` 97.77. |
| `src/components` (all) | 99.31 | 96.74 | 98.76 | 99.62 | Medium | very strong overall, but see subdirs below. |
| ├ `src/components/profile` | **90** | **81.86** | 94.21 | 91.09 | Medium | `issues.ts` 66.66/46.93, `step-languages.tsx` 76.92/61.11, `profile-wizard.tsx` 91.46, `step-bac.tsx` 89.47. Weakest component area. |
| ├ `src/components/matches` | 90.87 | 84.35 | 93.25 | 93.75 | Medium | `matches-controls.tsx` 72.41/78.26, `filter-panel.tsx` 83.33, `matches-counts.ts` 94.44/55.55. |
| ├ `src/components/auth` | 91.75 | 88.16 | 91.58 | 93.54 | High | `other-browser-warning.tsx` 33.33, `sign-in-form.tsx` 82.19, `account-sync-loader.tsx` 75/62.5. |
| ├ `src/components/home` | 93.75 | **65** | 100 | 96.42 | Low | branch-light due to decorative conditional rendering. |
| └ `src/components/plan`, `compare`, `program`, `scholarships`, `mdx` | ≥94 | varies | ≥93 | ≥94 | Medium | `mdx/guide-steps.tsx` 0 (see below). |
| `src/app` (+`[locale]`) | 43.75 / 59.25 | 75 / 50 | 50 / 62.5 | 46.66 / 69.56 | Low | Server Components; thin wrappers. Real behaviour is covered by e2e. `[locale]/layout.tsx` **25/30** is the only meaningful hole. |
| `scripts/**` | not measured | — | — | — | Low | excluded by `include=src/**`; 81 test files, no coverage number. |

### Files at 0 % — classified

| File | Verdict |
|---|---|
| `src/data-schema/resolved.ts` | Types-only → no executable statements. Not a gap. |
| `src/lib/utils.ts` | One re-export (`cn`). Not a gap. |
| `src/lib/legal/documents.ts` | Six MDX re-exports, `vi.mock`ed by `tests/app/legal-pages.test.tsx`. Wrapper, e2e covers behaviour. |
| `src/lib/auth/client.ts` | Better Auth browser client; always mocked. Exercised by `e2e-accounts`. |
| `src/app/fonts.ts` | `next/font` config; mocked in tests. |
| `src/app/robots.ts`, `src/app/sitemap.ts` | Delegate entirely to `buildRobots`/`buildSitemap` (`src/lib/seo.ts`, 100 %) and are asserted by `e2e/deploy-surface.spec.ts`. Thin wrappers. |
| `src/app/[locale]/account/delete/page.tsx` | Only rendered while `ACCOUNTS_ENABLED` is on; covered by `e2e-accounts`. |
| `src/i18n/request.ts` | next-intl request config, run by every render. |
| `src/components/mdx/guide-steps.tsx` | 0 %; only the MDX `guide-steps` renderer — one guide spec exists but never renders it. Minor real gap. |
| `src/proxy.ts` | Middleware body 0 % (5-7); only `config.matcher` is asserted in `tests/proxy.test.ts`. Redirect behaviour asserted only by `e2e/deploy-surface` ("the bare origin redirects to a locale"). |

**Interpretation.** The domain, schema, snapshot, DB and account layers — the places where a wrong answer breaks the product's only promise (trust) — are at or near 100 %. The residual is concentrated in **presentation-layer branches** (`src/components/profile`, `matches`, `auth`), thin framework wrappers, and the **unmeasured `scripts/` tree**. The strongest signal in this audit is not the 95 % floor; it is that a **regression could land unseen because nothing enforces the floor**.

---

## 2. Trustworthiness of the suite

### 2.1 Assertion-free tests — none

- Scanned all 338 files with a chain-aware parser (`it.each(...)`, `it.skip(...)`, arrow/`async` callbacks). **0 test files contain `it(`/`test(` calls without `expect(`/`expectTypeOf`/`assert`.**
- A first pass flagged 68 bodies; every one was a false positive: either a `RegExp.prototype.test(` call matched by the `test` token (`findIndex((line) => /…/.test(line))`), or a helper-based assertion (`expectAsciiDigitsOnly`, `expectNoPhysicalDirection`, `expectDisabled`, `dropsHousing`, `parity`) whose definition calls `expect`. Re-checked by hand in `tests/components/trust-helpers.ts:20`, `tests/lib/format.test.ts:26`, `tests/app/api/auth-handler.test.ts:44`, `tests/lib/snapshot/server.test.ts:272`, `tests/scripts/import/official-costs.test.ts:276`.

### 2.2 Disabled / trivial tests

- `grep` for `it.skip` / `it.todo` / `it.only` / `describe.skip`: **0 real occurrences.** (Matches on `.todo` are `review.todo` importer metadata; matches on `only(` are a local helper.)
- `expect(true|false|1|0|null|undefined)` — **0 occurrences.**
- **10 skipped test files / 25 skipped tests**, all under `tests/db-race/` (import, pg, profile-cas, saved-cap, harness, profile-revision, email-daily-cap, feedback-cap, migrations, email-cooldown). They skip because `TEST_POSTGRES_URL` is unset locally. **CI is not silent about this**: the dedicated `db-race` job runs them against a Postgres 18 service container and a guard step fails the job if the JSON report contains any `skipped`/`pending`/`todo` status, or if zero tests passed (`.github/workflows/ci.yml:122-179`). So the skip is a local-only convenience, not lost coverage — but **a local `pnpm test` green is not evidence that the race paths pass.**

### 2.3 Over-mocking — none of the module under test

- 69 test files, 138 `vi.mock(` calls. Targets are all external boundaries: `next-intl/server` (19), `@/i18n/navigation` (15), `@/lib/server/email` (12), `next/headers` (9), `@/lib/auth/client` (9), `next/navigation` (8), `@/lib/analytics`, MDX modules, `unpdf`, `better-auth`.
- No test mocks the module it is testing. The nearest cases are partial mocks with `importOriginal` (e.g. `tests/lib/privacy/no-pii.test.ts` on `@/lib/server/account-store`, `tests/components/program/leaves.test.tsx` on `@/domain/costs`) or deliberate failure injection (`tests/components/profile/build-chunk-failure.test.tsx`, `tests/lib/saved/use-saved-failure.test.tsx` on `@/lib/plan/store`). Both are legitimate.

### 2.4 Regression-catching power — spot-check of five critical suites

| Suite | Evidence it would catch a regression | Verdict |
|---|---|---|
| `tests/domain/match.test.ts` (416 ln) | Property/invariant block "holds for N combinations" over a generated matrix (line 317-390); "does not mutate frozen inputs"; explicit "route guidance never affects the match"; stale-route-guidance still reaching a tick. | Strong |
| `tests/domain/costs.test.ts` (291 ln) | `budgetFit` table covers `null`, `within`, `straddles` (both bounds), `above`, monthly×10 and yearly periods, and multi-currency → `unknown` (lines 229-243); tuition range widening + semester doubling + income-based flag; stale line still counted. | Strong |
| `tests/domain/checklist.test.ts` (640 ln) | "never skips on unknown data (all-null inputs)"; `language_exam` and `application_account` skip matrices; a degraded-facts control that flips skips to todo; explicit FactRef conventions. | Strong |
| Account erasure (`tests/lib/auth/delete-account.test.ts`, 17 tests) | Exercised through Better Auth's `deleteUser` hook → `eraseAccountResidue`; erases the student's rows and leaves another's; "sweeps a sign-in link and cooldown written for the address *while the deletion ran*"; refused confirmation deletes nothing; sessions store no IP/device. `src/lib/server/account-erasure.ts` is 100 % lines. | Strong |
| Snapshot integrity (`tests/lib/snapshot/client.test.ts` + `manifest-guard.test.ts`) | Byte-length mismatch, sha256 mismatch of the same length, shard kind/destination mismatch, non-JSON body, version pinning (`refetch once`, `version_changed_twice` + recovery), abort cleanup; `manifest-guard` differentially fuzzes **3000 + 2000 + 2000** mutations against the Zod schema and asserts both parsers agree. | Very strong |

### 2.5 Concrete weaknesses found

1. **No coverage gate anywhere.** `grep -i coverage .github/` → nothing. The `verify` job runs typecheck, lint, `pnpm test`, data:check, build, perf; none of them measure coverage. This is T4's headline gap.
2. **`scripts/` is unmeasured.** 81 test files guard the importers/snapshot builder/ops tools; the coverage command (and any gate built on `include=src/**`) never sees them.
3. **`src/app/[locale]/layout.tsx` at 25 % statements** is the one shell file with no meaningful unit test: the `hasLocale → notFound()` guard, `dir` selection and `dynamicParams=false` contract are only indirectly exercised.
4. **`src/lib/journey/plan-view.ts` branch 71.87 % and `src/lib/snapshot/server.ts` branch 66.21 %** are the two lowest branch numbers in otherwise-critical areas.
5. **Local-vs-CI gap on `db-race`** (see 2.2): the guard exists, but a developer's green `pnpm test` says nothing about concurrency paths.
6. Presentation branches in `profile/issues.ts` (46.93 % branch), `step-languages.tsx` (61.11 %), `matches-controls.tsx` (78.26 % lines) are the least-tested user-facing surfaces.

---

## 3. Named critical paths — coverage and missing cases

Legend: ✅ well covered · ◑ mostly, minor gaps · ⚠ real gap.

| # | Critical path | Existing tests | Key missing cases / invariant protected |
|---|---|---|---|
| 1 | **Account erasure** | ✅ `tests/lib/auth/delete-account.test.ts`, `account-deletion.test.tsx`, `tests/lib/privacy/no-pii.test.ts` (log shape), `src/lib/server/account-erasure.ts` 100 % | Invariant: every `verification`/`pending_signups`/`email_cooldowns` row naming the user **or** the email is gone after deletion, and another user's rows survive. Not isolated: no direct unit call of `eraseAccountResidue`; the malformed-row tolerance (`pg_input_is_valid` CASE) has no dedicated case. Add a focused test for a non-JSON `verification.value` next to the user's rows. |
| 2 | **Guest import keep/replace + conflicts** | ✅ `tests/lib/server/import.test.ts` (keep for profile/saves/ticks/marker; `has_server_data`; replace; revision conflicts; per-account; deleted-account session), `tests/lib/account-import/import-flow.test.ts`, `tests/db-race/import.test.ts` | Invariant: **keep never overwrites** existing server data, replace advances the revision so a stale device gets `conflict` not overwrite. Missing: import when the marker row exists with a timestamp but the profile was deleted (partly at line 403-411); a save made *during* an import race (left to `db-race`). |
| 3 | **Slug alias resolution** | ✅ `tests/lib/snapshot/resolve-program-slug.test.ts` (chain, loop, no-map), `tests/data-schema/alias.test.ts` (`checkAliases`, `aliasMapOf` flattening, collision/cycle fixtures), `e2e/slug-alias.spec.ts` (9 tests) | Invariant: an old slug redirects to the current page and resolves the same saved program/ticked steps. This path is the best-covered of the ten; no material gap. |
| 4 | **Snapshot integrity + version pinning** | ✅ `tests/lib/snapshot/client.test.ts` (integrity, version pinning, abort, cache), `digest.test.ts`, `manifest.test.ts`, `manifest-guard.test.ts` (fuzz) | Invariant: a tampered/truncated shard is rejected; a version change rebuilds the whole bundle; a second version change fails then recovers. Missing: a well-formed manifest with an **unknown future `formatVersion`** (forward-compat decision); a shard with correct bytes but a stale `Cache-Control`. |
| 5 | **Filter URL ↔ store sanitizer** | ✅ `tests/lib/matches/filter-url.test.ts` (encode/decode/`dropUnknownFilters`/`hasMatchFilterParams`), `filter-store.test.ts` (corrupt JSON, wrong shape, throwing storage, legacy seed) | Invariant: malformed URL values are dropped, never thrown on; storage corruption yields empty filters. Missing: budget exactly `Number.MAX_SAFE_INTEGER` (± 1) boundary; an integration test that a URL decode → store write → re-render round-trips through the page. |
| 6 | **Profile v1→v2 migration + one-shot seed idempotency** | ✅ `tests/lib/profile/store.test.tsx` "v1 profile migration" (seeds once, never re-seeds after emptying), `draft.test.ts` (`migrateDraft`), `storage.test.ts` (`MIGRATIONS`), `filter-store.test.ts` (`seedFiltersFromLegacy`) | Invariant: the preferences are seeded into `jisr.matches-filters` **exactly once**, a v1 record with corrupt preferences seeds nothing, and the migrated record reports `schemaVersion: 2`. Missing: a v1 record read twice in the same tick (double-seed); a v1 record where `jisr.matches-filters` already holds an unrelated invalid value. |
| 7 | **Checklist skips** | ✅ `tests/domain/checklist.test.ts` (`language_exam`, `application_account`, all-null control, degraded-facts control) | Invariant: unknown/stale data **never** produces a skipped step; a skip needs decisive fresh facts. Missing: `application_account` when the supplied channel slug ≠ the program's link (decisive mismatch); `foundation` route interaction. |
| 8 | **Scholarship predicate** | ✅ `tests/domain/scholarships.test.ts` (19-row table incl. nationality, link, destination, fields, institutions, past deadline, dedupe, code-unit sort), parity test in `snapshot/server.test.ts` | Invariant: the nationality filter applies to every result including linked ones. Missing: explicit `destinations: []` and `eligibleNationalities: []` "no restriction" rows (implied by defaults, not tabled). Minor. |
| 9 | **Deadline recurring / closed / stale** | ✅ `tests/domain/intakes.test.ts` (recurring usability, year wrap, tie-break, staleness), `tests/components/deadline-status.test.tsx` (closed/unknown/recurring, stale mark, no year) | Invariant: a year-less deadline is guidance ("usually"), never an upcoming date; a past deadline is "closed". Missing: 29 February recurrence; a closed deadline whose fact is fresh vs stale rendered identically. Minor. |
| 10 | **Cost `budgetFit` branches** | ✅ `tests/domain/costs.test.ts` table (null/within/straddles/above, month×10, multi-currency unknown) | Invariant: `budgetFit` never affects match status; unknown when budget null, estimate incomplete, or currency mismatch. Missing: budget currency equals the total but `complete=false`; budget exactly at a range bound with a ranged tuition. Minor. |

**Summary:** six of the ten named critical paths are covered as well as the codebase's own rules demand; the residual gaps are boundary cases (leap-day deadline, `MAX_SAFE_INTEGER` budget, empty `destinations`), not missing invariants. The only path where the *invariant itself* lacks a focused test is **account erasure** (tested through an integration hook, never in isolation).

---

## 4. E2E map and gaps

15 specs total (brief expected 14). Playwright projects: guest suite runs **phone + desktop**; accounts suite runs **desktop** only. Each guest spec is parameterised over `fr` and `ar`.

### `tests/e2e` (13 specs)

| Spec | One line |
|---|---|
| `a11y.spec.ts` | axe scans + keyboard/motion across home, profile steps, matches/program/plan/compare/scholarships in every state, per locale. |
| `compare.spec.ts` | Compare from plan/matches: 4-way selection, 7 topics, swap, "only what differs", missing-data programme, reload reset. |
| `deploy-surface.spec.ts` | robots/sitemap noindex mode, security headers, trilingual 404, bare-origin locale redirect. |
| `empty-and-errors.spec.ts` | Empty catalogue, shard re-read once, corrupted shard + Retry, failing manifest + Retry, blocked storage, unknown-path 404s. |
| `guides.spec.ts` | Footer guides link → hub → overview guide; one h1, no serious a11y violation. |
| `journey.spec.ts` | Home → profile → matches → programme → clear data; grouped counts, cost ranges + 10-month note, stale programme, budget vs estimate. |
| `legal.spec.ts` | Footer privacy/terms links render the notices with one h1 and no serious a11y violation. |
| `perf.spec.ts` | Per-route first-load JS ratchet (phone/desktop) + shard size/cache headers. |
| `plan.spec.ts` | Save two programmes, plan switching, tick survives reload, unsave forgets ticks, 13th save refused, data-gone programme. |
| `privacy.spec.ts` | Nothing typed leaves the device; save/tick/compare add no request/cookie/storage beyond snapshot shards; static HTML carries nothing profile-dependent. |
| `scholarships.spec.ts` | Country grouping + a11y, no horizontal scroll at phone width, nationality line, stale mark, whole-country card anchor. |
| `slug-alias.spec.ts` | Old slug redirects (request + browser, same language), saved-under-old-slug shown in matches/plan/compare, old+current de-duplicated, 404 preserved. |
| `smoke.spec.ts` | `/{locale}` sets `lang`/`dir` and renders an h1. |

### `tests/e2e-accounts` (2 specs, run only with `ACCOUNTS_ENABLED` + its own build)

| Spec | One line |
|---|---|
| `account-journey.spec.ts` | IS-1 sign-up + consent/age; IS-2 keep-then-replace; IS-3 cross-device + failed save undo; IS-8 report-outdated in export; IS-5 JSON export and full deletion; IS-6 other-browser sign-in without import. |
| `header-layout.spec.ts` | Header stays on one row when signed in. |

### Uncovered core journeys

1. **Guest profile draft persistence across reload** — no e2e proving a half-finished profile is resumed (unit-covered in `draft`/autosave, not browser-level).
2. **Indexable mode** (`NEXT_PUBLIC_SITE_URL` set): robots `Allow`, sitemap with URLs, canonical, preview `noindex` — `deploy-surface` only tests the **no-site-url** build; the indexable path is checked only by `pnpm ops:smoke` against production, never in CI e2e.
3. **GoatCounter loader on a real page** — `analytics-loader` is unit-tested but no e2e asserts the script is injected when configured.
4. **RTL visual correctness** — `ar` runs through axe and the logical-utility scanner, but there is no visual/screenshot regression for `dir="rtl"` layouts (Compare grid, programme sections).
5. **Guest feedback report** — the signed-in path (IS-8) is covered; the guest report-outdated flow is unit-tested but never driven end-to-end in a browser.

### CI confirmation

`grep -rni coverage .github/` → **no matches**. The `verify` job (`.github/workflows/ci.yml:20-60`) runs typecheck/lint/test/data:check/build/perf:js; the `e2e` job runs both Playwright suites; `db-race` runs the skipped specs on Postgres. **No coverage is collected or gated in CI.**

---

## 5. Proposed CI coverage gate

### 5.1 Changes

1. Add `@vitest/coverage-v8` as a devDependency, **pinned to the exact `vitest` version** (`5.0.2` at this baseline) to avoid the peer warning seen here.
2. Pin the coverage config in `vitest.config.ts` (not on the CLI) so local and CI agree:

   ```ts
   coverage: {
     provider: "v8",
     include: ["src/**"],
     reporter: ["text", "json-summary"],
     thresholds: {
       statements: 94, functions: 94, lines: 94, branches: 87,
       "src/domain/**":       { statements: 96, branches: 96, functions: 98, lines: 96 },
       "src/data-schema/**":  { statements: 99, branches: 99, functions: 99, lines: 99 },
       "src/lib/snapshot/**": { statements: 94, branches: 82, functions: 98, lines: 96 },
       "src/lib/server/**":   { statements: 95, branches: 88, functions: 97, lines: 97 },
       "src/lib/auth/**":     { statements: 94, branches: 90, functions: 98, lines: 95 },
       "src/components/**":   { statements: 96, branches: 92, functions: 96, lines: 97 },
     },
   }
   ```
3. Add `"test:coverage": "vitest run --coverage"` to `package.json`.
4. In CI, add one step to the `verify` job after `Test`:

   ```yaml
   - name: Test coverage (ratchet)
     run: pnpm test:coverage
   ```
   (Reuses the same install; no new job, no new checkout.)

### 5.2 Threshold rationale

- Every floor is the **measured value minus a 2–4 point margin**, so the gate starts green on `main` and only fails on a real drop, never on noise. v8 coverage is deterministic for a fixed source set; the margin absorbs refactors that reshuffle a few branches.
- `src/domain`, `src/lib/server`, `src/lib/auth`, `src/data-schema` get tight floors because a regression there is a wrong eligibility/cost fact or a data-loss bug — the product's whole promise.
- `src/lib/snapshot/**` branches sits at 82 (measured 86.05) because the remaining uncovered branches are in `server.ts` (66 %) and are hard to exercise without the full build; the floor still catches a new un-branched guard.
- `src/app/**` and `scripts/**` are **deliberately not gated at first**: `src/app` is Server Components measured at 43–60 % that e2e already covers, and `scripts/**` is outside `include=src/**`. Gating them today would force coverage-chasing in wrappers. Revisit once `scripts/**` is instrumented.
- Recommend `perFile: false` (directory/global floors): a single new file should not be able to fail the build, but a directory-wide drop should.

### 5.3 CI cost and risk

- **Cost:** the measured coverage run took **185 s** for 338 files. Instrumentation is the overhead; on `ubuntu-latest` (Node 24) the added step is roughly **1.5–2.5 min**, inside the existing 15-minute `verify` timeout. It shares the install and checkout, so no extra minutes beyond compute.
- **Risks / mitigations:**
  - *Lockfile drift*: CI uses `pnpm install --frozen-lockfile`; the new dep and lock update must be committed together.
  - *Provider/vitest mismatch*: pin `@vitest/coverage-v8` to the exact `vitest` version (5.0.2).
  - *Threshold brittleness on data-only changes*: none — `data/` and `tests/` are outside `src/**`.
  - *Hiding a regression behind a high global floor*: mitigated by per-directory floors; the global 94 % would mask a domain drop, the `src/domain/**` floor would not.
  - *First-run redness*: thresholds are set from the measured baseline, so `main` starts green; a source change without tests fails, which is the point.

### 5.4 Mutation testing

**Skipped.** Stryker (`@stryker-mutator/core` + `@stryker-mutator/vitest-runner`) is **not installed** and adding it would be a new dependency beyond the one permitted coverage provider — explicitly out of scope for this task. Even if allowed, mutating ~6 925 statements over 8 055 tests on this machine would take hours per run and is not a PR-per-commit gate. If the owner wants a one-off mutation baseline later, scope it to `src/domain` and `src/lib/snapshot` only (the highest-risk pure logic), run it off-CI, and record the score as a target rather than a gate.

---

## 6. Already well covered (do not spend effort here)

- **`src/domain`** end-to-end: eligibility routes, the rule engine, `subject_taken`, grade-scale validation, costs (7 lines, ranges, `budgetFit`), checklist (10 steps, skip semantics, degraded facts), scholarships, `filterPrograms`.
- **`src/data-schema`**: every record schema, provenance, staleness, dates, match-filters, profile — 100 %.
- **Snapshot client**: integrity (length/sha256/kind/destination/JSON), version pinning, cache, abort, text shards; the `manifest-guard` differential fuzz against Zod.
- **Guest import** (`src/lib/server/import.ts`): keep/replace/conflict/revision/per-account and the failure log shape.
- **Account actions**: consent gate, save/unsave caps, step ticks, profile compare-and-set, feedback rate limit, `loadAccountData`.
- **Filter URL + store** sanitizer and legacy seed.
- **i18n**: catalogue parity, forbidden wording, Arabic-digit policy, plural selectors across all three locales (`tests/i18n`, 19 files).
- **Data tooling**: 81 test files over the importers, `data:check`, snapshot build, ops-smoke.
- **Layout/RTL/wording guards**: `design/logical-direction` scans every component for physical utilities; `domain/boundary` lints canaries to keep `src/domain` pure.

---

## 7. Ranked missing tests (highest value first)

| Rank | Area | Case | Invariant protected | Proposed file | Effort |
|---|---|---|---|---|---|
| 1 | Coverage gate | Add the `test:coverage` step + thresholds (§5) | The 95 % floor stops being an accident and starts being enforced on every PR | `vitest.config.ts`, `package.json`, `.github/workflows/ci.yml` | S |
| 2 | Account erasure | Direct unit test of `eraseAccountResidue` incl. a malformed (non-JSON) `verification.value` beside the user's rows | A deletion leaves no residue even when a stranger's corrupt row is interleaved | `tests/lib/server/account-erasure.test.ts` | S |
| 3 | Locale shell | `src/app/[locale]/layout.tsx`: unknown locale → `notFound()`; `dir` per locale; `dynamicParams=false` | A non-locale first segment never renders a broken shell; `ar` is RTL | `tests/app/locale-layout.test.tsx` | M |
| 4 | Plan view model | `src/lib/journey/plan-view.ts` uncovered branches (58,65,88-114,127): next-step selection, skipped grouping | The plan shows the right next step and groups skips correctly | `tests/lib/journey/plan-view-branches.test.ts` | S |
| 5 | Server programme reader | `src/lib/snapshot/server.ts` branches 59-60,77: null/missing-shard paths | A static programme page degrades to null instead of throwing | extend `tests/lib/snapshot/server.test.ts` | M |
| 6 | Matches controls | `src/components/matches/matches-controls.tsx` + `filter-panel.tsx` uncovered lines | A filter change updates URL + store and never hides on unknown language | `tests/components/matches/controls.test.tsx` | M |
| 7 | Account store limits | `src/lib/server/account-store.ts` branches 293-303,328 + `account-import/run.ts` 23 | Saved cap and rate limits hold under the uncovered branches | extend `tests/lib/server/account-actions.test.ts` | M |
| 8 | Profile form messaging | `src/components/profile/issues.ts` (46.9 % branch) + `step-languages.tsx` (61.1 %) | A missing/ambiguous answer is `check`, never a false fail | `tests/components/profile/step-languages.test.tsx` | M |
| 9 | Sign-in UX | `src/components/auth/sign-in-form.tsx`, `other-browser-warning.tsx` (33 %) | The ruling-Q19 warning and form error states render | `tests/components/auth/sign-in-form.test.tsx` | M |
| 10 | Migration edge | v1 record read twice in one tick; v1 with an occupied invalid `jisr.matches-filters` | One-shot seed is idempotent under re-entry | extend `tests/lib/profile/store.test.tsx` | S |

Optional/lower value (boundary cases from §3): leap-day recurring deadline; budget `MAX_SAFE_INTEGER`; empty `destinations`/`eligibleNationalities`; unknown future `formatVersion`; `guide-steps.tsx` render.

---

## 8. Open questions

1. **Should `scripts/**` join the coverage scope?** 81 test files protect the data pipeline with zero measurement. Including it means setting additional per-area floors and a larger include set; excluding it keeps the gate focused on shipped runtime code. Owner call.
2. **Ratchet vs aspiration:** start at measured-minus-margin (proposed) or set fixed aspirational floors (e.g. 95/95 everywhere) and accept an initial clean-up? The proposal favours the ratchet so the gate is green on day one.
3. **`src/app` coverage:** acceptable to leave ungated because Server Components are covered by e2e, or should a low floor (e.g. lines 40) be added to catch a wholly-untested new page?
4. **`db-race` locally:** should a documented local command or a pre-push hook run `TEST_POSTGRES_URL` specs, closing the local-vs-CI gap? (CI already enforces them.)
5. **Dependency approval:** the task permitted the coverage provider; confirm `@vitest/coverage-v8` (devDependency only) is acceptable, and that a follow-up PR — not this read-only audit — carries the config/CI change.
6. **e2e coverage:** add Playwright V8 coverage later? Out of scope here and adds cost; note if desired.
