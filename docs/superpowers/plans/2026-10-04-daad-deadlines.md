# DAAD application-period deadlines (research round 3, run 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the DAAD "Application periods" block ("The following is valid for applicants from: all countries / non-EU countries ... until 15 July") into verified intake-only deadline proposals for the German programmes that have none, with no model and no search credits.

**Architecture:** `scripts/import/daad-deadlines.ts` (modelled on `fr-calendar.ts`) parses the block by code and writes `data-staging/proposals-de-deadlines/<slug>.json`. The proposals go through the existing flow (`restage --enrich`, `verify --enrich`, `data:audit`, `data:promote --replace-revisions`). `mentionsInternationalApplicants` learns that "applicants from: all countries" covers a Moroccan applicant, so `verifyProposal` accepts the quote.

**Why:** run-1 analysis. Of 87 DE programmes without a deadline that were read last round, 59 DAAD pages print the deadline under "The following is valid for applicants from: all countries" (5 more under "non-EU countries"); the reader proposed it for few and `verifyProposal` rejected the rest because "all countries" was not on the international-wording list. Owner approved the code-parser approach (2026-10-04).

**Tech Stack:** TypeScript (strict), Vitest, Zod (`ProposalSchema`), existing `pageText` / `verifyProposal`.

## Global Constraints

