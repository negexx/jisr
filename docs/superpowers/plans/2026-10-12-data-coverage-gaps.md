# Data-coverage gaps campaign (Spec 3) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the remaining reference-data gaps (deadlines/intakes, tuition, application channel, documents, requirement rules, teaching language) across FR/DE/NL/HU/IT, English-first, using **Gemini Deep Research output as the evidence source** fed through the existing verify → audit → promote pipeline.

**Architecture:** A researcher (Gemini Deep Research) returns one row per fact: `{country, slug, fact, value, unit, quote, source_url, applies_to_non_eu, read_date, confidence}`. A converter turns each row into the pipeline's `ProposalSchema` JSON (`data-staging/proposals/programs/<slug>.json`); `pnpm data:evidence verify` **re-fetches every quote and decides** — a model/researcher only proposes, code decides. Accepted facts go through `data:audit` and `data:promote` exactly like the health wave. Deterministic code tools run alongside where they exist (`data:daad-deadlines`, `data:fr-language`, `data:it-pages`).

**Tech Stack:** Node 24 + `tsx`; the `data:*` pipeline; Zod; the OpenCode reader as a **fallback** where Gemini finds nothing.

**Specs:** `docs/superpowers/specs/2026-10-10-data-coverage-campaign-design.md` (the campaign design this executes), `docs/superpowers/research/2026-10-09-data-gap-research.md` (the evidence base). This plan is the missing-country-first order with a research-table input.

## Global Constraints

- **Official https sources only; never invent a value; unknown stays `null`.** Every fact carries `source_url` + `info_kind` (`official|estimate|guidance`) + `last_verified_at`.
- **2026 figures only.** An older year is dropped, not relabelled.
- A value must appear **next to its currency/unit** in the quote. A number with no unit on the page is not usable.
- Deadlines: a dated deadline only when the quote states the year; a `recurringDeadline {month, day}` when it states day+month, no year; never both. Every deadline needs an accepted quote naming **international/non-EU** applicants.
- Tuition is `official` only; an official `{min,max}` range needs one quote stating both (ADR 0010).
- **HU:** do **not** re-import or republish Study Finder-derived data (Tempus permission pending). University pages only.
- Do not rename slugs. `data:check --strict` 0 errors / 0 stale; `data:build` OK; `typecheck`/`test`/`lint` green. Branch + PR only; never push `main`.
- The researcher only **proposes**; `verifyProposal` re-fetches each quote and keeps a fact only if a quote supports it. A rejected quote is a wrong quote.

## Review Focus

Input classes the spec implies but no task's tests exercise; each gets a test in its owning task.

