# Profile steps 3–4 → My-matches filters — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the profile wizard eligibility-only (`bac`, `languages`) and turn the five former preferences (`fields`, `studyLanguages`, `destinations`, `institutionType`, `budget`) into transient filters on `/matches`.

**Architecture:** A new `MatchFilters` value (parsed by a Zod schema for server/build/tests and a hand-written twin for the browser) is persisted device-locally under `jisr.matches-filters` and encoded in the `/matches` URL. The domain filter functions take `MatchFilters` instead of the profile; `budget` only annotates cost fit. `ProfileSchema` becomes v2 (eligibility only) with a `1→2` migration that strips the five and seeds the filter store once.

**Tech Stack:** TypeScript strict, Next 16 App Router + React 19, Tailwind v4, next-intl, Zod (server/build/tests only), Vitest + Playwright, Biome, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-16-profile-steps-to-matches-filters-design.md`

## Global Constraints

- Worktree: `.worktrees/profile-filters`, branch `feat/profile-steps-to-matches-filters` (already created off `origin/main`). Run pnpm through Windows, not WSL: `cmd.exe /c "cd /d C:\Users\dagda\Downloads\nex\UniWay\.worktrees\profile-filters && set SWC_NATIVE_BINDING_CACHE=C:\Users\dagda\.swc-cache&& pnpm <cmd>"`. `node_modules` is not installed in the worktree yet — Task 1 step 0 installs it.
- `src/domain` is pure TS: no React/Next/DB/fs/network, time passed in.
- Client-reachable code imports **no Zod and nothing from `@/data-schema` at runtime** except types and `dates`/`staleness`. New client validators are hand-written and differential-tested (`tests/lib/client-imports.test.ts` enforces the boundary).
- Combine filters: **AND across filters, any-of within one multi-select; empty = all.**
- `budget` **never hides a program** — it only feeds `estimateCost` (ADR 0005 item 8 stays true).
- Saved programs and `/plan` are **filter-independent**.
- Profile version constants live in **both** `src/data-schema/profile.ts` and `src/lib/constants.ts` (drift-tested); same for the draft and the new match-filters version.
- All user-facing strings go through next-intl in `fr`/`en`/`ar`; Tailwind logical utilities only; moved labels reuse the exact old `profile.fields.*` string values.
- "Done" = `pnpm typecheck`, `pnpm test`, `pnpm lint` green (+ `pnpm data:check` if `data/` changed); UI verified in a browser in `fr` (LTR) and `ar` (RTL), phone + desktop; `reviewer` review before the task is closed.
- Conventional commits; stage by explicit path; never commit `.env*` or push `main`.

## Review Focus

Failure modes the spec implies but no task's happy path exercises; each is pinned by a test in the owning task.

1. **Existing guest with a v1 profile** — must keep their data and get their filters seeded once, not be reset. (Task 2/4)
2. **Account-synced v1 profile** — the server read must migrate it, not return `null` (a silent "no profile"). (Task 4)
3. **`/matches` with empty filters** — must show every eligible program, not an empty page. (Task 3)
4. **Budget set with an incomplete or other-currency estimate** — `budgetFit` is `unknown`; nothing hides or crashes. (Task 3)
5. **Deep link with an unknown field/language/country slug** — the URL/parser drops the unknown value, never crashes. (Task 2/5)

---

### Task 1: `MatchFilters` value + validators

**Files:**
- Modify: `src/lib/constants.ts` (add `MATCH_FILTERS_VERSION`)
- Create: `src/data-schema/match-filters.ts`
- Create: `src/lib/matches/filters.ts`
- Test: `tests/data-schema/match-filters.test.ts`, `tests/lib/matches/filters.test.ts`

**Interfaces:**
- Consumes: `BudgetSchema` from `@/data-schema/profile`, `CountryCodeSchema`/`LanguageCodeSchema`/`SlugSchema` from `@/data-schema/primitives`, `src/lib/guards.ts` helpers.
- Produces:
  - `type MatchFilters = { schemaVersion: 1; fields: string[]; studyLanguages: string[]; destinations: string[]; institutionType: "public"|"private"|"any"; budget: Budget | null }`
  - `MATCH_FILTERS_VERSION = 1` (both files)
  - `parseMatchFilters(raw: unknown): MatchFilters | null`
  - `EMPTY_MATCH_FILTERS: MatchFilters`
  - `isEmptyFilters(filters: MatchFilters): boolean`

- [ ] **Step 1: Write the failing tests**

`tests/data-schema/match-filters.test.ts`: valid full object parses; unknown key rejected; wrong `schemaVersion` rejected; `institutionType` outside the enum rejected; `budget` null and well-formed accepted; duplicate values allowed (matching is set-like).

`tests/lib/matches/filters.test.ts`: differential parity with `MatchFiltersSchema` over fixtures + one mutation per rule + a seeded fuzzer (copy the structure of `tests/lib/profile/validate.test.ts`); `EMPTY_MATCH_FILTERS` is `isEmptyFilters === true`; a filters object with one field is not empty.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run tests/data-schema/match-filters.test.ts tests/lib/matches/filters.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`src/lib/constants.ts`: add `export const MATCH_FILTERS_VERSION = 1;` next to the other version constants.

`src/data-schema/match-filters.ts`: `MATCH_FILTERS_VERSION = 1` (own copy, drift-tested) + `MatchFiltersSchema = z.strictObject({ schemaVersion: z.literal(MATCH_FILTERS_VERSION), fields: z.array(SlugSchema), studyLanguages: z.array(LanguageCodeSchema), destinations: z.array(CountryCodeSchema), institutionType: z.enum(["public","private","any"]), budget: BudgetSchema.nullable() })` + `export type MatchFilters = z.infer<...>`.

`src/lib/matches/filters.ts`: mirror `src/lib/profile/validate.ts` — `strictRecord` over the six keys, version literal check, `parseEach` for the three arrays, `isOneOf` for `institutionType`, reuse `parseBudget` shape (move `parseBudget` from `src/lib/profile/validate.ts` to a shared spot if cleaner, or duplicate the three-field check). `EMPTY_MATCH_FILTERS` with `schemaVersion: MATCH_FILTERS_VERSION`, empty arrays, `institutionType: "any"`, `budget: null`. `isEmptyFilters` = no fields, no studyLanguages, no destinations, `institutionType === "any"`, `budget === null`.

- [ ] **Step 4: Run to verify pass** — `pnpm vitest run tests/data-schema/match-filters.test.ts tests/lib/matches/filters.test.ts` → PASS.

- [ ] **Step 5: Commit** — `git add src/lib/constants.ts src/data-schema/match-filters.ts src/lib/matches/filters.ts tests/data-schema/match-filters.test.ts tests/lib/matches/filters.test.ts && git commit -m "feat(matches): add MatchFilters value and validators"`

---

### Task 2: `jisr.matches-filters` store + one-time seeding from a legacy profile

**Files:**
- Create: `src/lib/matches/filter-store.ts`
- Test: `tests/lib/matches/filter-store.test.ts`

**Interfaces:**
- Consumes: `parseMatchFilters`, `EMPTY_MATCH_FILTERS`, `MatchFilters`.
- Produces:
  - `MATCH_FILTERS_KEY = "jisr.matches-filters"`
  - `readMatchFilters(storage: Storage): MatchFilters` (missing/invalid → `EMPTY_MATCH_FILTERS`)
  - `writeMatchFilters(storage: Storage, filters: MatchFilters): void`
  - `seedFiltersFromLegacy(storage: Storage, legacy: MatchFilters): boolean` — writes only when `readMatchFilters` is empty; returns whether it wrote. Task 4 calls this from the profile migration.

- [ ] **Step 1: Write the failing test** — `readMatchFilters` returns `EMPTY_MATCH_FILTERS` for missing and for corrupt JSON; round-trips a written value; `seedFiltersFromLegacy` writes when the key is absent, is a no-op when any filter is already set, and returns the right boolean (covers Review Focus #1 and #5's storage half).

- [ ] **Step 2: Run to verify failure** — `pnpm vitest run tests/lib/matches/filter-store.test.ts` → FAIL.

- [ ] **Step 3: Implement** — `readMatchFilters` uses `getLocalStorage()` (`src/lib/profile/storage.ts`) or the passed storage, `JSON.parse` in a narrow try, `parseMatchFilters`; `writeMatchFilters` parses before writing (mirrors `writeProfile`); `seedFiltersFromLegacy` checks `isEmptyFilters(readMatchFilters(storage))` first.

- [ ] **Step 4: Run to verify pass** → PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(matches): persist match filters under jisr.matches-filters"`

