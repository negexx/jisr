# Official-source cost profiles (design and plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Why this replaces the Numbeo plan.** Numbeo (see `2026-10-05-cost-of-living-numbeo.md`) answered HTTP 429 to the one-off scrape and stayed blocked for 11 hours. The owner decided on 2026-10-06: use free and official sources, and not to circumvent the block. The Numbeo code stays in the tree (documented, parked); its 20 staged profiles are parked and never promoted.

**Goal:** give every programme a first-year living-cost estimate (housing, food, transport, insurance, visa fees, one-off costs) from the figures that official bodies publish, each stored with a verbatim quote from the official page, checked by code, read by the owner, then promoted.

## What official sources give (researched 2026-10-06; per-country reports in the session, summarised here)

Official sources publish national figures, almost never per-city ones. France has a Paris vs rest split, Italy has per-region residence rents, Hungary has only Budapest and 2019 data. Reuse licences are stated nowhere: we cite the page URL and the date read, and quote only the figure.

## Design (owner-approved approach: "country profiles")

1. **One profile per country** (`<cc>-official`, `city: null`), plus a city profile only where an official city figure exists. Version 1 has one: `fr-paris-official` (Île-de-France transport pass and Paris Crous rent from Campus France). Italy per-city residence rents (garbled PDF) and the Budapest pass (eligibility changed 15 June 2026) are left out. The domain already uses a city profile first, then the country profile, per line, so nothing in `src/domain` or the UI changes.
2. **Lines**: only those with a figure on an official page that verifies. A gap stays unknown (Hungary food and housing, Italy rent), never filled in. A figure older than 2023 is not used unless it is a legal rate in force (so Hungary's 2019 Study in Hungary figures are out). Annual figures stay `per: year`, monthly `per: month`, one-off `per: once`: no conversion by us (the domain multiplies months by 10). The visa-means amount is not a cost line and is not used.
3. **A single published figure is stored as `min = max`** (the UI already prints a plain amount for equal ends); a published range is stored as the range. Never an invented spread.
4. **`info_kind`**: `official` for a rate or fee a body sets (CVEC, visa and permit fees, statutory health contribution, BAföG rates); `estimate` for averages, surveys and guidance (Campus France "about 300 EUR" food, Nibud and Sozialerhebung averages, Crous average rent). Every `estimate` carries a trilingual `basis` (fr required, en and ar draft) that names the publisher, the year and says what the number is. Both kinds carry `source_url` and `last_verified_at` (stamped by `data:promote`).
5. **Proposal, verify, stage, audit, promote** (same model as scholarships): the assistant writes a proposal JSON per country from the official pages; `pnpm data:costs-official verify <proposal.json>` re-fetches every cited page and keeps a line only if (a) the host is on the official allowlist (reuse the scholarship one), (b) the quote is on the page verbatim (whitespace and case normalised), (c) every number of the line's value appears in the quote with the right currency, (d) the quote carries a year or "current" wording for `estimate`s older than the rule above. Pages the bot cannot fetch (403, 502) drop their line and are reported. Staged records are 100% audited (always sampled, like scholarships) because a model prepared the quotes; the batch is about 40 facts.
6. **Slugs**: `<cc>-official`, `fr-paris-official`; the Numbeo `<cc>-numbeo` slugs are parked, so no country ever has two profiles.

## Global constraints

Same as the Numbeo plan: stage explicit file paths only; hold-outs (Hanze programmes and institutions, ISM `-daad9020`, every `hu-*` programme, the staged LUM programme) are moved aside before `data:audit draw` and `data:promote`, and so are the parked Numbeo cost profiles (`data-staging/cost-profiles/*-numbeo.yaml`, move them to `data-staging/parked-numbeo/`); `pnpm data:check` right after the promote; conventional commits ending `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; no `any`, `@ts-ignore`, non-null `!`; never write regexes with backslashes through the shell; `export SWC_NATIVE_BINDING_CACHE='C:\Users\dagda\.swc-cache'` before pnpm; politeness for the official pages (one request at a time, 2 s apart, cached, the project User-Agent; stop on the first 429 or 403 and report); an Opus `reviewer` pass after every task that changes code.

## File structure

- Create `scripts/import/official-costs.ts` (CLI `pnpm data:costs-official`), `tests/scripts/import/official-costs.test.ts`.
- Modify `scripts/import/audit.ts` (always sample `cost-profiles/*-official`; the sheet section already exists), `package.json`, `data/README.md`, `.claude/CLAUDE.md`.
- Data (through staging only): `data-staging/proposals-cost-official/<cc>.json` then `data-staging/cost-profiles/<cc>-official.yaml`.

---

### Task 1: the verifier (`data:costs-official verify`)

**Files:** `scripts/import/official-costs.ts`, `tests/scripts/import/official-costs.test.ts`, `package.json`.

**Interfaces:** reads `scripts/import/scholarships.ts` for the official-host check, the page-fetch and the quote-matching helpers (reuse, do not copy; export them if needed) and `scripts/import/costs.ts` for `StagedCostProfile`, the staging write and the `_review` shape. Proposal schema (Zod, in the new file): `{ slug, country, city (slug or null), lines: { housing|food|transport|insurance|application_visa|setup: { min, max, currency, per, info_kind: "official"|"estimate", basis: {fr,en,ar}, evidence: { url, quote } } } }`, amounts in major units (code converts to minor units with `minorUnitDigits`).

- [ ] Failing tests first (injected fetch, no network): a line whose quote is on an allowed-host page and carries its numbers is kept and staged with `source` set to the host and `sources` listing the url; a quote not on the page, an off-allowlist host, a number missing from the quote, a currency missing, an unfetchable page (403), a stale year: each drops only that line and is reported; a profile with no kept line is not staged; an existing staged file or a slug already in `data/` is never overwritten; the output validates against `CostProfileRecordSchema` once stamped; min = max for a single figure; a dry run writes nothing.
- [ ] Implement, `pnpm test`, `pnpm typecheck`, `pnpm lint`, commit `feat: data:costs-official verifies official cost quotes and stages cost profiles`. Then Opus review.

### Task 2: always audit official cost profiles

**Files:** `scripts/import/audit.ts`, `tests/scripts/import/audit-cost-profiles.test.ts`.

- [ ] Failing test: `cost-profiles/fr-official` and `cost-profiles/fr-paris-official` are drawn into every batch (`ALWAYS_SAMPLED` pattern extended), Numbeo profiles keep the normal 10%. Implement, commit `feat: official cost profiles are always in the audit sample`. Opus review.

### Task 3: proposals from the official pages (controller)

- [ ] For each country read the cited official pages as text (curl with the project User-Agent, cached by the CLI later), pick the exact verbatim sentence for each figure, write `data-staging/proposals-cost-official/<cc>.json` (FR, DE, NL, IT, HU, fr-paris). Candidate figures from the research: FR Crous rent 350 average elsewhere and 450 Paris, food about 300, transport 250-300 per year elsewhere and 374.40 per year Île-de-France (Campus France), CVEC 105 (cvec.etudiant.gouv.fr), VLS-TS validation 150 (service-public.gouv.fr), health free; DE rent including utilities 410 and food 198 and transport (Sozialerhebung on the DAAD finances page), semester ticket 37.80 per month, BAföG housing 380 (law), dorm average 305.52, statutory health insurance; NL rent 561, food 244 (conflict with 138 and 272: use only after reading the Nibud report), transport 67, health insurance 133 or the Rijksoverheid average premium 157, IND permit fee 254; IT SSN 700 per year (confirm on salute.gov.it), visa fee 50, permit contribution 40 or 50 plus 30.46 card and 16 marca da bollo; HU health contribution 12,300 per month (NAV). Anything whose page cannot be read stays out.
- [ ] `pnpm data:costs-official verify` per proposal (dry run first), read every staged profile against its page text.

### Task 4: audit, owner reads, promote (owner gate)

- [ ] Park the Numbeo staged profiles, hold-outs aside, `pnpm data:audit draw`, `pnpm data:audit sheet`, restore, then STOP and hand the owner `data-staging/AUDIT-SAMPLE.md`.
- [ ] After "correct": hold-outs aside, `pnpm data:promote --confirm-human-read --verified-on <date> --audited-batch`, `pnpm data:check` before committing, `pnpm data:build`, restart the dev server, browser check of one programme per country in fr and ar (cost block shows the Estimate or Official tag and the official source), `pnpm typecheck && pnpm lint && pnpm test`, Opus final review, push, draft PR, read CI once.

### Task 5: documentation

- [ ] `data/README.md`: source rows for the official pages, the "Official cost profiles" section (formulas, rules above, the allowlist, the age rule), the parked-Numbeo note; one line in `.claude/CLAUDE.md`. Commit `docs: official cost profiles`.

## Open decisions (defaults in this plan)

1. A single published figure is stored as min = max.
2. Figures older than 2023 are not used unless they are a legal rate in force.
3. The Numbeo code stays in the PR (parked, documented); its staged profiles are not promoted.
4. Per-city profiles: only Paris in version 1.
