# Cost of living from Numbeo (city and country profiles) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** give every programme a first-year living-cost estimate (housing, food, transport) from Numbeo, shown as an `estimate` with its basis and source, so the cost total on the programme page is no longer tuition-only.

**Architecture:** `scripts/import/sources/numbeo.ts` parses a Numbeo city or country page (a deterministic table of item, average, range; no model) and maps it to the existing cost-profile lines; `pnpm data:costs` fetches the pages once (cached, polite, identified) and stages one `cost-profiles/<slug>.yaml` per city plus one per country. The records go through the existing audit sample and `pnpm data:promote` (both are collection-generic; only the audit sheet needs a cost-profile section). The app is unchanged: `estimateCost` already reads city and country profiles and `SourceBadge` already shows estimates with a basis.

**Tech Stack:** TypeScript strict, Vitest (inline HTML fixtures, no network), existing `scripts/import/*`.

## Global Constraints

- **Permission.** The owner holds Numbeo's written permission to collect and use its data (reported by the owner, 2026-10-05; Numbeo's terms otherwise forbid scraping and copying). Keep the written permission with the project records, and check that its scope covers publishing the derived figures and any credit Numbeo expects (its terms ask for a link back or credit). Record it in the licence table of `data/README.md`. The scrape happens once, never more often than the permission allows.
- **Politeness.** One sequential request at a time, at least 2 s apart, a User-Agent that names the project and a contact, responses cached in `.cache/import/` (a re-run costs no requests), a `--max-requests` cap and a dry run that prints the number of requests first. Respect `robots.txt` (`/heavy_crawling.any` and `/DEPRECATED/` are disallowed; normal city pages are not).
- **Trust model.** Numbeo is crowdsourced, not official: every value is `info_kind: estimate` with a `basis` (fr, en, ar) that says what it is and how it was derived; never `official`. Unknown stays unknown: an item Numbeo does not list gives no line. Never mix currencies in one line. No model is involved: code parses and computes, and the audit sample reads the raw numbers.
- **Money** is integer minor units plus an ISO currency code; estimates are `{min, max}` ranges (`CostAmountSchema`). Amounts keep the currency Numbeo is asked for (EUR for FR, DE, IT, NL; HUF for HU); we never convert.
- **Provenance.** Each profile has `sources: { numbeo: { url, last_verified_at } }`; the url is the Numbeo page that was read, `last_verified_at` is stamped by `data:promote` (the day the owner read the sample). Every line uses `source: numbeo`, class stable.
- **Scope.** Lines produced: `housing`, `food`, `transport` (monthly). Left unknown here: `insurance`, `application_visa`, `setup` (they need official pages: a later plan).
- **Staging rules** as for every batch: the owner reads the audit sample before anything is promoted; hold-outs are moved aside before `data:audit draw` and before `data:promote` (Hanze programmes and institutions, ISM `-daad9020`, every `hu-*` programme, the staged LUM programme); `pnpm data:check` right after the promote and before committing; stage explicit file paths only; conventional commits ending with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; no `any`, `@ts-ignore` or non-null `!`; never write regexes with backslashes through the shell (use the Edit or Write tools); `export SWC_NATIVE_BINDING_CACHE='C:\Users\dagda\.swc-cache'` before pnpm or next.

## What Numbeo gives (read 2026-10-05, Paris page)

`https://www.numbeo.com/cost-of-living/in/Paris?displayCurrency=EUR` is a server-rendered table with sections (Restaurants, Markets, Transportation, Utilities, Rent Per Month, ...). Each row is `item | average | low-high`. The page also states `Last update: 3 October 2026`, a contributors count, and "The estimated monthly costs for a single person are EUR 1,041.5, excluding rent." Country pages exist at `https://www.numbeo.com/cost-of-living/country_result.jsp?country=France&displayCurrency=EUR`. Rows used:

| Our line (per month) | Rows | Rule |
|---|---|---|
| `housing` | `1 Bedroom Apartment Outside of City Centre` | owner decision 2026-10-05: a student most likely needs one bedroom; min and max = the row's low and high; a row with no range gives no line (never a single value) |
| `food` | `Meal at an Inexpensive Restaurant` and the grocery rows | a fixed monthly basket, listed in the basis: milk 8 L, bread 8 loaves (500 g), rice 2 kg, eggs 24, chicken 3 kg, apples 3 kg, bananas 3 kg, tomatoes 3 kg, potatoes 4 kg, onions 2 kg, lettuce 4, 8 inexpensive-restaurant meals; min uses each row's low price, max each row's high price; any basket row missing: no line |
| `transport` | `Monthly Public Transport Pass (Regular Price)` | min and max = the row's range; a student pass may be cheaper |

