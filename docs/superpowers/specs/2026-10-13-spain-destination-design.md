# Spain as a Jisr destination (Spec 2) — design

**Date:** 2026-10-13
**Status:** Approved (design) by the owner in conversation; this file is the written spec, pending the owner's read before `writing-plans`.
**Branch:** `data/es` (worktree `.worktrees/es`, off `origin/main` 5cf8d615).
**Precedent:** `docs/superpowers/specs/2026-10-04-italy-hungary-design.md` (adding a destination), `2026-10-08-italy-completeness-design.md` (register importer + filling facts). The health-fields spec already names this work "Spec 2 — Spain as a new destination".

## Goal

Add **Spain (ES)** as Jisr's 6th destination, inside the existing model (`level: bachelor`; eligibility `(origin credential country, credential type) → (destination, level)` then program rules), with the same trust model as FR/DE/NL/HU/IT: official https sources only, a model only proposes and code verifies verbatim quotes, unknown stays `null` → ⚠️, every fact carries `source_url` + `info_kind` + `last_verified_at`, nothing enters `data/` except through the audit sample and `data:promote`.

Deliverables: `data/countries/ES.yaml`; ES institutions; ES Grado programmes; the route `ma-bac-to-es.yaml`; ES application channels; ES cost profiles where a 2026 official city figure exists plus the Numbeo link where none does; the code touchpoints and tests that a new destination requires; an ADR; updated coverage.

## Owner decisions (2026-10-13)

1. **Teaching language:** both, **phased** — English-taught Grado first (wave 1), Spanish-taught (wave 2). Spanish-taught is the norm in Spain; English-taught Grados are rare.
2. **Fields:** the **original 3** only (Computer Science, Engineering, Business-Economics), Release-1 parity. Health fields are out of scope (separate spec).
3. **Institutions:** **all public universities, register-wide** in the 3 fields. Private institutions are out of scope.
4. **Sourcing:** wave 1 discovered from **SEPIE**'s official English-taught Bachelor table (+ curated cross-check), no importer; wave 2 uses a **thin new RUCT importer** (per-university identity/list export + per-degree HTML detail) as the canonical backbone, then the existing enrichment pipeline. Rationale: SEPIE is a clean official English list; RUCT is official but an HTML/session scrape with no language field, so it belongs with the Spanish mass.
5. **Route outcome:** `check` with `manual_check` conditions (a Moroccan Bac has no automatic direct access; homologación + UNEDasiss credencial/PCE + per-programme nota de corte, and each region/university decides).
6. **Living costs:** **Numbeo link** for ES + **narrow official 2026 city lines** where a clean one exists (no official 2026 national living-cost figure exists).
7. **Scope record:** a **short new ADR (0012)** because adding a destination is a product-scope change and has real code touchpoints, refining ADR 0003's "growth = data" for destinations.

## Evidence base (checked 2026-10-13; reused by the plan — each value still needs a fresh code-verified quote at staging)

### The register (identity backbone)
- **RUCT** — Registro de Universidades, Centros y Títulos, `https://www.educacion.gob.es/ruct/home` (Java/Tomcat app, `JSESSIONID`, `ISO-8859-1`). Sections: universities, centres, títulos. URL patterns: search `consultaestudios?actual=estudios`; per-degree `estudio.action?codigoCiclo=SC&codigoTipo=G&CodigoEstudio=<code>&actual=estudios`; university `universidad.action?actual=universidades&codigoUniversidad=<id>`; university titles `listaestudiosuniversidad.action?codigoUniversidad=<id>&actual=universidades` (10/page); centre titles `listaestudioscentro.action?actual=centros&codigoCentro=<c>&codigoUniversidad=<u>`.
- A degree record carries: código del título; nivel académico (Grado RD 1393/2007 | RD 822/2021) + MECES; **Rama** (Artes y Humanidades / Ciencias / Ciencias de la Salud / Ciencias Sociales y Jurídicas / **Ingeniería y Arquitectura**); **Campo de estudio** (ISCED-aligned); credits (formación básica, obligatorios, optativos, prácticas, TFG, totales); BOE links; CCAA autorizantes; centros. **No teaching-language field and no academic-year field.**
- **Machine-readable:** no bulk file and no public API. Each title list has an **Excel export** (`Opciones de exportación: Excel`) that works when the request follows the list page's session (`;jsessionid=…`, DisplayTag `d-…-e=…`); its columns are only **Código, Título, Nivel académico, Estado, Detalle**. Register-wide facts (rama/campo/créditos) exist only on the per-degree HTML page. National scale: ~3,200 Grados, a few hundred in our 3 fields.
- **Terms:** RUCT is a public administrative register; the portal Aviso Legal requires citing the source or prior authorisation. No robots.txt is published on any relevant host. Be polite by default.
- **QEDU** (`https://siiu.universidades.gob.es/QEDU`, `https://www.ciencia.gob.es/qedu.html`) is RUCT+SIIU-derived and adds **"Idioma extranjero"**, notas de corte, places, plus a client-side CSV/XLSX export; it is explicitly *non-official guidance* ("no tiene validez oficial"). It is a lead, never a fact source for `official`.
- **SEPIE** (Ministry) publishes **"Bachelor's degrees taught in English in Spain"**: `https://sepie.erasmusplus.gob.es/socrates/internacionalizacionmasters/mantenimientogrados.do` (University · Degree · Field · % in English · English Level · ECTS · € max/ECTS · Public/Private · Faculty/School · Region · Website), and `http://sepie.es/aplicaciones-web/i18n/html/tablagrados.html`.
- `datos.gob.es` hosts **no national RUCT dataset**, only per-university snippets (e.g. UAL JSON API, UAM CSV/XLSX).

