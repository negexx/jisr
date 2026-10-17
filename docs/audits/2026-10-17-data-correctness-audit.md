# Data-correctness audit — 2026-10-17

- **Audited commit:** `f0cc00efed2f74e7e8a816ea59585d7462f4eebe`
- **Audit window:** 2026-10-17/18 (baseline f0cc00ef)
- **Worktree:** `.worktrees/audit-shared` (branch `audit/scratch-shared`)
- **Scope:** `data/**` YAML (Zod-validated) and the reports/state derived from it (`docs/reports/2026-10-10`, `data-staging/` counts). Read-only: no `data/**` edits, no import/promote/scraper run, no promotion of staged data, no fixes.
- **Method:** ran the project's own validators (`data:check`, `data:check --strict`, `data:coverage`), wrote two read-only audit scripts (`scripts/audit/t6-matrix.ts`, `scripts/audit/t6-sample.ts`), sampled 30 programmes against their `source_url` with `webfetch`/`curl`, and counted `data-staging/` (read-only). Every number below traces to a command in the appendix.

All project commands were run through Windows:
`cmd.exe /c "cd /d C:\Users\dagda\Downloads\Nex\UniWay\.worktrees\audit-shared && set SWC_NATIVE_BINDING_CACHE=C:\Users\dagda\.swc-cache&& pnpm <cmd>"`.

---

## 1. Validation & freshness (what the tooling says)

| Command | Exit code | Tail of output |
|---|---|---|
| `pnpm data:check` | **0** | `freshness: 11625 fresh, 0 aging, 0 stale` · `translations: fr 8293/8293 (10 reviewed), en 8292/8293 (10 reviewed), ar 7704/8293 (0 reviewed)` · `data:check: 1815 records, 0 errors, 32 warnings` · `data:check: OK` |
| `pnpm data:check --strict` | **0** | same warnings, same freshness/translation/totals lines; `data:check: OK` (`--strict` fails only on stale facts; there are none) |
| `pnpm data:coverage` | **0** | the per-country matrix reproduced in §2 |

**No errors. No aging or stale facts. Nothing is blocked at the validator level.**

### Warnings (32) — all one class

Every warning is `sources.<key>: source "<key>" is never used` — a declared source key that no fact references. Distribution: **15 DE, 7 HU, 10 IT, 0 FR, 0 NL, 0 ES** programmes. None is an error; each is a leftover second/third source key on an imported record (e.g. `programs/de-hochschule-osnabruck-hrk214-international-economics-daad9923.yaml` declares `page-2` and `page-3` and uses neither). This is the only warning class and it has grown from 1 (2026-10-09) to 32 as HU/IT/NL records were added.

### Comparison with prelaunch checklist row A5 (2026-10-09)

| Metric | A5 (2026-10-09) | This run (2026-10-18) | Δ |
|---|---|---|---|
| records validated | 1656 | **1815** | +159 |
| errors | 0 | **0** | — |
| warnings | 1 | **32** | +31 |
| freshness | 10615 fresh, 0 aging, 0 stale | **11625 fresh, 0 aging, 0 stale** | +1010 facts |
| translations fr | 2910/2910 (9 reviewed) | **8293/8293 (10 reviewed)** | — |
| translations en | 2909/2910 (9 reviewed) | **8292/8293 (10 reviewed)** | — |
| translations ar | 1948/2910 (0 reviewed) | **7704/8293 (0 reviewed)** | — |

Two things to flag in the A5 evidence cell itself:

- The 2026-09-09 A5 line recorded `1 warning`; today it is **32**. A5 says "Re-run it before launch" — the warning count should be read as 32, not 1.
- The translation denominator jumped 2910 → 8293. The LocalizedText universe grew (documents, summaries, scholarship copy), not just the records; ar coverage is 92.9 % (7704/8293) with **0 reviewed**, which A5 already captures ("all `ar` copy is a machine draft").

### Translation findings

- `ar` reviewed = **0** (expected; A5/C1). `fr`/`en` reviewed = **10** each.
- **Missing `en` node: exactly 1** — `programs/hu-university-of-debrecen-debrecen-electrical-engineering-sf146.yaml` (the `en` summary object is absent, so the UI falls back to `fr`). This is the `en 8292/8293` in the tool line.
- **Missing `ar` nodes: 587** in programme-localised text (documents + summaries), i.e. ~7 % of the ar surface; `data:check` never fails on a missing optional locale.
- No `TODO`/`FIXME`/`TODO_read_source` markers in any `data/**` record (`0` files).

---

## 2. Completeness matrix (destination × fact)

