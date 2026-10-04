# French teaching language from the Parcoursup fiche (research round 3, run 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Give the French programmes that still have no teaching language (89 whose institution has no website; 284 in all) a verified `teachingLanguages: ["fr"]` fact from the one line every Parcoursup fiche prints, "Niveau de français requis pour s'inscrire à la formation : B2", without a model and without search credits.

**Architecture:** `scripts/import/fr-language.ts` (modelled on `daad-deadlines.ts` / `fr-calendar.ts`): a pure `frenchLanguage(text)` reads the level line and refuses the fiche when its text shows instruction in another language; `buildFrenchLanguageProposals` fetches each programme's fiche (`officialUrl`) and writes `data-staging/proposals-fr-language-fiche/<slug>.json`. The proposals go through `restage --enrich`, `verify --enrich`, `data:audit` and `data:promote --replace-revisions`.

**Why:** run-2 analysis. All 89 fiches state the level line (282 of the 284 missing programmes do), yet the last round's reader+checker accepted a language for only 63% of programmes: it quoted other lines, proposed `en`, or the checker ruled "unclear". The 435 languages already in `data/` rest on this same line (owner-accepted inference). The line alone is not enough: some fiches say the formation is taught in English ("entièrement dispensée en langue anglaise", "Option Internationale (>50% des cours en anglais)") while still printing a French level, so a fiche with such a signal gets no proposal and stays unknown.

## Global Constraints

- A model only proposes, code decides; here no model is called. The quote is the level line, re-fetched verbatim by `verifyProposal` from the fiche.
- Rule kept from the owner: a language fact needs a verbatim quote that states the language of instruction or the required French level of the Parcoursup fiche.
- Unknown stays unknown: no level line, an unreadable fiche, or ANY signal of instruction in another language (`en anglais`, `en langue anglaise`, `dispensé en <language>`, `cours en <language>`, bilingue, anglophone, parcours/option/cursus international, "taught in") gives no proposal. The guard is deliberately over-cautious.
- Existing official values are never overwritten (enrichment only fills a missing fact); only `teachingLanguages` is proposed.
- `src/` untouched. No `any`, no `@ts-ignore`, no non-null `!`. Tests use temp dirs and injected page text only.

---

### Task 1: the fiche reader, builder and CLI

**Files:**
- Create: `scripts/import/fr-language.ts`
- Create: `tests/scripts/import/fr-language.test.ts`
- Modify: `package.json` (`"data:fr-language": "tsx scripts/import/fr-language.ts"` after `data:fr-calendar`)
- Modify: `data/README.md` (section after the DAAD deadlines one)

**Interfaces:**
- Produces: `type FrenchLanguageOutcome = { ok: true; quote: string; level: string } | { ok: false; reason: "no-level-line" | "other-language" }`; `frenchLanguage(text: string): FrenchLanguageOutcome`; `type FrenchProgramme = { slug: string; url: string }`; `buildFrenchLanguageProposals({ programmes, textOf }): Promise<{ proposals: Proposal[]; skipped: { slug: string; reason: string }[] }>` (`reason` also `"page unreadable"`); `readFrenchProgrammes(dataDir: string, scope: "no-website" | "all"): Promise<FrenchProgramme[]>` (FR programmes whose `teachingLanguages.value` is null/empty and whose `officialUrl` is a `dossierappel.parcoursup.fr` fiche; `no-website` keeps those whose institution record has no https `website`).
- Consumes: `readFiche` from `./enrich-fr` (the existing level-line regex; `frenchLevel.quote`/`level`), `pageText`, `Proposal`/`ProposalSchema`, `writeCalendarProposals`, `staleProposalFiles` from `./fr-calendar`, `DATA_DIR`, `STAGING_DIR`.

- [ ] **Step 1: Write failing tests** (`tests/scripts/import/fr-language.test.ts`): the level line gives `{ok:true, level:"B2", quote:"Niveau de français requis pour s'inscrire à la formation : B2"}`; a fiche without the line -> `no-level-line`; each signal ("entièrement dispensée en langue anglaise", "Option Internationale (>50% des cours en anglais)", "enseignements en langue allemande"... ) -> `other-language`; the same fiche with only "Langue vivante 1 : Anglais" and "Un bon niveau est attendu" -> ok; builder returns a `ProposalSchema`-valid proposal (`programmePage` = fiche url, only `teachingLanguages`, value `["fr"]`) accepted by the real `verifyProposal` (page text contains the programme name) and reports skipped slugs with reasons incl. an unreadable page; `readFrenchProgrammes` on a temp data dir (no-website vs all scope, a programme that already has a language, a non-Parcoursup url, a DE record) returns the right slugs.
- [ ] **Step 2: Run** `pnpm exec vitest run tests/scripts/import/fr-language.test.ts` -> FAIL.
- [ ] **Step 3: Implement** `fr-language.ts`; CLI `main`: `--dry-run`, `--all` (scope), writes to `data-staging/proposals-fr-language-fiche/`, prints counts per skip reason and stale files (same pattern as `daad-deadlines.ts`).
- [ ] **Step 4: Run** the test file, `pnpm typecheck`, `pnpm lint` -> clean.
- [ ] **Step 5: package.json script + README section; commit** `feat: data:fr-language reads the teaching language from the Parcoursup fiche by code`.

### Task 2: Opus review, then the data run (controller)

- [ ] `reviewer` (Opus 5.5, medium) on the diff; fix findings.
- [ ] `pnpm data:fr-language --dry-run`, real run, `restage --enrich ... --slugs`, `verify --enrich` (dry first), check every unsampled record (value + quote + the guard), move held-out Hanze/ISM aside, STOP for the owner's audit sample.
