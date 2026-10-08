# Italy completeness: official fee ranges, discovery, and filling the missing facts

Date: 2026-10-08. Branch: `feat/italy-completeness` (worktree `../UniWay-italy`, from `origin/main` bb8c5339). Status: design approved by the owner in conversation; this file is the written spec.

## Goal

Close the Italy part of the biggest data gap (gap 2 to 4 of the 2026-10-07 review: deadlines, documents and channels, tuition) country by country, starting with Italy. Three independent pieces, in this order, each with its own plan, review and PR:

1. **Tuition model extension (code).** An official fee RANGE with a basis, so income-based (ISEE) fees can be stored and shown honestly.
2. **Italy discovery.** Pull the programmes and universities the Universitaly search and the MUR list know about and we do not.
3. **Italy fill.** The missing facts for all Italian programmes, old and new, through the audited pipeline.

Trust rules do not change: official sources only; a model proposes, code decides; every fact needs a verbatim quote that code re-fetches; unknown stays unknown; an official value is never overwritten; nothing enters `data/` except through the audit sample and `pnpm data:promote`.

## Decisions (owner, 2026-10-08)

1. Sources to fetch: Universitaly search (`cerca-corsi`), Universitaly institutions (`cerca-istituzioni`) and the MUR page "le università", to find missing universities and programmes. The CINECA catalogue of one university (units) is not used.
2. Scope of "missing programmes" is unchanged from the owner brief of 2026-10-05: Laurea (Bachelor), English-taught, in-person, the six classes (L-31 computer science; L-8, L-9, L-7, L-23 engineering; L-18, L-33 and low-confidence L-41 business-economics). Mixed Italian-English and Italian-taught courses are counted and reported, never staged.
3. Fill the facts the schema can hold (deadlines/intakes, documents, application channel, duration) AND extend the model so an official fee range or ISEE basis can be stored and shown (option A of the extension question: an official range with a basis; no band table, no note-only).

Assistant's calls (flagged to the owner): the branch comes from `main` and lives in a worktree so the owner's dev server on port 3000 and PR #19 are not disturbed; if the Universitaly endpoint ever needs a token or starts blocking, the work stops and the owner is told, no workaround.

## Facts found while designing (checked 2026-10-07 and 2026-10-08)

- Italy today (`pnpm data:coverage`): 45 programmes, 32 institutions (31 with programmes), teaching language 44 of 45 (all English), tuition 0, intakes 4, application channel 18, documents 11, duration 30. Per-programme gaps now: tuition 45, intakes 41, channel 27, documents 34, duration 15.
- The Universitaly search is a Nuxt app over a public JSON endpoint it calls itself from the browser: `GET https://universitaly-backend.cineca.it/api/offerta-formativa/cerca-corsi?searchText=&area=&tipoLaurea=&tipoClasse=0&durata=&lingua=&tipoAccesso=&modalitaErogazione=&order=RND&provincia=&provinciaSigla=` (plus a page parameter, to be confirmed in plan 2). The unfiltered search reports 1,611 university courses over 162 pages of 10. Each record has: `id`, `nomeStruttura` (university), `nomeCorso` and `nomeCorsoEn`, `tipoLaurea` (Triennale, Magistrale, ...), `durataAnni`, `lingua` (EN or IT), `sede.comuneDescrizione`, `classe.codice`, and `url` (the course's own page on the university's site). The `robots.txt` of the site returns a 404 page; no API documentation was found.
- The MUR "le università" page (`mur.gov.it/it/aree-tematiche/universita/le-universita`) is static Drupal HTML. The CINECA catalogue and the `cerca-istituzioni` page are JavaScript apps like `cerca-corsi`.
- The earlier MUR open-data CSV had no programme URLs, so the pipeline paid Serper to find each programme page; the portal's `url` removes most of that cost.
- Tuition today is `{ amountMinor, currency, period: year|semester }`, one official fee for the non-EU/EEA audience (ADR 0005 item 9, `scripts/data/product-rules.ts` `tuitionMustBeOfficial`); the cost estimate makes it `min == max` (`src/domain/costs.ts` `tuitionLine`). ADR 0005 listed "accept estimated tuition as a range" as rejected because it invites invented ranges; an OFFICIAL range quoted verbatim is a different thing and needs a new ADR.
- Italian universities usually publish fees as income-based (ISEE) bands or ranges (earlier result: tuition unknown for all 27 then-staged programmes). National admission deadlines do not exist for these fields: the two national dates are VISA deadlines (route facts, `pnpm data:it-calendar`).

## Piece 1: tuition model extension

**Schema.** `TuitionSchema` (`src/data-schema/records/program.ts`) gains `maxAmountMinor` (optional, integer minor units) and `basis` (optional, `"income_based"`). Rules: `maxAmountMinor >= amountMinor`; `basis` is allowed only with `maxAmountMinor`; a flat fee (neither field) is unchanged, so no existing record moves. `amountMinor` is the lowest fee, `maxAmountMinor` the highest, same currency and `period`. The resolved type (`src/data-schema/resolved.ts`), the Zod snapshot shard schema and the hand-written client validators accept the new fields; the differential tests against Zod prove parity.

**Snapshot.** The program shard shape changes, so `SNAPSHOT_FORMAT_VERSION` (`src/data-schema/snapshot.ts`, `src/lib/constants.ts`) and the manifest literal go from 1 to 2, per the rule that the format changes only with a version bump; the client's version check and its tests are updated. `public/snapshots` is rebuilt, never edited.

