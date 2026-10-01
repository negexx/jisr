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

## Tuition

A program has a single `tuition` figure, by convention the fee that applies to the Release 1 audience: students from outside the EU/EEA (for example Moroccan students). It must be an official published fee (`info_kind: official`); when the university does not publish one, leave the value `null` and the app shows it as to-be-checked. An estimate is never accepted here, because it would be turned into a single-number range.

## Checking

```
pnpm data:check              # validate every record, print freshness and translation reports
pnpm data:check --strict     # additionally fail when any fact is stale
pnpm data:build              # publish immutable JSON snapshots (runs after data:check)
```

`data:check` fails on invalid or provenance-less records, dangling references, unknown keys, future dates, a non-null program `tuition` that is not `official`, and `complete` coverage with no rules. Aging and stale facts are reported, and only fail the run under `--strict`. It also warns (without failing) about unused sources, `complete` coverage with a `manual_check` rule, a `complete` program that has teaching languages but no `language_proficiency` rule, a `language_proficiency` rule that requires a certificate but lists no `acceptedTests`, and a cost profile whose `city` matches no institution city.

## Importing candidates (`data-staging/`)

Official bulk datasets are pulled into `data-staging/`, never straight into `data/`. A staged record has the exact shape of a `data/` record, plus a `_review` block, and every `last_verified_at` is `null`. Any fact the importer could not read (and any value it only guessed, such as a website from Wikidata) carries `info_kind: TODO_read_source`, which is deliberately not valid: `data:promote` refuses the record until a human has read the source and chosen a value, or an explicit `null` for "not published". `data-staging/` is committed as the review queue; it is not read by `data:check` or the build.

```
pnpm data:import france          # Parcoursup open data (Licence + BUT, CS/engineering/business) + institutions
pnpm data:import institutions    # German (HRK) and Dutch (DUO) institution candidates
pnpm data:import                 # all sources; keeps staged files (--overwrite replaces them and clears their approval; --refresh bypasses the HTTP cache)
pnpm data:promote --confirm-human-read --verified-on YYYY-MM-DD
```

1. Open `data-staging/REVIEW.csv` (one row per record: name, institution, city, field, confidence, official link, what is still to check). Read the source, fix the staged YAML (replace each `TODO_read_source`, fill the website/type), then write `y` in the `approved` column. Re-importing never keeps an approval for a file it rewrote.
2. `data:promote` takes every approved row, stamps the date you pass as `last_verified_at` on every source, validates the record against its schema, and moves it into `data/`. A record that is still invalid is skipped and stays staged; an existing `data/` record is never overwritten. Pass the flags only after you have read the sources.
3. `pnpm data:check` then reports dangling references (promote a programme's institution too).

What each source provides, and what stays for a human:

| Source | Provides | Left for a human (read the programme page) |
|---|---|---|
| Parcoursup open data (fr-esr-parcoursup, Licence ouverte 2.0) | programme name, institution, city, public/private, link to the official Parcoursup page (used as the programme's source) | duration, languages, tuition, intakes, documents, requirement rules, the application channel for Moroccan applicants |
| ESR register of establishments (same publisher) | institution website for an exact UAI match: promotable as is | other institutions get a website candidate (Wikidata or the parent university, e.g. an IUT campus) flagged for confirmation |
| ONISEP Idéo, structures d'enseignement supérieur (ODbL) | parent university of each IUT campus or UFR by UAI code, used to find a website candidate; independent public/private cross-check (a mismatch with Parcoursup is flagged in the review sheet) | the unit's own website: the parent's site is only a candidate to confirm |
| ONISEP Idéo, actions de formation (ODbL) | the website each establishment lists for itself (often the IUT or faculty site): preferred over the parent university's as a website candidate | confirm it is the right site; programme-level matching (duration, cost text) is not imported |
| HRK Hochschulkompass list, Germany (`hs_liste.txt`) | 323 universities, Fachhochschulen/HAW and other Hochschulen: official name, city, public/private sponsor (type left null for church-run institutions), website candidate. A website that is not an https front door, or whose https form redirects to another domain, is flagged | everything has to be read on the institution's own site: the register page cited as source does not show an individual institution, so every record keeps the placeholder `info_kind` until you add that page as the source |
| DUO open data, Netherlands (`Hogescholen en universiteiten`) | 54 hogescholen and universities: official name, city, website candidate (probed for https), denomination as a hint | public/private type, the institution's own page as source, programmes |
| Wikidata (CC0) | only French UAI → website (a candidate, below ONISEP) | everything else |

Field assignment for French programmes is an exact-label table in `scripts/import/fields.ts`; `confidence: low` rows are judgement calls. The HTTP cache lives in `.cache/import/` (git-ignored).

### Source licences

| Source | Terms | Status |
|---|---|---|
| Parcoursup open data, ESR register | Licence ouverte 2.0 | free reuse with attribution |
| ONISEP Idéo (structures, actions) | ODbL | attribute ONISEP; share alike if a derived database is published |
| HRK Hochschulkompass list | [downloads page](https://www.hochschulkompass.de/en/higher-education-institutions/downloads.html): "free of charge for personal use only. All other uses, in particular commercial use (including individual parts), require the approval of the Foundation for the Promotion of the HRK" | **permission to be requested before launch** (hochschulkompass@hrk.de). The 323 HRK-derived staging files are committed for review; do not promote them into `data/` or publish them before permission is granted |
| DUO open data | published as open education data; the pages read here state no licence | **confirm the licence** (a research note says CC0, not verified) |
| Wikidata | CC0 | free |

Known gaps: no bulk official programme dataset was reachable for Germany (Hochschulkompass forbids crawling its search in robots.txt; the DAAD database is a JavaScript app with no public API) or the Netherlands (DUO's "Overzicht Erkenningen ho" lives on a JavaScript portal with no direct file link reachable from here). German and Dutch programmes, all tuition fees, living costs and scholarships are not imported.

Deliberately not adopted (see ADR 0003, one developer, Release 1): campus and institutional-history tables, raw source snapshots, ETER (its terms forbid republishing through an online platform), Destatis codebooks and accreditation registers (NVAO). Revisit when accounts or more countries land.
