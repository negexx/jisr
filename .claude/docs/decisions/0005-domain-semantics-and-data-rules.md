# ADR 0005 — Domain semantics and data rules settled while building M0-M2

**Status:** Accepted
**Date:** 2026-09-30

## Context

Building the data schema, the pure domain (`src/domain`) and the `data:check` pipeline forced a series of small product and semantics decisions. Several are load-bearing for the trust model ("estimates are ranges, never a single promised number"; "missing or ambiguous data is ⚠️, never ✅ or ❌") and for the M3+ UI. This ADR records them in one place so the UI, the data editors and future reviewers apply the same rules.

## Decisions

### Costs and matching
1. **Living costs use a 10-month academic year.** `ACADEMIC_YEAR_MONTHS = 10` (`src/domain/costs.ts`) converts monthly amounts to yearly and is exposed on every estimate. Housing is often paid 12 months, so the UI must state the assumption next to every yearly living-cost figure.
2. **A decisive ❌ stands even when other facts in the result are stale.** A fail is only produced from fresh official facts; anything that depends on a stale fact is already ⚠️, so the ❌ cannot rest on stale data.
3. **The domain never skips a checklist step on unknown, stale or non-official evidence.** A `language_exam` step is skipped only when the profile level is at least the requirement, every language reason (including route conditions) passes, and the route is `direct` or `check`. An `application_account` step is skipped only with a decisive channel link and a matching program slug.
4. **Grade values outside their own scale, or on an unknown scale, give ⚠️.** Empty match evidence also gives ⚠️.
5. **`subject_taken` is judged on the union of the subjects the student listed and the subjects of their track curriculum.**
6. **An empty `acceptedTests` means "any certificate counts".** The M3 profile input must therefore constrain the certificate choice to the rule's language, and `data:check` warns on a `language_proficiency` rule that requires a certificate but lists no `acceptedTests`.
7. **Foundation (Studienkolleg) routes show as ⚠️ `check`** with a prominent reason, never as a plain match.
8. **The program preference filter hides only on a definite mismatch** and returns the excluded programs with reasons, so the UI can say how many were hidden and why.

### Data rules (`data:check`)
9. **Tuition is one official fee for the non-EU/EEA audience, otherwise null.** A non-null `tuition.value` requires `info_kind: official` (error at `tuition.info_kind`); an estimate would be turned into a `min == max` range. The convention (the fee applicable to students from outside the EU/EEA, e.g. Moroccan students) is stated in `data/README.md` and `.claude/rules/reference-data.md`. A null value is valid with any `info_kind`; the app shows it as to-be-checked.
10. **`complete` coverage requires rules.** `coverage: complete` with zero rules is an error at `requirements.coverage` (programs and scholarships); use `partial` while requirements are unpublished. `complete` with a `manual_check` rule stays a warning. A `complete` program with non-empty `teachingLanguages` but no `language_proficiency` rule warns.
11. **Slug renames are unsupported** until an alias/redirect mechanism exists. That mechanism is a phase-2 prerequisite before accounts persist slugs. Never rename a slug.

### Presentation
12. **Mobile-first.** Base styles target phones (audience: Moroccan students, often on mobile and slow connections). Desktop gets properly designed layouts (side-by-side compare, two-column program page), not stretched phone screens.

## Alternatives considered

- **12-month living costs:** simpler, but overstates food/transport for a 10-month term and disagrees with how most official budgets are quoted. Rejected; the assumption is exposed instead.
- **Downgrade a ❌ to ⚠️ when unrelated facts are stale:** hides definite failures behind unrelated staleness. Rejected.
- **Accept estimated tuition as a range:** would need a min/max in the schema and invites invented ranges; null plus "to be checked" is more honest.
- **Keep `complete` + no rules as a warning:** a warning is easy to ignore and would let an empty requirement set read as "nothing required" and produce ✅.
- **Support slug renames now:** needs an alias table and redirects before any user data exists; deferred.

## Consequences

- Positive: the trust rules are enforced by the build (items 9-10) rather than by editor discipline; the UI has a single set of semantics to follow.
- Negative: universities that publish only a single blended fee cannot show tuition until a non-EU/EEA figure is found; the 10-month assumption must be surfaced in every yearly living-cost view.
- Neutral: items 1-8 are already implemented in `src/domain`; the M3 UI must honour them (certificate choice constrained by language, excluded-program count, foundation reason, mobile-first layouts).

## Before-launch additions

1. A fluent Modern Standard Arabic reviewer reads all Arabic strings (UI messages and `ar` data text) and marks them `reviewed`.
2. Verify that the local-machine `SWC_NATIVE_BINDING_CACHE` workaround needed for `next` commands does not apply to CI.

## How to revisit

ADRs are immutable once committed. If a decision here turns out wrong, write a new ADR that supersedes it; don't edit this one in place.
