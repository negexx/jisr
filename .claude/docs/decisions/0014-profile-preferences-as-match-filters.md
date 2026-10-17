# ADR 0014 — Profile preferences are transient match filters

**Status:** Accepted. Supersedes ADR 0005 item 8 (the program preference filter no longer reads the profile) and the `filterPrograms(profile, …)` wording in `.claude/rules/matching-domain.md`.
**Date:** 2026-10-17

## Context

The guest profile carried five preference fields — `fields`, `studyLanguages`, `destinations`, `budget`, `institutionType` — next to the student's eligibility answers (`nationality`, `credential`, `priorHigherEducationYears`, `languages`). The create-profile wizard asked for all of them (`bac` → `languages` → `preferences` → `budget` → `review`), and `filterPrograms` read the profile to decide which programs to hide.

Two problems came with that shape. First, a preference is not an eligibility fact: it changes as the student explores, it is re-answered on My matches, and it should not sit in the one document that claims "this is the student". Second, the account sync (ADR 0013) persists the profile; persisting a preference made a cheap, reversible choice into an authoritative fact that a device would overwrite for another.

The earlier tasks of this change moved matching to a `MatchFilters` value (`src/data-schema/match-filters.ts`), a client validator (`src/lib/matches/filters.ts`) and a store at `jisr.matches-filters` (`src/lib/matches/filter-store.ts`), and made the domain (`filterPrograms(filters, …)`), the view models and the client islands match on filters. This task removes the five fields from the profile (schema v2), reduces the wizard to `bac`/`languages`/`review`, and adds the `1→2` migrations that preserve existing users' answers.

Constraint behind every choice: one developer, free tiers only, and the `jisr.*` local-storage scheme with no server round-trip for the guest journey. Preferences are transient; eligibility is persisted.

## Decision

### 1. The persisted profile is eligibility only (schema v2)

- `ProfileSchema` (`src/data-schema/profile.ts`, `PROFILE_SCHEMA_VERSION = 2`) is a strict object of `nationality`, `credential`, `priorHigherEducationYears` and `languages`. The five preference keys are gone, and the schema rejects them (an unknown key is an error), so nothing is silently accepted and re-serialised.
- `BudgetSchema` stays exported from `profile.ts` even though the profile no longer contains a budget: `MatchFiltersSchema` imports it, and moving it would be a rename for its own sake.
- The hand-written client twin `src/lib/profile/validate.ts` drops the same keys and their parsing, and the differential test (`tests/lib/profile/validate.test.ts`) keeps the two in agreement over the tables and a seeded fuzzer.
- `DRAFT_SCHEMA_VERSION = 2`: the form draft is the same shape minus the five keys.

### 2. Preferences live in the transient filter store

- The five values are a `MatchFilters` document under `jisr.matches-filters`. They are device-local: never sent to the server, never part of the account document, never sent to analytics. A signed-in device reads and writes them locally like a guest. My matches also encodes them in its `/matches` URL (`field`, `lang`, `dest`, `type`, `budget`) so a filtered view can be shared or bookmarked; the URL is a browser entry point (the static page does not read it server-side) and is the only place outside the local store the values are written.
- `filterPrograms(filters, programs, now)` and `preferenceMismatches(filters, program, now)` (`src/domain/filter.ts`) take the filters, not the profile. The matching semantics of ADR 0005 item 8 are unchanged: a program is hidden only on a definite mismatch (destination, field, institution type, study language), unknown/stale/non-official teaching-language data never hides a program, and excluded programs are returned with reasons so the UI can offer to show them.
- The wizard is `STEPS = ["bac", "languages", "review"]`; the `preferences` and `budget` steps and their components are deleted. My matches hosts the filters instead (the filter panel is a later task in the same change); until it lands, the domain tests and the client islands read the filter store directly.

### 3. Budget is an annotation, not a filter