**Domain.** `tuitionLine` in `src/domain/costs.ts`: `min = amountMinor * k`, `max = (maxAmountMinor ?? amountMinor) * k` with `k = 2` for `semester`. The line keeps its `FactRef`; the income-based basis is carried on the line so the UI can say so. Totals already add ranges per currency; a test pins that an income-based tuition widens the total and `budgetFit` stays `unknown` or compares the range as the existing code does for ranges.

**Display.** Programme page tuition section, match card, compare cell, page facts, cost breakdown: a range uses `formatMoneyRange`, then the period, then a short note "depends on household income (ISEE)" for `income_based`, always with the SourceBadge (`official`). A flat fee reads exactly as today. New messages in en, fr and ar (the `ar` copy is a machine draft). Displayed ICU arguments stay preformatted strings; numbers are selectors only.

**Pipeline.** The reader accepts `tuition: { min, max, basis }`; the checker requires a verbatim quote and verifies by code that the quote contains both numbers in the stated currency and period; `promote`/`merge`/`proposals`/`audit` carry the new fields; `data:check` keeps "a non-null tuition must be official" and adds the two schema rules; the audit sample shows the range. The convention (the fee applicable to students from outside the EU/EEA residing abroad, e.g. Moroccan students) is unchanged; if a university publishes bands for all students and a different rule for non-EU students, the non-EU rule wins or the value stays null.

**Docs.** A new ADR 0010 states the decision and supersedes only item 9 of ADR 0005 and its "accept estimated tuition as a range" alternative; `.claude/rules/reference-data.md`, `.claude/rules/matching-domain.md`, `data/README.md`, `.claude/CLAUDE.md` (money bullet) are updated to match.

**Tests.** Table-driven: schema accept/reject (min greater than max, basis without max, negative), client validator parity, `tuitionLine` flat/range/semester, totals, view models, component rendering for flat and range in fr and ar, checker verbatim-quote rejection, `data:check` rule, the e2e and perf ratchet unchanged or lowered (a range string adds server text, not client JS). The JS ratchet only goes down.

## Piece 2: Italy discovery

**Source module.** A new import source (`scripts/import/sources/universitaly.ts`) reads the Universitaly search endpoint with the filters Laurea, English, in-person, and one request per class group, paged, at a polite pace (a short delay between requests, a few dozen requests in total, a descriptive User-Agent). Raw responses are cached under `data-staging/universitaly/` with fetch time and a sha256 for provenance. The MUR "le università" page is parsed for the list of universities and the Universitaly institutions listing is read the same way if a stable endpoint exists (to be confirmed in the plan); otherwise the MUR 01_atenei CSV already in the pipeline stays the university list.

**Comparison.** Each course is matched to existing data by university, normalised course name and class code (our programme slug is `<inst>-<name24>-<class>`); each university to our 32 institutions by name. Output: a report listing new programmes, new universities, programmes we have that the portal no longer lists, and mismatches (language, duration, class); counts per exclusion reason, including how many mixed and Italian-taught courses were left out. Nothing enters `data/` here.

**What the portal fills by code.** `officialUrl` (the `url` field), `durationYears` (`durataAnni`), `teachingLanguages` (`lingua`), city (`sede`), class code and field (field from the class code, never the model). These carry `source` = the Universitaly search page and `info_kind: official` with a `last_verified_at` of the fetch day.

**Owner checkpoint 1.** The candidate list (new programmes and universities, with the portal link of each) goes to the owner before any reading or staging of new records.

**Limits.** The endpoint is undocumented. If it needs authentication, changes shape, rate-limits or blocks, the importer stops with a clear message and the owner decides. The importer refuses to run when the result count is implausible (the response shape changed), as the MUR importer does.

## Piece 3: Italy fill

For the existing programmes and the approved new ones, run the existing audited path: pages (the portal `url` first; Serper only for university pages the link does not cover, with `--max-queries` and the planned number announced before each run, key in `.env.local` never read or printed), topics, reader, checker, restage, verify, audit. Facts targeted: intakes and deadlines for international applicants (a deadline needs a quote that says it applies to international applicants; a date with no year is a recurring deadline, ADR 0009), documents, application channel (`it-universitaly` or `it-university-direct`), duration where the portal has none, and tuition through the extended reader (a flat non-EU fee, or a range with `income_based` basis, only from a quote). Unknown stays unknown.

**Owner checkpoint 2.** The audit sample (and 100% of anything new at university level) is read by the owner; nothing is promoted without it. After promotion: `pnpm data:check` BEFORE committing, `data:build`, a before/after coverage table, and `data:check --strict`.

## Environment and process

- Work happens in the worktree `../UniWay-italy`; the pipeline needs the untracked `.env.local` (copy the file without opening it) and writes to the untracked `data-staging/`; the owner's existing staging in the main checkout is not touched.
- Each piece: brainstorm (done), spec (this file), plan, subagent-driven execution with an Opus review after each code task and a whole-branch Opus review at the end, then a draft PR. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm data:check` green; `pnpm build` and `pnpm perf:js` within the ratchet for piece 1; the UI checked in a browser in fr and ar for piece 1.
- Latest academic year only; say which year the portal reports.

## Out of scope

Italian-taught and mixed-language courses (counted and reported only), an ISEE band table, other countries (the same pattern repeats country by country), requirement coverage (gap 1), regional scholarships (already built), accounts.

## Risks

- The Universitaly endpoint is undocumented and may change or block; mitigated by caching, a plausibility check, a polite request budget and stopping on any block.
- A format version bump invalidates cached snapshots in browsers; the client already handles a manifest version mismatch by refetching, to be confirmed by test in the plan.
- Most Italian universities publish ISEE tables rather than a non-EU fee; the honest result may still leave tuition null for many programmes, with the range shown where the university states one.
- Widening what the audit must read: new programmes plus new facts for 45 old ones; the sample rate and batching are set in plan 3.
