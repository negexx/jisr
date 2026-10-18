# W5 — Scholarship (and official cost-profile) revision path

Date: 2026-10-18
Branch: `feat/scholarship-revision-path` (based on `origin/main` f0cc00ef)
Scope: the import tooling that lets a scholarship already in `data/` be revised, the enabler for data
wave W5. The same pattern was applied to official cost profiles.

## What changed

Until now `pnpm data:scholarship verify` and `pnpm data:costs-official verify` refused a slug already
in `data/` ("already in data/: never overwritten") and staged nothing. There was no revision path for
these two collections, unlike programmes (`data:evidence restage --enrich` + `verify --enrich` +
`data:promote --replace-revisions`).

A `--revise` flag now stages a revision of the existing record instead. A revision is built exactly
like an enrichment revision: it is verified as a fresh record would be (the same quotes, official
hosts and level/nationality rules — nothing is weakened), and only what an accepted quote supports is
applied over the record; a fact the proposal leaves silent, or that no quote supports, keeps its
existing value. Nothing is invented.

Files:

- `scripts/import/scholarships.ts` — `reviseScholarship()` (the merge), `--revise` in `runVerify` and
  the CLI. A revision carries `_review.revises: true`, `_review.preparedBy: assistant` and the run's
  `evidence`; the changed and kept fields go into `_review.notes`. Sources are preserved (an existing
  page keeps its older `last_verified_at`; a new page is added with `null`, stamped on promotion).
  The revision's earlier audit row is dropped so a **fresh** audit batch is required.
- `scripts/import/official-costs.ts` — `reviseProfile()` (the merge) and the same `--revise` handling.
- `scripts/import/audit.ts` — a small shared `dropAuditRows(keys, dir)` helper (the same bookkeeping
  `data:evidence restage` does inline).
- `data/README.md` — one paragraph each in *Scholarships* and *Official cost profiles*.

## Exact new commands

```bash
# stage a revision of a scholarship already in data/ (no-op without --revise: still refused)
pnpm data:scholarship verify <proposal.json> --revise [--dry-run]

# stage a revision of an official cost profile already in data/
pnpm data:costs-official verify <proposal.json> --revise [--dry-run] [--delay-ms 4000] [--use-cache]
```

The full revision lifecycle (scholarships; cost profiles identically):

```bash
pnpm data:scholarship verify data-staging/proposals-scholarship/<slug>.json --revise
pnpm data:audit draw                 # the revision is 100%-sampled like any scholarship
pnpm data:audit sheet                # owner reads it against the sources
pnpm data:promote --confirm-human-read --verified-on YYYY-MM-DD --audited-batch --replace-revisions
```

Backward compatibility: without `--revise`, both commands behave exactly as before — a staged file or
a slug already in `data/` stops the run.

## Merge discipline (both collections)

- **Verified facts replace** the existing values (this is the point of a revision; the proposal is a
  fresh, code-checked reading).
- **Localized text is merged, not replaced.** The proposal schema carries only `fr`/`en`, so the
  fresh value wins for the locales it provides and every locale it does not (notably `ar`) is kept
  verbatim, at the top level (`summary`, `howToApply`) and inside a document whose `slug` is
  unchanged; `_review.notes` records `locales kept: <locales>`.
- **Silent or unsupported facts keep** the existing value — a proposal that sets `deadline: null`, or
  claims a support amount no quote states, never clears or overwrites the record.
- **Sources are merged by url**: an existing page keeps its key and its (older) `last_verified_at`; a
  page the proposal adds is new and undated until promotion stamps it. A kept fact keeps its existing
  `source`, so no reference dangles.
- `_review.notes` records `changed: <fields>; kept: <fields>`.

## Audit (trust-critical)

Scholarships and official cost profiles are always 100%-sampled (`isAlwaysSampled`, never waivable).
A revision is new, changed content, so it must not ride on the earlier promotion's audit approval.
`--revise` therefore drops the record's existing audit row; the next `data:audit draw` puts it in a new
batch, and `data:promote` refuses it (for `preparedBy: assistant`) until that batch passes. The rule
holds: every scholarship record goes to the audit sample, and promote requires the audited batch.

## Tests (TDD)

Written first and watched fail, then made green:

- `tests/scripts/import/scholarships.test.ts` — new `describe("runVerify --revise")`:
  (a) without the flag the refusal is unchanged and nothing is staged; (b) with `--revise` the staged
  revision carries `revises: true`, `preparedBy: assistant` and merges the verified facts (a changed
  name and a changed support amount) over the existing record, which is left untouched; (c) existing
  `deadline`/`documents` are preserved where the proposal is silent; (d) a support fact with no
  accepted quote is not applied (the existing value stays); the earlier audit row is dropped; `--revise`
  on a slug not in `data/` is refused; `--revise --dry-run` writes nothing; (e) the staged revision
  promotes with `--replace-revisions` and a passed audit, and is refused without the flag.
- `tests/scripts/import/official-costs.test.ts` — the same coverage for cost profiles (kept lines
  merged, omitted lines preserved, a dropped line not applied, audit row dropped, promote with
  `--replace-revisions`).

Results:

- `pnpm exec vitest run tests/scripts/import/scholarships.test.ts` — 251 passed.
- `pnpm exec vitest run tests/scripts/import/official-costs.test.ts` — 129 passed.
- `pnpm test` (whole suite) — 328 files, 8045 passed, 25 skipped, 0 failed.
- `pnpm typecheck` — clean.
- `pnpm lint` — clean (2 pre-existing infos, untouched: `scripts/import/sources/hrk.ts:49` and
  `scripts/import/sources/studyfinder.ts:44`).

## Design decisions and uncertainties

- **`--revise` replaces verified facts, unlike `verify --enrich`.** Enrichment never overwrites an
  existing official value (it records a conflict). A revision exists to change values, so it applies
  what the proposal proved and keeps the rest. The task asked for the `verify --enrich` *discipline*
  (apply only quote-supported facts, keep the rest); the "never overwrite an official value" rule was
  deliberately not carried over, or the path could only ever fill gaps.
- **`null` in a proposal is treated as silence, not as "clear this".** The proposal schema cannot
  distinguish "not published" from "silent", so a revision never clears an existing value. Removing a
  fact on purpose has no path yet.
- **The existing audit row is dropped, not kept.** This is the one place the task's wording ("promote
  requires the audited batch") could be read as "the old batch suffices"; that reading would let
  changed money/eligibility facts through on an old approval, so the row is dropped and a new batch is
  required. Flag if the intended behaviour differed.
- **Unused sources can linger.** A revision keeps the existing `sources` map and adds to it, so a page
  whose fact was replaced may no longer be referenced. `data:check` reports that as a warning (not an
  error); pruning was left out to avoid dropping a page another fact still cites.
- **Only the two named commands changed.** `data:evidence`, `data:audit` and `data:promote` are
  untouched apart from the shared `dropAuditRows` helper in `audit.ts`; no dependency was added.
- **No model calls, no `data/*.yaml` edits.** `data/README.md` was edited as instructed (documentation
  only); no data record was written.