1. **A value whose quote is on the page but for the wrong year or the wrong applicant group** (an EU-only fee, a 2024 deadline) → `verifyProposal`/the study-year gate must drop it (Task 1 test + per-lane dry-run "0 unsupported").
2. **A researcher row with a number but no currency/unit** → rejected, not stored (Task 1 test).
3. **A programme the researcher could not find** → stays `null`, the row is absent, the record is unchanged (Task 1: rows with an empty value are skipped).
4. **A quote that appears on the page but not on the programme's own page** (a national page) → allowed only where a national page is the legitimate source (channel/documents); flagged in the audit (per-lane audit sheet).
5. **HU Study Finder leakage** → no Study-Finder-derived fact may be promoted (per-lane check: source host is the university's, not `studyinhungary.hu`).

---

### Task 0: Emit the gap target lists and the researcher input contract

**Files:**
- Create (not committed, `data-staging/`): `data-staging/gaps/<cc>-slugs.txt`, `data-staging/gaps/<cc>-targets.json`
- Create: `docs/superpowers/research/2026-10-12-gemini-gap-brief.md` (the prompt handed to Gemini, with the slug lists)

**Interfaces:**
- Produces: per-country target lists (programme slug + name + university + the facts missing) that the research brief embeds, so the researcher returns rows **keyed to our slugs**.

- [ ] **Step 1: Build the per-country missing-fact lists.** `pnpm data:coverage --detail --csv data-staging/gaps/coverage.csv`. From the CSV, per country, list every programme with `missing_count > 0` and the exact facts it misses.
- [ ] **Step 2: Write `<cc>-targets.json`** — one object per programme: `{slug, name, institution, country, missing: [facts]}`.
- [ ] **Step 3: Write the research brief** embedding the target list, the Global Constraints above, and the output contract (the row schema in Architecture). Confirm it fits Gemini's input limit; if not, split by country.
- [ ] **Step 4: Commit** the brief only (`docs/`), not the staging lists.

---

### Task 1: The research-row → proposal converter

**Files:**
- Create: `scripts/import/research-proposals.ts`
- Test: `tests/scripts/import/research-proposals.test.ts`
- Package script: `"data:research": "tsx scripts/import/research-proposals.ts"` in `package.json`

**Interfaces:**
- Consumes: a JSON file `[{slug, fact, value, unit, quote, sourceUrl, appliesToNonEu, readDate, confidence}]`.
- Produces: `data-staging/proposals/programs/<slug>.json` in `ProposalSchema` shape (`{slug, programmePage, facts: {<fact>: {value, evidence: [{url, quote}]}}}`), one file per programme, merging rows for the same slug. A row with an empty value, or a value without a `unit` where one is required (money/date), is skipped with a reason.

- [ ] **Step 1: Write the failing test** `tests/scripts/import/research-proposals.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { rowsToProposals } from "../../../scripts/import/research-proposals";

describe("rowsToProposals", () => {
  it("maps a tuition row with a unit to a proposal fact", () => {
    const out = rowsToProposals([
      { slug: "nl-x", fact: "tuition", value: "9314", unit: "EUR/year",
        quote: "€ 9.314 per year", sourceUrl: "https://x.nl/fees", appliesToNonEu: true,
        readDate: "2026-10-12", confidence: "high" },
    ]);
    expect(out["nl-x"].facts.tuition.value).toEqual({ amountMinor: 931400, currency: "EUR", period: "year" });
    expect(out["nl-x"].facts.tuition.evidence[0].url).toBe("https://x.nl/fees");
  });
  it("skips a money row with no unit", () => {
    const out = rowsToProposals([{ slug: "nl-y", fact: "tuition", value: "9314", unit: "",
      quote: "9314", sourceUrl: "https://y.nl/fees", appliesToNonEu: true, readDate: "2026-10-12", confidence: "high" }]);
    expect(out["nl-y"]).toBeUndefined();
  });
  it("skips a row whose value is not published", () => {
    expect(rowsToProposals([{ slug: "nl-z", fact: "tuition", value: "", unit: "",
      quote: "", sourceUrl: "", appliesToNonEu: false, readDate: "2026-10-12", confidence: "low" }])).toEqual({});
  });
});
```

- [ ] **Step 2: Run it (RED)** — `pnpm vitest run tests/scripts/import/research-proposals.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement `rowsToProposals(rows): Record<string, Proposal>`** in `scripts/import/research-proposals.ts`: map `fact` → the proposal fact shape (tuition→`{amountMinor,currency,period}` via `toMinor`/`minorUnitDigits`; intakes→`[{startDate,applicationDeadline,recurringDeadline}]`; channel→a slug; documents→`items`; rules→`language_proficiency`/`manual_check`; `teachingLanguages`→`[code]`). Drop rows with no value, or a money/date value with no unit. Also a `main(argv)` that reads the input file and writes the proposal files.
- [ ] **Step 4: Run it (GREEN).**
- [ ] **Step 5: Commit** `scripts/import/research-proposals.ts`, its test, and the package script.

---

### Task 2: IT lane

**Files:** staged proposals + `data/**`; `scripts/import/registries/it-pages-*.json` (existing).

- [ ] **Step 1: Deterministic first.** `pnpm data:it-pages --registry scripts/import/registries/it-pages-1.json,...,it-pages-4.json --out data-staging/gaps/it-pages.json` then `pnpm data:read --pages data-staging/gaps/it-pages.json --slugs data-staging/gaps/it-slugs.txt --check qwen3.7-plus --max-usd 2`.
- [ ] **Step 2: Researcher rows.** Convert Gemini's IT rows with `pnpm data:research data-staging/gaps/it-research.json` → proposals (into `data-staging/proposals/programs/`).
- [ ] **Step 3: Verify.** `pnpm data:evidence verify --slugs data-staging/gaps/it-slugs.txt --dry-run` → **expect 0 unsupported**; then without `--dry-run`.
- [ ] **Step 4: Audit + promote.** `pnpm data:audit draw && pnpm data:audit sheet` → the owner reads `AUDIT-SAMPLE.md` → `pnpm data:promote --confirm-human-read --verified-on <today>`.
- [ ] **Step 5: Check + commit.** `pnpm data:check`; commit `data/` as `feat(data-it): fill the Italian gaps`.

### Task 3: DE lane
Same shape: `pnpm data:daad-deadlines` (code) → convert Gemini's DE rows → verify → audit → promote. Requirement rules come from the DAAD language block (either the reader or Gemini's rows). Commit `feat(data-de): fill the German gaps`.

### Task 4: HU lane
Same shape, **university pages only** (no Study Finder). Deadlines/intakes (113), channel (76), tuition (50). After verify, confirm no promoted fact cites `studyinhungary.hu`/`stipendiumhungaricum.hu`. Commit `feat(data-hu): fill the Hungarian gaps`.

### Task 5: NL lane
`pnpm data:read` for tuition/documents; DUO RIO `VOERTAAL` for the 46 missing teaching languages; Gemini's rows for the rest. Commit `feat(data-nl): fill the Dutch gaps`.

### Task 6: FR lane
`pnpm data:fr-language` (narrowed guard) for the 68 missing languages; Gemini's rows for tuition/deadlines. Commit `feat(data-fr): fill the French gaps`.

---

### Task 7: Close the campaign

**Files:** `docs/reports/coverage-by-*`, the PR body.

- [ ] **Step 1: Re-measure.** `pnpm data:coverage` before/after; `pnpm data:coverage --detail --out docs/reports/coverage-by-institution-<date>.md --csv docs/reports/coverage-by-programme-<date>.csv`.
- [ ] **Step 2: Full gate.** `pnpm data:check --strict && pnpm data:build && pnpm typecheck && pnpm test && pnpm lint` — all green.
- [ ] **Step 3: Review + PR.** Run the `reviewer` subagent over the diff; open one PR `data: coverage campaign (Spec 3) — fill the gaps` with the coverage delta and the per-country record/source list. Never push `main`.

---

## Self-review notes

- **Spec coverage:** the campaign spec's per-country lanes map to Tasks 2–6 (order IT → DE → HU → NL → FR); the trust constraints are in Global Constraints; the researcher-input design (the new part) is Task 0 + Task 1; close is Task 7.
- **Type consistency:** the row schema in Architecture is the input of Task 1 and the output contract of Task 0's brief; the proposal shape matches `ProposalSchema` (`scripts/import/proposals.ts`), consumed by `data:evidence verify`.
- **Review Focus** items are pinned: wrong-year/wrong-audience → Task 1 test + each lane's dry-run; no-unit money → Task 1 test; unpublished → Task 1 test; national-page quote → each lane's audit; Study Finder leakage → Task 4 check.
- **Fallback:** where Gemini finds nothing for a fact, the lane's `data:read` step is the fallback — the plan keeps both, so a country is never blocked on the researcher alone.