The basket and the housing rule are our modelling choices, disclosed in the `basis`; the owner approves them in this plan.

## File Structure

- Create `scripts/import/sources/numbeo.ts`: `parseNumbeoPage`, `costLinesFrom`, URL builders and the basis texts.
- Create `scripts/import/costs.ts`: the `pnpm data:costs` CLI (city list from `data/`, fetch, stage).
- Modify `scripts/import/audit.ts`: a sample-sheet section for `cost-profiles/*` (raw numbers per line, the page, the formula).
- Modify `package.json`: script `data:costs`.
- Modify `data/README.md`: source row, licence row (permission), credits note, a "Cost profiles" paragraph.
- Tests: `tests/scripts/import/numbeo.test.ts`, `tests/scripts/import/costs.test.ts`, `tests/scripts/import/audit-cost-profiles.test.ts`.

---

### Task 1: Numbeo page parser and line mapping (pure)

**Files:** Create `scripts/import/sources/numbeo.ts` and `tests/scripts/import/numbeo.test.ts`.

**Interfaces:**
- Produces `type NumbeoRow = { name: string; avg: number | null; low: number | null; high: number | null }`.
- Produces `type NumbeoPage = { lastUpdate: string | null; contributors: number | null; rows: NumbeoRow[] }`. `parseNumbeoPage(html: string): NumbeoPage` reads the `data_wide_table`, strips tags, decodes entities, and reads `1,396.87` and `1,100.00-2,000.00` (US thousands separator); a missing number is `null`; `lastUpdate` is the ISO date of `Last update: 3 October 2026`. The currency is not guessed from the page: the CLI knows which currency it asked for.
- Produces `costLinesFrom(page: NumbeoPage): { lines: Partial<Record<"housing" | "food" | "transport", { min: number; max: number }>>; used: Record<string, NumbeoRow[]>; missing: string[] }`, with min and max in major units rounded to whole units (the CLI converts to minor units).

- [ ] **Step 1: failing tests** (inline HTML in the shape of the real page, invented round numbers): values and ranges parse; the thousands separator; a row without a range gives low and high `null`; sections that are not used are ignored; housing takes the 1-bedroom-outside-the-centre range, and a row without a range gives no housing line; food sums quantity times low and high price and needs every basket row; transport takes the pass range; a missing row removes only its line and is listed in `missing`; `used` carries the exact rows behind each line (for the audit sheet).
- [ ] **Step 2: run and see them fail** (`pnpm exec vitest run tests/scripts/import/numbeo.test.ts`).
- [ ] **Step 3: implement** the parser (regex on `<tr>` and `<td>`, no new dependency) and the mapping.
- [ ] **Step 4: run and see them pass; `pnpm typecheck && pnpm lint`; commit** `feat: parse Numbeo cost pages into housing, food and transport lines`.

### Task 2: `pnpm data:costs`: fetch once, stage profiles

**Files:** Create `scripts/import/costs.ts` and `tests/scripts/import/costs.test.ts`; modify `package.json`.

**Interfaces:**
- Consumes `parseNumbeoPage` and `costLinesFrom` (Task 1), `fetchText` from `scripts/import/http.ts` (cached), `stageFile` and `toYaml` from `scripts/import/staging.ts`.
- Produces `numbeoCityUrl(name: string, currency: string): string` (`https://www.numbeo.com/cost-of-living/in/<Name>?displayCurrency=<CUR>`, spaces as dashes, accents percent-encoded) and `numbeoCountryUrl(name: string, currency: string): string`.
- Produces `buildProfile(input: { slug: string; country: string; city: string | null; url: string; page: NumbeoPage; currency: string }): StagedCostProfile | null` (null when no line could be built). The staged record is `{ slug, country, city, lines: { housing?: { value: { min, max, currency, per: "month" }, source: "numbeo", info_kind: "estimate", basis: { fr, en, ar (draft) } }, ... }, sources: { numbeo: { url, last_verified_at: null } }, _review: { kind: "cost-profiles", preparedBy: "assistant", preparedAt, sourceId: "numbeo:<slug>", evidence: [{ fact: "lines.housing", url, quote: "<row text and numbers>" }, ...], notes } }`. Slugs: `<cc>-<city-slug>-numbeo` for cities, `<cc>-numbeo` for countries.
- Usage: `pnpm data:costs [--dry-run] [--countries FR,DE,...] [--max-requests 400] [--delay-ms 2000]`.

