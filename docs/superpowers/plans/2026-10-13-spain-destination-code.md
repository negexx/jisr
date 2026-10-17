# Spain destination (Spec 2) — skeleton, code touchpoints and RUCT importer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Spain as a Jisrr destination and build + unit-test the thin RUCT importer, so `pnpm data:import spain` stages Spanish Grado candidates; this plan promotes no ES programme (the data runs are Plan 2).

**Architecture:** Three layers. (1) A data-first skeleton — `data/countries/ES.yaml`, two application channels, the route `ma-bac-to-es.yaml` — validated by `data:check`, no code. (2) A small set of code touchpoints that enumerate destination countries. (3) A new register importer `scripts/import/sources/ruct.ts`, mirroring `scripts/import/sources/mur.ts`: pure parsers/builders unit-tested over captured HTML fixtures, plus one `importSpain()` that fetches and assembles. An ADR records the decision.

**Tech Stack:** TypeScript (strict), Vitest, Zod (`src/data-schema`), `tsx` import scripts, Biome, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-13-spain-destination-design.md` (read it; this plan argues from it).

## Global Constraints

- Official https sources only; **never invent a value**; missing/ambiguous → `null` (shows ⚠️). Every fact carries `source_url` + `info_kind` (`official|estimate|guidance`) + `last_verified_at`.
- **2026 figures only** (`MIN_ESTIMATE_YEAR = 2026`); tuition is `official` only (ADR 0010); a deadline without a year → `recurringDeadline {month, day}` (ADR 0009); a deadline needs a quote naming international/non-EU applicants.
- No `any`, no `@ts-ignore`, no non-null `!`. Named exports; kebab-case files; `PascalCase` components.
- `src/domain` imports nothing from React/Next/`src/db`/`src/lib`/`fs`/network; client-reachable code imports no Zod and nothing from `@/data-schema` except types and `dates`/`staleness`.
- Do not rename slugs. PRs only; never push `main`. Conventional commits (`feat:`/`fix:`/`chore:`/`refactor:`/`docs:`/`test:`), subject ≤ 72 chars, imperative.
- Importer contract: unread facts carry `info_kind: "TODO_read_source"` and the record carries `officialUrl: null` until a human supplies the programme page; source pages are decoded **ISO-8859-15/ISO-8859-1**, fetched politely (one at a time, cached), and the run **stops** on HTTP 403/429 or a changed shape (never works around a block). Reasoning about the codebase: use the codebase-memory graph (`project="jisr"`) first, then Grep/Read.
- Definition of done for this plan: `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm data:check --strict` all green and `pnpm data:build` succeeds.

## Review Focus

Five input classes or failure modes the spec implies and a naive implementation would get wrong — each has a test pinned to the task that owns the code:

1. **A dangling reference or non-official source in the ES YAML** (route channel not declared, country not present) → `data:check` must fail, never silently pass.
2. **An ES city with no verified Numbeo page** → must fall back to the ES country page, never a guessed city URL.
3. **A RUCT page whose shape changed** (missing column/section, an administrative row) → the importer must stop or skip with a clear message, never stage a wrong institution.
4. **An unread fact** → must never be promotable (`officialUrl: null` / `TODO_read_source` blocks `data:promote`).
5. **A Spanish-taught programme** → must not be given a teaching language or a Spanish-level rule the source does not state.

---

### Task 1: ES country, application channels and route (data only)

**Files:**
- Create: `data/countries/ES.yaml`
- Create: `data/application-channels/es-unedasiss.yaml`
- Create: `data/application-channels/es-preinscripcion-regional.yaml`
- Create: `data/admission-routes/ma-bac-to-es.yaml`

**Interfaces:**
- Produces: country code `ES`; channel slugs `es-unedasiss`, `es-preinscripcion-regional`; route slug `ma-bac-to-es` (consumed by later data runs and by `data:check` reference validation).

- [ ] **Step 1: Write `data/countries/ES.yaml`**

```yaml
code: ES
name:
  fr: { text: Espagne, status: reviewed }
  en: { text: Spain, status: reviewed }
  ar: { text: إسبانيا, status: draft }
