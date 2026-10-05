# Hungary programmes (Slice 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Stage, enrich, audit and promote the English-taught Hungarian Bachelor programmes (Computer Science, Engineering, Business-Economics) from the official Study Finder, with the same trust model as Germany's DAAD flow. Spec: `docs/superpowers/specs/2026-10-04-italy-hungary-design.md`. Slice 0 (country, route, channels, touchpoints) is committed (`231d793a`).

**Architecture:** `scripts/import/sources/studyfinder.ts` parses the Study Finder list and detail pages (plain HTML tables) into staged institution and programme records (`pnpm data:import hungary`). The Study Finder detail page is the register page of each programme (`-sf<id>` slug suffix): `data:pages` discovers the programme's own page from its "Contact website" row and its fee/admission pages. Facts then come through the existing `data:read` (reader + checker), `restage/verify --enrich`, `data:audit` and `data:promote`.

## Global Constraints

- Official sources only (Study Finder, Study in Hungary, Stipendium Hungaricum); polite cached reads, one request at a time (`fetchText`); the Study Finder has no robots.txt and `www.studyinhungary.hu` has a certificate for the bare host only, so evidence URLs use `https://studyinhungary.hu/...`.
- Field is the Study Finder branch of science (Computer Science and Information Technology, Engineering Science, Economic Science); a name that points elsewhere makes the record `low` confidence for the review sheet. Level Bachelor, language English (plus mixed English entries).
- Nothing is invented: tuition, deadlines, documents, requirements are left `null` for the reader; institution `type` and `website` stay `null` (the register does not say) with a todo.
- Fees keep the currency the page states (EUR or HUF); never converted.
- No `any`, `@ts-ignore`, non-null `!`; tests use inline HTML, no network.

---

### Task 1: parsers and record builder

**Files:** Create `scripts/import/sources/studyfinder.ts`, `tests/scripts/import/studyfinder.test.ts`; Modify `scripts/import/summaries.ts` (`SummarySource` gets `"studyfinder"`).

**Interfaces:**
- `parseSfList(html: string): SfListing[]` where `SfListing = { id: number; name: string; institution: string; language: string | null; location: string | null; duration: string | null }`.
- `parseSfDetail(html: string, id: number): SfDetail` with `SfDetail = { id; name; institution; faculty; branch; level; qualification; language; duration; location; contactWebsite: string | null; studyInHungaryLink: string | null; shAvailable: boolean; diasporaAvailable: boolean; stateAvailable: boolean }`.
- `fieldOfBranch(branch: string | null): string | null` (the three Release 1 fields, else null).
- `semestersToYears(duration: string | null): number | null`; `languageCodesOf(language: string | null): string[] | null`.
- `buildHungaryRecords(details: readonly SfDetail[]): StagedRecord[]` (institutions, campus units for other cities, programmes).
- `importHungary(): Promise<StagedRecord[]>` (list pages per branch x language, then every detail page), registered in `run.ts` as `hungary`.

- [ ] Tests first (inline HTML copied from the real pages): list parsing, detail parsing incl. SH/Diaspora/State flags and Contact website, branch mapping, semesters/years, languages, record building (slugs end `-sf<id>`, field from branch, `officialUrl` = the Study Finder page, `sources.studyfinder`, tuition/intakes/documents null, institution `type` and `website` null, campus unit for a second city, low confidence when the name points to another field, records skipped for other levels/fields).
- [ ] Implement, `pnpm exec vitest run tests/scripts/import/studyfinder.test.ts`, typecheck, lint, commit.

### Task 2: page discovery for Study Finder programmes

**Files:** Modify `scripts/import/pages.ts` (`studyFinderRegisterUrl(slug)`, used where `daadRegisterUrl` is), `scripts/import/discover.ts` (`discoverFromRegister` takes an optional `programmeLink(html)` so the Study Finder "Contact website" row is the programme page); tests in `tests/scripts/import/pages.test.ts` and `discover.test.ts`.

- [ ] Tests first, implement, commit. Then a dry run of `data:pages` on a handful of real slugs.

### Task 3: Opus review, then the data run (controller)

- [ ] `reviewer` on the diff. Then `data:import hungary`, review sheet / shortlist as for DAAD (field and institution checks), `data:pages --slugs`, `data:read --dry-run`, a sample of about 12, report the hit rate, full run with `--check`, `restage/verify --enrich`, check every unsampled staged record, audit sample, STOP for the owner. After the audit: promote with the held-out files aside, coverage table, Stipendium Hungaricum scholarship (verified-only), Release 1 wording in `CLAUDE.md`/`messages/*.json`, PR.