- [ ] **Step 1: failing tests** (no network: the fetch function is injected): the city list comes from `data/programs` joined to `data/institutions` (programme `city` slug and the institution's city name, one row per slug); URL building for `Paris`, `Saint-Martin-d'Hères`, `'s-Gravenhage` and a name with a space; a 404 or a page without the rent table gives no profile and an entry in the report (that city falls back to the country profile); HU asks for `HUF`, the others `EUR`; the basis texts name Numbeo, the page date, the formula and the basket; the delay and `--max-requests` are honoured; a dry run prints the number of requests and writes nothing; an existing staged file or a slug already in `data/` is never overwritten.
- [ ] **Step 2: run and see them fail.**
- [ ] **Step 3: implement.** Fetch sequentially with the delay and the User-Agent `Jisrr-research (non-commercial; written permission held by the project owner; contact dagdaguihamza@gmail.com)`. Country profiles come from the country pages (France, Germany, Netherlands, Italy, Hungary) and are the fallback for cities Numbeo does not list.
- [ ] **Step 4: tests pass; typecheck and lint; commit** `feat: data:costs stages Numbeo cost profiles for the programme cities and the countries`.

### Task 3: audit sheet for cost profiles

**Files:** Modify `scripts/import/audit.ts` (`sampleSheet`); create `tests/scripts/import/audit-cost-profiles.test.ts`.

- [ ] **Step 1: failing test:** a staged cost profile with two lines renders, per line, the line name, the range and currency, `(estimate; source numbeo)`, one `"<row> | avg | range"` evidence line per Numbeo row used and the page url, plus the formula sentence and the check "Confirm: this is the city's page (right city, right currency, right date)".
- [ ] **Step 2: run and see it fail. Step 3: implement** (a `cost-profiles/` branch next to the scholarships one). **Step 4: pass, lint, commit** `feat: audit sample sheet for cost profiles`.

### Task 4: the one-off run (controller; the owner reads the sample)

- [ ] Announce the number of requests (`pnpm data:costs --dry-run`: five country pages plus one page per programme city, about 320 in all, at 2 s each is about 11 minutes; the report lists the cities Numbeo does not have). Run a sample of 10 cities first, read the output, then the full run.
- [ ] Read every staged profile myself (values against the Numbeo page text) and check the totals on three programme pages in the dev server.
- [ ] Hold-outs aside, `pnpm data:audit draw`, `pnpm data:audit sheet`, restore, then STOP and hand the owner `data-staging/AUDIT-SAMPLE.md`.
- [ ] After "correct": hold-outs aside, `pnpm data:promote --confirm-human-read --verified-on <date> --audited-batch`, `pnpm data:check` BEFORE committing, `pnpm data:build`, restart the dev server, browser check of a programme page in fr and ar (cost block with the estimate tag and the Numbeo source), `pnpm typecheck && pnpm lint && pnpm test`, Opus `reviewer`, push, draft PR.

### Task 5: documentation

**Files:** Modify `data/README.md` and `.claude/CLAUDE.md` (one line in the reference-data scope).

- [ ] Source-table row for Numbeo (provides: city and country price tables; left for a human: insurance, visa fees, one-off setup costs), a licence row (`permission obtained from Numbeo, reported by the project owner (2026-10-05); keep the written permission; credit Numbeo wherever its figures are shown`), a "Cost profiles" paragraph with the formulas and the basket, and the credits note ("Numbeo, numbeo.com"). Commit `docs: Numbeo source, licence and cost-profile formulas`.

## Self-review

- Spec coverage: source (Tasks 1-2), one-off scrape with permission and politeness (constraints, Task 2), trust labelling as estimate (constraints, Task 2 basis), audit and promote (Tasks 3-4), no UI change (architecture), docs and credit (Task 5).
- Not covered on purpose: insurance, visa fees and setup costs (official sources, a later plan); a student-specific transport discount; MAD display.
- Types: `NumbeoPage`, `NumbeoRow`, `costLinesFrom` and `buildProfile` are defined once in Tasks 1-2 and used with the same names in Tasks 2-3.

## Open decisions for the owner (defaults in this plan)

1. Housing is the range of a 1-bedroom apartment outside the city centre (owner decision 2026-10-05: a student most likely needs one bedroom).
2. The food basket as listed.
3. Hungary in HUF, not converted.
4. The country profile from Numbeo's country page is the fallback for cities Numbeo lacks.
5. Normal 10% audit sampling (the numbers are parsed by code, not read by a model); say if you want every profile read.
