# Reference data

This folder holds Jisr's curated reference data. It is the source of truth for the app; git history is the audit trail. It currently holds **no records**.

**Only records whose every value traces to an official https source belong here.** Never invent or fill in a value. If something is not published, write `null` and let the app show "to be checked".

## Layout

One record per file: `data/<collection>/**/<id>.yaml`.

- The collection is the first folder under `data/`. Deeper folders are organisational only.
- The file name (without `.yaml`) equals the record's id: `slug`, or `code` for `countries`.
- Do not rename a slug. Saved user data will refer to it, and the slug alias/redirect mechanism is not yet supported (to be built before accounts persist slugs, phase 2), so a rename breaks saved data.
- Use the `.yaml` extension. `README.md` and dotfiles are ignored; anything else is an error.

The 13 collections:

`countries`, `fields`, `subjects`, `language-certificates`, `grading-scales`, `grade-conversions`, `credential-types`, `application-channels`, `admission-routes`, `institutions`, `programs`, `cost-profiles`, `scholarships`.

## Provenance

Every record other than the vocabulary collections (`countries`, `fields`, `subjects`, `language-certificates`) has a `sources` map of `key -> { url, last_verified_at }`, and every fact, rule, requirements block or record-level claim names one of those keys in `source`.

- `url` is an official https page.
- `last_verified_at` is the date a human actually read that page (`YYYY-MM-DD`, never in the future).
- `info_kind` is `official`, `estimate` or `guidance`. An `estimate` also needs a `basis` explaining how the range was derived.
- A source key that is used but not declared is an error. A declared key that is never used is a warning.

## Tuition

A program has a single `tuition` figure, by convention the fee that applies to the Release 1 audience: students from outside the EU/EEA (for example Moroccan students). It must be an official published fee (`info_kind: official`); when the university does not publish one, leave the value `null` and the app shows it as to-be-checked. An estimate is never accepted here, because it would be turned into a single-number range.

## Intakes and deadlines

An intake has `startDate`, `applicationOpens` and `applicationDeadline`, each a full ISO date or `null`. When the official page gives the deadline as a day and a month with no year ("15 July"), do not guess a year: write it as `recurringDeadline: { month: 7, day: 15 }` and leave `applicationDeadline` as `null`. An intake never has both (`data:check` errors); the field is optional, so existing records stay valid. The app shows a recurring deadline as "usually by DD/MM each year, check the date for your intake", never as an upcoming date and never with a guessed year (ADR 0009). It is a volatile fact like any deadline (aging 120 days, stale 270). Only a deadline that applies to international or non-EU applicants belongs here; a general or EU deadline is left out.

## Checking

```
pnpm data:check              # validate every record, print freshness and translation reports
pnpm data:check --strict     # additionally fail when any fact is stale
pnpm data:build              # publish immutable JSON snapshots (runs after data:check)
```

`data:check` fails on invalid or provenance-less records, dangling references, unknown keys, future dates, a non-null program `tuition` that is not `official`, and `complete` coverage with no rules. Aging and stale facts are reported, and only fail the run under `--strict`. It also warns (without failing) about unused sources, `complete` coverage with a `manual_check` rule, a `complete` program that has teaching languages but no `language_proficiency` rule, a `language_proficiency` rule that requires a certificate but lists no `acceptedTests`, and a cost profile whose `city` matches no institution city.

## Importing candidates (`data-staging/`)

Official bulk datasets are pulled into `data-staging/`, never straight into `data/`. A staged record has the exact shape of a `data/` record, plus a `_review` block, and every `last_verified_at` is `null`. Any fact the importer could not read (and any value it only guessed, such as a website from Wikidata) carries `info_kind: TODO_read_source`, which is deliberately not valid: `data:promote` refuses the record until a human has read the source and chosen a value, or an explicit `null` for "not published". `data-staging/` is committed as the review queue; it is not read by `data:check` or the build.

