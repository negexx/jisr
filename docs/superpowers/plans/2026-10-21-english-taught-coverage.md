# English-taught Bachelor's coverage, all six countries (plan)

**Goal:** every English-taught Bachelor's programme in our fields (`data/fields`) at a registered institution is in `data/`, then its facts are filled in this order: intakes, tuition, application channel, deadlines, documents. Unknown stays null (⚠️). Existing pipeline only: import → stage → `data:pages` → `data:read --check` → `data:evidence verify` → `data:audit draw/sheet` (**owner audits**) → `data:promote`. One branch and one PR per country.

## Baseline (measured 2026-10-21 on main aefc0036, English-taught / total)

| | ES | NL | FR | DE | IT | HU |
|---|---|---|---|---|---|---|
| programmes | 0/15 | 5/125 | 16/755 | 143/150 | 60/64 | 131/131 |
| EN, no intakes | – | 4 | 1 | 37 | 34 | 128 |
| EN, no tuition | – | 3 | 1 | 2 | 20 | 58 |
| EN, no channel | – | 0 | 0 | 22 | 17 | 0 |
| EN, no deadline | – | 5 | 1 | 39 | 36 | 130 |

## Sources (researched 2026-10-21)

- **ES:** SEPIE "Bachelor's degrees taught in English in Spain", `https://sepie.erasmusplus.gob.es/socrates/internacionalizacionmasters/mantenimientogrados.do` (HTML table with Excel/PDF export; columns university, degree, field, % in English, ECTS, max €/ECTS, public/private, region, website). No RUCT code, no date, no licence statement. RUCT has no language field.
- **NL:** RIO (`ho_erkenningen_rio.csv`, CC-BY) has **no teaching-language column**; 1,569 current full-time Bachelor rows nationally, our importer keeps those in our fields. Study in NL (studyinnl.org) answered 503 on every request; Studielink has no catalogue. Language can only come from the programme page.
- **FR:** Campus France "Taught in English" catalogue, JSON at `https://tie-api.campusfrance.org/sgetprograms/1` and `/sgetprogram/{id}` (no key). 1,314 programmes; Bachelor-level (levels 10-12) 88, plus 90 ambiguous "Master1/Bachelor" (level 25). Fields: `diplomaIsNational`, `taughtenAll`, `webdiploma` (programme page on the institution's site). No terms of use found. Parcoursup has no language field.
- **DE / IT / HU:** existing importers (`data:import daad`, `data:it-discovery` + `data:it-stage`, `data:import hungary`), mostly cache hits; dedupe by slug and `PROMOTED.csv`.

## Approval needed: two new importers

1. **`pnpm data:import spain-english` (SEPIE).** Fetch the table (or its export), stage rows in our fields with % in English = 100 (owner threshold; partial rows listed, not staged), `officialUrl` candidate = the row's website, teaching language left `TODO_read_source` (the programme page confirms it), joined to the RUCT institution by normalised name. Extends `CAMPO_FIELD` style mapping to the six fields and adds a `sepie:` branch to `listing.ts`. The catalogue is a lead, never the `source_url`.
2. **`pnpm data:import france-english` (Campus France TIE).** One list call, keep levels 10-12 (level 25 only where its label says Licence/Bachelor), `diplomaIsNational = 1` and `taughtenAll = 1`; one detail call per survivor (~90). Match institution by normalised name + city to existing FR institutions (unmatched → review queue), programme page = `webdiploma`. Never `source_url` = Campus France.

NL needs no new importer: re-run `data:import netherlands` to stage the field-matching RIO programmes we lack, then `data:pages --topics` + `data:read --check` decide the language from the programme page; records whose page says Dutch-taught are not promoted in this workstream. A Study in NL importer is deferred until the site answers and Nuffic's terms are known.

## Batches (each ends at an owner audit; nothing promoted before it passes)

| Order | PR / branch | Steps |
|---|---|---|
| 1 | `data/es-english` | importer 1 (after approval, TDD, reviewer) → stage → listing promote of verified pages → read/check → audit sample → promote |
| 2 | `data/nl-english` | RIO restage → pages/read/check (language first) → audit → promote; then enrichment of the 5 + new |
| 3 | `data/fr-english` | importer 2 (after approval) → stage → read/check → audit → promote |
| 4 | `data/de-english` | DAAD refresh (new rows) + `data:daad-deadlines` + enrichment of 37 no-intake / 22 no-channel |
| 5 | `data/it-english` | Universitaly discovery refresh + `data:it-pages` + enrichment |
| 6 | `data/hu-english` | Study Finder refresh + enrichment of 128 no-intake / 58 no-tuition |

Model spend: `--max-usd` per run (documented ~0.1-0.3 ¢ reader + ~0.3 ¢ checker per programme). Every fact needs a verbatim quote verified by code; deadlines follow ADR 0009 and the international-applicant rule.

## Out of scope

Reviewing Arabic, the CNDP, non-English-taught programmes, fields outside `data/fields`, and any value without an official https source.