- A model only proposes, code decides; here no model is called. Every fact has a verbatim quote that `verifyProposal` re-fetches from the cited page.
- Only the DAAD register page of the programme is cited (it is the programme's `officialUrl`).
- Unknown stays unknown: a block that does not match the strict grammar, an audience that is not "all countries" or non-EU, an ambiguous result (two different winter/unlabelled deadlines) or a dated deadline that is already past gives no proposal.
- Winter semester (or an unlabelled period) only; a summer-only block gives no proposal (an intake has no semester label).
- No year in the quote -> `recurringDeadline` `{month, day}` (ADR 0009); a year -> dated `applicationDeadline`, never a guessed year; never both on one intake. The deadline is the END of a range or the "until" date. `applicationOpens` only when both ends of a range state a year.
- `src/` is not touched. No `any`, no `@ts-ignore`, no non-null `!`. Tests use temp dirs and never touch `data/` or `data-staging/`.
- Nothing in `data/` is edited by hand.

---

### Task 1: "applicants from: all countries" counts as international wording

**Files:**
- Modify: `scripts/import/evidence.ts` (the `INTERNATIONAL_WORDS` list, ~line 115)
- Test: `tests/scripts/import/evidence.test.ts` (`mentionsInternationalApplicants` block, ~line 209)

**Interfaces:**
- Produces: `mentionsInternationalApplicants(quote)` is true for a quote containing `applicants from: all countries` (DAAD register wording). Unchanged for every other input.

- [ ] **Step 1: Write the failing tests** — in the `is true for` list add `"The following is valid for applicants from: all countries For the winter semester: until 15 July"`; in the `is false for` list add `"The following is valid for applicants from: EU countries For the winter semester: until 15 July"` and `"All countries have a deadline: 15 July"`.
- [ ] **Step 2: Run** `pnpm exec vitest run tests/scripts/import/evidence.test.ts` -> the first new case FAILS.
- [ ] **Step 3: Implement** — add to `INTERNATIONAL_WORDS`, with the comment `// DAAD register: "The following is valid for applicants from: all countries" includes applicants from outside the EU`:

```ts
  /applicants from:\s*all countries/i,
```

- [ ] **Step 4: Run** the same command -> PASS.
- [ ] **Step 5: Commit** `git add scripts/import/evidence.ts tests/scripts/import/evidence.test.ts && git commit -m "feat: a DAAD 'applicants from: all countries' deadline counts as international"`

### Task 2: the DAAD deadline parser, builder and CLI

**Files:**
- Create: `scripts/import/daad-deadlines.ts`
- Create: `tests/scripts/import/daad-deadlines.test.ts`
- Modify: `package.json` (script `"data:daad-deadlines": "tsx scripts/import/daad-deadlines.ts"`, next to `data:fr-calendar`)
- Modify: `data/README.md` (one section after "National calendar (France...)": the command, grammar, rules, and that proposals go through `restage --enrich` / `verify --enrich`)

**Interfaces:**
- Consumes: `pageText(url)` (`./evidence`), `ProposalSchema`, `Proposal` (`./proposals`), `mentionsInternationalApplicants` (`./evidence`), `DATA_DIR`, `STAGING_DIR` (`./staging`).
- Produces:
  - `type DaadIntake = { startDate: null; applicationOpens: string | null; applicationDeadline: string | null; recurringDeadline: { month: number; day: number } | null }`
  - `type DaadOutcome = { ok: true; intake: DaadIntake; quote: string } | { ok: false; reason: "no-block" | "no-qualifying-audience" | "unparsed" | "summer-only" | "past" | "ambiguous" }`
  - `daadDeadline(text: string, today: string): DaadOutcome` (pure; `today` is ISO `YYYY-MM-DD`)
  - `type DaadProgramme = { slug: string; url: string }`
  - `buildDaadProposals(input: { programmes: readonly DaadProgramme[]; textOf: (url: string) => Promise<string>; today: string }): Promise<{ proposals: Proposal[]; skipped: { slug: string; reason: string }[] }>`
  - `readDaadProgrammes(dataDir: string): Promise<DaadProgramme[]>` (German programmes whose `officialUrl` or `sources.programme.url` is a DAAD `/international-programmes/en/detail/` page and that hold no intake with a deadline)
  - `writeDaadProposals(proposals, dir, dry)`; `staleDaadProposalFiles(dir, proposals)` is NOT duplicated: import `writeCalendarProposals` and `staleProposalFiles` from `./fr-calendar`.

**Grammar** (text from `pageText`, one line): block = text after `Application periods` up to `More information on application periods` or `Joint degree` (else 600 chars). Split the block before each `The following is valid for applicants from:`. A piece matches `^The following is valid for applicants from:\s*(?<audience>.*?)\s*(?:For the (?<sem>winter|summer) semester:\s*)?(?<tail>(?:until\s+)?\d.*)$`; the tail is `until D` or `D - D`, where `D` = `<day> <English month name>( <4-digit year>)?`; a real calendar date is required. Audience qualifies when it is exactly `all countries` or contains `non-EU countries` (case-insensitive). The quote is the whole trimmed piece.

- [ ] **Step 1: Write the failing tests** (`tests/scripts/import/daad-deadlines.test.ts`). Fixtures are one-line strings shaped like the real pages:

```ts
const page = (block: string) =>
  `Mode of study full-time Application periods ${block} More information on application periods Please find more details on this website. Joint degree / double degree programme No`;
const ALL = "The following is valid for applicants from: all countries";
const TODAY = "2026-10-04";
```

Cases (each asserts the exact `DaadOutcome`):
1. `${ALL} For the winter semester: until 15 July` -> ok, intake `{startDate:null, applicationOpens:null, applicationDeadline:null, recurringDeadline:{month:7,day:15}}`, quote equals the block text.
2. `${ALL} For the winter semester: 15 February - 31 May` -> recurring 31/5, applicationOpens null.
3. `${ALL} 1 November - 31 March` (unlabelled) -> recurring 31/3.
4. `${ALL} For the winter semester: until 15 July 2027` -> dated `applicationDeadline: "2027-07-15"`, recurring null.
5. `${ALL} For the winter semester: until 15 July 2026` -> `{ok:false, reason:"past"}` (today 2026-10-04).
6. `${ALL} For the winter semester: 1 November 2026 - 31 March 2027` -> opens `2026-11-01`, deadline `2027-03-31`.
7. `The following is valid for applicants from: non-EU countries For the winter semester: 15 April - 15 May The following is valid for applicants from: EU countries Iceland Norway For the winter semester: 1 June - 15 July` -> recurring 15/5 and the quote contains only the non-EU piece.
8. `The following is valid for applicants from: EU countries For the winter semester: until 15 July` -> `no-qualifying-audience`.
9. `${ALL} For the summer semester: until 15 January` -> `summer-only`; and winter + summer pieces -> the winter one.
10. Two qualifying winter pieces with different dates -> `ambiguous`; with the same dates -> ok.
11. `This programme has no deadline listed.` and a page with no block -> `no-block`/`unparsed` as follows: no `Application periods` text -> `no-block`; a block that does not match the grammar (`At Frankfurt School ... the application deadline is at the end of June.`, `31 August for winter semester 28./29. February for summer semester`) -> `unparsed`.
12. Impossible date `until 31 February` -> `unparsed`.
13. For every ok case, `mentionsInternationalApplicants(quote)` is true.
14. `buildDaadProposals` with a fake `textOf`: returns a `ProposalSchema`-valid proposal (`programmePage` = the DAAD url, one `intakes` fact, evidence `[{url, quote}]`), reports skipped slugs with their reasons, and a `textOf` that throws puts that slug in `skipped` with reason `page unreadable`.
15. `verifyProposal` (the real one, with the fake text injected the way `fr-calendar.test.ts` does) accepts the proposal's `intakes` fact for cases 1 and 4 (check how that test calls `verifyProposal` and copy it; if it needs a deps parameter use it, otherwise assert through `checkRecurringDeadline` / `checkDeadline` / `mentionsInternationalApplicants` directly).
16. `readDaadProgrammes` on a temp `data/` (two DE DAAD programmes, one with a deadline already, one FR, one DE non-DAAD): returns only the DAAD programme without a deadline.

- [ ] **Step 2: Run** `pnpm exec vitest run tests/scripts/import/daad-deadlines.test.ts` -> FAIL (module missing).
- [ ] **Step 3: Implement** `scripts/import/daad-deadlines.ts` per the interfaces and grammar above. CLI `main`: `--dry-run`; `readDaadProgrammes(DATA_DIR)`; `today` = `new Date().toISOString().slice(0, 10)`; `buildDaadProposals` with `pageText`; writes to `data-staging/proposals-de-deadlines/` unless dry; prints "would write/wrote N proposals of M DAAD programmes without a deadline" and a count per skip reason, plus stale files via `staleProposalFiles`; same `process.argv[1]?.endsWith("daad-deadlines.ts")` guard as `fr-calendar.ts`.
- [ ] **Step 4: Run** the test file -> PASS; then `pnpm typecheck && pnpm lint`.
- [ ] **Step 5: Add the `package.json` script and the README section**, run `pnpm lint`.
- [ ] **Step 6: Commit** `git add scripts/import/daad-deadlines.ts tests/scripts/import/daad-deadlines.test.ts package.json data/README.md docs/superpowers/plans/2026-10-04-daad-deadlines.md && git commit -m "feat: data:daad-deadlines reads the DAAD application periods by code"`

### Task 3: Opus review, then the data run (controller, not an implementer)

- [ ] `reviewer` subagent (Opus 5.5, medium) on `git diff origin/feat/research-round-2..HEAD`; fix findings.
- [ ] Run `pnpm data:daad-deadlines --dry-run`, then for real; then the flow: `data:evidence restage --enrich data-staging/proposals-de-deadlines --slugs <file>`, `verify --enrich` (dry run first), check every unsampled record (value + quote), move held-out Hanze/ISM files aside before any promote, `data:audit`, STOP for the owner's audit sample.
