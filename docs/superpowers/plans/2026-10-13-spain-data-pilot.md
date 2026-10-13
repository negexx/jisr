# Spain data pilot (Plan 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land a bounded set of real Spanish Grado programmes in `data/` end-to-end — register listings first, then enriched facts — by adding the missing ES pipeline guidance and the missing ES register-listing path, so Spain becomes a real destination in the app (not just a skeleton).

**Architecture:** Two code pieces then a bounded data run. (1) The ES reader/checker/search guidance (`COUNTRY_NOTES`, `CHANNEL_WORDS`, `CHANNEL_TEXT`, `topics`/`discover` search words) so the model can read Spanish pages. (2) An ES register-listing path: today `scripts/import/listing.ts` only accepts France/Germany; a curated `es-listing.json` (slug → the programme's own page) makes a RUCT-staged record promotable with a non-null `officialUrl` and null facts. (3) A pilot of ~15 staged ES programmes from 3 flagship universities is promoted as listings, then read/enriched with the model, then audited by the owner and promoted as revisions. Wave 2 (the remaining ~827 staged programmes) and the English-taught SEPIE wave are **Plan 3**.

**Tech Stack:** Node 24 + tsx; `data:*` pipeline (`data:import`, `data:pages`, `data:read`, `data:evidence`, `data:audit`, `data:promote`, `data:costs-official`, `data:coverage`); reader `deepseek-v4.1-flash`, checker `qwen3.7-plus`; Serper search; Vitest.

**Spec:** `docs/superpowers/specs/2026-10-13-spain-destination-design.md` (see §Scope, §The RUCT importer, §Wave 1/2, §Costs). Plan 1 (`docs/superpowers/plans/2026-10-13-spain-destination-code.md`) built the skeleton + importer this plan consumes.

## Global Constraints

- Official https sources only; never invent a value; unknown stays `null` (⚠️). A model only proposes; code re-fetches a verbatim quote (`verifyProposal`) and decides.
- Tuition is `official` only (ADR 0010). A deadline needs a quote naming international/non-EU applicants; dated only with a year, else `recurringDeadline {month, day}`; never both (ADR 0009).
- Register-listing records carry a non-null `officialUrl` and every fact `{value: null, info_kind: …}`; enriched records get real facts. `TODO_read_source` / a null `officialUrl` must never reach `data/` (`promote.ts` skips them).
- No `any`/`@ts-ignore`/non-null `!`. Client-reachable code imports no Zod. Do not rename slugs.
- `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm data:check --strict` (0 stale), `pnpm data:build` all green at each commit. `--verified-on` is the day the **owner** reads the sample, never future. Branches/PRs only; never push `main`.
- Budgets: reader `--max-usd 2`, search `--max-queries 60` for a 15-programme pilot, `--concurrency 8`. A run that hits its cap stops and produces only what fits.
- The pilot is **bounded**: at most ~15 programmes, 3 institutions. Do not let it grow into the 842 in this plan.

## Review Focus

1. **A RUCT record promoted before its `officialUrl` is supplied** → `promote.ts` must skip it (no ES record in `data/` with a null/placeholder URL). Acceptance: after the listing promotion, every `data/programs/es-*.yaml` has a real `officialUrl` and facts null.
2. **An ES fact the reader "knows" but the page does not state** → `verifyProposal` drops it. Acceptance: `data:evidence verify --enrich --dry-run` reports 0 unsupported facts.
3. **A deadline an EU-only page states** → rejected for a Moroccan applicant. Acceptance: no promoted ES deadline lacks an international-applicant quote.
4. **A channel slug the pipeline does not know** (`es-unedasiss` / `es-preinscripcion-regional`) → `checkChannel` fails closed. Acceptance: both slugs are in `CHANNEL_WORDS` + `CHANNEL_TEXT` before any read, and the reader prompt lists them.
5. **A pilot that quietly grows past its bound** → the run stops at the curated 15. Acceptance: the curated registry lists exactly the chosen slugs; `data:coverage` delta is small and explained.

---

### Task 1: ES pipeline guidance (reader, checker, evidence, search)

**Files:**
- Modify: `scripts/import/reader.ts` (`COUNTRY_NOTES`, ~line 94-110)
- Modify: `scripts/import/evidence.ts` (`CHANNEL_WORDS` ~722-742; `CHANNEL_EXCLUDES` ~745-753)
- Modify: `scripts/import/checker.ts` (`CHANNEL_TEXT` ~26-42)
- Modify: `scripts/import/topics.ts` (`WORDS` ~13-39; `LANGUAGE` ~41)
- Modify: `scripts/import/discover.ts` (`WORDS` ~283-304)
- Test: `tests/scripts/import/reader.test.ts`, `evidence.test.ts`, `checker.test.ts`, `topics.test.ts`, `discover.test.ts`

**Interfaces:**
- Produces: an `ES` entry in `COUNTRY_NOTES`; `"es-unedasiss"` and `"es-preinscripcion-regional"` in `CHANNEL_WORDS`, `CHANNEL_EXCLUDES` and `CHANNEL_TEXT`; `ES` in `topics.WORDS`, `topics.LANGUAGE`, `discover.WORDS`. `CHANNEL_SLUGS` derives from `CHANNEL_WORDS`, so both ES slugs appear in the reader prompt automatically. (`LANGUAGE_WORDS.es` and `SOURCE_LINE.ruct` already exist — do not touch them.)

- [ ] **Step 1: Failing tests.** In each test file, add the ES case mirroring the existing IT/HU case:
  - `reader.test.ts`: an `ES` run contains the ES note in the **user** prompt and leaves the system prompt unchanged (mirror the IT/DE assertions ~313-367 and the "system identical across countries" test ~498-502).
  - `evidence.test.ts`: `checkChannel("es-unedasiss", quote)` and `checkChannel("es-preinscripcion-regional", quote)` accept their real page sentences and reject a quote from the other channel / an exclusion; `CHANNEL_SLUGS` contains both slugs.
  - `checker.test.ts`: `claimText("applicationChannel", "es-unedasiss")` returns the ES sentence, not the generic fallback.
  - `topics.test.ts`: `ES` yields the 4 site-scoped queries with `search.languages` all `"es"` (mirror ~200-210); a country with no `WORDS` still no-ops (unchanged).
  - `discover.test.ts`: `ES` searches in Spanish (`languages.every((l) => l === "es")`), mirroring the IT test ~389-404.
- [ ] **Step 2: Run** `pnpm exec vitest run tests/scripts/import/reader.test.ts tests/scripts/import/evidence.test.ts tests/scripts/import/checker.test.ts tests/scripts/import/topics.test.ts tests/scripts/import/discover.test.ts` — confirm the new cases FAIL for the right reason.
- [ ] **Step 3: Implement.** The ES `COUNTRY_NOTES` value is one string (an array `.join(" ")`), mirroring the IT entry, and must state: the application channel choice — `es-unedasiss` when the page describes the UNEDasiss credencial/PCE route, `es-preinscripcion-regional` when it describes the region's preinscripción / the university's own admission application; that tuition is the fee for a non-EU student **not resident in Spain** where the page states one (else null); that a Spanish-taught Grado's language is Spanish and an English-taught one's is English, taken from the page's own statement (never assumed); that a deadline counts only when it names international/non-EU applicants (ADR 0009), and a day+month with no year becomes a `recurringDeadline`. Add the two `CHANNEL_WORDS` regexes over the exact wording the ES pages use (UNEDasiss credencial / PCE; regional preinscripción / Distrito Único / preinscripción de la universidad) with a cross-exclusion so the two do not both match; the `CHANNEL_TEXT` one-line description per slug; and the `ES` search-word entries (`topics.ts` fees/language/deadline/documents in Spanish, `LANGUAGE.ES = "es"`; `discover.ts` fees/admission in Spanish, `language: "es"`).
- [ ] **Step 4: Run** the five test files, then `pnpm test` (no regression), `pnpm typecheck`, `pnpm lint`.
- [ ] **Step 5: Commit**

```bash
git add scripts/import/reader.ts scripts/import/evidence.ts scripts/import/checker.ts scripts/import/topics.ts scripts/import/discover.ts tests/scripts/import
git commit -m "feat(import): Spanish reader, channel and search guidance"
```

---

### Task 2: ES register-listing path (curated `officialUrl`)

**Files:**
- Modify: `scripts/import/listing.ts` (`listingProgramme` / `listingInstitution` country guards ~line 40-120)
- Modify: `package.json` if a new script is needed (prefer none — reuse `pnpm data:listing`)
- Test: `tests/scripts/import/listing.test.ts` (drive the ES branch from an inline registry fixture; the real `es-listing.json` is created in Task 3)

**Interfaces:**
- Consumes: Task 1 (no direct dependency; different files).
- Produces: `data:listing` can promote an **ES** staged programme whose slug is in `es-listing.json`, writing a `data/programs/<slug>.yaml` with `officialUrl` = the curated programme page and every fact `{value: null, info_kind: …}` (the register-listing tier), and a `register-listing` ledger row. The registry shape: `{ "entries": [ { "slug": "<es-slug>", "officialUrl": "https://…" } ] }` (strict Zod, https only, slug must match a staged `data-staging/programs/<slug>.yaml` with `sourceId` starting `ruct:`).

- [ ] **Step 1: Read first.** `scripts/import/listing.ts` in full, `scripts/import/staging.ts` (`stageFile`, `readLedger`, `appendLedger`), and `data/README.md` "Trust tiers" (`register-listing`). Confirm how `listingProgramme` sets `officialUrl` and its FR/DE guards, and how `data:listing` reads the curated registry (if any) vs the staged files.
- [ ] **Step 2: Failing test** in `tests/scripts/import/listing.test.ts`: an ES staged record whose slug is in the registry yields a listing record with the curated `officialUrl`, `country: "ES"`, facts null, and a `register-listing` ledger level; an ES slug **not** in the registry yields no record (never a null/guessed URL); a non-https or dangling registry URL is rejected at parse.
- [ ] **Step 3: Implement** the ES branch in `listing.ts` + the strict registry schema, mirroring the FR/DE structure. Do not widen the FR/DE behaviour.
- [ ] **Step 4: Run** the listing tests, `pnpm typecheck`, `pnpm lint`.
- [ ] **Step 5: Commit**

```bash
git add scripts/import/listing.ts scripts/import/registries/es-listing.json tests/scripts/import/listing.test.ts
git commit -m "feat(import): ES register-listing path from a curated programme-page registry"
```

---

### Task 3: Curate the pilot set and promote the ES listings

**Files:**
- Create: `scripts/import/registries/es-listing.json` entries (the chosen ~15 slugs + their pages) — populated here, not in Task 2.
- Produces: `data/programs/es-*.yaml` (the listings), `data/institutions/es-*.yaml` (their institutions, if not already promoted — the staged institution record must be promoted alongside), ledger rows.

**Interfaces:** Consumes Task 2 (`data:listing` ES branch). Produces the `data/` ES programmes Task 4 reads.

- [ ] **Step 1: Choose the pilot set.** From `data-staging/REVIEW.csv` / `data-staging/programs/es-*.yaml`, pick ~15 Grado programmes from 3 flagship public universities (candidate institutions: Universidad Politécnica de Madrid, Universitat Politècnica de Catalunya, Universidad de Granada, Universidad de Zaragoza, Universitat de València — choose 3 that have clear in-scope Grados). Prefer programmes whose field is unambiguous and whose university site is known.
- [ ] **Step 2: Curate the programme pages.** For each chosen programme, find its **own page on the university's site** (the `Grado` page) and record `{slug, officialUrl}` in `es-listing.json`. This is a human/research step: the page must be the programme's own page and must be official https. If a programme's page cannot be found, drop that slug (do not guess).
- [ ] **Step 3: Promote the listings (owner audit).** Run the listing batch (follow `data/README.md` "Importing candidates" step 2 and the "Trust tiers" `register-listing` recipe): the institutions first, then the programmes. **The owner reads the audit sample** (`data-staging/AUDIT-SAMPLE.md`); register-listing batches may be `owner-waived` — the owner decides. Then `data:promote --confirm-human-read --verified-on <today>`. Run `pnpm data:check` → 0 errors.
- [ ] **Step 4: Verify the invariant.** `ls data/programs/es-*.yaml` shows exactly the chosen programmes, each with a non-null `officialUrl` and null facts (Review Focus #1). Record the count.
- [ ] **Step 5: Commit** the promoted `data/` files by explicit path with `data: add the first Spanish Grado listings (pilot)`, and the registry with `git add scripts/import/registries/es-listing.json`.

---

### Task 4: Read the pilot programmes (pages, model, verify)

**Files:** create `data-staging/pilot/es/{slugs.txt,pages.json}`; `data-staging/proposals-read/es/**` (untracked). No `data/` change yet.

**Interfaces:** Consumes Task 3 (the promoted ES listings). Produces the proposals Task 5 audits.

- [ ] **Step 1: Slugs.** `ls data/programs/es-*.yaml | sed 's#.*/##;s#\.yaml##' > data-staging/pilot/es/slugs.txt`.
- [ ] **Step 2: Pages.** `pnpm data:pages --slugs data-staging/pilot/es/slugs.txt --search --topics --topic-list fees,language,deadline,documents --max-queries 60 --out data-staging/pilot/es/pages.json`. Inspect it: each programme's own page first. If the automatic search finds wrong pages for Spain (as it did for Italy), STOP and report — a curated ES page registry (like `it-pages`) is the fallback and becomes its own task, not a silent improvisation.
- [ ] **Step 3: Read (model).** `pnpm data:read --model deepseek-v4.1-flash --pages data-staging/pilot/es/pages.json --slugs data-staging/pilot/es/slugs.txt --out data-staging/proposals-read/es --check qwen3.7-plus --max-usd 2 --concurrency 8`. Report per-programme facts proposed and facts dropped.
- [ ] **Step 4: Gate.** `pnpm data:evidence verify --enrich data-staging/proposals-read/es --slugs data-staging/pilot/es/slugs.txt --dry-run` → **0 unsupported facts** (Review Focus #2). Report any unsupported fact; a quote that fails is a proposal bug, not something to bypass.
- [ ] **Step 5: Record, do not commit.** `data-staging/` is gitignored (it is a local review queue). Leave the proposals for Task 5; report the proposal dir and counts. No commit in this task.

---

### Task 5: Audit and promote the enriched ES facts

**Interfaces:** Consumes Task 4's proposals.

- [ ] **Step 1: Restage + verify.** `pnpm data:evidence restage --enrich data-staging/proposals-read/es --slugs data-staging/pilot/es/slugs.txt`, then `verify --enrich … --dry-run` then without `--dry-run`.
- [ ] **Step 2: Audit (owner).** `pnpm data:audit draw && pnpm data:audit sheet`. **The owner reads `data-staging/AUDIT-SAMPLE.md`** and answers correct/incorrect; errors go back to Task 4. `pnpm data:audit status` must show the batch passed.
- [ ] **Step 3: Promote.** `pnpm data:promote --confirm-human-read --verified-on <today> --replace-revisions`; `pnpm data:check` → 0 errors. Confirm every promoted ES fact carries a source + quote; a fact the owner rejected stays null.
- [ ] **Step 4: Commit** the enriched `data/programs/es-*.yaml` by explicit path with `data: enrich the pilot Spanish Grados`.

---

### Task 6: Official 2026 ES cost lines

**Files:** create `data-staging/proposals-cost-official/es.json`; `data/cost-profiles/es-<city>-official.yaml` where a clean 2026 official city figure exists (Madrid Abono Joven, Barcelona T-jove are the known ones).

**Interfaces:** Consumes `pnpm data:costs-official verify` (`scripts/import/official-costs.ts`). Produces ES cost-profile records or, where none exists, nothing (the Numbeo link already covers those pages).

- [ ] **Step 1: Author the proposal.** For each city with a clean official **2026** figure (Madrid transport, Barcelona transport; housing only if a city-wide official 2026 source exists), write the `OfficialCostProposalSchema` JSON with a verbatim quote that contains the amount **next to its currency** and a 2026 year. Do not invent a figure; a line with no 2026-dated quote is dropped by `verify`.
- [ ] **Step 2: Verify + stage.** `pnpm data:costs-official verify data-staging/proposals-cost-official/es.json --dry-run` then without. Report kept/dropped lines.
- [ ] **Step 3: Audit (owner, 100%).** Cost profiles are 100% audited — the owner reads every line. Then `data:promote` the cost profiles.
- [ ] **Step 4: Commit** the ES cost-profile files (if any) with `data: add the official 2026 Spanish city cost lines`.

---

### Task 7: Coverage, gate, review, PR

- [ ] **Step 1: Coverage delta.** `pnpm data:coverage` before (from Task 3) and after; record the ES column and per-fact counts.
- [ ] **Step 2: Full gate.** `pnpm typecheck && pnpm test && pnpm lint && pnpm data:check --strict && pnpm data:build` — all green.
- [ ] **Step 3: Whole-branch review.** Dispatch the `reviewer` over `git diff origin/main...HEAD`.
- [ ] **Step 4: PR.** Open one PR `data/es` → `main` titled `data: add the first Spanish Grado programmes (pilot)`, with the coverage delta, the audit result and what stays unknown. Never push `main`.

---

## Self-review notes (plan author)
- Spec coverage: §Scope wave 1/2 → Tasks 3-5 pilot + explicit Plan 3 deferral; §Data model `officialUrl` → Tasks 2-3; §code touchpoints reader/evidence/checker/topics/discover → Task 1; §Costs → Task 6; DoD → Task 7.
- The pilot is bounded to ~15 programmes/3 institutions on purpose; the 842 and the SEPIE English wave are Plan 3.
- Interfaces: the registry shape (`{slug, officialUrl}`), the pilot dirs (`data-staging/pilot/es/…`) and the slugs file are used identically across Tasks 3-5.
