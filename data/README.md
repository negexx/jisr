# Reference data

This folder holds Jisr's curated reference data. It is the source of truth for the app; git history is the audit trail. It currently holds **no records**.

**Only records whose every value traces to an official https source belong here.** Never invent or fill in a value. If something is not published, write `null` and let the app show "to be checked".

## Layout

One record per file: `data/<collection>/**/<id>.yaml`.

- The collection is the first folder under `data/`. Deeper folders are organisational only.
- The file name (without `.yaml`) equals the record's id: `slug`, or `code` for `countries`.
- Do not rename a slug. Saved user data will refer to it, and the slug alias/redirect mechanism is not yet supported (to be built before accounts persist slugs, phase 2), so a rename breaks saved data.
- Use the `.yaml` extension. `README.md` and dotfiles are ignored; anything else is an error.

The 13 collections:

`countries`, `fields`, `subjects`, `language-certificates`, `grading-scales`, `grade-conversions`, `credential-types`, `application-channels`, `admission-routes`, `institutions`, `programs`, `cost-profiles`, `scholarships`.

## Provenance

Every record other than the vocabulary collections (`countries`, `fields`, `subjects`, `language-certificates`) has a `sources` map of `key -> { url, last_verified_at }`, and every fact, rule, requirements block or record-level claim names one of those keys in `source`.

- `url` is an official https page.
- `last_verified_at` is the date a human actually read that page (`YYYY-MM-DD`, never in the future).
- `info_kind` is `official`, `estimate` or `guidance`. An `estimate` also needs a `basis` explaining how the range was derived.
- A source key that is used but not declared is an error. A declared key that is never used is a warning.

## Checking

```
pnpm data:check              # validate every record, print freshness and translation reports
pnpm data:check --strict     # additionally fail when any fact is stale
pnpm data:build              # publish immutable JSON snapshots (runs after data:check)
```

`data:check` fails on invalid or provenance-less records, dangling references, unknown keys and future dates. Aging and stale facts are reported, and only fail the run under `--strict`. It also warns (without failing) about unused sources, `complete` coverage with no rules or a `manual_check` rule, a `language_proficiency` rule that requires a certificate but lists no `acceptedTests`, and a cost profile whose `city` matches no institution city.
