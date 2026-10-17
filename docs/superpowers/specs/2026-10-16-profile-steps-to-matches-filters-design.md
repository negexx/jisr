# Design — Move profile steps 3–4 into My-matches filters

**Date:** 2026-10-16
**Task:** A of two (B is the Jisr → Jisrr rename)
**Status:** Draft for owner review
**Supersedes (in part):** ADR 0005 item 8 and the `matching-domain` rule ("program preference filter") — replaced by a new ADR 0014.

## Problem

The "My profile" wizard collects five facts that are not eligibility facts:

- step 3 `preferences` → `fields`, `studyLanguages`, `destinations`, `institutionType`
- step 4 `budget` → `budget`

These are **browsing preferences**, not part of the student's identity/eligibility. Today they are baked into the persisted `Profile` (`ProfileSchema` requires `fields` with `.min(1)` and `institutionType`), which couples the wizard to browsing and makes the profile carry temporary choices.

The request: keep only steps 1–2 (`bac`, `languages`) in the profile, and turn those five values into **filters on `/matches`** that narrow the list as the student scrolls.

## Decisions (approved by the owner, 2026-10-16)

1. **Transient match filters.** The five values are **removed from the persisted profile**. They live in a new device-local store (`jisr.matches-filters`, localStorage) and in the URL query for deep links. Default `/matches` (empty filters) = **all programs eligible for the credential/languages**, grouped by match status exactly as today.
2. **Back-compat.** Bump `PROFILE_SCHEMA_VERSION` 1 → 2. A `1 → 2` migration strips the five and **seeds `jisr.matches-filters` once** from the removed values. The same migration runs on the server read path so account-synced profiles survive. The account cache self-heals (a non-parsing cache is dropped and re-hydrated from the server). Drafts get a matching `1 → 2` migration.
3. **Filter set and combination.** `fields` (multi), `studyLanguages` (multi), `destinations` (multi), `institutionType` (single: `any`/`public`/`private`), `budget` (amount + currency + period). **AND across different filters; any-of within one multi-select; empty = all.** `budget` **only annotates cost fit and never hides a program** (preserves ADR 0005 item 8 cost semantics).
4. **Empty state / plan.** A filter that excludes everything shows a "no programs match your filters" state with a **Clear filters** action (reusing/extending the existing states). The saved list and `/plan` are **filter-independent** — a saved program is never hidden from the plan by a filter. `budgetProvided` becomes `filters.budget !== null`.
5. **Full doc/test update.** Product spec, a new ADR, all three locales, the guest-copy golden (values reused verbatim so the golden does not churn), wizard/matching/component Vitest, and the e2e journey driver.

## Data model

### New: `MatchFilters`

```ts
type MatchFilters = {
  fields: Slug[];               // empty = any field
  studyLanguages: string[];     // empty = any teaching language
  destinations: CountryCode[];  // empty = any destination
  institutionType: "any" | "public" | "private";
  budget: Budget | null;        // annotation only; never hides a program
};
```

`Budget` is the existing `{ amountMinor, currency, period }` (unchanged). A `MatchFilters` with every member empty/`any`/`null` is the **empty filter** and keeps every eligible program.

Value types are deliberately identical to the removed profile fields so `preferenceMismatches` and `estimateCost` keep working with minimal change.

### Zod vs client twin (no-Zod boundary)

- `src/data-schema/match-filters.ts` — `MatchFiltersSchema` (Zod) + `MATCH_FILTERS_VERSION = 1`, for server/build/tests.
- `src/lib/matches/filters.ts` — hand-written `parseMatchFilters` twin for client code (the client-import rule forbids Zod and `@/data-schema` runtime imports). A differential test runs both over fixtures, one mutation per rule, plus a seeded fuzzer (mirrors `tests/lib/profile/validate.test.ts`).

### Profile schema (v2)

