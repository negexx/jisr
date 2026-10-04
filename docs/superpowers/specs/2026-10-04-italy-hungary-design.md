# Italy and Hungary as destinations: design

Status: approved by the owner on 2026-10-04 ("go ahead, Hungary first"). Branch `feat/italy-hungary` (from `feat/research-round-3`).

## Goal

Add Hungary and Italy to the Release 1 destinations (Bachelor level, Computer Science / Engineering / Business-Economics) with the same trust model as France, Germany and the Netherlands: every fact carries an official https source and a last-verified date, a model only proposes and code verifies the quote, unknown stays unknown, and every batch is audited by the owner before promotion.

## Scope decision

English-taught programmes first. Italian- and Hungarian-taught programmes come later as separate batches with their own language requirements (Italian B2, Hungarian). Precedent: France was register-wide (almost all French-taught), Germany was the DAAD English-taught register, the Netherlands a Dutch-taught shortlist; Hungary is almost entirely English-taught for international students and Italy has a large English-taught Bachelor offer.

## What the model already expresses

`src/` has no hard-coded destination lists: countries, admission routes (`(origin credential country, type) -> (destination, level)`), application channels, language certificates and scholarships are data. Country-specific code lives in the import scripts only: `CHANNEL_WORDS` / `CHANNEL_SLUGS` (`scripts/import/evidence.ts`), the reader country notes and language codes (`scripts/import/reader.ts`, `evidence.ts`), channel descriptions in `checker.ts` and `summaries.ts`, the "France, Germany and the Netherlands" copy in `messages/*.json`, the importers and discovery (`scripts/import/sources/*`, `discover.ts`).

Money: costs are totalled per currency (`src/domain/costs.ts`), so a fee published in HUF would be "to be checked" against a EUR budget. Fees are stored in the currency the official page states; Hungarian international fees are mostly published in EUR (to be measured in Slice 1 before any conversion is considered).

## Sources (all official, found 2026-10-04)

**Hungary.** Study Finder (`https://tempus.tpf.hu/studyfinder`, Tempus Public Foundation under the Study in Hungary initiative; programmes in English and other languages, 800+ entries). A plain GET search form (`index/search/?level=Bachelor&language=English&branch_of_science=...`) lists results; `index/show/<id>` pages give institution, faculty, branch, level, qualification, language, duration, location, requirements, entrance examination and minimum language level, the programme's own website ("Contact website"), and whether the programme is available in the Stipendium Hungaricum (SH), Diaspora and State scholarship programmes. Fees and deadlines are not in Study Finder: they come from the programme/institution pages through the existing reader. In-scope size (Bachelor, English): Computer Science and IT 20, Engineering Science 52, Economic Science 57 (about 130 before field filtering). No robots.txt; the DAAD precedent applies: the owner obtains written permission from the Tempus Public Foundation, the importer stays a polite cached reader (four-request pattern, one at a time).

**Italy** (Slice 2). MUR open data (`https://dati-ustat.mur.gov.it`, public domain CSV of all degree courses with university, degree class and `CorsoLingua`) gives programmes, the field via the degree class and the language; Universitaly (`universitaly.it`, a single-page app, not scrapeable) is the pre-enrolment channel for non-EU applicants; the yearly MUR note on international students gives the national pre-enrolment calendar and per-country requirements. Italian public tuition is set per university (ISEE-based; non-EU applicants abroad usually pay a university-defined band), so expect many programmes with only a range.

## Slices (each ends with an owner audit and an Opus review)

0. **Hungary skeleton:** country `HU`, route `ma-bac-to-hu` (outcome `check` unless an official page states otherwise), channels (`hu-university-direct`, `hu-stipendium-hungaricum`), language code `hu`, code touchpoints and copy (TDD), docs scope update.
1. **Hungary programmes:** `data:import hungary` (Study Finder to staged candidates, field mapping by name as for DAAD, institution records), enrichment with the existing pages/reader/checker pipeline (HU country note, register-page discovery), audit, promotion, Stipendium Hungaricum scholarship (verified-only through `data:scholarship`), coverage report.
2. **Italy skeleton and programmes:** same pattern from the MUR CSV; national pre-enrolment calendar read by code (like `data:fr-calendar`); university tuition reads.
3. **QA and docs:** both countries in the browser in `fr` and `ar` (RTL, phone and desktop), e2e check, README/CLAUDE.md scope, coverage tables, PR.

## Risks and decisions carried

- Written permission from the Tempus Public Foundation for the Study Finder content (owner).
- No official page yet found that states the Moroccan Bac outcome for Hungary: the route stays `check` with a manual-check condition citing the official Study in Hungary / Felvi pages, never an invented outcome.
- Italian tuition and Hungarian deadlines may be published only as ranges or per intake; those stay unknown and are reported by name.
- The Release 1 statement in `.claude/CLAUDE.md` ("France, Germany, Netherlands") is updated when the first Hungarian programmes are promoted.
