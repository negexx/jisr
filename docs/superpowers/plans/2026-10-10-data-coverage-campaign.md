# Release-1 Data-Coverage Campaign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The five lane tasks (A1–A5) are independent and SHOULD run in parallel; the integration tasks (B1–B5) MUST run one country at a time because they write the shared ledgers.

**Goal:** Raise coverage for France, Germany, the Netherlands, Hungary and Italy by running the repository's import/enrichment pipeline — filling missing facts on existing programmes and adding the missing Italian Computer-Science programmes — most-deficient destination first (IT → HU → NL → DE → FR).

**Architecture:** A long-lived campaign branch `data/coverage-2026-10` off `main`. A serial Phase 0 bootstraps and stages new candidates; five parallel lane worktrees (`data/<cc>`) produce **proposals only**; a serial Phase 2 applies them per country (`restage → verify → audit → promote`), so the shared `REVIEW.csv`/`PROMOTED.csv`/`AUDIT.csv` always have a single writer.

**Tech Stack:** Node 24 + tsx scripts; `data:*` pipeline (`data:import`, `data:it-discovery`, `data:it-stage`, `data:pages`, `data:read`, `data:national`, `data:fr-language`, `data:fr-calendar`, `data:daad-deadlines`, `data:it-language`, `data:scholarship`, `data:evidence`, `data:audit`, `data:promote`, `data:coverage`); OpenCode models `deepseek-v4.1-flash` (reader) and `qwen3.7-plus` (checker); Serper for search.

**Spec:** `docs/superpowers/specs/2026-10-10-data-coverage-campaign-design.md`

## Global Constraints

- Official https sources only; **never invent a value**; unknown stays `null`. A model only proposes; code re-fetches a verbatim quote and decides.
- Tuition is `official` only. A deadline needs a quote naming international/non-EU applicants; dated only with a year, else `recurringDeadline {month, day}`; never both.
- Scholarships and official cost profiles are 100 % audited, never waivable.
- Do not rename slugs. `pnpm data:check` must stay green. `pnpm typecheck`/`pnpm test`/`pnpm lint` green for the PR.
- Branches and PRs only; **never commit or push to `main`**.
- Per-lane budgets: reader `--max-usd 2`, search `--max-queries 300`, `--concurrency 8`. A lane that hits its cap stops; it produces only what fits.
- `--verified-on YYYY-MM-DD` is the day the owner reads the sample; never a future date.
- Respect source licences; the Study Finder (HU) written permission is not yet received, so new HU Study-Finder-derived facts are out of scope until it arrives.

## Review Focus

Inputs/conditions the spec implies but no single step exercises; each is pinned to a task's acceptance.

1. A fact the reader "knows" but the page does not state — `verifyProposal` must drop it (quote not found). Acceptance: `verify --dry-run` reports 0 unsupported facts.
2. A deadline an EU-only page states — must be rejected for a Moroccan applicant. Acceptance: no promoted deadline lacks an international-applicant quote.
3. Five lanes writing the shared ledgers — must never happen. Acceptance: only Phase 0/2 touch `REVIEW.csv`/`PROMOTED.csv`/`AUDIT.csv`; lanes commit only `proposals-*`.
4. A lane whose model/search budget runs out mid-run — must leave no partial promotion (proposals only). Acceptance: `--max-usd` respected and no `data/` record appears before Phase 2.
5. A programme whose official page cannot be fetched (403/429) — the run must stop politely, not hammer it. Acceptance: HTTP errors surface in the lane report; no retry storm.

---

### Task A0: Campaign bootstrap (serial, one writer)

**Files:**
- Modify: `.gitignore` (add `.worktrees/`)
- Create (not committed): `.worktrees/{it,hu,nl,de,fr}` worktrees
- Create: `data-staging/campaign/baseline-coverage.md` (the before snapshot)

**Interfaces:**
- Produces: branch `data/coverage-2026-10`; lane branches `data/{it,hu,nl,de,fr}`; a baseline coverage file Task C compares against.

- [ ] **Step 1: Confirm the environment.** From the campaign branch:
  - `git switch data/coverage-2026-10` (already created and holds the spec commit).
  - Confirm `.env.local` has `SERPER_API_KEY` and `OPENCODE_API_KEY` (names only): `grep -oE '^[A-Z_]+=' .env.local`.
  - `pnpm install && pnpm data:check && pnpm data:build`.

