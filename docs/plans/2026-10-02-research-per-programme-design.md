# Research: per-programme facts for the German and Dutch programmes (design)

Status: approved in chat by the owner on 2026-10-02 (scope, budget, approach). This is the spec; the implementation plan follows it.

## Problem

`data/` holds 959 programmes (FR 757, DE 147, NL 55), but most facts students need are missing. Counts of programmes that have a value (measured 2026-10-02):

| Fact | FR (757) | DE (147) | NL (55) |
|---|---|---|---|
| tuition | 733 | 42 | 11 |
| teaching language | 38 | 143 | 35 |
| intakes / deadlines | 6 | 11 | 11 |
| application channel | 757 | 35 | 31 |
| documents | 0 | 0 | 0 |
| scholarships (per programme) | 0 | 0 | 0 |

No `data/scholarships/` or cost-profile records exist at all. The facts exist on official pages; the pipeline never looked for them. `scripts/import/discover.ts` issues three queries per programme (the programme page, fees, admission), keeps only links on the institution's own site, skips every `.pdf` link, and exits early when the institution has no website. The reader (`reader.ts`) can only emit duration, teaching language, tuition, intakes, application channel and requirement rules; `documents` and per-programme `scholarships` exist in the schema (`src/data-schema/records/program.ts`) but no proposal field carries them.

## Decisions (owner)

1. **First batch:** per-programme gaps, not the shared (living costs, national scholarships) batch. Shared data is a separate later piece of work.
2. **Scope of this run:** the 202 German and Dutch programmes first (191 have an institution website: DE 136 of 147, NL 55 of 55), then the same method on the 757 French ones after the results are reviewed.
3. **Budget:** hard cap of USD 10 for the DE + NL run (search queries, reader, checker), enforced by the existing `--max-usd` budget and a query cap.

## Non-negotiables (unchanged trust model)

- A model only proposes; code decides. Every accepted fact has a verbatim quote that code re-fetches and finds on the page (`verifyProposal`, `quoteInText`). A fact without a verifiable quote is dropped, never guessed.
- Only the institution's own site (and official registers already trusted) count as `official`. Aggregators are never labelled official. `tuition` must be `official` (`data:check` enforces it).
- Unknown stays unknown ("to check"); no placeholder values. A value of 0 for tuition is a real answer when the official page states that no tuition fees are charged.
- The verification steps `data:evidence verify`, `data:audit` (owner confirms the sample with one word) and `data:promote` stay the only way into `data/`. Nothing in this work loosens `verifyInstitution`, the quote check or the audit.
- Secrets stay in `.env.local`; never read, logged or committed.

## Design

### 1. Topic searches (discover)

For each programme, in addition to the existing three queries, ask one site-scoped query per missing topic: tuition for international/non-EU students, language of instruction, application deadline / intake, application documents, scholarships and funding, admission requirements. Keywords per country (German: Studiengebühren, Unterrichtssprache, Bewerbungsfrist, Bewerbungsunterlagen, Stipendium; Dutch: collegegeld, voertaal, aanmelddeadline, toelatingseisen/documenten, beurs). Answers are memoised per institution (tuition, deadline, document and scholarship pages are mostly institution-wide), so a query is shared by all of an institution's programmes. Programmes whose institution has no website (11 German) are not searched and stay on their register data; they are reported, not guessed.

### 2. PDF pages

Fee schedules, deadline tables and document lists are often PDFs. Add text extraction for PDF links (library chosen with `ctx7` docs and justified in the commit message), a size cap, and the same page labelling (`=== PAGE <url> ===`) so quotes are verified against the extracted text exactly like HTML. A PDF that fails to extract is skipped and counted.

### 3. New fact kinds in proposals