- A budget never hides or reorders a program. It only feeds `budgetFit` on a cost estimate. It is part of `MatchFilters` so it is set with the other preferences, and the program page (`personal-match.tsx` → `personal-outcome.ts`) and My matches read it from the filter store rather than from the profile.
- The program page reads the filter budget once after mount and passes it to `personalOutcome`; the cost box still appears only when a budget is set.

### 4. The `1→2` migrations preserve existing users' answers

- **Guest profile** (`src/lib/profile/storage.ts`): `MIGRATIONS[1]` deletes the five keys, sets `schemaVersion: 2` and returns the removed values as a `MatchFilters` (only when `parseMatchFilters` accepts them). `migrateProfile` hands those legacy preferences back, and the store seeds `jisr.matches-filters` once via `seedFiltersFromLegacy`: it never overwrites a live choice, and it seeds nothing when the stripped values are all default. `readProfile` seeds the same way so the storage-level read is self-contained.
- **Guest draft** (`src/lib/profile/draft.ts`): `readDraft` strips the five keys from a v1 draft (and bumps the version) before `parseDraft`, so a half-finished form keeps its bac and languages answers.
- **Account rows** (`src/lib/server/rows.ts`): `rowToProfile` runs the same strip (`migrateProfileRecord`) before `ProfileSchema.safeParse`, so a profile synced under v1 still reads on a build that only knows v2. It does not seed filters server-side (the server has no access to the device's filter store).
- **Account cache** self-heals: `parseAccountProfile` runs the v2 `parseProfile`, so a cached v1 profile fails to parse and the server copy replaces it at the next hydration.
- Migration is not the schema's job: a v1-shaped object handed straight to `ProfileSchema` is rejected, and only the read paths that know history migrate it.

### 5. Incomplete existing test helpers were updated in the same change

The type change is global; `tsc` includes tests. Every `Profile` fixture and consumer was updated (builders, e2e fixtures, domain pipeline and e2e-fixture tests, store and server tests), `filtersFromProfile` was retired in favour of static `MatchFilters` fixtures, and the Playwright driver/spec expectations are updated with the rest of the change.

## Alternatives considered

- **Keep the five fields on the profile and mirror them into filters.** Two sources of truth for one choice; the migration would have to reconcile them and the account document would keep storing a preference. Rejected.
- **Persist filters to the account (like the profile).** A preference is not eligibility and should not be authoritative across devices in Release 1; it also needs a server schema and sync path for no user benefit yet. Rejected; filters stay transient.
- **Accept the five keys in v2 and ignore them.** Silent acceptance would let an edited or older document look valid and be re-serialised without the fields, hiding the migration instead of doing it once. Rejected; the strict schema rejects them and the read paths strip them first.
- **Seed filters on every guest read rather than once.** `seedFiltersFromLegacy` is idempotent and only writes when the store is empty and the legacy values are non-default, so it is safe to call on each migrated read; it still never overwrites a choice the student has since made.
- **Give the server the filter store so account imports could seed it.** The server never sees the device's filters and the account has no filter document; the cache self-heals instead. Rejected.
- **Keep `BudgetSchema` in a new module.** A move to satisfy tidiness only; it stays in `profile.ts` where it was.

## Consequences

- Positive: one persisted document describes the student (eligibility); matching reads a transient, cheap value; the wizard is shorter; existing users keep their choices through a one-time seed; the schema can tell a v1 document from a typo.
- Negative: a v1 guest profile is migrated on every read until it is saved again (the store seeds once, but the record itself is only rewritten on the next save); the server cannot seed filters for an imported account, so an account-only student re-answers their preferences (acceptable: they were never in the account).
- Neutral: `fields`/`studyLanguages`/`destinations`/`institutionType`/`budget` remain valid `MatchFilters` keys; `BudgetSchema` lives in `profile.ts`; filters are encoded in the `/matches` URL for sharing and bookmarking, but are never sent to the server, the account document or analytics.

## How to revisit

ADRs are immutable once committed. If a decision here turns out wrong, write a new ADR that supersedes it; don't edit this one in place. ADR 0005 item 8 is superseded by decision 2 above; the rest of ADR 0005 stands.