- [ ] **Step 2: Record the baseline.** `mkdir -p data-staging/campaign && pnpm data:coverage > data-staging/campaign/baseline-coverage.md`. Read it; it must match the spec's baseline table.

- [ ] **Step 3: Ignore and create worktrees.**
  - Add `.worktrees/` to `.gitignore`.
  - For each `cc` in `it hu nl de fr`: `git worktree add .worktrees/<cc> -b data/<cc> data/coverage-2026-10`.
  - Verify with `git worktree list` (six entries incl. the main checkout) and `git branch`.

- [ ] **Step 4: Commit the bootstrap.** `git add .gitignore data-staging/campaign/baseline-coverage.md && git commit -m "chore: bootstrap the data-coverage campaign (branch, worktrees, baseline)"`.

---

### Task A1: Italy lane — proposals (parallel)

**Files:**
- Work in `.worktrees/it` on branch `data/it`.
- Create: `data-staging/proposals-read/it/**`, `data-staging/proposals-it-language/**` (if it yields), `data-staging/campaign/it/{slugs.txt,pages.json,candidates.json}`, and a registry `scripts/import/registries/national-it.json` addition if new national facts are found.

**Interfaces:**
- Consumes: `data:it-discovery` (read-only), `data:it-pages` (needs the programme slugs to exist in `data/`).
- Produces (consumed by Task B1): the proposal dirs above and `data-staging/campaign/it/slugs.txt`.

- [ ] **Step 1: Discover new programmes.** In `.worktrees/it`: `pnpm data:it-discovery` (about 26 requests; writes `data-staging/universitaly/<day>/report.md` + `candidates.json`). Read `report.md`; select the **computer-science (L-31)** candidates first, then any thin engineering/business candidates the report clearly lists. Copy the chosen portal ids into `data-staging/campaign/it/candidates.json`.

- [ ] **Step 2: Record the existing-fact targets.** `pnpm data:coverage --detail --csv data-staging/campaign/it/it-coverage.csv`; build `data-staging/campaign/it/slugs.txt` = every `it-*` programme with `missing_count > 0` (inspect the CSV header; use `awk`). These programmes get enriched for tuition, deadline, language rule, documents, channel.

- [ ] **Step 3: Build the pages file.** `pnpm data:it-pages --registry scripts/import/registries/it-pages-1.json,it-pages-2.json,it-pages-3.json,it-pages-4.json --out data-staging/campaign/it/pages.json`. If a selected candidate is not yet in `data/`, it is added in Task B1 first; the registry covers the 55 existing programmes.

- [ ] **Step 4: Read (model).** `pnpm data:read --model deepseek-v4.1-flash --pages data-staging/campaign/it/pages.json --slugs data-staging/campaign/it/slugs.txt --out data-staging/proposals-read/it --check qwen3.7-plus --max-usd 2 --concurrency 8`. Expected: a proposal JSON per programme, each fact carrying a quote.

- [ ] **Step 5: Code-only national facts.** `pnpm data:national scripts/import/registries/national-it.json --out data-staging/proposals-national/it --dry-run` then without `--dry-run`. Run `pnpm data:it-language --dry-run` and `pnpm data:it-calendar`.

- [ ] **Step 6: Sanity gate + commit.** `pnpm data:evidence verify --enrich data-staging/proposals-read/it --slugs data-staging/campaign/it/slugs.txt --dry-run` must report **0 unsupported facts** (facts with no quote are fine as "dropped"). Then `git add data-staging/proposals-read/it data-staging/proposals-it-language data-staging/proposals-national/it data-staging/campaign/it scripts/import/registries` and commit `feat(data-it): proposals for Italian programmes`.

- [ ] **Step 7: Report.** Publish, in the lane report: new candidates chosen, programmes read, proposals produced, facts dropped, USD spent, and any HTTP 403/429.

### Task A2: Hungary lane — proposals (parallel)

**Files:** work in `.worktrees/hu` on `data/hu`; create `data-staging/proposals-read/hu/**`, `data-staging/proposals-national/hu/**`, `data-staging/campaign/hu/{slugs.txt,pages.json}`, and `scripts/import/registries/national-hu.json`.

**Interfaces:** Produces the proposal dirs + slugs file consumed by Task B2.

