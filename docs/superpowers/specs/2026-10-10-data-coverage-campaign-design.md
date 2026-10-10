# Release-1 data-coverage campaign — design spec

**Date:** 2026-10-10
**Status:** Approved (design). Implementation to follow via `writing-plans`, executed by 5 parallel country lanes.
**Owner decisions:** scope = facts + new programmes; order = IT → HU → NL → DE → FR; parallel model = B.

## Goal

Raise the quantity and completeness of Jisr's reference data for the five Release-1 destinations by running the repository's existing import/enrichment pipeline end to end, country by country, most-deficient first. Two kinds of work per country:

1. **Add missing programmes** (where a Release-1 cell is thin, above all Italy × Computer Science).
2. **Fill missing facts on existing programmes** (tuition, deadlines, teaching language, language-proficiency rules, documents, application channel, requirement rules).

Output: records that quote an official source and carry `last_verified_at`, promoted into `data/`, plus updated coverage reports. No value is invented; anything unverified stays `null` and the app shows "to be checked".

## Baseline (measured 2026-10-10, `pnpm data:coverage`)

| Destination | Programmes | CS | Eng | Bus | Core missing facts |
|---|---:|---:|---:|---:|---|
| France | 755 | 157 | 248 | 350 | teaching language 91, deadlines 20, **scholarships 0**, tuition 24 |
| Germany | 147 | 20 | 75 | 52 | language-proficiency rule 106, deadlines 64, channel 22, documents 19 |
| Hungary | 114 | 18 | 52 | 44 | **deadlines 114 (100 %)**, channel 86, documents 66, language rule 65, tuition 57 |
| Netherlands | 55 | 20 | 17 | 18 | **language rule 50**, deadline 42, documents 43, tuition 31 |
| Italy | 55 | **2** | 19 | 34 | deadline 43, language rule 43, tuition 17, channel 17 |

Data health: `data:check` green (0 errors, 1 cosmetic warning); 0 aging/stale; Arabic 100 % machine draft (out of scope here — this campaign does not review Arabic).

## Order and its metric

**IT → HU → NL → DE → FR.** Ranked by: (a) a near-empty Release-1 cell first (IT × CS = 2); then (b) the share of programmes missing core facts (HU: no deadline on any of 114; NL: language rule missing on 91 %). FR is last on coverage but carries a separate, high-value item — **the FR scholarship set is empty** on the default-locale country.

## Non-negotiable constraints (from `data/README.md`, `.claude/rules/reference-data.md`)

- Official https sources only; **never invent or fill in a value**; unknown stays `null` → ⚠️.
- A model only **proposes**; code re-fetches a **verbatim quote** (`verifyProposal`) and decides. Evidence citing a page the reader was not given is dropped.
- Facts carry `source_url` + `info_kind` (`official|estimate|guidance`) + `last_verified_at`. Tuition is **official only** (never an estimate; ranges need one quote).
- Deadlines: a dated deadline only when the quote states the year; a `recurringDeadline {month, day}` when it states day+month, no year; never both. **Every deadline needs an accepted quote naming international/non-EU applicants** (ADR 0009).
- Scholarships and official cost profiles are **100 % audited** (never waivable). Register-listing / machine-quoted / identical-national batches may be `owner-waived`.
- Source licences are tracked (`data/README.md` licence table); some sources need written permission (Study Finder/HU permission still pending — HU work must respect it).
- Do not rename slugs. `data:check` must stay green. Work happens on branches; **never push to `main` directly** (PRs only).
- The app is `pnpm typecheck`/`pnpm test`/`pnpm lint` green; data PRs additionally need `pnpm data:check`.

## Execution model (Approach B) — 5 parallel country lanes, serialised at the shared ledgers

The **read** (hundreds of pages, model calls) is the bottleneck and is parallel-safe. **Staging and promotion** write one shared `REVIEW.csv` (2.6 MB), `PROMOTED.csv` (4,924 rows) and `AUDIT.csv`; exactly one writer must own them at a time. So the campaign runs in three phases on a single **campaign branch** `data/coverage-2026-10` (off `main`), with five **lane branches** `data/<cc>`.

### Phase 0 — shared setup + serial staging (one writer)
On the campaign branch: fresh `pnpm data:build`; confirm `SERPER_API_KEY` + `OPENCODE_API_KEY` in `.env.local`; fix the reader/checker models and per-lane budgets and the `--verified-on` date; create the five lane worktrees. Then stage **all** new candidates serially (these rewrite `REVIEW.csv`): `pnpm data:import <cc>` (`netherlands|germany|hungary|italy`) and, for Italy, `pnpm data:it-discovery` → `pnpm data:it-stage --ids …`.

### Phase 1 — five parallel country lanes (proposal-only)
Each lane runs in its own worktree `.worktrees/<cc>` on branch `data/<cc>`, and only **produces proposals** (no `data/` writes, no ledger writes):
- `pnpm data:pages --slugs <cc-slugs.txt> --search --topics [--topic-list fees,language,deadline,documents] --max-queries N --out data-staging/pages/<cc>.json`
- `pnpm data:read --model deepseek-v4.1-flash --pages <…> --slugs <cc-slugs.txt> --out data-staging/proposals-read/<cc> --check qwen3.7-plus --max-usd 2`
- `pnpm data:national scripts/import/registries/national-<cc>*.json --out data-staging/proposals-national/<cc>`
- Code-only tools where they exist: `data:fr-language`, `data:fr-calendar`, `data:daad-deadlines`, `data:it-language`.
- Hand-authored proposals: `data:scholarship verify <proposal.json>` (FR set, HU additions), `data:costs-official verify <proposal.json>` only if a 2026 official source exists.