currency: EUR
```

(French/English names are the natural ones; Arabic stays `draft` until the native review, like every other country file.)

- [ ] **Step 2: Run `pnpm data:check` and confirm green**

Run: `pnpm data:check`
Expected: PASS, no new error. The `ES` country resolves; nothing references it yet.

- [ ] **Step 3: Write the two channel files**

Model them on `data/application-channels/it-universitaly.yaml` (read it first, and the schema `src/data-schema/records/application-channel.ts` for the exact `type` enum). `es-unedasiss`: the existing `type` value that fits (a portal/credential service), `officialUrl` = one UNEDasiss https page, a short trilingual note, `info_kind: official`, `sources` citing UNEDasiss. `es-preinscripcion-regional`: an entry-point channel describing the regional preinscripción systems; `officialUrl` = the UNEDasiss `paso_6` page or the BOE preinscripción resolution, the note says the application is made at the destination university/region, `info_kind: official`.

- [ ] **Step 4: Write `data/admission-routes/ma-bac-to-es.yaml`**

Copy the shape of `data/admission-routes/ma-bac-to-it.yaml`. Fixed values: `origin: MA`, `credentialType: ma-bac`, `destination: ES`, `level: bachelor`, `outcome: check`, `applicationChannels: [es-unedasiss, es-preinscripcion-regional]`, `source: procedures`, `info_kind: official`. Four `manual_check` conditions, each `info_kind: official` with a trilingual `note`: (1) `homologacion-mandatory` → homologación to Título de Bachiller is the mandatory first step (`source: homologacion`); (2) `unedasiss-credencial-and-pce` → UNEDasiss Acreditación with Calificación de Acceso + PCE, ≥4 subjects (`source: unedasiss`); (3) `nota-de-corte` → admission depends on the per-programme nota de corte (`source: admission`); (4) `visa-proof-of-funds` → the student visa requires 100 % IPREM per month (`source: visa`). `sources`: `homologacion` = `https://www.educacionfpydeportes.gob.es/mc/convalidacion-homologacion/convalidacion-no-universitaria/ensenanzas/homologacion-graduado.html`; `unedasiss` = `https://unedasiss.uned.es/faqs`; `admission` = `https://www.boe.es/buscar/act.php?id=BOE-A-2024-11858` (RD 534/2024); `visa` = `https://www.boe.es/buscar/act.php?id=BOE-A-2024-24099` (RD 1155/2024 art. 35.h); all `last_verified_at: 2026-10-13`. The route `note` must state that a Moroccan Bac has **no direct access** and that the region/university decides. **Do not** assert Morocco's non-reciprocity as a hard legal fact — phrase the note as the general rule (the spec flags this inference).

- [ ] **Step 5: Run `pnpm data:check` and confirm green**