- [ ] **Step 1: Targets.** `pnpm data:coverage --detail --csv data-staging/campaign/hu-coverage.csv`; `data-staging/campaign/hu/slugs.txt` = every `hu-*` programme with `missing_count > 0` (deadline is the priority).
- [ ] **Step 2: Pages (search).** `pnpm data:pages --slugs data-staging/campaign/hu/slugs.txt --search --topics --topic-list fees,language,deadline,documents --max-queries 300 --out data-staging/campaign/hu/pages.json`.
- [ ] **Step 3: Read.** `pnpm data:read --model deepseek-v4.1-flash --pages data-staging/campaign/hu/pages.json --slugs data-staging/campaign/hu/slugs.txt --out data-staging/proposals-read/hu --check qwen3.7-plus --max-usd 2 --concurrency 8`.
- [ ] **Step 4: National facts.** Author `scripts/import/registries/national-hu.json` (documents + applicationChannel entries with an official https `url` and a verbatim ≥15-char quote; e.g. the Hungarian application/visa pages). Verify: `pnpm data:national scripts/import/registries/national-hu.json --out data-staging/proposals-national/hu --dry-run` then without.
- [ ] **Step 5: Gate + commit + report** as in A1 (commit message `feat(data-hu): proposals for Hungarian programmes`; note the Study Finder permission limit).

### Task A3: Netherlands lane — proposals (parallel)

**Files:** work in `.worktrees/nl` on `data/nl`; create `data-staging/proposals-read/nl/**`, `data-staging/proposals-national/nl/**`, `data-staging/campaign/nl/{slugs.txt,pages.json}`.