Lane deliverables are committed on `data/<cc>`: disjoint `data-staging/proposals-*/<cc>/**`, registries, and `candidates.json` (IT). No shared file is touched, so merges are clean.

### Phase 2 — serialised integration, one country at a time, on the campaign branch
Merge `data/<cc>` into `data/coverage-2026-10`, then for that country:
```
pnpm data:evidence restage --enrich <proposal-dir> --slugs <slugs.txt>
pnpm data:evidence verify   --enrich <proposal-dir> --slugs <slugs.txt> --dry-run
pnpm data:evidence verify   --enrich <proposal-dir> --slugs <slugs.txt>
pnpm data:audit draw && pnpm data:audit sheet      # you read AUDIT-SAMPLE.md
pnpm data:promote --confirm-human-read --verified-on YYYY-MM-DD --replace-revisions
pnpm data:check
```
New IT programmes stage first (`data:it-stage`) and then flow through the same restage/verify/audit/promote. Each ledger is written by exactly one writer; there are no ledger merges.

## Per-country lane scope

| Lane | Add programmes | Fill facts | Lane tools |
|---|---|---|---|
| **IT** | English-taught CS (L-31) + thin Eng/Bus from Universitaly | tuition, deadline, language rule, documents, channel; visa note | `it-discovery`→`it-stage`, `it-pages` (registry), `it-language`, `it-calendar`, `national-it`, read |
| **HU** | none (114 present) | **deadlines**, tuition, channel, documents, language rule | `national` (new HU registry), read |
| **NL** | thin CS/Eng if RIO yields | tuition (institution-wide non-EU fee rule), deadline, language rule, documents | `national-nl` (Studielink), read |
| **DE** | English-taught CS via DAAD if gaps remain | language rule, deadline, documents, channel | `daad-deadlines`, `national-de-*` (uni-assist VPD), read |
| **FR** | none | teaching language, deadline; **author the FR scholarship set** | `fr-language`, `fr-calendar`, `scholarship`, `national-fr`, read |

## Shared setup details

- **Models:** reader `deepseek-v4.1-flash` (cheap, bake-off-adequate), checker `qwen3.7-plus` (best remover in the bake-off). All ids exist in `scripts/import/llm.ts`.
- **Budgets:** reader `--max-usd` ≥ 2 per lane (tunable), `--concurrency 8`, search `--max-queries` ≥ 300; a hard stop ends a lane without partial promotion (proposals only).
- **Date:** `--verified-on` is the day the owner actually reads the sample; never a future date.
- **Worktrees:** `.worktrees/<cc>` (added to `.gitignore`), one per lane, each with its own `.cache/import` so HTTP caches never race.

## Out of scope (documented, not forgotten)

- Official living-cost profiles for DE/NL/IT and Hungarian housing/food — no 2026 official source (owner decision 2026-10-07); the Numbeo link stays. Only a newly found 2026 official figure would change this.
- The ~1,992-programme German register backlog and the ~658 Dutch backlog: register-listing tier (name/institution/town/field/link only). Promoting them is a separate owner decision, not this campaign.
- Arabic review (C1) and any UI/message work.
- New destinations or fields beyond Release 1.

## Risks and mitigations

- **Unverifiable facts are dropped** → expected; they stay `null`. Budgets cap spend; `--dry-run` first.
- **Wrong pages found by search** → cost tokens only; the reader must quote and the verifier must find the quote.
- **HU has no dedicated deadline tool and Hungarian pages may not state international deadlines** → generic read only; low yield is acceptable, unknown stays unknown.
- **Study Finder (HU) written permission not yet received** → do not republish new HU studyfinder-derived facts until it arrives; HU lane may be blocked on this — record it, do not guess.
- **Model/key spend or rate limits** → per-lane `--max-usd` and `--max-queries`; lanes are independent.
- **Ledger corruption by parallel writers** → eliminated: only Phase 0/2 write ledgers, one writer at a time.

## Definition of done (per country)

1. Lane proposals produced within budget and committed on `data/<cc>`.
2. Merged into `data/coverage-2026-10`; `restage`/`verify` clean (no unsupported facts).
3. `data:audit` sheet produced and the sample **read by the owner** (or waived where the tier allows).
4. `data:promote` run; `pnpm data:check` green; `pnpm data:build` succeeds.
5. Coverage delta recorded (`data:coverage` before/after).
6. Whole campaign: one PR `data/coverage-2026-10` → `main` (never a direct push), `pnpm typecheck`/`test`/`lint` green, `reviewer` subagent over the diff.

## Deliverables

- Promoted new/changed records in `data/**` with quotes and `last_verified_at`.
- New registries under `scripts/import/registries/` (HU; NL/IT additions).
- Updated `docs/reports/coverage-by-*` and `data-staging/PROMOTED.csv`/`REVIEW.csv` ledgers.
- One PR `data/coverage-2026-10` → `main` at the end of the campaign, green and reviewed (per-country PRs are an owner option, but the shared ledgers favour one campaign PR).
