# Dutch tuition: institution-wide flat fees under strict gates (research round 3, run 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Recover the non-EU tuition of Dutch programmes whose institution publishes ONE institutional fee for all bachelor programmes, without relaxing the checker and without using a stale study year.

**Architecture:** (1) `checkTuition` in `scripts/import/evidence.ts` learns a study-year rule: when a quote labels amounts with study years ("2025-2026", "2026/27"), the label nearest to the proposed amount must start at the current study year or later, so a past year's rate sheet can never be accepted (the R2-T2 follow-up). (2) The reader's NL country note (`COUNTRY_NOTES.NL` in `scripts/import/reader.ts`, placed after the pages so the cache is kept) tells the reader when an institution-wide fee page may be used. (3) Data run: pages for the 39 programmes (fee pages already reached last round; Serper only for institutions with no readable fee page), `data:read --check`, restage/verify `--enrich`, audit, promote.

**Owner decision (2026-10-04, "Yes, with strict gates"):** a flat institution-wide fee that the official page explicitly says covers bachelor/all programmes counts as that programme's tuition. Checker unchanged; institutions that publish only a range or no amount stay unknown and are reported by name.

## Global Constraints

- A model proposes, code decides: the amount must appear in a verbatim quote re-fetched by `verifyProposal`; the checker model still judges the claim per programme and a Moroccan (non-EU) applicant; the audit sample reads the result.
- Only official institution pages. Never the statutory fee (wettelijk collegegeld, EU/EEA). Never a range ("varies per programme", "from-to"). Never a past study year.
- Existing official values are never overwritten; nothing in data/ is edited by hand.
- `src/` untouched; no `any`, `@ts-ignore`, non-null `!`; tests use injected text and temp dirs.

---

### Task 1: study-year gate in `checkTuition`

**Files:** Modify `scripts/import/evidence.ts` (`checkTuition`, new `currentStudyYear`), Test `tests/scripts/import/evidence.test.ts` (`checkTuition` block).

**Interfaces:** `checkTuition(amountMinor: number, quote: string, minStudyYear = currentStudyYear()): FactCheck`; `currentStudyYear(now = new Date()): number` = the year the current study year started (August onward = this year, else last year).

- [ ] Tests (fail first): `checkTuition(1036000, "Studiejaar 2026-2027 Instellingscollegegeld Voltijd: € 10.360", 2026).ok` true; the same amount next to "Studiejaar 2025-2026 ... € 10.164" with amount 1016400 and min 2026 -> `ok:false`; a quote with both years where the proposed amount sits under 2026-2027 passes and the old-year amount fails; "2026/27" and "2026-27" short forms; a quote with no study year passes (programme pages keep working); zero fee unchanged; `currentStudyYear(new Date("2026-10-04"))` = 2026 and `new Date("2026-03-01")` = 2025.
- [ ] Implement; run `pnpm exec vitest run tests/scripts/import`; commit.

### Task 2: reader note for institution-wide fees

**Files:** Modify `scripts/import/reader.ts` (`COUNTRY_NOTES.NL`), Test `tests/scripts/import/reader.test.ts` (the prompt contains the rule).

- [ ] NL note text: use an institution-wide fee page when its quote states ONE non-EU amount (instellingscollegegeld / institutional fee, not the wettelijk collegegeld) for bachelor programmes or all programmes, in the same sentence or table row as a study year of the current or next study year and as full-time/voltijd (or all modes); then it applies to this bachelor programme: propose it with that quote. When the page lists several amounts by programme group, faculty, mode or year and the quote does not tie one to bachelor full-time, or only a range is given, leave tuition out and say why in notes.
- [ ] Test, implement, commit.

### Task 3: Opus review, then the data run (controller)

- [ ] `reviewer` on the diff. Then: pages (fee pages + `--search --topics --topic-list fees --max-queries N` only for institutions without a readable fee page; tell the owner N first), `data:read --dry-run`, sample of ~12, full run, restage/verify `--enrich`, move no-new-fact revisions aside (restore audit rows), check every unsampled record, audit draw. STOP for the owner.
