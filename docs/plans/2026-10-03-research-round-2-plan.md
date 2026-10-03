# Research round 2: France, the Netherlands and scholarships (design and plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax. Tasks 1 to 6 are code (subagents); Task 7 is the paid and verified data work (controller only, never a subagent: API keys, money, the owner's audit).

**Branch:** `feat/research-round-2`, stacked on `feat/recurring-deadlines` (PR #10, itself on PR #9). Merge `origin/main` into it once #9 and #10 are merged.

## Findings that shape the design (2026-10-03, from three read-only investigations plus checks of the data)

- **France.** The Campus France Maroc page for first-year BUT applications states the calendar for Moroccan applicants at national level: "Du 1er octobre 2026 au 15 novembre 2026 à 23h59 (heure marocaine)." (`https://www.maroc.campusfrance.org/candidature-en-1ere-annee-but-a-l-universite-iut`). Only 6 of 481 BUT programmes carry it. The Licence page (251 programmes + 22 double degrees) states no dates in the fetched text; its calendar may be on another Campus France page (to find in Task 7). Teaching language is 38/757; documents are checked on the Etudes en France platform (skip). The investigation's cost estimate of about USD 100 is wrong: the DE/NL run cost USD 1.58 for 202 programmes, so about USD 6 for 700.
- **Netherlands.** Tuition 12/55. The causes are not mainly the checker: Dutch institutions publish "instellingscollegegeld" as an amount that "varies per programme", and the real figure is on a year-specific page or calculator that our crawl never reached (for example Fontys' 2026-2027 fee page is linked from the collegegeld page but was not supplied). Recording an institution-wide figure as a programme's tuition would show a possibly wrong number, so it is not done (owner decision 2026-10-03: follow fee links one level deeper, keep tuition unknown otherwise).
- **Scholarships.** No scholarship data exists. `scholarshipsForProgram` (src/domain/scholarships.ts) already selects scholarships by destination and fields, so national schemes need no per-programme links; but an institution-specific scholarship (Heilbronn, Ingolstadt, the NL Scholarship at participating institutions only) would show on EVERY programme of the country. The model needs an optional `institutions` restriction. The survey found few Bachelor-level schemes open to Moroccans: Germany (Deutschlandstipendium, Hochschule Heilbronn, TH Ingolstadt), Netherlands (NL Scholarship), France none confirmed. It is unverified: the AMCI scheme it lists is probably the other direction (foreigners studying in Morocco) and came from an aggregator; every scholarship must be re-checked against its official page with a code-verified quote before it becomes a record.

## Decisions (owner)

1. Netherlands: follow fee links deeper; keep tuition unknown where only an institution-wide range is published (show the official fee page link as guidance, not as a number).
2. France: the national calendar for all BUT programmes (and for Licence if an official page states it) plus the per-programme teaching-language read; no documents.
3. Scholarships: start now, verified-only, with the `institutions` restriction.

## Global Constraints

- Trust model unchanged: a model only proposes and code decides; every fact needs a verbatim quote re-fetched by code; only official sources (provider, institution, Campus France, Nuffic/Study in Holland, government bodies); unknown stays unknown; an existing official value is never overwritten; requirements are never rewritten by enrichment; nothing in `data/` is edited by hand; the audit sample and `data:promote` stay the only way in; held-out programmes (4 Hanze, 1 ISM) stay out.
- Any new application deadline needs an accepted quote naming international / non-EU / Moroccan applicants (`mentionsInternationalApplicants`). A national calendar quote that says "heure marocaine" satisfies it.
- Scholarship records are Bachelor-level only (`level: "bachelor"` in the schema), with a verified quote for who may apply (non-EU / international / Moroccan wording), for the level, and for every amount and date stated; `support` and `deadline` stay null where no quote supports them.
- No secrets read, printed or committed; subagents never call paid APIs; tests use fakes and temp dirs only and never touch the real `data/` or `data-staging/`; named exports, no `any`, no `@ts-ignore`, no non-null `!`; conventional commits with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; stage explicit paths only; never commit `next.config.ts` or `.env*`.
- JS budget: the program page has 0.2 KB of headroom. Nothing in this plan adds client code except the scholarship filter in `src/domain/scholarships.ts` (a few bytes, in the matching chunk); measure with the e2e perf spec before the PR and never raise a ratchet row silently.
- Environment: `export SWC_NATIVE_BINDING_CACHE='C:\Users\dagda\.swc-cache'` before any pnpm command; normalise touched files to LF; ports 3000/3100 are the controller's; held-out staging files must be moved aside before any `data:promote --audited-batch` and restored with `git restore --source=HEAD -- <paths>`; hand-staged revisions must drop their old audit rows.
- Serper free plan is a finite quota: every search command takes `--max-queries`; prefer reusing `.cache/search`.

## File structure

| File | Responsibility |
|---|---|
| `scripts/import/topics.ts`, `pages.ts` | French and refreshed Dutch wording; `topics` subset option and `--topic-list`; fee-link follow (`followFeeLinks`) |
| `scripts/import/enrich-fr.ts` | national BUT (and Licence) calendar sentence, `calendarIntakes` |
| `scripts/import/fr-calendar.ts` (new) + `package.json` `data:fr-calendar` | intake-only proposals for every French BUT/Licence programme from the national calendar |
| `src/data-schema/records/scholarship.ts`, `src/domain/scholarships.ts` | optional `institutions` restriction and its filter |
| `scripts/import/scholarships.ts` (new) + `package.json` `data:scholarship` | scholarship proposal schema, code verification, staged records |
| `tests/scripts/import/*`, `tests/domain/scholarships.test.ts`, `tests/data-schema/*` | tests |
| `data/README.md`, `.claude/docs/architecture.md`, `.claude/CLAUDE.md` | docs |

---

### Task 1: French wording and a topic subset

**Files:** Modify `scripts/import/topics.ts`, `scripts/import/pages.ts`; Test `tests/scripts/import/topics.test.ts`, `pages.test.ts`.

**Interfaces:** `discoverTopicPages(input)` gains optional `topics?: readonly Topic[]` (default all four); `pages.ts` gains `--topic-list <a,b>` (comma-separated subset of `fees,language,deadline,documents`, default all) and passes it through; `TopicInput` unchanged otherwise.

- [ ] **Step 1: Failing tests.** In `topics.test.ts`: (a) with `topics: ["language"]` and country `FR` exactly one query is asked, it starts with `site:<domain> `, and contains `langue d'enseignement` (French wording); (b) `FR` with the default topics asks four queries (the French wording exists for all four topics: fees `droits d'inscription étudiants internationaux`, language `langue d'enseignement enseigné en`, deadline `date limite de candidature étudiants internationaux`, documents `pièces justificatives dossier de candidature étudiants internationaux`); (c) the search `language` option for FR is `fr`; (d) `scoreTopicLink` scores French pages: a URL `/droits-de-scolarite` with text `Droits d'inscription` for fees, `/candidature` with text `Date limite de candidature` for deadline, `/langue-d-enseignement` for language, `/pieces-a-fournir` for documents are all >= 0.4, and `/vie-etudiante` is < 0.4; (e) an unknown subset value in `--topic-list` makes `pages.ts` throw `unknown topic <name>`; a pure helper `parseTopicList(value: string | undefined): Topic[]` returns all four for `undefined`, `["language"]` for `"language"`, and throws on `"language,foo"`. Run `pnpm vitest run tests/scripts/import/topics.test.ts tests/scripts/import/pages.test.ts` — Expected: FAIL.
- [ ] **Step 2: Implement.** Add `FR` to `WORDS` and `LANGUAGE` (`fr`) in `topics.ts` with the wording above; extend each `PATTERN` regex with French stems folded without accents (fees: `droits? d.inscription|frais de scolarit|droits de scolarit`; language: `langue d.enseignement|enseign[eé] en|langue de la formation`; deadline: `date limite|calendrier|candidature`; documents: `pi[eè]ces|justificatifs|dossier de candidature`), export `parseTopicList`, give `discoverTopicPages` the `topics` option, and wire `--topic-list` into the topics pass of `pages.ts` (and into the dry-run estimate: `topicSites.size * topics.length`).
- [ ] **Step 3: Verify and commit.** `pnpm vitest run tests/scripts && pnpm typecheck && pnpm lint` — PASS. `git add scripts/import/topics.ts scripts/import/pages.ts tests/scripts/import/topics.test.ts tests/scripts/import/pages.test.ts && git commit -m "feat: French topic wording and a --topic-list subset for the page search"` (trailer).

---

### Task 2: Dutch wording and fee-link following

**Files:** Modify `scripts/import/topics.ts`, `scripts/import/pages.ts`; Test `tests/scripts/import/topics.test.ts`.

**Interfaces:** `followFeeLinks(feePages: readonly string[], input: { website: string; fetchHtml: (url: string) => Promise<string>; limit?: number }): Promise<string[]>` exported from `topics.ts`: fetches each fee page (at most 3), extracts same-site https links with `extractLinks` (from `discover.ts`), keeps those whose text or path matches the fee pattern AND (a study-year marker `20\d\d[-/ ]20\d\d|20\d\d/\d\d|studiejaar|academic year` OR a calculator word `collegegeldmeter|tarieven|tariff|fee calculator`), excludes dated news paths, sorts by score, returns at most `limit` (default 2) URLs not already in `feePages`; never throws (a failed fetch is skipped).

- [ ] **Step 1: Failing tests** (fake `fetchHtml`): (a) a fee page whose HTML links to `/collegegeld/collegegeld-studiejaar-2026-2027`, `/over-ons`, `https://other.example/collegegeld-2026-2027`, `/nieuws/2019/05/collegegeld` and `/documenten/tarieven-2026.pdf` yields the first and the PDF only (own site, not news); (b) `limit: 1` returns one; (c) a throwing `fetchHtml` returns `[]`; (d) a link already in `feePages` is not returned; (e) Dutch queries: for NL the fees query contains `instellingscollegegeld` and `niet-EER`, the deadline query contains `niet-EER` and `1 april`, the language query contains `voertaal`; (f) `discoverTopicPages` with a `fetchHtml` adds the followed links to `out.fees` (up to the per-topic cap + 2) and still returns `[]` for an unknown country.
- [ ] **Step 2: Implement** as specified; in `pages.ts` pass `fetchHtml: (u) => fetchText(u, { accept: "text/html,application/xhtml+xml" })` to the topics pass (HTML fetches only, no search queries, cached); keep `mergeTopicPages`' cap of 10 total pages.
- [ ] **Step 3: Verify and commit** (`pnpm vitest run tests/scripts && pnpm typecheck && pnpm lint`; `feat: follow fee links one level deeper and refresh the Dutch topic wording`).

---

### Task 3: France: the national calendar as proposals

**Files:** Modify `scripts/import/enrich-fr.ts` (`National`, `readNational`), create `scripts/import/fr-calendar.ts`, `package.json` (`"data:fr-calendar": "tsx scripts/import/fr-calendar.ts"`); Test `tests/scripts/import/enrich-fr.test.ts`, `tests/scripts/import/fr-calendar.test.ts`.

**Interfaces:** `National` gains `butCalendar: Evidence | null` and `licenceCalendar: Evidence | null` (read like the other national sentences, from `PAGES.applyBut` and, when Task 7 finds an official page, `PAGES.calendarLicence` — add `calendarLicence` to `PAGES` only when Task 7 supplies the URL; until then `licenceCalendar` is always `null`); `calendarIntakes(evidence: Evidence): { startDate: null; applicationOpens: string; applicationDeadline: string } | null` exported from `enrich-fr.ts`: parses a sentence of the form `Du 1er octobre 2026 au 15 novembre 2026 à 23h59 (heure marocaine).` (also `Du 2 octobre 2026 au ...`, month names in French with or without accents, `1er` or `1`) into ISO dates by code; returns `null` for anything else or for an impossible date (via `isValidIsoDate`); `buildCalendarProposals(input: { slugs: readonly { slug: string; isBut: boolean }[]; national: National }): Proposal[]` in `fr-calendar.ts`: for each slug the intake-only proposal `{ slug, programmePage: null, facts: { intakes: { value: [calendarIntakes(...)], evidence: [<the sentence>] } } }`, using `butCalendar` for BUT programmes and `licenceCalendar` for the others, and nothing for a kind whose calendar is `null`. The CLI reads `data/programs/fr-*.yaml` (slug, name), the national sentences with `pageText`, writes `data-staging/proposals-fr-calendar/<slug>.json`, prints counts per kind and the sentence used, supports `--dry-run`, never calls a paid API.

- [ ] **Step 1: Failing tests.** `calendarIntakes`: the BUT sentence gives `{ startDate: null, applicationOpens: "2026-10-01", applicationDeadline: "2026-11-15" }`; "Du 15 janvier 2027 au 1er mars 2027 à 23h59 (heure marocaine)." works; "Du 31 février 2026 au 1er mars 2026" is `null`; a sentence without two dates is `null`; the accent-less `decembre`/`fevrier` forms parse. `readNational` with a fake `getText` returns `butCalendar` with the exact sentence from page text that contains `Du 1er octobre 2026&nbsp;au ...` after `htmlToText` (use the real `htmlToText` on a small HTML fixture with `&nbsp;`). `buildCalendarProposals`: BUT slugs get the proposal, Licence slugs get none while `licenceCalendar` is `null`, and with a fake `licenceCalendar` they get one; every proposal parses with `ProposalSchema` and its quote satisfies `mentionsInternationalApplicants`; with `butCalendar: null` nothing is produced. A test that `verifyProposal` accepts such a proposal against a fake page containing the sentence (international rule, day beside month, year present) and rejects it when the page lacks the sentence.
- [ ] **Step 2: Implement** as specified (regex on the whitespace-normalised sentence; month table in French; the CLI uses `sentence()` from `enrich-fr.ts`).
- [ ] **Step 3: Verify and commit** (`pnpm vitest run tests/scripts && pnpm typecheck && pnpm lint`; `feat: the Campus France national calendar as intake proposals for French programmes`).

---

### Task 4: Scholarships: the institutions restriction

**Files:** Modify `src/data-schema/records/scholarship.ts`, `src/domain/scholarships.ts`; Test `tests/data-schema/records.test.ts` (or the scholarship record tests), `tests/domain/scholarships.test.ts`; check `scripts/data/*` and the snapshot types compile unchanged.

**Interfaces:** `ScholarshipRecordSchema` gains `institutions: z.array(SlugSchema).optional()` (absent or empty = no restriction; existing records stay valid); `scholarshipsForProgram`: a scholarship with a non-empty `institutions` list applies only to programmes whose `program.institution` is in it (the explicit `program.scholarships` link still wins), the destination and fields rules stay as they are for scholarships without the list; the `Scholarship` resolved type carries `institutions` (check `src/data-schema/resolved.ts` and `scripts/data/resolve.ts` copy it; add it if they whitelist keys).

- [ ] **Step 1: Failing tests.** Domain: with a scholarship `{ destinations: ["DE"], fields: [], institutions: ["inst-a"] }`, a DE programme of `inst-a` gets it, a DE programme of `inst-b` does not, a programme of `inst-b` that lists the slug in `program.scholarships` does; without `institutions` (or `[]`) behaviour is unchanged for every existing test; the nationality filter still applies first. Schema: `institutions` accepts slugs, rejects non-slugs, may be absent. Resolve/build: a scholarship YAML with `institutions` survives `data:build` into the scholarships shard (use the existing snapshot build tests' helpers).
- [ ] **Step 2: Implement; Step 3: verify** (`pnpm vitest run tests/domain tests/data-schema tests/lib && pnpm typecheck && pnpm lint && pnpm test`) **and commit** (`feat: a scholarship can be restricted to named institutions`).

---

### Task 5: Scholarships: proposal, code verification, staged records

**Files:** Create `scripts/import/scholarships.ts`, `package.json` (`"data:scholarship": "tsx scripts/import/scholarships.ts"`); Test `tests/scripts/import/scholarships.test.ts`.

**Interfaces:**
- `ScholarshipProposalSchema` (zod): `slug` (kebab), `name`, `provider`, `destinations` (country codes, min 1), `institutions?` (slugs), `eligibleNationalities` (ISO codes), `fields` (slugs), `summary: { fr: string; en?: string }`, `howToApply: { fr: string; en?: string }`, `officialUrl` (https), `support: { amount: { min: number; max: number; currency: string; per: "month"|"year"|"once"|"total" } | null; covers: string[] } | null`, `deadline: string | null` (ISO), `documents: DocumentProposal[] | null` (as in `proposals.ts`), `evidence: { eligibility: Ev[]; level: Ev[]; support?: Ev[]; deadline?: Ev[]; howToApply: Ev[] }` where `Ev = { url: https; quote: string }`; amounts are in major units in the proposal (EUR 5000 = 5000) and converted to minor units by code.
- `verifyScholarship(proposal: ScholarshipProposal, getText: GetText): Promise<{ ok: true; record: Record<string, unknown>; evidence: { fact: string; url: string; quote: string }[] } | { ok: false; reasons: string[] }>`: fetches every cited page with `getText`, keeps quotes found verbatim (`quoteInText`), then requires: eligibility has an accepted quote with `mentionsInternationalApplicants`; level has an accepted quote matching `/bachelor|undergraduate|licence|first[- ]degree|erststudium/i`; `howToApply` has an accepted quote; the official URL is https and its page is fetchable; `support` is kept only when an accepted `support` quote contains the minimum and the maximum amount (use the existing `amountPattern` logic: export a small helper `amountInQuote(amountMajor, quote)` from `evidence.ts`) and the currency word or symbol, otherwise `support` becomes `null`; `deadline` is kept only when an accepted `deadline` quote passes `checkDeadline`, otherwise `null`; anything else missing => `ok: false` with reasons. The record is built in the exact shape of `ScholarshipRecordSchema` (LocalizedText with `status: "draft"`, `info_kind: "official"`, sources `page-N` with `last_verified_at: null`, `requirements: { coverage: "partial", source, info_kind: "official", rules: [] }`, `documents` fact with value null when `documents` is null, `level: "bachelor"`) and must pass `ScholarshipRecordSchema` (tested).
- CLI: `data:scholarship verify <proposal.json> [--dry-run]` verifies one proposal file and, unless `--dry-run`, writes `data-staging/scholarships/<slug>.yaml` with `_review: { kind: "scholarships", slug, name, preparedBy: "assistant", preparedAt, evidence, todo: "...prepared by the assistant from the quoted pages (see evidence): included in the audit sample draw" }`, refusing to overwrite an existing staged file; prints each accepted/rejected fact with the reason. It reads `data/institutions` to check that every slug in `institutions` exists. No network except the cited pages; no paid API.

- [ ] **Step 1: Failing tests** (fake `getText`; fixture proposal for a made-up scholarship with a page containing the sentences): a full proposal verifies and the record passes `ScholarshipRecordSchema`; a missing international-applicant quote rejects with that reason; a quote not on the page is dropped and, if it was the only eligibility quote, rejects; a wrong amount (quote says 5,000 but the proposal says 4,000) sets `support` to `null` and still accepts the rest; a deadline without a year in the quote (`checkDeadline` fails) sets `deadline` to `null`; level without a bachelor word rejects; an unknown institution slug rejects; the staged file is written with `preparedBy: assistant` and refuses to overwrite; `amountInQuote(5000, "EUR 5,000 one-time")` true and `amountInQuote(5000, "EUR 15,000")` false.
- [ ] **Step 2: Implement; Step 3: verify** (`pnpm vitest run tests/scripts && pnpm typecheck && pnpm lint && pnpm test`) **and commit** (`feat: verified scholarship records from official pages (data:scholarship)`).

---

### Task 6: Docs

- [ ] Update `data/README.md` (the national calendar flow `data:fr-calendar`, `--topic-list`, fee-link following, `data:scholarship`, the scholarship `institutions` restriction, the rule that scholarships are Bachelor-level and verified-only), `.claude/docs/architecture.md` (scholarship matching: destination, fields, institutions, explicit links), `.claude/CLAUDE.md` (one line each; stay under ~200 lines). `pnpm typecheck && pnpm lint && pnpm test && pnpm data:check`; commit `docs: ...`.

---

### Task 7: The data work (controller only)

- [ ] **Step 0: Preconditions.** Branch up to date with `main` once #9/#10 are merged (`git merge origin/main`); `git status --porcelain data-staging/programs` has no untracked staged revisions; held-out files moved aside before any `--audited-batch` promotion; note remaining Serper credits with the owner.
- [ ] **Step 1: France national calendar.** Find the official Campus France Maroc page that states the Licence calendar (search `maroc.campusfrance.org` calendrier Etudes en France Licence; official pages only); show the owner the sentence; if found add its URL to `PAGES` and the sentence pattern (small code change with a test). `pnpm data:fr-calendar --dry-run`, then for real into `data-staging/proposals-fr-calendar`; `restage --enrich ... --slugs`, `verify --enrich --dry-run`, `verify --enrich`; audit draw/sheet; owner confirms; promote (held-out aside); `data:check`, `data:build`, tests; commit data and audit trail.
- [ ] **Step 2: France teaching language.** `pnpm data:pages --slugs <FR slugs without teachingLanguages> --search --topics --topic-list language --max-queries <cap> --out data-staging/pages-fr-language.json` (dry run first; about 190 institutions, at most that many queries), reader dry run, paid read with the checker (cap USD 8, `--max-tokens 20000000`), keep only `teachingLanguages` in the proposals, stage with `--enrich`, check the unsampled records with the owner, audit, promote.
- [ ] **Step 3: Netherlands.** Re-run pages with the new wording and fee-link following for the 43 NL programmes without tuition and the programmes without deadlines/documents (`--topics`), reader dry run, paid read (cap USD 3), keep tuition, intakes and documents, stage, unsampled check (international wording!), audit, promote. Report how many Dutch institutions still publish only an institution-wide range (their tuition stays unknown; list them for the owner).
- [ ] **Step 4: Scholarships.** For each candidate from the survey (Deutschlandstipendium, Hochschule Heilbronn, TH Ingolstadt, NL Scholarship with its Nuffic/Study in Holland participant list matched to our institutions, any French Bachelor scheme, AMCI direction check): fetch the official page, write the proposal JSON with verbatim quotes, `pnpm data:scholarship verify`, fix or drop what the code rejects; discard anything that is not Bachelor level or not open to Moroccans; show the owner every record with its quotes; audit; promote (collection `scholarships`); `data:check`, `data:build`; check on a real program page in fr and ar (browser) that the scholarship appears only where it should (national: all programmes of the country; institution-specific: only that institution).
- [ ] **Step 5: Report.** Before/after coverage (`pnpm -s data:coverage`), spend, hit rates, unsampled-record findings, the Dutch institutions with only a range, the scholarship list, decisions pending. Open a draft PR (base: the previous stacked branch or `main` once merged). Stop.

---

## Self-review

- **Spec coverage:** France calendar and language (Tasks 1, 3, 7), Dutch fee links and wording (Tasks 1, 2, 7), scholarships with the institutions restriction, verification and linking by destination/fields/institution (Tasks 4, 5, 7), docs (6).
- **Placeholders:** none; Task 7 contains the steps that depend on live pages (the Licence calendar page, the Nuffic participant list), each ending in an owner-visible checkpoint.
- **Types:** `Topic`, `parseTopicList`, `followFeeLinks`, `calendarIntakes`, `buildCalendarProposals`, `ScholarshipProposalSchema`, `verifyScholarship`, `amountInQuote`, `institutions` are defined once and used consistently.