`src/data-schema/profile.ts` loses `fields`, `studyLanguages`, `destinations`, `budget`, `institutionType`; `PROFILE_SCHEMA_VERSION` becomes `2` in **both** `src/data-schema/profile.ts` and `src/lib/constants.ts` (drift-tested). The hand-written twin `src/lib/profile/validate.ts` drops the five keys from its `strictRecord` key list and its validation.

Remaining profile (unchanged internally): `nationality`, `credential`, `priorHigherEducationYears`, `languages`.

## Persistence and migration

- `src/lib/profile/storage.ts`: add `MIGRATIONS[1]` that strips the five from a v1 record, and have the migration surface the stripped values so the store can seed filters.
- `src/lib/matches/filter-store.ts` (new): read/write `jisr.matches-filters` under a version constant, using `parseMatchFilters`; empty/missing = empty filters.
- **Seeding, once:** when a guest profile is migrated `1 → 2` and `jisr.matches-filters` is absent, write the legacy values (only when non-default) to the filter store. Never overwrite an existing filter store.
- **Server:** `src/lib/server/rows.ts` `rowToProfile` runs the same pure `1 → 2` strip before `ProfileSchema.safeParse`, so a v1 `profiles.data` document still reads. No filter seeding server-side (filters are device-local).
- **Draft:** bump `DRAFT_SCHEMA_VERSION` 1 → 2 and drop the five from `src/data-schema/draft.ts` + `src/lib/profile/draft-validate.ts`; a small read-time migration strips them from a v1 draft so a mid-wizard user keeps `bac`/`languages`.
- **Account cache:** `parseAccountProfile` already drops a non-parsing payload and re-hydrates from the server; the server now returns v2, so no cache migration is needed.
- Key scheme stays `jisr.*` throughout; the only new key is `jisr.matches-filters`.

## Domain interface changes