### The admission route
- **No direct access.** A Moroccan Baccalauréat is a non-EU system; Morocco is **absent from every official EU/reciprocity list** (UNEDasiss `publico_destino`; RD 534/2024 art. 6.a; the UGR reciprocity list) — this is an **inference from absence, flagged** and worth a one-line confirmation with the Ministry/UNEDasiss before publishing the route as a hard claim.
- **Homologación** to the Spanish *Título de Bachiller* by the Ministry is the mandatory first step: `https://www.educacionfpydeportes.gob.es/mc/convalidacion-homologacion/convalidacion-no-universitaria/ensenanzas/homologacion-graduado.html` (ficha `…/05/051270/ficha/051270.html`). Fee 49,76 € (Ministry embassy page).
- **UNEDasiss** evaluates the record and runs the **PCE** (Pruebas de Competencias Específicas); non-EU applicants take the **Acreditación UNEDasiss with Calificación de Acceso + PCE** (≥4 subjects recommended). `https://unedasiss.uned.es/home`, `/faqs` (Q4 "HOMOLOGACIÓN … trámite obligatorio"; Q11 "UNEDasiss no homologa"), `/publico_destino` ("Otros países fuera de la UE"), `https://unedasiss.uned.es/paso_6` ("La solicitud de admisión debes realizarla en la universidad o universidades de destino"; 2026 foreign-system deadline 7 July).
- **Nota de admisión / nota de corte:** admission mark = 60 % record + 40 % PCE (`Calificación para la admisión = (0,2 × NMB + 4) + 0,1 × M1…M4`, max 10, university may add up to 4). **Nota de corte** = the admission mark of the last applicant admitted to that specific degree at that specific university; varies every year and per degree; published per region/university (UGR glossary; Madrid Libro de normas 2026-27). **No national cut-off list exists.**
- **Legal basis:** Real Decreto 534/2024 (`BOE-A-2024-11858`), arts. 6, 23.3, 25 (universities may set "cupos de reserva"); Orden EFD/550/2025.
- **Application channel = regional preinscripción**, no national portal. Madrid **Distrito Único** (`https://www.comunidad.madrid/educacion/solicitud-plaza-universitaria-preinscripcion`, one online application across the 6 public universities; foreign-system SEEx extended window). Cataluña **Portal d'Accés / Accesnet** (`https://universitats.gencat.cat/es/preinscripcions/acces-universitat-estudis-estrangers/`). Andalucía **Distrito Único Andaluz** with a dedicated **"Fase de Extranjeros"** (`https://www.juntadeandalucia.es/boja/2026/65/33`). BOE only fixes minimum deadlines: Resolución 23 abril 2026 (`BOE-A-2026-9696`) — preinscripción open at least until 22 June 2026, foreign-system students until 7 July 2026.

### Costs (2026-dated official figures the plan can use)
- **Tuition (per-programme, `official` only).** Regional 2026/27 figures exist, but the non-EU rate depends on region and **residence status** (resident vs non-resident / *estancia por estudios*): Cataluña `Decret 96/2026` (17,69 €/credit general; non-EU set by each Consell Social — UPC 30 €/credit); Andalucía Decreto 98/2023 prorrogado (12,62 €/credit 1st; some universities up to 100 % real cost); Madrid Decreto 43/2022 applied 2026/27 (non-resident non-EU = 4th-enrolment price 113,71–136,44 €/credit → 6 822,60–8 186,40 €/60 ECTS; UC3M/UCM/URJC/UAH pages dated 2026/27); Aragón Decreto 24.06.2026; UPV 2× for non-resident foreigners; UNED Orden CNU/573/2026. **A Grado tuition value therefore needs a residence-status qualifier and must be read per university.**
- **Living costs.** **No official 2026 national figure** (INE EPF is 2025 data; CJE Observatorio 2025 data; EUROSTUDENT is private and 2021-24). Genuine 2026 official *city* figures exist: Madrid **Abono Joven 10 €/month** (comunidad.madrid, upd. 10.03.2026; BOCM 29.12.2025), Barcelona **T-jove 45,50 €/90 days** (ATM, 2026). Official 2026/27 halls of residence exist but are per-institution, not city-level.
- **Visa / proof of funds.** 100 % IPREM per month (75 %/50 % for family), RD 1155/2024 art. 35.h, amended by RD 316/2026 (April 2026). IPREM = **600 €/month** (SEPE; the 2026 value, legally the prorogated 2023 PGE value). This is a **proof-of-funds line** (a separate owner task, `docs/superpowers/research/2026-10-09-data-gap-research.md`), **not** a cost — out of scope here.
- **Scholarships.** No 2026 official Bachelor-level scheme targets a non-EU entrant: the *becas generales* are keyed to the Spanish tax-resident system; MAEC-AECID explicitly covers Morocco but is **Master-level and public-employee-only**. **No ES scholarship record in this spec.**