---

### Task 3: Domain, view and client take filters

**Files:**
- Modify: `src/domain/filter.ts`, `src/lib/journey/matches-view.ts`, `src/lib/snapshot/plan.ts`, `src/components/matches/matches-request.ts`, `src/components/matches/matches-client.tsx`, `src/components/matches/matches-states.tsx` (remove `NoProgramsForFieldsState`), `src/components/matches/namespaces.ts` if needed
- Test: `tests/domain/filter.test.ts`, `tests/lib/journey/matches-view.test.ts`, `tests/lib/snapshot/plan.test.ts`, `tests/components/matches/*`

**Interfaces:**
- Consumes: `MatchFilters`, `readMatchFilters`.
- Produces:
  - `preferenceMismatches(filters: MatchFilters, program: Program, now: IsoDate): PreferenceMismatch[]`
  - `filterPrograms(filters: MatchFilters, programs: readonly Program[], now: IsoDate): ProgramFilterResult`
  - `MatchesViewInput = { profile: Profile; filters: MatchFilters; bundle: SnapshotBundle; now: IsoDate; locale: AppLocale }`
  - `MatchesView` loses `no_programs_for_fields`
  - `shardsForMatches(profile: { credential: { country: CountryCode } }, manifest): ShardPlan`
  - `planKey(profile) = JSON.stringify([profile.credential.country])`