- `src/domain/filter.ts`: `preferenceMismatches(filters, program, now)` and `filterPrograms(filters, programs, now)` take `MatchFilters` instead of `Profile`. Logic is unchanged; `budget` remains excluded from hiding.
- `src/lib/journey/matches-view.ts`: `MatchesViewInput` gains `filters: MatchFilters`; `filterPrograms(filters, …)`; `cardFor` passes `budget: filters.budget` to `estimateCost`. The `no_programs_for_fields` kind is replaced by an empty-results state driven by filters (no field is required any more).
- `src/lib/snapshot/plan.ts`: `shardsForMatches(profile, manifest)` no longer reads `profile.fields` — it loads **all** program shards in the manifest (plus each destination's aux shards), because the default set is now every field.
- `src/components/matches/matches-request.ts`: `planKey` becomes `[credential.country]` only — filters change the rendered view, **not** the fetched shards, so changing a filter never refetches the snapshot.

## Profile wizard changes

- `STEPS = ["bac", "languages", "review"]`; `FORM_STEP_COUNT` = 2.
- Delete `step-preferences.tsx` and `step-budget.tsx` from the wizard; `profile-wizard.tsx` renders only `StepBac`, `StepLanguages`, `StepReview`.
- `FormState` (`src/lib/profile/form/types.ts`) drops the five; `state.ts`, `build.ts`, `validate-step.ts`, `options.ts` drop the preferences/budget branches; `pathStep` handles only bac/languages.
- `StepReview` shows only bac + languages.
- `validateStep("review")` = bac ∥ languages (unchanged mechanism).

## My-matches UI

- New `src/components/matches/filter-panel.tsx` (+ `filter-controls.tsx`): a mobile-first disclosure/bar with the five controls. Field/study-language/destination reuse the display-name helpers; institution type is a single choice; budget is amount + currency + period. Reuse the exact label/hint strings from the old `profile.fields.*` values so the guest-copy golden is untouched.
- Replace the `ProfileSummary` aside with a filter summary (active filters + Clear). The old `ProfileSummary` (fields/destinations/budget chips) is retired.
- Empty state: `matches-states.tsx` gains a "no programs match your filters" variant with a Clear-filters action; the existing `allHidden` path still covers "everything hidden by filters".
- `budgetProvided` prop chain (`group-section`, `match-card`, `cost-breakdown`, `personal-match`, `compare-*`) is driven by `filters.budget !== null`.
- URL query: encode filters as `field`, `lang`, `dest`, `type`, `budget` params; read on mount (Suspense boundary in the matches island), seed from localStorage when the URL is empty, and write both on change.

## i18n

- New `matches.filters.*` keys (legend/hint/choices/clear/empty) in `fr`, `en`, `ar`, values copied verbatim from the retired `profile.fields.*` entries where the wording is identical.
- Remove `profile.steps.preferences.*`, `profile.steps.budget.*`, `profile.fields.*`, and the budget review lines; keep `profile.steps.bac|.languages|.review.*`.
- `copy-audit` (golden byte-identity) is satisfied by removing keys (removal is not checked) and by reusing values verbatim for the moved keys.

## Tests (TDD)

- Domain (`tests/domain/filter.test.ts`): empty filters keep everything; each filter hides on a definite mismatch; AND across filters; OR within a multi-select; **budget never hides**.
- `tests/lib/journey/matches-view.test.ts`: filters narrow; empty = all; budget annotates only; the empty-results kind.
- `tests/lib/snapshot/plan.test.ts`: `shardsForMatches` loads all program shards; planKey ignores filters.
- Profile (`tests/lib/profile/*`): `state.test.ts` STEPS = 3; `validate.test.ts` + `tests/data-schema/profile.test.ts` v2 shape; `storage.test.ts` migration strips + seeds once; draft v2 migration.
- Server (`tests/lib/server/rows.test.ts`): v1 row → v2 read.
- Components: wizard flow (2 steps); filter panel; empty state with Clear; summary.
- e2e: `tests/e2e/journey.spec.ts` walks 2 steps then filters; `tests/e2e/support/profile-form.ts` driver updated; a11y/privacy specs follow.
- Diff/fuzz tests for the new hand-written twin.
- `tests/lib/privacy/no-pii.test.ts`: the filter values must not reach analytics.

## Docs

- New ADR `0014-profile-preferences-as-match-filters.md` superseding ADR 0005 item 8 and the matching-domain "preference filter" wording.
- Update `docs/product/jisr_mvp.md` core journey (profile = eligibility; field/language/institution/budget = My-matches filters).
- Update `.claude/CLAUDE.md` (ProfileSchema shape, architecture blurb) and `.claude/rules/matching-domain.md` (`filterPrograms(filters, …)`).
- Update `.claude/docs/architecture.md` if it states the profile fields or the matches shard plan.

## Risks

1. **Larger default set.** With no field filter the default loads every program shard. Verify `pnpm build` + `pnpm perf:js` and the JS-budget ratchet (`tests/e2e/support/js-budget.ts`); the first-load JS budget is 150 KB accepted (ADR 0008).
2. **Three migrations** (guest profile, account/server read, draft) must agree; a drift test pins the two `PROFILE_SCHEMA_VERSION` constants.
3. **`no_programs_for_fields` removal** touches matches states + their tests.
4. **Budget-as-annotation** must stay out of `preferenceMismatches` (ADR 0005 item 8), even though it is now a filter input.
5. **Golden.** Only values-reused-verbatim keeps `copy-audit` green.
6. **URL state** needs a Suspense boundary in the matches island (Next 16 static page + `useSearchParams`).

## Out of scope

- Syncing filters to the account (filters stay device-local).
- Any change to eligibility/routes, costs math, scholarships, checklist.
- Task B (the Jisr → Jisrr rename) — separate branch and PR.

## Sequencing

1. This spec → owner review.
2. `writing-plans` → TDD implementation on `feat/profile-steps-to-matches-filters` → `reviewer` → PR.
3. After A's shape settles: Task B on its own branch.