## Scope

### Wave 1 — English-taught Grado (first; proves ES end-to-end)
Discovery from the **SEPIE** English-taught Bachelor table plus a curated cross-check; candidates staged at **register-listing tier** (name, institution, city, field, level, and the register/programme link as `officialUrl` once a human supplies it), then enriched by reading the programme's own page for teaching language, tuition, deadlines, documents and requirement rules. Delivers the full guest journey in ES: country, route, channels, program page, matches, save, plan.

### Wave 2 — Spanish-taught Grado (the mass)
Build the **thin RUCT importer**; run it for **all public universities** in the 3 fields; then enrich through the existing pipeline with a Spanish reader country note and Spanish language-proficiency rules **only where a university page states a required level** (never invented).

### Out of scope (documented, not forgotten)
Private institutions; health fields; the visa "proof of funds" line; ES scholarships; Italian-style per-region visa calendars; any change to `level` (stays `z.literal("bachelor")`).

## Data model & files

- `data/countries/ES.yaml` — `code: ES`, fr/en/ar name (Espagne / Spain / إسبانيا), `currency: EUR`.
- `data/institutions/es-*.yaml` — public universities from RUCT: `type: public`, `website` a candidate confirmed on the university's own https page, `sources` citing RUCT and the university page.
- `data/programs/es-*.yaml` — Grado records: `level: bachelor`, `field` from RUCT **rama/campo de estudio** via a code table (never the model). `officialUrl` is supplied by a human from the university's own page; a RUCT-derived record starts with `officialUrl: null` (RUCT publishes no programme page) and cannot be promoted until it is supplied — exactly as the Italy MUR importer behaves. Every unread fact is `null` with the placeholder `info_kind` until then.
- `data/admission-routes/ma-bac-to-es.yaml` — `origin: MA`, `credentialType: ma-bac`, `destination: ES`, `level: bachelor`, `outcome: check`; `manual_check` conditions: (1) homologación to Título de Bachiller mandatory; (2) UNEDasiss credencial + PCE; (3) per-programme nota de corte; (4) visa/proof of funds. `note` states there is no direct access and that the region/university decides. `applicationChannels: [es-unedasiss, es-preinscripcion-regional]`. Sources: RD 534/2024, the Ministry homologación pages, UNEDasiss.
- `data/application-channels/es-unedasiss.yaml` and `data/application-channels/es-preinscripcion-regional.yaml`. `es-unedasiss` is the credential/accreditation step; `es-preinscripcion-regional` is a single entry-point channel describing the regional preinscripción systems (Madrid Distrito Único, Cataluña Accesnet, Andalucía Distrito Único), because Spain has **no national portal**. Whether the region-specific systems warrant their own channel records (as opposed to one entry-point record) is a plan decision, not fixed here.
- `data/cost-profiles/es-<city>-official.yaml` — **only** where a clean official **2026** city line exists (Madrid/Barcelona transport today); a city line needs a verbatim quote, `per`, currency beside the number, and a 2026 year.
- `src/lib/numbeo-links.ts` — add `ES: "Spain"` to the country names and only city pages that are fetched and confirmed to exist (`<h1>Cost of Living in <City>` + breadcrumb country), per the existing rule.
- No schema change; no new credential type (uses `ma-bac`).

## RUCT importer (wave 2)

New `scripts/import/sources/ruct.ts` exporting `importSpain(): Promise<StagedRecord[]>`, registered in `scripts/import/run.ts` (`SOURCES`) and `scripts/import/owners.ts` (`OWNS`), with a `SummarySource` member in `scripts/import/summaries.ts` and a field classifier (`fieldOfCampo`/`fieldOfRama`, mirroring `fieldOfClass` in `sources/mur.ts`).