Run: `pnpm data:check`
Expected: PASS. Any dangling channel/country reference fails here (Review Focus #1).

- [ ] **Step 6: Commit**

```bash
git add data/countries/ES.yaml data/application-channels/es-unedasiss.yaml data/application-channels/es-preinscripcion-regional.yaml data/admission-routes/ma-bac-to-es.yaml
git commit -m "data: add Spain country, channels and admission route"
```

---

### Task 2: Numbeo link for ES

**Files:**
- Modify: `src/lib/numbeo-links.ts`
- Test: `tests/lib/numbeo-links.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `numbeoLinkFor("ES", city)` returns the ES country page for a city with no verified city page.

- [ ] **Step 1: Read `tests/lib/numbeo-links.test.ts` and extend the country list assertion to include `ES`**

Add `ES` to the `it.each` country list; add one case asserting `numbeoLinkFor("ES", "any-unverified-city")` equals `{ url: "https://www.numbeo.com/cost-of-living/country_result.jsp?country=Spain", kind: "country" }`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/lib/numbeo-links.test.ts`
Expected: FAIL (`numbeoLinkFor("ES", …)` returns `null`).

- [ ] **Step 3: Implement in `src/lib/numbeo-links.ts`**

Add `ES: "Spain"` to `NUMBEO_COUNTRY_NAMES`. Add city entries to `NUMBEO_CITY_PAGES` **only** for cities whose Numbeo page you actually fetch and confirm (h1 `Cost of Living in <City>` + matching breadcrumb), following the file's comment; leave the rest to the country fallback.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run tests/lib/numbeo-links.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/numbeo-links.ts tests/lib/numbeo-links.test.ts
git commit -m "feat: link ES programme pages to Numbeo"
```

---

### Task 3: Add ES to the country enums (`national.ts`, `costs.ts`)

**Files:**
- Modify: `scripts/import/national.ts` (the `country: z.enum([...])` selector)
- Modify: `scripts/import/costs.ts` (`COUNTRY_NAMES`)
- Test: `tests/scripts/import/costs.test.ts`

**Interfaces:**
- Produces: `"ES"` accepted by the national-facts selector; `COUNTRY_NAMES.ES === "Spain"`.

- [ ] **Step 1: Update the failing expectation in `tests/scripts/import/costs.test.ts`**

Find the case that asserts an unknown code `"ES"` is refused (around line 966) and change it so ES is accepted (use a genuinely unknown code such as `"ZZ"` for the refusal case).

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/scripts/import/costs.test.ts`
Expected: FAIL (ES still refused).

- [ ] **Step 3: Implement**

Add `"ES"` to the enum in `scripts/import/national.ts` and `ES: "Spain"` to `COUNTRY_NAMES` in `scripts/import/costs.ts`. ES is EUR, so `currencyOf` and `ACCEPTED_CURRENCY_SYMBOLS` need no change.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run tests/scripts/import/costs.test.ts tests/scripts/import/national.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/import/national.ts scripts/import/costs.ts tests/scripts/import/costs.test.ts
git commit -m "feat: recognise ES as a known destination in the import scripts"
```

---

### Task 4: RUCT fixtures (capture, then parse the university list)

**Files:**
- Create: `tests/scripts/import/fixtures/ruct/universities.html`
- Create: `scripts/import/sources/ruct.ts`
- Test: `tests/scripts/import/ruct.test.ts`

**Interfaces:**
- Produces: `type RuctUniversity = { code: string; name: string }`; `parseRuctUniversities(html: string): RuctUniversity[]`.

- [ ] **Step 1: Capture the fixture**

Run (the env's Node `fetch` may not reach the host; `curl` does — the plan's scripts already ship a curl shim at `/tmp/opencode/curl-fetch.mjs`):

```bash
curl -sS -L --http1.1 -A "Mozilla/5.0 (compatible; JisrDataBot/1.0)" \
  "https://www.educacion.gob.es/ruct/listauniversidades.action?actual=universidades&textoCodigoUniversidad=&consulta=1" \
  -o tests/scripts/import/fixtures/ruct/universities.html
```

Confirmed live: `200`, `charset=ISO-8859-15`, one `<table>` with headers `Código | Universidad | Centros | Títulos` and rows linking `/ruct/universidad.action?codigoUniversidad=<id>`. The list mixes real universities with administrative categories ("Centros autorizados…", "Centros dependientes del Ministerio de Defensa", "Centros extranjeros autorizados…").

- [ ] **Step 2: Write the failing test in `tests/scripts/import/ruct.test.ts`**

Read the fixture, decode it as `iso-8859-15`, call `parseRuctUniversities`, and assert: it returns the rows seen in the fixture with `code`/`name` matching the table (assert at least the first three rows you read, including one administrative row, so the *skip* rule below is pinned); links with `&amp;` are decoded. Keep the HTML in the fixture file, not inline (it is large).

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/scripts/import/ruct.test.ts`
Expected: FAIL (`parseRuctUniversities` is not exported).

- [ ] **Step 4: Implement `parseRuctUniversities` in `scripts/import/sources/ruct.ts`**

Return `{ code, name }` per table row; decode HTML entities (`&amp;`, `&nbsp;`, `&ntilde;`); trim. A row whose title starts with `Centros ` is an administrative category: return it too (the caller filters), but expose `isUniversityName(name): boolean` (false for names matching the administrative prefixes) as a separate pure export.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm exec vitest run tests/scripts/import/ruct.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/scripts/import/fixtures/ruct/universities.html scripts/import/sources/ruct.ts tests/scripts/import/ruct.test.ts
git commit -m "feat(import): parse the RUCT university list"
```

---

### Task 5: Parse a university's title list (Grado filter)

**Files:**
- Create: `tests/scripts/import/fixtures/ruct/titles-<code>.html`
- Modify: `scripts/import/sources/ruct.ts`
- Test: `tests/scripts/import/ruct.test.ts`

**Interfaces:**
- Consumes: `parseRuctUniversities` (Task 4).
- Produces: `type RuctTitle = { code: string; name: string; level: string }`; `parseRuctTitles(html: string): RuctTitle[]`.

- [ ] **Step 1: Capture the fixture**

Pick one real public university id from the Task 4 fixture, then:

```bash
curl -sS -L --http1.1 -A "Mozilla/5.0 (compatible; JisrDataBot/1.0)" \
  "https://www.educacion.gob.es/ruct/listaestudiosuniversidad.action?codigoUniversidad=<id>&actual=universidades" \
  -o tests/scripts/import/fixtures/ruct/titles-<id>.html
```

If the list is paginated, capture the first page only (the plan filters by title text afterwards; pagination is handled in Task 7).

- [ ] **Step 2: Write the failing test**

Assert `parseRuctTitles` returns the table rows with `code`, `name` and `level` (the "Nivel académico" cell, e.g. `Grado…`, `Máster…`), and that `level` for a Grado row starts with `Grado`.

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/scripts/import/ruct.test.ts -t titles`
Expected: FAIL.

- [ ] **Step 4: Implement `parseRuctTitles`** (same entity-decoding/trim rules as Task 4). Commit only after green.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm exec vitest run tests/scripts/import/ruct.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/scripts/import/fixtures/ruct/titles-*.html scripts/import/sources/ruct.ts tests/scripts/import/ruct.test.ts
git commit -m "feat(import): parse a RUCT university's title list"
```

---

### Task 6: Parse a degree detail and map the field

**Files:**
- Create: `tests/scripts/import/fixtures/ruct/degree-<code>.html`
- Modify: `scripts/import/sources/ruct.ts`
- Test: `tests/scripts/import/ruct.test.ts`

**Interfaces:**
- Produces: `type RuctDegree = { code: string; name: string; nivel: string | null; rama: string | null; campo: string | null; centres: string[] }`; `parseRuctDegree(html: string): RuctDegree`; `fieldOfCampo(campo: string | null, name: string): FieldMatch | null` (`FieldMatch` from `scripts/import/fields.ts`).

- [ ] **Step 1: Capture a Grado detail page** for one code from Task 5:

```bash
curl -sS -L --http1.1 -A "Mozilla/5.0 (compatible; JisrDataBot/1.0)" \
  "https://www.educacion.gob.es/ruct/estudio.action?codigoCiclo=SC&codigoTipo=G&CodigoEstudio=<code>&actual=estudios" \
  -o tests/scripts/import/fixtures/ruct/degree-<code>.html
```

- [ ] **Step 2: Write the failing test**

Assert `parseRuctDegree` reads `name`, `nivel`, `rama` (one of the five ramas), `campo`, and the centres; a field the page omits is `null`. Assert `fieldOfCampo` maps a Computer-Science `campo` (e.g. an "Informática…" campo) to `{ field: "computer-science", confidence: "high" }`, an engineering campo to `engineering`, a business/economics campo to `business-economics`, and an unrelated campo to `null`.

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/scripts/import/ruct.test.ts -t degree`
Expected: FAIL.

- [ ] **Step 4: Implement `parseRuctDegree` and `fieldOfCampo`**

`fieldOfCampo` is a code table over the `campo` string (mirror `CLASS_FIELD`/`fieldOfClass` in `sources/mur.ts`), cross-checked against the title name via `classifyDaad(name)` for a `high`/`low` confidence (low when the name disagrees). Do not guess: an unrercognised campo is `null`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm exec vitest run tests/scripts/import/ruct.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/scripts/import/fixtures/ruct/degree-<code>.html scripts/import/sources/ruct.ts tests/scripts/import/ruct.test.ts
git commit -m "feat(import): parse a RUCT degree and map its field"
```

---

### Task 7: Build records and wire `importSpain` into the dispatcher

**Files:**
- Modify: `scripts/import/sources/ruct.ts`
- Modify: `scripts/import/run.ts` (`SOURCES`), `scripts/import/owners.ts` (`OWNS`), `scripts/import/summaries.ts` (`SummarySource`)
- Test: `tests/scripts/import/ruct.test.ts`, `tests/scripts/import/owners.test.ts`

**Interfaces:**
- Consumes: `parseRuctUniversities`, `parseRuctTitles`, `parseRuctDegree`, `fieldOfCampo`; `stagedInstitution` (`sources/institutions.ts`); `programmeSummary` (`summaries.ts`).
- Produces: `buildSpainRecords(input: { university: RuctUniversity; titles: RuctTitle[]; degrees: Map<string, RuctDegree> }): StagedRecord[]`; `importSpain(): Promise<StagedRecord[]>`.

- [ ] **Step 1: Write the failing test for `buildSpainRecords`**

Given a small hand-built input, assert: the institution slug is `es-<slug(name)>`; the institution has `country: "ES"`, `type: "public"`… (or `null` where RUCT does not state it), every unread fact is `{ value: null, info_kind: "TODO_read_source" }`, `officialUrl: null`, `sourceId` is stable (`ruct:<code>`), and non-Grado titles and non-3-field campos are excluded. Also assert `owners.test.ts` maps a sample `ruct:*` sourceId to `spain`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/scripts/import/ruct.test.ts tests/scripts/import/owners.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `buildSpainRecords` and `importSpain`**

`importSpain` fetches the university list, skips administrative rows (`isUniversityName` false) and keeps public universities, fetches each title list, keeps `Grado` titles whose `fieldOfCampo` is non-null, fetches each degree detail, and returns `buildSpainRecords(...)`. Register `spain: importSpain` in `SOURCES` (`run.ts`), add the `ruct:` pattern to `OWNS`, and add a `"ruct"` member to `SummarySource`. Use `fetchText` with `encoding: "iso-8859-15"` and a count guard (stop if the university count is implausible). `type` is `null` unless the degree/university page states public status; do not guess.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run tests/scripts/import/ruct.test.ts tests/scripts/import/owners.test.ts`
Expected: PASS.

- [ ] **Step 5: Dry-run the importer against the live register (writes only to the gitignored `data-staging/`)**

Run: `NODE_OPTIONS="--import /tmp/opencode/curl-fetch.mjs" pnpm data:import spain`
Expected: stages ES institution/programme candidates into `data-staging/` (untracked) with a plausible count, or exits with a clear message and stages nothing if the host is blocked (Review Focus #3). Do not work around a block.

- [ ] **Step 6: Commit**

```bash
git add scripts/import/sources/ruct.ts scripts/import/run.ts scripts/import/owners.ts scripts/import/summaries.ts tests/scripts/import/ruct.test.ts tests/scripts/import/owners.test.ts
git commit -m "feat(import): stage Spanish Grado candidates from RUCT"
```

---

### Task 8: ADR 0012

**Files:**
- Create: `.claude/docs/decisions/0012-spain-destination.md`

- [ ] **Step 1: Write the ADR** following the format of `.claude/docs/decisions/0010-official-fee-range.md`: Status `Accepted`, Date `2026-10-13`; Context (adding a destination is a product-scope change with code touchpoints); Decision (Spain as 6th destination; two-wave language; thin RUCT importer for the Spanish mass; Numbeo-link-only living costs; the code touchpoints listed in the spec); Consequences; note that it refines ADR 0003's "growth = data" for destinations. Link the spec.

- [ ] **Step 2: Commit**

```bash
git add .claude/docs/decisions/0012-spain-destination.md
git commit -m "docs: add ADR 0012 — Spain as a destination"
```

---

### Task 9: Prose and scope docs ("five → six destinations")

**Files:**
- Modify: `messages/en.json`, `messages/fr.json`, `messages/ar.json` (the four prose enumerations each: "France, Germany, the Netherlands, Hungary and Italy")
- Modify: `content/{en,fr,ar}/guides/bac-and-european-universities.mdx`, `content/{en,fr,ar}/guides/studying-in-europe.mdx`
- Modify: `AGENTS.md`, `.claude/CLAUDE.md`, `.claude/rules/reference-data.md`

**Interfaces:** none (copy only).

- [ ] **Step 1: Update the message prose** in all three locales to include Spain (keep ICU placeholders/preformatted-argument rules intact; the `ar` copy stays a machine draft).
- [ ] **Step 2: Add an ES section/paragraph** to the two guides in each locale, mirroring the existing per-country sections; frontmatter provenance untouched.
- [ ] **Step 3: Update the scope line** ("Release 1: France, Germany, Netherlands, Hungary, Italy") to include Spain in the three docs.

- [ ] **Step 4: Verify i18n/content tests and run lint**

Run: `pnpm exec vitest run tests/i18n tests/content && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add messages/en.json messages/fr.json messages/ar.json content AGENTS.md .claude/CLAUDE.md .claude/rules/reference-data.md
git commit -m "docs: include Spain in the destination copy"
```

---

### Task 10: Full verification

- [ ] **Step 1: Run the whole gate**

Run: `pnpm typecheck && pnpm test && pnpm lint && pnpm data:check --strict && pnpm data:build`
Expected: all green; `data:check --strict` 0 stale (Review Focus #4 is enforced by `data:promote`, #5 by the reading pipeline in Plan 2).

- [ ] **Step 2: Commit any fix; then stop**

```bash
git status --short
```

No commit needed if clean. This plan ends here: the ES destination is wired and the importer is tested, but **no ES programme is promoted**. Plan 2 (`docs/superpowers/plans/…-spain-data-runs.md`) stages, enriches, audits and promotes wave 1 (SEPIE/curated English) then wave 2 (RUCT Spanish), adds the reader/channel guidance entries (`reader.ts` `COUNTRY_NOTES`, `evidence.ts` `CHANNEL_WORDS`, `checker.ts` `CHANNEL_TEXT`, `topics.ts`/`discover.ts`), the official 2026 city cost lines, the coverage delta and the PR.