Source: `pnpm data:coverage` (counts, reproduced verbatim) plus `scripts/audit/t6-matrix.ts` (percentages, deadline split, coverage status, language distribution). Percentages are of that country's programme count.

### Raw counts (`pnpm data:coverage`)

| Fact | DE | ES | FR | HU | IT | NL |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| programmes | 150 | 15 | 755 | 132 | 65 | 125 |
| tuition | 147 | 0 | 737 | 69 | 38 | 50 |
| tuition (official) | 147 | 0 | 737 | 69 | 38 | 50 |
| teaching language | 150 | 0 | 706 | 130 | 60 | 79 |
| intakes | 111 | 0 | 735 | 3 | 21 | 33 |
| application channel | 126 | 0 | 755 | 43 | 45 | 102 |
| documents | 138 | 0 | 736 | 119 | 56 | 23 |
| duration | 149 | 10 | 755 | 115 | 47 | 104 |
| requirement rules | 62 | 0 | 755 | 131 | 50 | 93 |

### Percentages and deadline split (`scripts/audit/t6-matrix.ts`)

| country | progs | tuition | tuition official | teaching lang | intakes (any) | with deadline | dated | recurring | channel | documents | rules (any) | rules (complete) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| FR | 755 | 98 % | 98 % | 94 % | 97 % | 97 % (735) | 735 | 0 | 100 % | 97 % | 100 % | **0 (0 %)** |
| DE | 150 | 98 % | 98 % | 100 % | 74 % | 73 % (109) | 19 | 90 | 84 % | 92 % | 41 % | **0 (0 %)** |
| NL | 125 | 40 % | 40 % | 63 % | 26 % | 17 % (21) | 1 | 20 | 82 % | 18 % | 74 % | **0 (0 %)** |
| HU | 132 | 52 % | 52 % | 98 % | 2 % | 1 % (1) | 0 | 1 | 33 % | 90 % | 99 % | **0 (0 %)** |
| IT | 65 | 58 % | 58 % | 92 % | 32 % | 29 % (19) | 19 | 0 | 69 % | 86 % | 77 % | **0 (0 %)** |
| ES | 15 | 0 % | 0 % | 0 % | 0 % | 0 % | 0 | 0 | 0 % | 0 % | 0 % | **0 (0 %)** |

### Programme count per field

| country | total | computer-science | engineering | business-economics | medicine | pharmacy | allied-health |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| FR | 755 | 157 | 248 | 350 | 0 | 0 | 0 |
| DE | 150 | 20 | 75 | 52 | 1 | 0 | 2 |
| NL | 125 | 20 | 17 | 18 | 10 | 5 | 55 |
| HU | 132 | 18 | 52 | 44 | 0 | 0 | 18 |
| IT | 65 | 2 | 19 | 34 | 0 | 1 | 9 |
| ES | 15 | 6 | 6 | 3 | 0 | 0 | 0 |

Release 1 declares CS / Engineering / Business-Economics. Several destinations carry programmes **outside** those three fields (NL medicine 10 + pharmacy 5 + allied-health 55; HU allied-health 18; IT allied-health 9 + pharmacy 1; DE medicine 1 + allied-health 2). Field scope and the field-assignment table should be confirmed with the owner before these are considered in-scope (see P2).

### Teaching-language distribution

| country | distribution (`lang: n`) |
|---|---|
| FR | fr 681 · (none) 49 · de+fr 9 · en+fr 8 · en 4 · de+en+fr 3 · en+es+fr 1 |
| DE | en 89 · de+en 52 · de 7 · de+en+es 1 · en+es+fr 1 |
| NL | nl 74 · (none) 46 · en+nl 3 · en 2 |
| HU | en 129 · (none) 2 · en+hu 1 |
| IT | en 60 · (none) 5 |
| ES | (none) 15 |

### Requirement-rule coverage — the load-bearing gap

- **All 1242 programmes are `requirements.coverage: partial`. Zero are `complete`.** Confirmed two ways: the matrix `rules (complete)` column is 0 for every country, and a direct count over `data/programs/*.yaml` returns only `{'partial': 1242}`.
- Rule kinds actually present across all programmes: `manual_check` 1340, `language_proficiency` 933, `prior_study_years_min` 26, `subject_taken` 8. **There are no `credential_type_in`, `credential_track_in`, `overall_grade_min` or `subject_grade_min` rules anywhere.**
- All six Morocco→destination admission routes are built from **`manual_check` conditions only** (FR 0 conditions, DE 1, NL 1, HU 2, IT 3, ES 4; every one `manual_check`).
- Consequence (verified in `src/domain/match.ts`): `coverageReason()` adds an `unknown` reason whenever coverage is not `complete`, and `aggregateMatchStatus()` returns `check` when any reason is `unknown`. Because **every** programme is `partial`, a `manual_check` route/rule is `unknown`, and no structured grade/credential rule exists, **no programme can ever display ✅ today** — the best outcome is ⚠️ `check`. See §7 P0-1.