Add `documents` (list of `{slug, name, translationRequired}` with evidence) and per-programme `scholarships` (a link to a scholarship record, with its own evidence) to `ProposalSchema`, the reader prompt, `verifyProposal` and `applyVerified`, so they flow through staging, audit and promotion like the existing facts. Document slugs come from a closed vocabulary (so the plan page's checklist and translation line keep working); an unrecognised document is kept as a `manual_check`-style note, not an invented slug. Scholarship records themselves (`data/scholarships/*.yaml`) are created only for scholarships a programme or institution page actually describes (name, who can apply, support, deadline), each with source and date; national schemes (DAAD, Orange Tulip, Eiffel) belong to the later shared batch.

### 4. Run, checks and reporting

Order: dry-run (prints queries and a cost estimate, spends nothing) → run on a 10-programme sample per country and read the proposals with the owner → full DE + NL run under the USD 10 cap → `data:evidence verify` → `data:audit` sample → owner confirms → `data:promote`. Programmes already in `data/` are re-staged with `data:evidence restage --slugs <file>` (never unfiltered) so existing audited facts are not dropped. After promotion, `pnpm data:check` must be 0 errors and a before/after coverage table per fact and country is published in the PR. The run stops before France for the owner's review.

## Out of scope

Living-cost profiles, national scholarships, French programmes (until this batch is reviewed), the held-out Hanze and ISM programmes, any UI change, accounts.

## Testing

Unit tests in `tests/scripts/import/` for: the new topic queries and keyword lists (fake search provider), the PDF text path (fixture PDF), the new proposal fields and their verification (accepted with a real quote, dropped without one, dropped when the value disagrees with the quote), restage keeping prior facts. `pnpm typecheck`, `lint`, `test`, `data:check` stay green; no network in tests.

## Success criteria

- Every added fact has an official URL, a verified quote and a date; `data:check` has 0 errors.
- A before/after coverage table for DE and NL, with the real hit rate per fact. The aim is tuition, teaching language and deadline for most of the 191 searchable programmes; a fact the institution does not publish stays unknown and is listed.
- Spend is under USD 10 and reported.

## Risks

- Many sites render with JavaScript or hide fees in PDFs; mitigated by PDF extraction, and by reporting what could not be read.
- German and Dutch date and number words may defeat the date reader (`MONTHS` / `NUMBER_WORDS`); extend them with tests.
- Fees differ for EU and non-EU students; the reader must take the non-EU figure for a Moroccan applicant or leave the fact unknown.
- Search results can point to outdated pages; the existing filter on dated news paths stays and every page is dated by the verification day.

## Changes after reading the code (2026-10-02, same day)

Reading `scripts/import/*` and the earlier read batches (`data-staging/proposals-read/{de,nl}-*`) corrected three points above. They narrow the scope; nothing is loosened.

1. **The Dutch programmes and about 56 German ones were already read** (batches `de-b1`, `de-b2-*`, `nl-b1`, `nl-b2`), and 88 German programmes are register listings that were never read. The first sentence of the Problem section ("the pipeline never looked for them") is true for those 88 and for France, not for the read ones: for them the weak parts were page discovery and what verification accepted. In the earlier batches, 27 intake dates were rejected as "not supported by the quotes" (cause not yet diagnosed: the year may be missing from the quote, or the date format may not match) and 9 tuition values of 0 were rejected for lacking a "no fees" sentence. Plan task 6 starts by diagnosing the intake rejections on real pages before any rule is changed.
2. **Scholarships become their own plan (Plan B).** A scholarship is a new record type (`data/scholarships/*.yaml`: support, deadline, requirements, documents, how to apply), and most programmes would only link to an institution or national scheme. Building that pipeline together with the national schemes (DAAD, Eiffel, Orange Tulip) is cleaner than a per-programme version. This plan covers tuition, teaching language, intakes, application channel, duration and documents; scholarships follow.
3. **Admission requirement rules are not rewritten in this batch.** Rewriting them changes who gets a green match, so a new batch of rules needs its own review. Existing rules stay untouched; the enrichment only fills fact fields.

Design addition: an **enrichment mode** applies reader output to records that are already in `data/` without resetting anything. A fact the reader proves (quote verified, checker kept) replaces a missing value or a register-listing (`guidance`) value; an existing `official` value is never overwritten (a disagreement is written to the record's review notes); everything the reader did not establish stays exactly as it is, with its source. Old sources keep their verification dates; only new sources are dated at promotion.