- [ ] **Step 1: Targets.** `data-staging/campaign/nl/slugs.txt` = every `nl-*` programme with `missing_count > 0` (tuition and language rule priority; the reader's NL note allows an institution-wide non-EU fee page under strict conditions).
- [ ] **Step 2: Pages.** `pnpm data:pages --slugs data-staging/campaign/nl/slugs.txt --search --topics --max-queries 300 --out data-staging/campaign/nl/pages.json`.
- [ ] **Step 3: Read.** Same shape as A2 (`--out data-staging/proposals-read/nl`).
- [ ] **Step 4: National facts.** `pnpm data:national scripts/import/registries/national-nl.json --out data-staging/proposals-national/nl --dry-run` then without.
- [ ] **Step 5: Gate + commit + report** (`feat(data-nl): proposals for Dutch programmes`).

### Task A4: Germany lane — proposals (parallel)

**Files:** work in `.worktrees/de` on `data/de`; create `data-staging/proposals-de-deadlines/**` (code), `data-staging/proposals-read/de/**`, `data-staging/proposals-national/de/**`, `data-staging/campaign/de/{slugs.txt,pages.json}`.

- [ ] **Step 1: Targets.** `data-staging/campaign/de/slugs.txt` = every `de-*` programme with `missing_count > 0` (language rule and deadline priority).
- [ ] **Step 2: DAAD deadlines (code).** `pnpm data:daad-deadlines --dry-run` then `pnpm data:daad-deadlines` → `data-staging/proposals-de-deadlines/`.
- [ ] **Step 3: Pages + read.** `pnpm data:pages --slugs data-staging/campaign/de/slugs.txt --search --topics --max-queries 300 --out data-staging/campaign/de/pages.json`; then `pnpm data:read … --out data-staging/proposals-read/de …`.
- [ ] **Step 4: National facts.** `pnpm data:national scripts/import/registries/national-de-channel.json scripts/import/registries/national-de-documents.json --out data-staging/proposals-national/de --dry-run` then without.
- [ ] **Step 5: Gate + commit + report** (`feat(data-de): proposals for German programmes`).

### Task A5: France lane — proposals (parallel)

**Files:** work in `.worktrees/fr` on `data/fr`; create `data-staging/proposals-fr-language-fiche/**` (code), `data-staging/proposals-fr-calendar/**` (code), `data-staging/scholarships/fr-*.yaml` (from verified proposals), `data-staging/proposals-read/fr/**`, `data-staging/campaign/fr/{slugs.txt,pages.json}`.

- [ ] **Step 1: Teaching language (code).** `pnpm data:fr-language --dry-run` then `pnpm data:fr-language`.
- [ ] **Step 2: Deadlines (code).** `pnpm data:fr-calendar --dry-run` then `pnpm data:fr-calendar`.
- [ ] **Step 3: The FR scholarship set (authoring).** Research each realistic Bachelor-level French scholarship (official provider pages only; verify each is open to Moroccan undergraduates), write a proposal JSON per scheme, and run `pnpm data:scholarship verify <proposal.json>` for each. Verify each page's quote is re-fetched and kept.
- [ ] **Step 4: Remaining facts.** `data-staging/campaign/fr/slugs.txt` = FR programmes with `missing_count > 0` (excluding the language/calendar ones already covered); `pnpm data:pages … --search --topics … --out data-staging/campaign/fr/pages.json`; `pnpm data:read … --out data-staging/proposals-read/fr …`.
- [ ] **Step 5: National facts.** `pnpm data:national scripts/import/registries/national-fr.json --out data-staging/proposals-national/fr --dry-run` then without.
- [ ] **Step 6: Gate + commit + report** (`feat(data-fr): proposals, scholarships and language for French programmes`).

---

### Task B1: Integrate Italy (serial, after A1)

**Files:** on `data/coverage-2026-10`; merged `data/it` branch; then `data/**` + ledgers.

**Interfaces:** Consumes A1's proposal dirs and `candidates.json`.

- [ ] **Step 1: Stage the new candidates (first writer of the ledgers).** `pnpm data:it-stage --ids <chosen ids>` per `data-staging/campaign/it/candidates.json`. If a university cannot be resolved, stop and report (do not guess).
- [ ] **Step 2: Rebuild the new programmes' pages and read.** `pnpm data:it-pages --registry … --out data-staging/campaign/it/pages.json` again now the new slugs exist; `pnpm data:read --model deepseek-v4.1-flash --pages data-staging/campaign/it/pages.json --slugs <new+old> --out data-staging/proposals-read/it --check qwen3.7-plus --max-usd 2`.
- [ ] **Step 3: Apply.** `pnpm data:evidence restage --enrich data-staging/proposals-read/it --slugs data-staging/campaign/it/slugs.txt` → `verify --dry-run` (0 unsupported) → `verify`.
- [ ] **Step 4: Audit.** `pnpm data:audit draw && pnpm data:audit sheet`. **The owner reads `data-staging/AUDIT-SAMPLE.md`.** `pnpm data:audit status` must show the batch passed.
- [ ] **Step 5: Promote + check.** `pnpm data:promote --confirm-human-read --verified-on YYYY-MM-DD --replace-revisions`; `pnpm data:check`. Record the coverage delta.

### Task B2: Integrate Hungary (serial, after A2)
Same shape as B1: `restage --enrich data-staging/proposals-read/hu` + `data-staging/proposals-national/hu` → `verify` → `audit` (owner reads) → `promote --replace-revisions` → `data:check`; record delta.

### Task B3: Integrate the Netherlands (serial, after A3)
Same shape (proposals-read/nl + proposals-national/nl).

### Task B4: Integrate Germany (serial, after A4)
Same shape, including `data-staging/proposals-de-deadlines`.

### Task B5: Integrate France (serial, after A5)
Same shape, including `proposals-fr-language-fiche`, `proposals-fr-calendar`, and the FR scholarships (**100 % audited**). Note: FR teaching language and calendar proposals are `restage --enrich`; the scholarships follow the normal scholarship audit + promote path.

---

### Task C: Campaign close

**Files:** `docs/reports/coverage-by-*`, `data-staging/campaign/*`.

- [ ] **Step 1: Re-measure.** `pnpm data:coverage > data-staging/campaign/final-coverage.md` and `pnpm data:coverage --detail --out docs/reports/coverage-by-institution-<date>.md --csv docs/reports/coverage-by-programme-<date>.csv`. Compare with baseline.
- [ ] **Step 2: Full gate.** `pnpm typecheck && pnpm test && pnpm lint && pnpm data:check --strict && pnpm data:build` — all green.
- [ ] **Step 3: Clean up.** `git worktree remove .worktrees/<cc>` for each lane; delete merged lane branches with `git branch -d`.
- [ ] **Step 4: Review + PR.** Run the `reviewer` subagent over the campaign diff. Open one PR `data/coverage-2026-10` → `main` with the coverage delta in the body. Never push to `main`.

---

## Self-review notes (for the plan author)
- Spec coverage: every spec section maps to a task (order → A1–A5 order; trust constraints → Global Constraints + Review Focus; new programmes → A1/B1; per-country tools → A1–A5; shared setup → A0; serialised integration → B1–B5; done → C).
- New programmes are **IT only** (the DE/NL register backlogs are out of scope per the spec).
- Type/name consistency: proposal dirs, slugs files, branch names and worktree paths are used identically across tasks.