### Morocco/Bac route completeness

| route | outcome | conditions (kind) | application channels | guidance | source |
|---|---|---:|---|---:|---|
| `ma-bac-to-fr` | direct | 0 | `fr-campus-france` | 1 | Campus France Maroc; crous |
| `ma-bac-to-de` | foundation | 1 (`manual_check`) | `de-uni-assist`, `de-uni-assist-vpd`, `de-university-direct` | 1 | (record `sources`) |
| `ma-bac-to-nl` | check | 1 (`manual_check`) | `nl-studielink` | 0 | |
| `ma-bac-to-hu` | check | 2 (`manual_check`) | `hu-university-direct`, `hu-stipendium-hungaricum` | 0 | |
| `ma-bac-to-it` | check | 3 (`manual_check`) | `it-universitaly`, `it-university-direct` | 0 | |
| `ma-bac-to-es` | check | 4 (`manual_check`) | `es-unedasiss`, `es-preinscripcion-regional` | 0 | |

All six exist with a source and channels. FR is `direct` with **zero** structured conditions (its note says "each programme sets its own conditions"), so FR eligibility is entirely ⚠️. Morocco/Bac is the only origin/credential in the data (`data/admission-routes/*` all MA/`ma-bac`; one credential type, one grading scale) — the schema is origin-agnostic, but no second origin exists.

---

## 3. Sample source verification (30 programmes)

**Reproducible rule** (`scripts/audit/t6-sample.ts`): per destination, programmes sorted by slug; take ranks `ceil(k·N/5)` for k = 1…5 (1-indexed) → 5 per country × 6 = 30. Each `officialUrl`/`source_url` was fetched live (29 by `curl`, 6 first by `webfetch`) and compared on institution name, programme name, tuition, teaching language and deadlines.