Flow: fetch the RUCT university list → for each **public** university fetch its title list (following the session to the Excel export where useful) → keep `Grado` whose rama/campo maps to the 3 fields → fetch each degree's `estudio.action` page for rama/campo/credits/centros. Build institution candidates with `stagedInstitution` (as MUR does) and programme records whose only filled facts are the register ones; **everything else stays `info_kind: TODO_read_source` with `officialUrl: null`** (RUCT has no programme page), so `data:promote` blocks until a human supplies the university page and reads the facts.

Constraints: decode `ISO-8859-1`; polite rate-limit, one request at a time; stop on the first HTTP 403/429 or on a changed shape; a count guard (implausible result count → stop). The sandbox's Node `fetch` may not reach `educacion.gob.es`; use the curl-backed shim (`NODE_OPTIONS="--import /tmp/opencode/curl-fetch.mjs"`). Tests mirror `tests/scripts/import/mur.test.ts` / `rio.test.ts` over the pure parser/builder exports, driven by inline fixtures (no network), asserting slugs, `sourceId`s, the placeholder `info_kind`, and the review-note wording.

## Wave 1 (SEPIE/curated) & enrichment

SEPIE table → candidate list → register-listing staged records → `data:pages` (or a curated page registry, as Italy did with `it-pages`) → `data:read` (reader + checker) → `data:evidence restage/verify --enrich` → `data:audit` → `data:promote`. Teaching language stays unknown until the **programme's own page** states it; SEPIE/QEDU are leads and any fact they supply alone is `guidance`, not `official`. Deadlines follow ADR 0009 (year → dated; day+month, no year → `recurringDeadline`; every deadline needs a quote naming international/non-EU applicants).

## Code touchpoints (this is why an ADR is needed — it is not purely data-drawn)

| File | Change |
|---|---|
| `src/lib/numbeo-links.ts` (+ `tests/lib/numbeo-links.test.ts`) | add ES country name; verified ES city pages |
| `scripts/import/national.ts` | add `"ES"` to the country selector enum (or ES national registries cannot validate) |
| `scripts/import/costs.ts` | add `ES: "Spain"` to `COUNTRY_NAMES` |
| `scripts/import/sources/ruct.ts` (new) + `run.ts` (`SOURCES`) + `owners.ts` (`OWNS`) + `summaries.ts` | the ES importer |
| `scripts/import/reader.ts` (`COUNTRY_NOTES`), `evidence.ts` (`CHANNEL_WORDS`), `checker.ts` (`CHANNEL_TEXT`), `topics.ts`/`discover.ts` (search words) | ES guidance |
| `messages/{en,fr,ar}.json`, `content/{en,fr,ar}/guides/*.mdx` | prose "five → six destinations" + an ES section |
| `AGENTS.md`, `.claude/CLAUDE.md`, `.claude/rules/reference-data.md` | scope line |
| `tests/scripts/import/costs.test.ts` | the "ES refused" assertion changes once ES is known |

`demo-data` is untouched unless the hero demo is deliberately extended (owner call).

## ADR

New `.claude/docs/decisions/0012-spain-destination.md`: records Spain as the 6th destination, the two-wave language decision, the RUCT importer, the Numbeo-link-only living-costs stance, and the explicit code touchpoints — refining ADR 0003's "growth = data" for destinations (a destination needs data **and** a small set of code touchpoints).

## Risks

- **RUCT is a scrape** (session-bound export, ISO-8859-1, TLS quirk, no API): mitigated by caching, a polite rate-limit, a shape/count guard, and stopping on any block.
- **No official teaching-language field**: English status is a SEPIE lead until the programme page confirms it; expect many Spanish-taught programmes with `teachingLanguages` unknown until read.
- **Non-EU tuition is per-university and residence-status dependent**: many Grado tuition values may stay `null` → ⚠️.
- **Morocco's reciprocity status is inferred from absence**: flag it in the route note; do not publish it as a hard claim without a Ministry/UNEDasiss confirmation.
- **Wave 2 scale**: hundreds of records; the audit sample and batching are set in the plan; nothing is promoted without the owner reading the sample.

## Definition of done

1. `pnpm data:check --strict` exit 0 (0 stale) and `pnpm data:build` OK.
2. All new text in fr/en/ar; every fact traced to an official https URL with `info_kind` + `last_verified_at`.
3. ES visible in the app end-to-end (matches, program page, plan) in **fr and ar**, phone and desktop.
4. `pnpm typecheck`, `pnpm test`, `pnpm lint` green; importer and route have tests.
5. Coverage delta recorded (`pnpm data:coverage` before/after); the pairs of `data/countries`, `admission-routes`, `application-channels` and the new `data/` records committed.
6. ADR 0012 committed; docs scope lines updated.
7. PR titled `data: …` off `data/es` → `main` (never a direct push), then the repo's `reviewer` subagent over the diff.