```
pnpm data:import france          # Parcoursup open data (Licence + BUT, CS/engineering/business) + institutions
pnpm data:import institutions    # German (HRK) and Dutch (DUO) institution candidates
pnpm data:import netherlands     # Dutch programmes (RIO register) and their campus institutions
pnpm data:import germany         # German programmes (Studiensuche API), linked to the HRK institutions
pnpm data:uniassist             # uni-assist university list -> data-staging/UNIASSIST.csv (which German universities use uni-assist, and how)
pnpm data:import daad            # English-taught German programmes (DAAD), with language, duration, deadline
pnpm data:import                 # all sources; keeps staged files (--overwrite replaces them and clears their approval; --refresh bypasses the HTTP cache)
pnpm data:promote --confirm-human-read --verified-on YYYY-MM-DD
```

1. Open `data-staging/REVIEW.csv` (one row per record: name, institution, city, field, confidence, official link, what is still to check). Read the source, fix the staged YAML (replace each `TODO_read_source`, fill the website/type), then write `y` in the `approved` column. Re-importing never keeps an approval for a file it rewrote.
2. `data:promote` takes every approved row, stamps the date you pass as `last_verified_at` on every source, validates the record against its schema, and moves it into `data/`. A record that is still invalid is skipped and stays staged; an existing `data/` record is never overwritten. Pass the flags only after you have read the sources.
3. `pnpm data:check` then reports dangling references (promote a programme's institution too).

What each source provides, and what stays for a human:

| Source | Provides | Left for a human (read the programme page) |
|---|---|---|
| Parcoursup open data (fr-esr-parcoursup, Licence ouverte 2.0) | programme name, institution, city, public/private, link to the official Parcoursup page (used as the programme's source) | duration, languages, tuition, intakes, documents, requirement rules, the application channel for Moroccan applicants |
| ESR register of establishments (same publisher) | institution website for an exact UAI match: promotable as is | other institutions get a website candidate (Wikidata or the parent university, e.g. an IUT campus) flagged for confirmation |
| ONISEP Idéo, structures d'enseignement supérieur (ODbL) | parent university of each IUT campus or UFR by UAI code, used to find a website candidate; independent public/private cross-check (a mismatch with Parcoursup is flagged in the review sheet) | the unit's own website: the parent's site is only a candidate to confirm |
| ONISEP Idéo, actions de formation (ODbL) | the website each establishment lists for itself (often the IUT or faculty site): preferred over the parent university's as a website candidate | confirm it is the right site; programme-level matching (duration, cost text) is not imported |
| HRK Hochschulkompass list, Germany (`hs_liste.txt`) | 323 universities, Fachhochschulen/HAW and other Hochschulen: official name, city, public/private sponsor (type left null for church-run institutions), website candidate. A website that is not an https front door, or whose https form redirects to another domain, is flagged | everything has to be read on the institution's own site: the register page cited as source does not show an individual institution, so every record keeps the placeholder `info_kind` until you add that page as the source |
| DUO open data, Netherlands (`Hogescholen en universiteiten`) | 54 hogescholen and universities: official name, city, website candidate (probed for https), denomination as a hint | public/private type, the institution's own page as source, programmes |
| DUO "Overzicht Erkenningen ho" (RIO register), Netherlands (CC-BY) | 713 current full-time Bachelor programmes (HBO and WO) in the three fields that still take new students, at 168 institution units (one per campus town): official Dutch name, English name and ECTS in the notes, funding status, accreditation date. Teacher training, dual and part-time tracks and programmes whose intake has ended are left out | the programme page (`officialUrl` is left empty on purpose), duration (the register gives ECTS only), teaching language, tuition for non-EU students, intakes, documents, requirements, application channel |
| Federal Employment Agency "Studiensuche" API, Germany (documented by bund.dev) | 1,889 Bachelor (undergraduate, full-time) programmes in 26 engineering, computer-science and business study fields at 248 universities, Fachhochschulen/HAW and other Hochschulen, linked to the HRK institution (matched by name or HRK short name, never guessed). Teacher training and work-study (dual, practice- or training-integrated) offers are left out | the programme page (`officialUrl` is left empty), duration, teaching language, tuition, intakes, documents, requirements, application channel (uni-assist or direct): the API has none of these. Programme names include the degree label ("... Bachelor of Science") |
| DAAD International Programmes database, Germany (the JSON search behind the DAAD website) | about 270 Bachelor programmes taught in English (or partly German) in the three fields, with the teaching language, duration (from the semester count) and a clean application deadline prefilled under the placeholder `info_kind`, and the DAAD detail page as the source and as the review-sheet link. Linked to the HRK institution (English names matched by town, kind of institution and distinctive words; never guessed; a campus in another town becomes its own unit). Programmes taught abroad are left out. Field is decided by the programme name only | the programme's own page (`officialUrl` is left empty: the DAAD page is a listing, not the institution's page), tuition for non-EU students (22 of 362 DAAD entries state an amount, but its unit, period and audience are not clear, so none is prefilled), documents, requirements, application channel. A plain deadline may be the one for EU/German applicants: check it for applicants from outside the EU. The same degree may also exist as a Studiensuche record under its German name (the DAAD record says how many of that field the institution has there: keep the DAAD one, it has language and dates) |
| Wikidata (CC0) | only French UAI → website (a candidate, below ONISEP) | everything else |

Field assignment for French programmes is an exact-label table in `scripts/import/fields.ts`; `confidence: low` rows are judgement calls. Re-importing is safe: every record carries a stable source id (`sourceId` inside `_review`, for example `ba:73208836` or `uai:0597215X`) because slugs are built from names and can change. `data:promote` writes each promoted record to `data-staging/PROMOTED.csv`; a later import skips any record already promoted under any slug and replaces an unapproved staged file whose slug changed (an approved one is kept and a warning is printed). Two records of one import sharing an id or source id fail the import.

The HTTP cache lives in `.cache/import/` (git-ignored).

### Source licences

| Source | Terms | Status |
|---|---|---|
| Parcoursup open data, ESR register | Licence ouverte 2.0 | free reuse with attribution |
| ONISEP Idéo (structures, actions) | ODbL | attribute ONISEP; share alike if a derived database is published |
| HRK Hochschulkompass list | [downloads page](https://www.hochschulkompass.de/en/higher-education-institutions/downloads.html): "free of charge for personal use only. All other uses, in particular commercial use (including individual parts), require the approval of the Foundation for the Promotion of the HRK" | **permission obtained from the HRK** (reported by the project owner, 2026-10-01). Keep the written permission with the project records and check that its scope covers everything derived from the list: the institution records and campus units, the sponsor type, and the name matching that links German programmes to institutions |
| DUO "Overzicht Erkenningen ho" (RIO) | Creative Commons Attribution (cc-by, from the dataset metadata; the licence version is not stated) | credit "DUO / Ministry of Education, Culture and Science (OCW)" wherever RIO-derived data is shown: **add a data-credits page before launch** |
| DUO institution list (`Hogescholen en universiteiten`) | the page states no licence; a research note says CC0 for DUO open data, not verified | **confirm the licence** |
| Studiensuche API (Federal Employment Agency) | no licence statement found in the public documentation; documented and used by the bund.dev community with a public client id | **terms of use confirmed as acceptable by the project owner** (2026-10-01); keep the confirmation with the project records |
| uni-assist university list (`uni-assist.de/en/tools/uni-assist-universities/`) | public web pages with no licence statement and no robots.txt rule found for them; fetched politely (4 requests in parallel, cached) for a read-only mapping that is not republished | **confirm acceptable with the project owner**; the sheet only records which universities use uni-assist and cites the page |
| DAAD International Programmes search | undocumented JSON endpoint of the DAAD website; its host (www2.daad.de) serves no robots.txt (404) and the main site's robots.txt has no rule for these pages (not verifiable from this repository); four paged requests, one at a time, cached; DAAD's legal pages could not be read | **permission obtained from DAAD** (reported by the project owner, 2026-10-01). Keep the written permission with the project records and check that its scope covers publishing the DAAD-derived facts (language, duration, deadlines) and any credit DAAD expects |
| Wikidata | CC0 | free |

Known gaps: tuition fees, living costs, scholarships and Morocco-specific admission routes are not imported. German-taught programmes from the Federal Employment Agency's study search have no teaching language, tuition or programme page; the English-taught ones from DAAD do have a language and a page. If a request fails behind a proxy, run with `NODE_USE_ENV_PROXY=1` (Node 22+): in the cloud sandbox Node reached DAAD only that way.

Deliberately not adopted (see ADR 0003, one developer, Release 1): campus and institutional-history tables, raw source snapshots, ETER (its terms forbid republishing through an online platform), Destatis codebooks and accreditation registers (NVAO). Revisit when accounts or more countries land.

## uni-assist mapping (`pnpm data:uniassist`)

uni-assist e.V. is the central service many German universities use for applicants with a foreign
school-leaving certificate. Its official list (197 universities) says, per university, one of:

- **processes**: no note on its page: uni-assist handles the application;
- **vpd_only**: "We will issue you with a preliminary review documentation (VPD). You are then
  required to submit your application with the VPD directly to the university.";
- **special**: a note that only concerns some courses or levels (read it).

`data-staging/UNIASSIST.csv` has one row per university with the mode, the detail page (the source
to cite) and the note verbatim. Each row is matched to our German institutions by website host,
then registrable domain (language subdomains such as `en.w-hs.de`), narrowed by town for
universities with several campus units, then by exact normalised name. A row that matches nothing
is **never guessed**: `sameTownCandidates` lists our institutions in that town for a person to
decide. The page itself says that each university decides which courses and applicant groups
uni-assist handles, so the sheet narrows the question and the university's own page answers it.
Nothing in `data/` is written from this sheet yet.

## Trust tiers: how this scales past what a person can read

No team can read thousands of programmes, so the data does not pretend that someone did. Every record
carries a **tier** in the ledger (`data-staging/PROMOTED.csv`, column `level`), and the site only
claims "Official, verified" for a fact that has a source quote, never for an unknown.

| Tier (`level`) | What it means | Who or what checked it | Where it applies |
|---|---|---|---|
| `human` | a person read the sources | a person | records edited or sampled by the owner |
| `audited-sample` | prepared by the assistant with a verbatim quote per fact, in a batch whose random sample was read and passed | code (quotes re-fetched) + a sample read by a person | the pilot flow (`data:evidence`, `data:audit`) |
| `owner-waived` | same preparation, but the owner passed the sample **unread** (a preview) | code only | the 15-programme pilot, today |
| `register-listing` | only what an official register states: name, institution, town, field, level and a link to the official page; **every other fact is "to be checked"** | the schema, `data:check` and the link check below | France (Parcoursup) and Germany (DAAD) listings, `pnpm data:listing` |
| `machine-quoted` | a listing plus facts that code read from the official page and quoted verbatim, each re-fetched and checked by the same verifier as the pilot | code (extractor + verifier) | French listings: `pnpm data:enrich-fr` (French level required, distance learning, and the national facts below) |
| `demoted` | a listed record whose official page no longer shows its name went back to staging | `pnpm data:linkcheck --demote` | any listed record |

Principles:

1. **Never show a "verified" label next to an unknown.** A value nobody has read shows "to be checked" and
   no badge (ADR 0005 item 9). An institution whose type or website the register does not state keeps
   `type: null` / `website: null` instead of a guess.
2. **Verify the process, sample the output, test everything cheaply.** Register-derived records come from
   a deterministic importer, so the error rate is a property of the importer, not of each record.
   `pnpm data:linkcheck` fetches every listed programme's official page and requires it to mention the
   programme's name (all 915 listings: 891 pass, 24 were demoted; run it again to catch pages that move).
3. **Depth comes in small batches.** Quote-verified facts (`data:evidence`) are added per batch, starting
   with the shortlist (`data:shortlist`), and each batch has its own audit sample.
4. **Keep checking.** `data:evidence verify --dry-run` re-fetches every quote of the promoted records and
   reports the ones that no longer match; `data:uniassist` and `data:linkcheck` can be re-run the same way.
5. **Records the importer cannot support stay in staging** (low-confidence field classification,
   institutions not in an official register, programmes without an official page link).

Listing tier details: the DAAD duration and teaching language are taken as `guidance` (DAAD is a listing
service, not the institution); its deadline is never used (it can be the one for EU applicants). A French
institution's website is listed only when the ministry's register confirmed it; a German one only when the
HRK homepage does not redirect to another domain. The date in `last_verified_at` is the day the register
was read by code, not a day a person read the record.

### French machine-quoted facts (`pnpm data:enrich-fr`)

For every French listing the extractor adds only what an official page states, with its quote:

- **French level required** (and the mandatory TCF / DELF-DALF certificate): the Parcoursup fiche says "Niveau de français requis pour s'inscrire à la formation : B2" (754 of 757 fiches state a level); Campus France Maroc says the certificate is mandatory unless exempt.
- **Distance learning**: the fiche's own sentence.
- **Duration**: Campus France's national pages (a Licence is "six semestres", the BUT is "préparé en 3 ans").
- **Tuition for a student from outside the EU** at a public institution: Campus France Maroc ("2 902 euros pour une année en cycle de Licence"); a note says some institutions exempt non-EU students. The 178 euros shown on every fiche is the EU rate and is never used.
- **Application platform**: Études en France, from the Campus France Maroc Licence and BUT pages.

National facts are not the programme's own page: the badge shows the Campus France page as their source. Teaching language, deadlines and documents stay "to be checked": the fiche has no clear sentence for them (its "Langue vivante 1" is a school-subject requirement, not the teaching language).

## Reading pages with cheap models (OpenCode Go)

Per-programme reading by Claude is replaced by cheap models called from scripts (they bill OpenCode, not Claude). The trust model does not change: a model only *proposes*; code decides.

```
pages we fetched ──► reader (cheap model) ──► ProposalSchema ──► verifyProposal (code: quote on page? value agrees?)
                                                                      │
                                       checker (strong model, claim + ~500 chars; --check) ──► proposals-read/<slug>.json
                                                                      │   (copy to proposals/, then data:evidence verify ──► audit sample ──► promote)
```

`data:read` writes proposals into `data-staging/proposals-read/` only. Nothing is applied to staged records, no date is stamped and nothing is promoted by these scripts: the existing `data:evidence verify`, `data:audit` and `data:promote` steps stay the only way in. With `--check`, what the checker removed is also removed from the saved proposal, so a later `data:evidence verify` cannot bring it back. Evidence that cites a page the reader was not given (one it remembered, an aggregator) is dropped before verification, and a fact left with no evidence is dropped with it (listed under `dropped` in `calls.jsonl`).

- `scripts/import/llm.ts`: the OpenCode client (three wire formats, streaming, price table, idle watchdog). Key from `OPENCODE_API_KEY` (env or `.env.local`, never committed, logged or echoed in errors). The hard `Budget` cap reserves each call's worst case before it is sent, so parallel calls cannot overshoot it; a stream without usage is charged an estimate.
- `scripts/import/reader.ts` (`pnpm data:read`): prompt = fixed instruction + shared national pages first (cache hit), the programme's pages last. A badly formed fact or rule is dropped and counted (`dropped`), never passed on without evidence; a language rule with unknown `acceptedTests` is dropped (an empty list means "any certificate"). The French application channel is left to the route data. Every command has `--dry-run` and `--max-usd`.
- `scripts/import/checker.ts`: the second model judges whether the quote states each fact and each requirement rule *for this programme and a Moroccan, non-EU applicant*. It can only remove; an unusable answer removes all facts and judged rules (fail closed); a `manual_check` note is not judged and the programme page is checked by code. A budget stop stops the run.
- `scripts/import/discover.ts`: finding the pages. `discoverFromRegister` reads a register page that links the programme's own page ("Course website" on DAAD pages, plus the fee and application links) and works for Germany; `discover` crawls from the institution website and is only a weak fallback (it found the exact pilot page for 2 of 14).
- Deadlines (ADR 0009): the reader writes an application deadline as a dated `applicationDeadline` only when the quote states the year, and as `recurringDeadline` `{month, day}` only when it states day and month with no year; never both on one intake. `verifyProposal` checks a dated deadline against the quote as before, and a recurring one with `checkRecurringDeadline`: the day must stand beside the month in an accepted quote, and a quote that contains a year is rejected for it (it is a dated deadline, not "every year"). Every application deadline, dated or recurring, also needs an accepted quote that names international or non-EU applicants (`mentionsInternationalApplicants` in `scripts/import/evidence.ts`: English, German, Dutch and French phrasings such as "non-EU", "nicht-EU", "buiten de EU", "hors UE", "third country", "international", "foreign", "from abroad"; programme and office names such as "International Business" or "International Office" do not count). Without such a quote the deadline is rejected and the intake fact is not accepted. The word check is only a first filter: the checker model (`--check`) judges the claim for an international applicant and the audit sample reads it.
- The international rule is not retroactive. Deadlines already in `data/` are kept as they are. Re-running `data:evidence verify` on an older proposal may now reject a deadline that was promoted earlier; do not remove it automatically, list such records and let the owner decide. Enrichment never overwrites an existing official value, so a rejected or new deadline does not replace one already in `data/`.
- `pnpm data:bakeoff` / `pnpm data:checkeval`: model comparison on the 15 pilot programmes against the quote-verified pilot proposals.

Bake-off result (2026-10-01, prompt v2, 40 truth facts, same pages for every model): readers DeepSeek V4.1 Flash, GPT 6 Luna, Hy3, Qwen3.8 Flash and MiMo-V2.6-Flash all agree with the truth on 29-31 facts with 0-2 wrong-but-verified (conflict); about 0.1-0.3 cent per programme. GLM-5.3-Flash and Kimi K2.7 Code reason for thousands of tokens and are not usable as readers; LongCat Free is too slow. As checker, Qwen3.7-Plus removed 4 of 4 wrong facts and kept 31 of 35 correct ones (the 4 it drops are strict "not stated for non-EU / only recommended" calls) at about 0.3 cent per call; Kimi K2.7 Code and GLM-5.2 return unusable answers more often. Muse Spark needs "models that train on request data" enabled in the OpenCode privacy settings and was not used.

### Topic pages, PDFs, documents and enrichment

- `pnpm data:pages --slugs <file> --search --topics` builds the pages file for `data:read`. `--topics` adds, per institution, the pages found by four searches restricted to its site (fees, language of instruction, deadline, documents; German, French or Dutch wording, by the programme's country) to every programme of that institution: one query per topic per institution, not per programme. It needs the same key as `--search` (`SERPER_API_KEY` or `BRAVE_API_KEY`) and is bounded by `--max-queries`. PDFs are kept (fee schedules); other file types and dated news posts are not. The programme's own pages stay first and are never dropped: "at most 10 pages" limits the topic pages that are added (they fill what is left up to 10 in total). A topic search that fails for one programme is logged (`topic search failed for <slug>`) and that programme keeps its existing pages; the run summary counts these and the programmes skipped because their institution has no https website, and lists those slugs in `<out>.skipped.txt`. A wrong topic page costs tokens only: the reader still has to quote it and the verifier still has to find the quote.
- `--dry-run` sends no search query and writes nothing, and prints the upper bound on queries, but it is not offline: it still fetches the DAAD register page of every German programme, and a dry run without `--search` also crawls the institution homepages of the programmes that have no register page or Parcoursup fiche.
- PDF text (`scripts/import/pdf.ts`, `unpdf`): a URL whose path ends in `.pdf`, or any page whose body turns out to be a PDF (a `/download?id=3` link), is read as text, cached next to the HTML cache, and the reader and the verifier see exactly the same text. A body that is neither text nor a PDF (more than 1% replacement characters) is refused, never sent to the reader. The limit is 8 MB; there is no OCR, so a scanned PDF (no extractable text) is reported like a page that cannot be fetched.
- The `documents` fact is the list of documents an international applicant must submit. Each item has a slug, a name (`fr`, `en`), `quotedAs` (the name exactly as the page writes it, in the page's language) and `translationRequired` (`true` or `null`, never `false`). `verifyProposal` keeps an item only if its `quotedAs` is found, as a whole word, in an accepted quote ("ID" is not found in "valid"), and keeps `translationRequired: true` only if a quote that names that same document also mentions a translation; otherwise it becomes `null`. If no document is named in a quote the whole fact is rejected. A quote naming several documents and mentioning translation supports all of them, so the checker model (`--check`) judges whether it really applies to each.
- Enrichment adds facts to records already in `data/` without resetting anything. `pnpm data:evidence restage --enrich <dir>` brings the records that have a proposal with facts in `<dir>` (for example `data-staging/proposals-enrich`, or one run directory `data-staging/proposals-read/<run>`: `proposals-read` itself holds run subdirectories, not proposals) back into staging, keeping their dates, marked `_review.enrich: true`. `pnpm data:evidence verify --enrich <dir>` verifies those proposals and touches only the marked records. `restage --enrich` always needs `--slugs <file>`, drops the audit rows of the records it restages (they go through a new audit batch) and skips a slug that already has a staged file, printing `already staged, skipped: <slug>`. A plain `verify` (without `--enrich`) skips records marked for enrichment and prints `skipped (restaged for enrichment: use --enrich): <slug>`. Enrichment fills a fact only where the record has no official value; it never overwrites an official value (a disagreement is recorded in the review notes instead), and when the programme page was not verified it never replaces any existing value either, only fills a missing one (a non-null register value is kept and the reader's competing value and url go into the review notes) and never touches requirements, the official URL, the summary or the scholarships. The output says `page NOT verified` when the programme page itself was not confirmed (the facts then come from pages not tied to the programme by name, and the record carries a note saying so), `no new facts: discard the staged revision for <slug>` when nothing was added, and `no further facts ... (earlier enrichment kept)` when the staged copy already holds earlier enrichment. Enriched records go through `data:audit` and are promoted with `--replace-revisions` like any revision.
- `pnpm data:coverage` prints a markdown table, one column per country, of how many programmes in `data/programs` hold each fact (programmes, tuition, tuition official, teaching language, intakes, application channel, documents, duration, programmes with at least one requirement rule). A null or empty fact does not count. It reads `data/` only, uses no network and writes nothing.
- `--topic-list <a,b>` narrows `--topics` to a subset of `fees,language,deadline,documents` (default all four). It needs `--topics` (alone it would silently do nothing, so `data:pages` stops with an error), an unknown name is an error, and the `--dry-run` query bound counts only the chosen topics.
- Fee-link following: when the fees topic finds pages, `followFeeLinks` (`scripts/import/topics.ts`) fetches at most 3 of them (never a PDF) and adds up to 2 links found there: https, same site as the institution, not news or a dated post, scoring as a fee link, and naming a study year ("2026-2027", "2026/27", "studiejaar", "academic year") or a fee tool (collegegeldmeter, tarieven, fee calculator). Only the newest study year found on any of the pages survives and sorts first, so a past year's rate sheet never outranks the current one; undated links stay. PDF links are returned but never fetched here (the reader and verifier read them as above). A page that cannot be fetched is skipped, and a URL is fetched once per run, shared by the programmes of an institution.

### National calendar (France, `pnpm data:fr-calendar`)

Campus France Maroc publishes one application calendar per kind of programme as a sentence on its Études en France application pages ("Du 1er octobre 2026 au 15 novembre 2026 à 23h59 (heure marocaine)"). `pnpm data:fr-calendar` reads the BUT page, turns that sentence into an intake-only proposal (`applicationOpens`, `applicationDeadline`, `startDate: null`) for every French programme whose name or slug says BUT, and writes one `<slug>.json` per programme into `data-staging/proposals-fr-calendar/`. The dates are parsed from the sentence by code, never typed; an impossible date, or a range that ends before it starts, gives no proposal. The page sentence that says whom the application is for (the Bac marocain sentence) is added as a second quote. No model is called and nothing is applied to `data/`: the proposals go through the existing enrichment flow, `pnpm data:evidence restage --enrich data-staging/proposals-fr-calendar --slugs <file>`, then `verify --enrich`, `data:audit` and `data:promote --replace-revisions`, and the deadline rules above (an accepted quote must name international applicants) still apply.

- `--dry-run` computes everything and writes nothing. The summary counts the BUT and Licence programmes that would get a proposal and prints the calendar sentence found for each kind, or "no calendar sentence found".
- A programme that is neither a BUT nor a Licence (a Master, an engineering diploma) gets no proposal.
- The Licence calendar is not wired yet: `PAGES.calendarLicence` (`scripts/import/enrich-fr.ts`) is added only when an official page for it is found, so no Licence programme gets a proposal until then.
- Proposal files in the output directory that an earlier run wrote and this run did not are listed in a warning, never deleted.

### Scholarships (`pnpm data:scholarship`)

Scholarships are Bachelor-level (`level: bachelor`) and verified-only. The assistant prepares a proposal from the provider's official pages; code re-fetches every cited page and decides what is kept, and a fact no accepted quote supports stays unknown (`null`).

```
pnpm data:scholarship verify <proposal.json> [--dry-run]
```

The proposal (`ScholarshipProposalSchema` in `scripts/import/scholarships.ts`) is JSON with `slug`, `name`, `provider`, `destinations` and `eligibleNationalities` (country codes; an empty nationality list means any international applicant), `fields` (empty = all fields), optional `institutions`, `summary` and `howToApply` (`fr` required, `en` optional), `officialUrl` (https), `support` (`amount` in whole major units with `currency` and `per` of month, year, once or total, plus `covers`; or `null`), `deadline` (ISO date or `null`), `documents` (or `null`) and `evidence`: verbatim `{ url, quote }` lists for `eligibility`, `level`, `howToApply` and optionally `support` and `deadline`. A quote counts only if it is on the cited page and on an official site (the provider's own, `daad.de`, `nuffic.nl`, `studyinholland.nl`, `campusfrance.org`, or a government site such as `gouv.fr`, `bund.de`, `overheid.nl`, `government.nl`, `.gov`). Then:

- **Eligibility:** an accepted quote must name international (non-EU) applicants; a quote that states an exclusion ("not eligible", "instead", "only EU citizens", ...) is dropped. Each listed nationality needs a quote that names the country or its region. The quote table (`NATIONALITY_NAMES`) covers MA, DZ and TN only; any other code is rejected until its names are added.
- **Level:** a quote must say the scholarship itself is for Bachelor (undergraduate, first-degree) students. A quote that makes it a Master or doctoral scholarship, or that requires a Bachelor's degree to apply (or is for its graduates), rejects the record.
- **Support:** the amount is kept only if one quote states it as a whole number with the currency next to it and the period (per month, per year, one-time, in total) beside it; a ceiling ("up to") or a Master's amount does not count. Otherwise `support` stays unknown, with a note. `covers` keeps only what a quote names; `other` is never kept.
- **Deadline:** kept only if one clause of an accepted quote names international applicants, contains exactly one date and says what the date is (a deadline word, not an opening or results date). A quote with several dates (one per applicant group) leaves the deadline unknown.
- **Documents:** an item is kept only if an accepted quote names it as the page writes it; `translationRequired: true` needs a quote that also mentions translation, else it becomes `null`.
- **Institutions:** each slug must be a file in `data/institutions/`.

The record is staged in `data-staging/scholarships/<slug>.yaml` with its evidence and the rejected facts in `_review`; a staged file or a slug already in `data/` is never overwritten, and `--dry-run` writes nothing. Scholarships are few and shown as facts about money and eligibility, so `data:audit` always puts every `scholarships/*` item in the sample (`drawBatch`): they are 100% audited, whatever the batch size. The sample sheet spells out destinations, nationalities, fields and institutions ("ALL FIELDS", "ALL INSTITUTIONS") and the checks to confirm. After the audit, `data:promote` as for any prepared record.

The optional `institutions` field restricts a scholarship to the programmes of the named institutions (slugs of `data/institutions/`, checked by `data:check`). Absent or empty means no restriction. How a scholarship is matched to a programme: the student's nationality is filtered first (an empty `eligibleNationalities` matches any), a scholarship the programme links explicitly always applies, and otherwise the destination must match, `fields` must be empty or include the programme's field, and `institutions` must be empty or include its institution.