| # | country | programme slug | verdict | evidence (verbatim where quoted) |
|---|---|---|---|---|
| 1 | FR | `fr-i-u-t-de-la-reunion-9741180p-but-genie-civil-construction-dur-11952` | CONFIRMED (scope note) | fiche: "I.U.T de la Réunion (Saint-Pierre - 974) BUT - Génie civil - Construction durable"; fiche tuition "Par année **178 euros**". Record tuition **2902 €/an** is sourced to `page-3` = Campus France Maroc ("**2 902** … frais d'inscription différenciés"), not to the fiche. Named/tuition source both trace; the fiche disagrees (differentiated vs national rate). |
| 2 | FR | `fr-i-u-t-de-velizy-antenne-de-rambouillet-0782118d-but-genie-chimique-genie-des-pro-10016` | CONFIRMED | fiche name matches; "Frais de scolarité 178 euros"; "Niveau de français requis … B2". |
| 3 | FR | `fr-iut-de-besancon-antenne-de-dole-0391244r-but-science-des-donnees-39197` | CONFIRMED | fiche "Frais de scolarité 178 euros"; institution text names "Université Marie et Louis Pasteur" (parent of the Dole antenne). |
| 4 | FR | `fr-universite-de-lorraine-faculte-de-droit-0572536x-licence-economie-43106` | CONFIRMED | fiche institution name matches exactly; "Frais de scolarité 178 euros / 118 euros"; B2. |
| 5 | FR | `fr-universite-toulouse-iii-universite-toulo-0313218e-licence-mecanique-4187` | CONFIRMED | fiche "Licence - Portail Mécanique"; "Frais de scolarité 178 euros"; "Université Toulouse III Paul Sabatier". |
| 6 | DE | `de-hochschule-fresenius-hrk271-biomedical-sciences-bsc-daad11104` | CONFIRMED | DAAD page: teaching language "English"; non-EU tuition "**6,120 EUR**" per semester = record `612000 EUR/semester`; institution "Hochschule Fresenius". |
| 7 | DE | `de-hochschule-heilbronn-technik-wirtschaft-hrk125-mechanical-engineering-daad11005` | CONFIRMED | DAAD non-EU "**1,500 EUR**" = record; page states German required + English electives = record `[de, en]`. |
| 8 | DE | `de-hochschule-trier-...-sustainable-business-and-daad9857` | CONFIRMED | Trier programme page: "**Fees: No tuition fee (semester fee only)**" and "Language of instruction: English" = record `0 EUR/year`, `[en]`. (DAAD page's 380 € is the semester contribution, 1200 € living cost — not tuition.) |
| 9 | DE | `de-technische-hochschule-mannheim-hrk177-international-engineerin-daad10335` | CONFIRMED (missing fact) | page: "International Engineering", "English", "deadline: **15 November 2026**". Record has `intakes: null` — a gap, not an error. |
| 10 | DE | `de-whu-otto-beisheim-...-bachelor-in-internationa-daad4099` | CONFIRMED | record tuition cites WHU fees page: "tuition fees are **€9,300 per semester**" = record `930000 EUR/semester`. (The DAAD listing shows 9,100 €, but it is not the tuition source.) |
| 11 | NL | `nl-christelijke-hogeschool-windesheim-01vu-ict-1001o2665` | CONFIRMED | page: "ICT in Zwolle", "**4 jaar**", "start in september en februari" = record start 2027-09-06. |
| 12 | NL | `nl-hanzehogeschool-groningen-25be-mondzorgkunde-1001o4069` | CONFIRMED | page "Mondzorgkunde"; "**Nederlands**" = record `[nl]`. |
| 13 | NL | `nl-hogeschool-rotterdam-22oj-opleiding-tot-fysiothera-1001o4047` | **SOURCE-CHANGED** | `officialUrl` is a **2020-2021 institution-wide "hogeschoolgids" PDF**, not a programme page (`hogeschoolgids-bacheloropleidingen-ivg-2020-2021.pdf`, HTTP 200, 2.9 MB). Cannot confirm tuition/language/dates; record is all-null. |
| 14 | NL | `nl-rijksuniversiteit-groningen-21pc-geneeskunde-1001o5904` | CONFIRMED | page: "Medicine", "**Dutch**", "non-EU/EEA studenten **15 januari 2027**", start "01 september 2027" = record. |
| 15 | NL | `nl-wageningen-university-21pi-voeding-en-gezondheid-1001o6124` | CONFIRMED | page "Voeding en Gezondheid", "Wageningen", "**Nederlands**" = record `[nl]`. |
| 16 | HU | `hu-eotvos-jozsef-college-baja-business-administration-sf215` | CONFIRMED (name note) | page: "Business and Management (BA)", "LANGUAGE English", institution "Eötvös József Főiskola". Record name is "Business Administration and Management" (title mismatch only). |
| 17 | HU | `hu-obuda-university-budapest-mechatronical-engineerin-sf546` | CONFIRMED | Study Finder page: Obuda, English = record `[en]`. |
| 18 | HU | `hu-university-of-debrecen-debrecen-electrical-engineering-sf146` | CONFIRMED | page: "**fee for this program is 7,000 USD/Year**" = record `700000 USD/year`; "English". |
| 19 | HU | `hu-university-of-pannonia-nagykanizsa-water-operation-engineer-sf582` | CONFIRMED | page: "Tuition Fee: 1,500 EUR semester … **1,750 EUR semester**" = record `175000 EUR/semester` (higher, non-EU line). |
| 20 | HU | `hu-university-of-szeged-szeged-tourism-and-catering-sf1134` | CONFIRMED | Study Finder page: Szeged, English. |
| 21 | IT | `it-casamassima-lum-g-degennaro-casamassima-economia-ed-organizzazione-aziendale-l18` | CONFIRMED | page "Business Economics and Organization", LUM; record `[en]`. |
| 22 | IT | `it-milano-bocconi-milano-international-economics-and-management-l18` | **SOURCE-CHANGED** | `officialUrl` `…/international-economics-and-management` **301-redirects** to `…/bachelor-science/management`; final page `<title>Management | Bocconi University</title>` and body "**BSc in Management**". The stored programme name no longer matches the page the URL now serves. |
| 23 | IT | `it-padova-padova-information-engineering-l8` | CONFIRMED | page "Information Engineering", Padova, "English"; tuition section present; record deadline 2027-03-07. |
| 24 | IT | `it-roma-luiss-roma-economics-and-business-l33` | CONFIRMED | page "Economics and Business", Luiss, "English". |
| 25 | IT | `it-udine-udine-management-business-analytics-l18` | CONFIRMED | page "Management & Business Analytics"; "English". |
| 26 | ES | `es-universidad-complutense-de-madrid-...-ingenieria-de-dat-2504344` | CONFIRMED | page "Grado en Ingeniería de Datos e Inteligencia Artificial", UCM. Record facts all null. |
| 27 | ES | `es-universidad-de-granada-...-administracion-y-2501817` | CONFIRMED | page "Administración y Dirección de Empresas", Universidad de Granada. |
| 28 | ES | `es-universidad-de-granada-...-ingenieria-electr-2502550` | CONFIRMED | page "Ingeniería Electrónica Industrial", Granada. |
| 29 | ES | `es-universidad-politecnica-de-madrid-...-ingenieria-aeroes-2502400` | CONFIRMED | page "Aeroespacial", Universidad Politécnica de Madrid. |
| 30 | ES | `es-universidad-politecnica-de-madrid-...-ingenieria-mecani-2502150` | CONFIRMED | page "Mecánica", Universidad Politécnica de Madrid. |

**Result: 28 CONFIRMED, 2 SOURCE-CHANGED, 0 CONTRADICTS, 0 NOT-FOUND, 0 UNVERIFIED.** Accuracy on name/institution and on any stored fact = **28/30 (93 %)**. The two non-confirmations are both stale/redirected sources, not wrong values:

- **IT Bocconi** — URL renamed/redirected; the record name and URL must be re-checked (P1-3).
- **NL Hogeschool Rotterdam** — `officialUrl` is a six-year-old generic PDF; needs a real programme page (P1-3).

Context on FR tuition (affects all 5 FR samples): **744 of 755 FR programmes** take their `tuition` from `page-3` = `maroc.campusfrance.org/le-cout-des-etudes-les-bourses` (the differentiated non-EU national rate), while the programme's own Parcoursup fiche states the reduced 178 €/an. The value is source-consistent, but it is a **country-level** figure presented per programme — worth an explicit product/owner decision (P1-4).

---

## 4. Duplicates & orphans / referential integrity

Run over all 1815 records (`scripts/audit/t6-matrix.ts` + a YAML cross-check).

**Clean:**
- Program→institution refs: **0** unknown. Program→application-channel refs: **0** unknown (171 programmes have no channel, which is `null`, not dangling). Program→scholarship refs: **0** unknown.
- Scholarship→institution/field/destination refs: **0** bad.
- Duplicate slugs (programmes, institutions, scholarships, cost profiles): **0**. Slug-convention violations (`^[a-z0-9][a-z0-9-]*$`): **0**.

**Institutions with 0 programmes — verified "17":** FR 8, NL 5, IT 3, HU 1.

- FR: `fr-antenne-institut-universitaire-de-techno-0912287s`, `fr-avignon-universite-0840685n`, `fr-ecole-de-commerce-et-de-management-ecm-0900463p`, `fr-facultes-libres-de-louest-uco-laval-0530959e`, `fr-institution-des-chartreux-0690564n`, `fr-universite-dartois-site-de-bethune-0624055w`, `fr-universite-dorleans-centre-univ-de-chate-0360768p`, `fr-universite-paris-est-creteil-val-de-marn-0772519v`
- NL: `nl-breederode-hogeschool-27wj-rotterdam`, `nl-capabel-hogeschool-30hc-s-gravenhage`, `nl-hz-university-of-applied-sciences-21mi`, `nl-stichting-hogeschool-viaa-22hh`, `nl-zuyd-hogeschool-25jx`
- IT: `it-camerino-camerino`, `it-napoli-vanvitelli-napoli`, `it-parma-parma`
- HU: `hu-university-of-debrecen-nyiregyhaza`

**Likely true duplicate programmes (same institution + same name + same `officialUrl`): 2 pairs**

| pair | fields | note |
|---|---|---|
| `hu-eotvos-jozsef-college-baja-business-administration-sf215` / `...-sf216` | both `business-economics`, city `baja` | identical name and `officialUrl` (`https://ejf.hu/en/business-and-management-ba`). Two Study Finder ids for one programme. |
| `it-siena-siena-biotech-engineering-for-health-l2` / `...-l8` | `allied-health` vs `engineering` | identical name and `officialUrl` (`https://biotech-engineering.unisi.it/…`). The Italy import rule is "a course listed under two classes is one programme" — this pair violates it, and the two records disagree on `field`. |

**Other duplicate-name/officialUrl groups are by design, not errors** (verify, don't "fix"):
- 97 duplicate programme names across institutions/campuses (e.g. "Mechanical Engineering" ×13 at 13 institutions). Expected in a multi-institution catalogue.
- 22 duplicate `officialUrl` values, mostly the NL RIO register (one programme per campus town, e.g. Avans/Fontys/Inholland/De Haagse pages shared across town units) and the IT "english-taught-programmes" listing page shared by two Messina programmes — different programmes that legitimately share a listing URL.
- 27 duplicate institution names and 62 duplicate/empty websites: campus units of one university (`…-breda` / `…-s-hertogenbosch`) and the **119 institutions with `website: null`** (of 499).

**Control-character defect (1 file):** `data/programs/nl-universiteit-van-amsterdam-21pk-biomedische-wetenschappe-1001o6206.yaml` contains **21 `0x7F` (DEL) bytes** (three runs of seven) inside the summary text `"Biomedische Wetenschappen (Biomedical Science\x7f\x7f\x7f\x7f\x7f\x7f\x7f)"` (offsets at line 10/13/16). It passes Zod (`data:check` is green) but will render as garbage in the UI. It is the only `data/**` file with a control byte.

---

## 5. Coverage reports & staging

### `docs/reports/2026-10-10` (point-in-time snapshot)

- Two files: `coverage-by-institution-2026-10-10.md` (per-institution + "Programmes with missing facts") and `coverage-by-programme-2026-10-10.csv` (1127 lines = 1126 programmes).
- **Pre-Spain:** sections are `DE, FR, HU, IT, NL` only — there is no `## ES` section, consistent with Spain landing 2026-10-13.
- Per-country programme counts in the report's CSV: **DE 147, FR 755, HU 114, IT 55, NL 55 = 1126**. Today: DE 150, FR 755, HU 132, IT 65, NL 125, ES 15 = **1242** (Δ: DE +3, FR 0, HU +18, IT +10, NL +70, ES +15). The report is a fair snapshot of 2026-10-10 but is now stale for every country except FR.
- **Spot-checks (report vs today):**
  1. FR programmes: report 755 = today 755 ✓.
  2. `Fachhochschule Aachen` (`…-hrk2-julich`): report 4 programmes = today 4 ✓.
  3. `Hochschule Osnabrück` (`de-hochschule-osnabruck-hrk214`): report "4 programmes, tuition 3" — today **tuition 4/4** (the missing tuition was filled after 2026-10-10). Healthy progress; the report is not a live claim.
  4. No ES section = pre-Spain ✓ (see above).
  5. Report grand total 1126 vs 1242 today ✓ (growth is NL/HU/IT/DE/ES).

### `data-staging/` (read-only; exists only in the main checkout — the audit worktree has none)

- 7473 files. Top level: `AUDIT.csv`, `AUDIT-SAMPLE.md`, `PROMOTED.csv`, `REVIEW.csv` + directories `bakeoff` (325), `gaps` (19), `health` (5), `institutions` (378), `programs` (1295), `parked-numbeo` (20), `proposals` (140; `proposals/programs`), `proposals-read` (5286), `proposals-scholarship` (1: `nl-scholarship.json`), `cost-profiles` (0), `scholarships` (0).
- `REVIEW.csv`: **1378 rows = 998 programmes + 380 institutions; 1376 unapproved, 2 approved.** `AUDIT.csv`: 170 rows (62 `ok`, 108 blank/pending). `PROMOTED.csv`: 168 promoted records.
- **"~801 unverified candidates" is not reproducible at this commit.** The closest current figures are 1378 review rows (1376 unapproved) and 1295 staged programme files. The 801 figure likely predates the October HU/IT/NL/ES imports; the audit records the live numbers instead.
- Staged records are the review queue (gitignored, not read by `data:check`/build); `parked-numbeo/` (20 profiles) stays parked per the README (Numbeo blocked us, never promoted). `proposals-scholarship/nl-scholarship.json` is a not-yet-promoted proposal duplicating the promoted `nl-scholarship` (no action needed in an audit).

---

## 6. Scholarships, costs, Spain

### Scholarships — 21 records; counts corrected

| Metric | Task's assumed state | Verified |
|---|---|---|
| total | 21 | **21** ✓ |
| with a `deadline` | 0 | **0** ✓ |
| with an `amount` | 20/21 without → 1 with | **3 with** (18 without) |
| with `requirements.rules` | 0 | **0** ✓ |
| with any non-`partial` coverage | — | **0** (all `partial`) |

The three with an amount: `deutschlandstipendium` (€300/month), `nl-scholarship` (€5,000 once), `nl-scholarship-the-hague-uas` (€5,000 once). All three amounts are `info_kind: official` with a source. Destinations: DE 1, FR 1, NL 3, HU 1, IT 15; **ES 0, and no cross-cutting scholarship** beyond the national ones. Provenance is present on all 21 (every fact names a `sources` key; `data:check` is green). No unknown institution/field refs (§4). The gap is `deadline` (0) and `requirements.rules` (0) — scholarships cannot drive a checklist date or a structured eligibility rule.

### Cost profiles — 3 records, not 2+1 in the sense assumed

| slug | country | city | lines present |
|---|---|---|---|
| `fr-official` | FR | null | housing (estimate), food (estimate), transport (estimate), `application_visa` (official), `setup` (official) |
| `fr-paris-official` | FR | paris | housing (estimate), transport (estimate) |
| `hu-official` | HU | null | `insurance` (estimate) |

- **FR×2 + HU confirmed.** No cost profile for **DE, NL, IT, ES**.
- Fee-line volatile/2026 compliance: correct. `application_visa`/`setup`/`insurance` are `volatileFact` in `src/data-schema/records/cost-profile.ts`; `fr-official`'s fees cite Service-Public and the CVEC 2026-2027 figure (105 €); `hu-official` cites the NAV 2026 contribution (12,300 HUF). Housing/food/transport are stable estimates with a `basis` quoting a 2026-updated Campus France/Nav page and `last_verified_at` 2026-10-07. No pre-2026 figure stored.
- Numbeo fallback: `src/lib/numbeo-links.ts` maps **DE, FR, NL, IT, HU, ES** (country pages for all six; 23 city pages only for DE/FR/HU/IT/NL). `NumbeoLink` renders only when a housing/food/transport line is `missing` — i.e. effectively **all DE, NL, IT and ES programme pages**, plus FR pages whose city has no stored profile. The link is server-only and stores no Numbeo figure; compliant with the "2026-only / Numbeo is a link, not data" rule.

### Spain skeleton — 15 programmes, 3 institutions, no facts

- 15 programme files (`data/programs/es-*`), 3 institutions (`es-universidad-complutense-de-madrid`, `es-universidad-de-granada`, `es-universidad-politecnica-de-madrid`, each `type: public`, `website: null`, source `ruct`).
- Fields: CS 6, Engineering 6, Business-Economics 3 (all three Release 1 fields).
- **Every fact is null:** tuition 0/15, teaching language 0/15 (not English-tagged), intakes 0/15, application channel 0/15, documents 0/15; only `durationYears` 10/15 and `name`/`officialUrl` are populated. Requirements 0/15.
- No Spain scholarship, no Spain cost profile, no Spain institution website.
- **What a Spain data wave must add** (all are facts, no code): (1) teaching language per programme, English-taught first; (2) tuition for non-EU (the "tasas" vary by comunidad/grade, needs an official page per programme or a regional decree); (3) intakes/deadlines (`preinscripción` windows per comunidad — Cataluña/Comunidad de Madrid differ; a `recurringDeadline` where no year is stated); (4) `applicationChannel` per institution (`es-unedasiss` vs `es-preinscripcion-regional` — already modelled, 2 channels exist); (5) documents; (6) requirement rules (at minimum a `language_proficiency` rule, currently absent, so ES matches are always ⚠️); (7) institution `website`; (8) at least one Spain scholarship and an ES cost profile or an explicit Numbeo-only decision.

---

## 7. Prioritised data-work list

Owner-decision rows are flagged; everything else is a data/research task.

### P0 — blocks the core promise (realistic ✅/❌ and trustworthy costs)

| # | Item | Destination / field | Effort | Owner flag |
|---|---|---|---|---|
| P0-1 | **No programme can reach ✅.** All 1242 are `requirements.coverage: partial`; there are zero `credential_type_in`/`overall_grade_min`/`subject_grade_min` rules and the six routes are `manual_check` only, so `aggregateMatchStatus` returns ⚠️ for every programme. Make at least the high-traffic programmes `complete` with real rules, and give routes structured credential/grade conditions. | all / `requirements`, `admission-routes` | XL (research per source) | **Owner decision:** scope of "complete" per destination |
| P0-2 | **FR tuition is a national figure, not a programme fee.** 744/755 FR programmes cite `maroc.campusfrance.org` (differentiated non-EU rate) while each fiche states 178 €. Decide whether to (a) keep the differentiated rate with an explicit label/basis, or (b) record the fiche fee. | FR / `tuition` | M | **Owner decision** (product semantics) |
| P0-3 | **HU has almost no dates.** intakes 2 %, deadlines 1 % (1 recurring). Hungarian programmes are unusable for planning without application windows. | HU / `intakes` | L | |

### P1 — correctness / trust defects found in the sample

| # | Item | Destination / field | Effort | Owner flag |
|---|---|---|---|---|
| P1-1 | Delete/fix the **DEL control bytes** in `nl-universiteit-van-amsterdam-21pk-biomedische-wetenschappe-1001o6206.yaml`. | NL / text | XS | |
| P1-2 | Resolve the **two true duplicate pairs** (Eötvös József sf215/sf216; Siena biotech L-2/L-8, which also disagree on `field`). | HU, IT / dedup | S | |
| P1-3 | **Stale/redirected sources:** Bocconi `international-economics-and-management` now redirects to "BSc in Management" (re-verify name/URL); Hogeschool Rotterdam's `officialUrl` is a 2020-2021 generic PDF (replace with the programme page). | IT, NL / `officialUrl` | S | |
| P1-4 | **32 unused-source warnings** — clean or use the declared keys (15 DE, 7 HU, 10 IT). Trivial, keeps `data:check` signal clean. | DE, HU, IT / `sources` | S | |
| P1-5 | **Missing `en` summary** on `hu-university-of-debrecen-debrecen-electrical-engineering-sf146`. | HU / i18n | XS | |
| P1-6 | **NL completeness is thin on the facts that matter**: tuition 40 %, teaching language 63 % (46 null), documents 18 %, intakes 26 %. The RIO import gives names/ECTS only. | NL / tuition, language, documents, intakes | L | |
| P1-7 | **IT is thin on deadlines** (29 %) and has one all-field-`partial` set with no structured rules. | IT / `intakes`, `requirements` | M | |

### P2 — quality, scope, housekeeping

| # | Item | Destination / field | Effort | Owner flag |
|---|---|---|---|---|
| P2-1 | **Field scope drift:** NL/HU/IT/DE carry medicine/pharmacy/allied-health outside the declared CS/Eng/Business scope. Confirm in/out of scope. | NL, HU, IT, DE / `field` | M | **Owner decision** |
| P2-2 | **17 institutions with 0 programmes** — promote a programme or mark/remove the institution (avoids empty pages/compare entries). | FR 8, NL 5, IT 3, HU 1 | M | |
| P2-3 | **119 institutions with `website: null`** — research the homepage (bands flagged in `REVIEW.csv`). | all | L | |
| P2-4 | **HU application channel 33 %** and **HU tuition 52 %**; DE application channel 84 %. Fill from the programme pages. | HU, DE / `applicationChannel`, `tuition` | M | |
| P2-5 | **Scholarships:** 0 deadlines, 0 requirement rules. Add the per-institution deadlines and at least language/nationality rules so scholarships can feed the checklist. | all / `scholarships` | M | |
| P2-6 | **Spain wave** (see §6): language, tuition, intakes, channel, documents, rules, website, scholarship, cost profile. | ES / all | XL | |
| P2-7 | **Cost profiles** for DE/NL/IT/ES or an explicit "Numbeo-link only" decision; fill `fr-paris-official` (food, fees) and HU (housing/food/transport). | DE, NL, IT, ES, FR, HU / `cost-profiles` | L | **Owner decision** (Numbeo-only is acceptable) |
| P2-8 | **`ar` missing 587 nodes** and 0 reviewed — the native review (A5/C1) is the gate; complete the missing nodes first. | all / i18n | L | **Owner action** (native review) |

---

## 8. Verified sound

The following are **confirmed correct** at `f0cc00e` (do not "fix" them):

- `data:check` and `data:check --strict` both **exit 0**: 1815 records, 0 errors, 0 aging, 0 stale.
- Referential integrity is clean: 0 dangling institution, application-channel or scholarship references; 0 unknown scholarship→institution/field refs.
- 0 duplicate slugs; 0 slug-convention violations; no `TODO`/`FIXME`/`TODO_read_source` markers in `data/**`.
- Scholarship provenance complete (all 21); 3 official amounts; no rule-schema violation.
- Cost-profile fee lines are correctly `volatileFact` and store only 2026 figures; the Numbeo fallback stores no figure (server-only link).
- Sample accuracy **28/30 fully confirmed** against live sources; the 2 exceptions are stale sources, not wrong values.
- The `docs/reports/2026-10-10` snapshot matches its pre-Spain state (FR unchanged, no ES section).

---

## Appendix — commands and scripts (all read-only)

```
# validators (Windows cmd wrapper), all exit 0
pnpm data:check
pnpm data:check --strict
pnpm data:coverage

# read-only audit scripts (untracked; under scripts/audit/)
pnpm exec tsx scripts/audit/t6-matrix.ts   # matrix, dup/orphan, scholarship/cost/route/i18n report
pnpm exec tsx scripts/audit/t6-sample.ts   # deterministic 30-programme sample (ranks ceil(kN/5))

# source verification: webfetch (6 pages) + curl (24 pages), each officialUrl/source_url fetched once
# data-staging counts: find/ls in the main checkout (read-only; not present in the audit worktree)
```

Scratch scripts are `scripts/audit/t6-matrix.ts` and `scripts/audit/t6-sample.ts` (not committed). No `data/**` file was modified.