- [ ] **Step 1: Write/adjust the failing tests**
  - `tests/domain/filter.test.ts`: rewrite the table to pass `MatchFilters`; add **empty filters keep everything** (Review Focus #3), **AND across two filters**, **OR within one multi-select**, **budget never hides**.
  - `tests/lib/journey/matches-view.test.ts`: empty filters → every eligible program grouped; setting `fields`/`destinations` narrows and lists hidden; **budget set → `budgetFit` computed, grouping unchanged** (Review Focus #4); remove `no_programs_for_fields` cases.
  - `tests/lib/snapshot/plan.test.ts`: `shardsForMatches` returns **all** program shards + each destination's aux shards; `planKey` ignores filters.

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement** — move the four read sites in `filterPrograms`/`preferenceMismatches` from `profile.*` to `filters.*` (logic unchanged); thread `filters` through `MatchesViewInput`, `cardFor` (`budget: filters.budget`), `buildMatchesView`; `shardsForMatches` drops the `profile.fields` filter and unions all `programShardsIn(manifest)`; `matches-request.planKey` drops fields; `matches-client.tsx` reads filters with `useState(() => readMatchFilters(...))` (URL wiring is Task 5), passes them to `buildMatchesView`, and drives `budgetProvided = filters.budget !== null`; delete `NoProgramsForFieldsState` and its `view.kind` branch.

- [ ] **Step 4: Run to verify pass** → PASS. Then run `pnpm typecheck` (whole app compiles; `ProfileSummary` may still read the profile's fields — that is fine and removed in Task 5).

- [ ] **Step 5: Commit** — `git commit -m "refactor(matches): match on transient filters, load all program shards"`

---

### Task 4: Profile v2 (eligibility only) + migrations + reduced wizard

**Files:**
- Modify: `src/data-schema/profile.ts`, `src/data-schema/draft.ts`, `src/lib/constants.ts`, `src/lib/profile/validate.ts`, `src/lib/profile/draft-validate.ts`, `src/lib/profile/storage.ts`, `src/lib/profile/draft.ts`, `src/lib/profile/store.ts`, `src/lib/server/rows.ts`, `src/lib/profile/form/{types,state,validate-step,build,options,initial-state}.ts`, `src/components/profile/profile-wizard.tsx`, `src/components/profile/step-review.tsx`, `src/components/profile/issues.ts`
- Delete: `src/components/profile/step-preferences.tsx`, `src/components/profile/step-budget.tsx`
- Create: `.claude/docs/decisions/0014-profile-preferences-as-match-filters.md`
- Test: `tests/data-schema/profile.test.ts`, `tests/lib/profile/{validate,storage,draft,draft-validate}.test.ts`, `tests/lib/profile/form/*`, `tests/lib/server/rows.test.ts`, `tests/components/profile/*`

**Interfaces:**
- Consumes: `seedFiltersFromLegacy`, `MATCH_FILTERS_VERSION`, `EMPTY_MATCH_FILTERS`.
- Produces: `STEPS = ["bac","languages","review"]`; `PROFILE_SCHEMA_VERSION = 2`; `DRAFT_SCHEMA_VERSION = 2`; migration `1→2` that strips the five and returns the legacy preferences.

- [ ] **Step 1: Write/adjust the failing tests**
  - `tests/lib/profile/storage.test.ts`: a stored v1 record is migrated to v2 (five keys gone) and **`jisr.matches-filters` is seeded once** from the removed values (Review Focus #1); an already-set filter store is not overwritten.
  - `tests/lib/server/rows.test.ts`: a v1 `profiles.data` row reads back a v2 profile (Review Focus #2).
  - `tests/data-schema/profile.test.ts`, `tests/lib/profile/validate.test.ts`: v2 shape (no five keys; `schemaVersion: 2`); a v1-shaped object is rejected by the schema (migration is not the schema's job).
  - `tests/lib/profile/form/state.test.ts`: `STEPS` is the 3-entry array; draft round-trip without the five.
  - `tests/lib/profile/form/validate-step.test.ts`, `build.test.ts`: preferences/budget cases removed; `pathStep` has only bac/languages/review.
  - `tests/lib/profile/draft-validate.test.ts`: v2 draft; a v1 draft is migrated (five keys stripped, bac/languages kept).
  - `tests/components/profile/flow.test.tsx`: the wizard is two steps then review; review shows only bac + languages.

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement**
  - `PROFILE_SCHEMA_VERSION` and `DRAFT_SCHEMA_VERSION` → `2` in both `src/lib/constants.ts` and the schema files; drop the five from `ProfileSchema`/`DraftSchema` and from the hand-written twins' key lists and validation.
  - `src/lib/profile/storage.ts`: add `MIGRATIONS[1]` = strip the five; have `migrateProfile` return `{ record, legacyPreferences }` when it migrated from v1 so the store can seed.
  - `src/lib/profile/store.ts`: on a guest read that migrated from v1, call `seedFiltersFromLegacy(storage, legacyPreferences)`.
  - `src/lib/profile/draft.ts`: strip the five from a v1 draft before `parseDraft`.
  - `src/lib/server/rows.ts`: run the same strip before `ProfileSchema.safeParse`.
  - `src/lib/profile/form/*`: remove the five from `FormState`, `emptyFormState`, `formFromProfile`, `formFromDraft`, `draftFromForm`, `candidateFrom`; `STEPS`; `validate-step.ts` drops `validatePreferences`/`validateBudget` and their `pathStep` branches.
  - `profile-wizard.tsx`: render only `StepBac`/`StepLanguages`/`StepReview`; delete the two step components; `step-review.tsx` drops the preferences and budget sections; `issues.ts` drops the removed path labels.
  - Write ADR `0014-profile-preferences-as-match-filters.md` (replaces ADR 0005 item 8 and the `matching-domain` "preference filter" wording; records transient filters, the v2 migration, budget-as-annotation) and update `.claude/CLAUDE.md` (ProfileSchema shape + decision list) and `.claude/rules/matching-domain.md` (`filterPrograms(filters, …)`).

- [ ] **Step 4: Run to verify pass** → PASS; then `pnpm typecheck` and `pnpm lint`.

- [ ] **Step 5: Commit** — `git commit -m "feat(profile): profile holds eligibility only; preferences become match filters"`

---

### Task 5: My-matches filter UI + URL state + i18n

**Files:**
- Create: `src/components/matches/filter-panel.tsx`, `src/components/matches/filter-controls.tsx`, `src/components/matches/filter-summary.tsx`, `src/lib/matches/filter-url.ts`
- Modify: `src/components/matches/matches-client.tsx`, `src/components/matches/matches-states.tsx`, `src/components/matches/group-section.tsx`, `src/app/[locale]/matches/page.tsx` (Suspense), `messages/{fr,en,ar}.json`, `docs/product/jisr_mvp.md`
- Delete: `src/components/matches/profile-summary.tsx`
- Test: `tests/components/matches/*`, `tests/lib/matches/filter-url.test.ts`, `tests/i18n/{matches-messages,profile-messages}.test.ts`

**Interfaces:**
- Consumes: `MatchFilters`, `readMatchFilters`, `writeMatchFilters`, `isEmptyFilters`.
- Produces: `encodeFilters(filters): URLSearchParams`, `decodeFilters(params): MatchFilters` (unknown slugs dropped — Review Focus #5); `<FilterPanel filters onFiltersChange core text locale />`; a "no programs match your filters" empty state with a **Clear filters** action.

- [ ] **Step 1: Write the failing tests**
  - `tests/lib/matches/filter-url.test.ts`: round-trip; **unknown field/language/country slugs are dropped, not thrown** (Review Focus #5).
  - `tests/components/matches/filters.test.tsx`: selecting a field narrows the list and updates the URL; Clear filters restores the full list; empty filters show all eligible programs; the empty-result state offers Clear.
  - i18n: `matches.filters.*` present in all three locales; retired `profile.fields.*` / `profile.steps.preferences|budget.*` keys gone from all three.

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement** — build the panel/controls from the existing display-name helpers and shadcn primitives (mobile-first, logical utilities); wire `matches-client.tsx` to read the URL on mount (seed from localStorage when the URL has none) and write both on change, behind a `<Suspense>` in the matches page; add the empty state; replace the `ProfileSummary` aside with `FilterSummary`; add `matches.filters.*` keys (values copied verbatim from the retired `profile.fields.*` entries) and remove the retired keys in `fr`/`en`/`ar`; update `docs/product/jisr_mvp.md` (profile = eligibility; field/language/institution/budget = My-matches filters).

- [ ] **Step 4: Run to verify pass** → PASS; then verify `/matches` in a browser in `fr` and `ar`, phone + desktop.

- [ ] **Step 5: Commit** — `git commit -m "feat(matches): filter panel and URL state on My Matches"`

---

### Task 6: e2e driver, fixtures, golden, and full verification

**Files:**
- Modify: `tests/e2e/support/profile-form.ts`, `tests/e2e/journey.spec.ts`, `tests/e2e/a11y.spec.ts`, `tests/e2e/empty-and-errors.spec.ts`, `tests/e2e/privacy.spec.ts`, `tests/e2e/support/{matches,fixture-data}.ts`, `tests/fixtures/e2e/profiles.ts`, `tests/fixtures/i18n/guest-copy-golden.json` (only if values changed)
- Test: the whole suite

**Interfaces:**
- Consumes: everything above.
- Produces: an e2e driver that walks two steps then exercises the matches filters.

- [ ] **Step 1: Update the driver + specs** — `stepHeading` union → `"bac" | "languages" | "review"`; `fillToReview` = `fillBac`, `advance("languages")`, `fillLanguages`, `advance("review")`; add `fillFilters(...)`/`clearFilters()`; remove `institution` from `ProfileFormValues`; update the journey to walk two steps, then filter and clear.
- [ ] **Step 2: Fixtures + golden** — drop the five from `tests/fixtures/e2e/profiles.ts`; add a filter fixture; regenerate `guest-copy-golden.json` **only if** any retained value changed (reused values keep it green).
- [ ] **Step 3: Full gate** — `pnpm typecheck && pnpm test && pnpm lint`; then `pnpm build && pnpm perf:js` and confirm the JS-budget ratchet (`tests/e2e/support/js-budget.ts`); then `pnpm test:e2e`.
- [ ] **Step 4: Commit** — `git commit -m "test(e2e): two-step wizard and matches filters"`

---

## Self-Review

- **Spec coverage:** decisions 1–5 map to Tasks 1–5; field-removal/migration → Task 4; URL/filters UI → Task 5; docs/ADR → Tasks 4–5; e2e/golden/perf → Task 6. No task defines a function another task does not consume.
- **Type consistency:** `MatchFilters` (with `schemaVersion`), `parseMatchFilters`, `EMPTY_MATCH_FILTERS`, `isEmptyFilters`, `readMatchFilters`, `writeMatchFilters`, `seedFiltersFromLegacy`, `preferenceMismatches(filters, …)`, `filterPrograms(filters, …)`, `MatchesViewInput.filters`, `shardsForMatches(profile, manifest)`, `planKey(profile)` are used with the same names/shapes across tasks.
- **Review Focus:** #1 → Task 2/4, #2 → Task 4, #3 → Task 3, #4 → Task 3, #5 → Task 2/5. Each has a named test.
- **Proportion:** the plan names signatures, files and tests; bodies are left to the implementer except where the spec pins values (combine rule, budget-as-annotation, reused copy).
