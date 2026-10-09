# Data wave 1: national facts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give about 820 programmes a verified `documents` or `applicationChannel` fact from national official pages (FR documents, DE channel and documents, NL channel, IT channel and documents) through the existing audited pipeline, with no model and no search credits.

**Architecture:** One new tool, `pnpm data:national`, turns a committed registry (national page URLs, verbatim quotes, candidate document items, a programme selector) into one `Proposal` per selected programme in `data-staging/proposals-national/<run>/`. The existing flow (`data:evidence restage --enrich`, `verify --enrich`, `data:audit`, `data:promote`) verifies every quote with the same code as every other fact. A small pipeline change lets a registry entry request `info_kind: guidance` for documents and application channel.

**Tech Stack:** TypeScript (strict), Node 24, tsx scripts, Zod, `yaml`, Vitest, existing `scripts/import/*` helpers, pnpm.

Spec: `docs/superpowers/specs/2026-10-09-data-wave1-national-facts-design.md`. Evidence base (URLs, quotes, counts): `docs/superpowers/research/2026-10-09-data-gap-research.md`. Read both first.

## Global Constraints

- Worktree `C:\Users\dagda\Downloads\nex\UniWay-deploy`, branch `feat/data-wave1` (never touch `C:\Users\dagda\Downloads\nex\UniWay`, never use port 3000). Before any pnpm/next command: `export SWC_NATIVE_BINDING_CACHE='C:\Users\dagda\.swc-cache'`. The Bash tool strips backslashes: write files (especially regexes and JSON with accents) with the Write/Edit tools.
- Project rules (`.claude/CLAUDE.md`): every fact in `data/` has an official https `source_url`, `info_kind` and `last_verified_at`; never invent or fill a value; every value traces to a quote that code re-fetches; missing data stays `null`. TypeScript strict, no `any`, no `@ts-ignore`, no non-null `!`, named exports, Biome formatting (2 spaces, 100 cols, double quotes), Zod for every data file and input boundary in server/build scripts. No new dependencies. Conventional commits; `git add` explicit paths; never `git add -A`; trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; never push to `main`.
- Never `git add` anything under `data-staging/` (it holds untracked working files, and tools such as `restage` rewrite tracked staging files like `AUDIT.csv`); registries and code are committed, staged proposals are not. `data/` changes are committed only by the orchestrator after the owner has read an audit sample (Task 8).
- `last_verified_at` is stamped by `data:promote` with the date the owner passes; no tool in this plan stamps a date. Nationwide pages are fetched politely: one request at a time, project User-Agent (use the existing `pageText`/`fetchText`, which cache in `.cache/import/`), stop at any 403/429.
- Owner decisions (2026-10-09): national lists that are only "normally/often required" (DE uni-assist documents, IT circular documents) are stored as `info_kind: guidance`; Campus France Maroc documents (FR), channels (Studielink, Universitaly, uni-assist) and per-university channel quotes are `official`; German `processes` and own-portal universities are evidenced by a quote from the university's own page via a curated registry. Wave 1 does not touch tuition, deadlines, language, rules, duration, scholarships or costs, and does not touch Hungary.
- Verification commands (from the worktree): `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm data:check` (0 errors), `pnpm build`, `pnpm perf:js`, `pnpm test:e2e` (alone). Do not edit `tests/e2e/support/js-budget.ts`.
- Every task ends with an Opus `reviewer` pass dispatched by the orchestrator; a task is not done until approved.

## Execution protocol (orchestrator)

Tasks 1 and 2 are code and run first, sequentially. Tasks 3 to 7 are registries plus real dry-runs; they edit different registry files and can run one after another (they share `package.json` only if a task needs a script, which none does). Task 8 is the audited batch runbook run by the orchestrator with the owner. Implementers: `implementer` (Sonnet). Reviewer: Opus. Implementer tasks that fetch pages may use `curl -sL` and WebFetch; they must save nothing under `data/`.

## File map

| File | Responsibility |
|---|---|
| `scripts/import/proposals.ts` (modify) | `infoKind` on documents/channel facts; carried through `verifyProposal`, `enrichRecord`, `applyVerified` |
| `scripts/import/evidence-cli.ts` (modify) | memoise `getText` inside `verifyAll` |
| `scripts/import/national.ts` (new) | registry schema, programme reader, selectors, proposal builder, writer, CLI |
| `scripts/import/national-uniassist.ts` (new) | German uni-assist sheet mapper (vpd_only rows -> registry entries) |
| `scripts/import/registries/national-{fr,de,nl,it}.json` (new) | curated national facts per country |
| `tests/scripts/import/{proposals,national,national-uniassist,national-registries}.test.ts` | unit tests |
| `package.json` | `"data:national": "tsx scripts/import/national.ts"` next to the other `data:*` scripts |
| `data/README.md` (modify) | a `data:national` section |

---

### Task 1: `info_kind: guidance` in the proposal pipeline, memoised `verifyAll`

**Files:**
- Modify: `scripts/import/proposals.ts` (lines to read first: 30-33 `fact()` helper, 99-151 `ProposalSchema`, 139-147 documents/channel facts, 155-167 `AcceptedFact`/`Verified`, ~374 where an accepted fact is stored, 493 `applyVerified`, 563-667 `enrichRecord`, specifically the `info_kind: "official"` at ~493 and ~615)
- Modify: `scripts/import/evidence-cli.ts` (`verifyAll`, ~224)
- Test: `tests/scripts/import/proposals.test.ts`, `tests/scripts/import/evidence-cli.test.ts` (existing files; add cases)

**Interfaces:**
- Produces: `ProposalSchema` accepts an optional `infoKind: "official" | "guidance"` on `facts.documents` and `facts.applicationChannel` only (all other facts still strip unknown keys, so a guidance request on tuition, intakes etc. cannot exist). `AcceptedFact` gains `infoKind?: "official" | "guidance"`. `enrichRecord` and `applyVerified` write `info_kind: accepted.infoKind ?? "official"`. Behaviour already true and must stay: an existing value with `info_kind === "official"` is never overwritten.
- `verifyAll` calls the injected/default `getText` through a per-run memo (`Map<string, Promise<string>>`), so a national page cited by 700 proposals is fetched and converted once.

- [ ] **Step 1: Failing tests** in `tests/scripts/import/proposals.test.ts` (use the file's existing helpers for a minimal record and page map; follow the style of the neighbouring `enrichRecord` tests):
  1. `ProposalSchema.parse` keeps `infoKind: "guidance"` on a documents fact and on an applicationChannel fact; rejects `infoKind: "estimate"`.
  2. `verifyProposal` of a documents proposal with `infoKind: "guidance"` returns `facts.documents.infoKind === "guidance"`; with no `infoKind` it is `undefined`.
  3. `enrichRecord` on a staged record with `documents.value === null` and a verified guidance documents fact writes `documents.info_kind === "guidance"`; the same with no `infoKind` writes `"official"`; a record whose existing `documents` is `official` with a value is kept even when the new fact is guidance.
  4. In `tests/scripts/import/evidence-cli.test.ts` (pattern at ~97-135: temp dirs, `pages` record, `verifyAll(false, null, { enrichDir, stagingDir, getText })`): three staged enrich records citing the same URL cause `getText` to be called once for that URL.
- [ ] **Step 2: Run** `pnpm exec vitest run tests/scripts/import/proposals.test.ts tests/scripts/import/evidence-cli.test.ts` and confirm the new cases fail for the right reason.
- [ ] **Step 3: Implement.** In `proposals.ts` add next to `fact()`:

```ts
const InfoKindRequest = z.enum(["official", "guidance"]);
// Only documents and application channel may ask for guidance: a national page that says "normally
// required" is advice, not an official requirement.
const guidanceFact = <T extends z.ZodTypeAny>(value: T) =>
  fact(value).extend({ infoKind: InfoKindRequest.optional() });
```

  and use `guidanceFact(...)` for `applicationChannel` and `documents` in `ProposalSchema`. Carry `infoKind` where `verifyProposal` stores an accepted fact (~374), add the optional field to `AcceptedFact`, and replace both hard-coded `"official"` stamps with `accepted.infoKind ?? "official"` (check each site's variable names). In `evidence-cli.ts` wrap the `getText` used by `verifyAll` in a memo:

```ts
function memoText(getText: (url: string) => Promise<string>): (url: string) => Promise<string> {
  const seen = new Map<string, Promise<string>>();
  return (url) => {
    const hit = seen.get(url);
    if (hit !== undefined) return hit;
    const pending = getText(url);
    seen.set(url, pending);
    return pending;
  };
}
```

  (a rejected fetch must not poison later calls inside one run: on rejection delete the entry, like `readBuildSnapshot` does elsewhere.)
- [ ] **Step 4: Run** the two test files, `pnpm typecheck`, `pnpm lint`, then the whole `pnpm test` (the importer has many tests; none may regress).
- [ ] **Step 5: Check the surfaces the map flagged.** (a) `pnpm exec tsx -e` is not needed: read `src/data-schema/provenance.ts:35-55` and `scripts/data/product-rules.ts` and confirm `data:check` allows `info_kind: guidance` on `documents` and `applicationChannel` (it does for 88 existing programme facts; state the file:line proof). (b) Read `src/components/program/program-sections.tsx` (DocumentsSection ~404-440, ProcedureSection ~360-402) and `src/components/source-badge.tsx` and confirm a guidance fact renders the "General guidance" label, not "official"; if the badge text for guidance is wrong or the documents list claims "official" anywhere in copy (`messages/*.json` keys used by those sections), report it instead of fixing (UI changes are a separate decision).
- [ ] **Step 6: Commit.**

```bash
git add scripts/import/proposals.ts scripts/import/evidence-cli.ts tests/scripts/import/proposals.test.ts tests/scripts/import/evidence-cli.test.ts
git commit -m "feat: guidance info_kind for documents and channel proposals, memoised page text in verifyAll"
```

---

### Task 2: `data:national` core

**Files:**
- Create: `scripts/import/national.ts`, `tests/scripts/import/national.test.ts`, `tests/scripts/import/national-registries.test.ts`
- Modify: `package.json` (script), `data/README.md` (section)
- Read first: `scripts/import/fr-calendar.ts` (template: `readCalendarProgrammes`, `buildCalendarProposals`, `writeCalendarProposals`, `staleProposalFiles`, `main`), `scripts/import/daad-deadlines.ts` (skip-reason reporting), `scripts/import/proposals.ts` (`ProposalSchema`, `verifyProposal`), `scripts/import/evidence.ts` (`pageText`), `scripts/import/staging.ts` (`DATA_DIR`, `STAGING_DIR`, `parseCsv`)

**Interfaces:**
- Consumes: Task 1 (`infoKind` on documents/channel facts); `ProposalSchema`, `Proposal`, `verifyProposal(proposal, programmeName, getText)`; `pageText`; `programmeKind` and `ProgrammeKind` from `fr-calendar.ts`.
- Produces (all exported from `scripts/import/national.ts`):

```ts
export type Selector = z.infer<typeof SelectorSchema>;
export type Entry = z.infer<typeof EntrySchema>;
export type NationalProgramme = {
  slug: string; name: string; country: string; institution: string;
  institutionType: "public" | "private" | null;
  kind: ProgrammeKind | null;       // only computed for FR; null elsewhere
  channel: string | null;           // programme's applicationChannel value
  holdsDocuments: boolean;
};
export function parseRegistry(json: unknown): { entries: Entry[] };            // throws ZodError
export function selects(p: NationalProgramme, s: Selector): boolean;
export async function readNationalProgrammes(dataDir?: string): Promise<NationalProgramme[]>;
export type EntryReport = { id: string; selected: number; proposed: number; skipped: string[]; rejected: string[] };
export async function buildNationalProposals(input: {
  entries: readonly Entry[]; programmes: readonly NationalProgramme[];
  getText: (url: string) => Promise<string>;
}): Promise<{ proposals: Proposal[]; reports: EntryReport[] }>;
export function writeNationalProposals(proposals: readonly Proposal[], dir: string, dry: boolean): Promise<void>;
```

- [ ] **Step 1: Failing tests** `tests/scripts/import/national.test.ts` (no network; inject `getText` as a closure over a `Record<string,string>`; build temp `data/programs` and `data/institutions` trees with `mkdtemp(tmpdir())` and YAML strings, as `daad-deadlines.test.ts:242-` does). Cover, each as its own `it`:
  1. `parseRegistry` rejects a non-https evidence url, a quote under 15 characters, a document item with `translationRequired: false`, an entry with `fact: "documents"` and no items, a channel entry without `channel`; accepts a minimal valid documents entry and channel entry.
  2. `selects`: country mismatch false; `institutions` list filter; `institutionType` public vs private vs null (null never matches a type filter, like fr-calendar's `publicInstitution`); `kinds` filter (FR kinds only); `channels` filter requires the programme's current channel to be in the list.
  3. `readNationalProgrammes` over a temp tree: reads country, institution type from `institutions/<slug>.yaml`, channel value, documents-held flag (empty array or null = not held), FR kind via `programmeKind`.
  4. `buildNationalProposals`: (a) a channel entry whose quote is on the page yields a `Proposal` per selected programme that holds no channel, with `facts.applicationChannel.value` the slug, one evidence item `{url, quote}`, `programmePage: null`, and it parses with `ProposalSchema`; (b) a quote missing from the page yields no proposals and a `rejected` reason in the report; (c) programmes already holding the fact are skipped (counted in `skipped`); (d) a documents entry carries `infoKind: "guidance"` into `facts.documents.infoKind` when the entry says so, and none when `official`; (e) two entries (documents and channel) for the same programme merge into ONE proposal with both facts; (f) two entries claiming the same fact for the same programme keep the first and report the second as skipped; (g) a documents item whose `quotedAs` is not in any accepted quote stays in the proposal (the verifier drops it later) but the entry is rejected when NO item is found (the dry verification keeps the entry only if `verifyProposal` accepts the fact).
  5. Writer: `writeNationalProposals(..., dry=true)` writes nothing; with `dry=false` writes `<slug>.json` (pretty JSON + newline) and `slugs.txt` (one slug per line, sorted) into the directory; leftover `.json` files from a previous run are reported (not deleted) by `staleProposalFiles` (reuse the fr-calendar function by exporting it from there, or copy its 8 lines).
  `tests/scripts/import/national-registries.test.ts`: for every file `scripts/import/registries/national-*.json` that exists, `parseRegistry(JSON.parse(readFileSync(file, "utf8")))` succeeds and entry ids are unique across files (the test must pass with zero registry files, so later tasks only add files).
- [ ] **Step 2: Run, confirm failure** (`module not found`).
- [ ] **Step 3: Implement** `scripts/import/national.ts`. Schema and builder core (adapt names to the real exports you read; keep functions small):

```ts
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";
import { z } from "zod";

import { pageText } from "./evidence";
import { type ProgrammeKind, programmeKind } from "./fr-calendar";
import { type Proposal, ProposalSchema, verifyProposal } from "./proposals";
import { DATA_DIR, STAGING_DIR } from "./staging";

const Kebab = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const Https = z.string().url().refine((u) => u.startsWith("https://"), "https only");
const Evidence = z.object({ url: Https, quote: z.string().min(15) });

export const SelectorSchema = z.object({
  country: z.enum(["FR", "DE", "NL", "IT", "HU"]),
  institutions: z.array(z.string()).min(1).optional(),
  institutionType: z.enum(["public", "private"]).optional(),
  kinds: z.array(z.enum(["but", "licence", "other"])).min(1).optional(),
  channels: z.array(z.string()).min(1).optional(),
});

const DocumentItem = z.object({
  slug: z.string().regex(Kebab),
  name: z.object({ fr: z.string().min(1), en: z.string().min(1).optional() }),
  quotedAs: z.string().min(2).max(120),
  translationRequired: z.literal(true).nullable(), // never false (data/README.md)
});

const Base = {
  id: z.string().regex(Kebab),
  infoKind: z.enum(["official", "guidance"]),
  selector: SelectorSchema,
  evidence: z.array(Evidence).min(1),
  notes: z.string().optional(),
};

export const EntrySchema = z.discriminatedUnion("fact", [
  z.object({ ...Base, fact: z.literal("documents"), items: z.array(DocumentItem).min(1) }),
  z.object({ ...Base, fact: z.literal("applicationChannel"), channel: z.string().regex(Kebab) }),
]);
export const RegistrySchema = z.object({ entries: z.array(EntrySchema).min(1) });
```

  `selects` is a pure conjunction of the selector's present fields. `buildNationalProposals` runs per entry: select programmes (and skip those already holding the fact: `holdsDocuments` for documents, `channel !== null` for channel); build the entry's single fact (`{ value, evidence, infoKind }` with `infoKind` omitted for `official`); verify ONCE with `verifyProposal(candidateForFirstSelected, firstSelected.name, getText)` (national evidence is identical for every programme; `programmePage` is `null`), and when the fact is not in `verified.facts` put every `verified.rejected[].reason` in `rejected` and propose nothing for that entry; otherwise create one `ProposalSchema.parse({ slug, programmePage: null, facts: { [fact]: ... } })` per selected programme, merging into an existing proposal for the same slug from an earlier entry (a second claim on the same fact is reported in `skipped`, first wins). `main(argv)`: positional registry paths, `--dry-run`, `--out <dir>` (default `data-staging/proposals-national/<basename of the first registry without .json>`), `--data-dir`; it prints, per entry, `selected / proposed / skipped (grouped reasons) / rejected`, then totals, the stale-file warning and the exact next commands:

```
pnpm data:evidence restage --enrich <out> --slugs <out>/slugs.txt
pnpm data:evidence verify --enrich <out> --dry-run
```

  Add the CLI guard used by the other tools (`if (process.argv[1]?.endsWith("national.ts") === true) main(...)`) and the package script. Add to `data/README.md` a `### National facts (pnpm data:national)` section (registry format, selector fields, guidance, the three commands above, "never overwrites an existing value", "no model, no search").
- [ ] **Step 4: Run** the new tests, `pnpm typecheck`, `pnpm lint`, full `pnpm test`.
- [ ] **Step 5: Commit.**

```bash
git add scripts/import/national.ts tests/scripts/import/national.test.ts tests/scripts/import/national-registries.test.ts package.json data/README.md
git commit -m "feat: data:national turns a curated registry of national facts into per-programme proposals"
```

---

### Task 3: French documents registry (official)

**Files:**
- Create: `scripts/import/registries/national-fr.json`
- Read first: the research file, France section; `scripts/import/enrich-fr.ts` (`PAGES`, how the Campus France Maroc pages are fetched and their encoding handled)

**Interfaces:** Consumes Task 2 (`parseRegistry`, `pnpm data:national`). Produces: one registry entry `fr-documents-etudes-en-france` with `fact: "documents"`, `infoKind: "official"`, `selector: { country: "FR", institutionType: "public", kinds: ["but", "licence"] }`.

- [ ] **Step 1: Read the real pages.** Fetch with the project's own fetch layer so decoding matches what the verifier will see: `pnpm exec tsx -e "import { pageText } from './scripts/import/evidence'; pageText('https://www.maroc.campusfrance.org/2la-saisie-des-informations-personnelles').then(t => console.log(t))"` (also the procedure page `https://www.maroc.campusfrance.org/la-procedure-de-candidature-sur-etudes-en-france-de-campus-france`). Save nothing outside `.cache/import/`.
- [ ] **Step 2: Write the registry.** Evidence quotes: sentences at least 15 characters, copied from that text exactly (the verifier normalises case, quotes, dashes and whitespace only). Items: only documents whose `quotedAs` wording you saw in that text (the research confirmed these lines, re-check each: "photo d'identité", "pièce d'identité", and the translation sentence "Tous les documents doivent être en français ou traduits en français auprès d'un traducteur assermenté"). The research also saw, but did not confirm in the raw page: baccalauréat with "relevé de notes du national et du régional", certificat de scolarité, relevés de notes of each lycée year, TCF/DELF B2/DALF certificate: add each as an item ONLY if you find its exact words; never from memory. Slugs: reuse the existing ones where they fit (`grep` the slugs in `data/programs/*.yaml`, e.g. `school-leaving-certificate`, `passport`); new kebab slugs otherwise. `translationRequired: true` only for items covered by the translation sentence, else `null`. Names fr/en. Put in `notes`: "Platform dossier of Études en France; not per-institution extras (DAP blanche, Campus France interview, CVEC)".
- [ ] **Step 3: Validate.** `pnpm exec vitest run tests/scripts/import/national-registries.test.ts` passes with the new file.
- [ ] **Step 4: Real dry run.** `pnpm data:national scripts/import/registries/national-fr.json --dry-run` and report the counts (selected, proposed, skipped by reason, rejected). Expect about 700 selected. Check three random selected slugs by hand: public institution, BUT or Licence, no documents yet. If `proposed` is 0 explain exactly which quote or item failed. Then run without `--dry-run` once (writes only under `data-staging/proposals-national/national-fr/`, untracked) so Task 8 can use it.
- [ ] **Step 5: Commit** `git add scripts/import/registries/national-fr.json && git commit -m "feat: national registry for French application documents (Campus France Maroc)"`.

---

### Task 4: German application channel (uni-assist sheet mapper and curated registry)

**Files:**
- Create: `scripts/import/national-uniassist.ts`, `tests/scripts/import/national-uniassist.test.ts`, `scripts/import/registries/national-de-channel.json`
- Modify: `scripts/import/national.ts` (the CLI accepts `--uniassist-sheet <csv>`: entries produced by the mapper are appended to the registry entries before building)
- Read first: research file Germany section; `data-staging/UNIASSIST.csv` header and rows (`uniAssistId,name,city,website,mode,matchMethod,matchedInstitutions,sameTownCandidates,detailUrl,note`); `scripts/import/sources/uniassist.ts` (`parseList`, `parseDetail`, types); `parseCsv` in `staging.ts`

**Interfaces:**
- Produces: `export function uniAssistEntries(rows: readonly SheetRow[]): { entries: Entry[]; forPerson: { name: string; reason: string }[] }`. Rows with `mode === "vpd_only"` and a non-empty `matchedInstitutions` become one entry each: `fact: "applicationChannel"`, `channel: "de-uni-assist-vpd"`, `infoKind: "official"`, `selector: { country: "DE", institutions: [matched slugs] }`, `evidence: [{ url: detailUrl, quote: <the VPD sentence from the row's note> }]`. `special` rows, rows with no matched institution, and rows whose note does not contain the VPD wording go to `forPerson` and are never proposed.
- The curated registry `national-de-channel.json` covers what the sheet cannot: the `processes` universities (Fulda, Hannover, Osnabrück, Leuphana, Passau, Köln, plus Hof, Trier/Birkenfeld, Hamm-Lippstadt, Wismar after a person confirms the campus matches; see the research file) and the own-portal institutions (FAU, FH Münster, Mannheim, TH Nürnberg, TH Ulm, Karlsruhe, Reutlingen, Ravensburg, Furtwangen, Albstadt, DHBW Mosbach, EBS, Frankfurt School, Fresenius, SRH, Bard, Kühne, WHU).

- [ ] **Step 1: Failing tests** for `uniAssistEntries` with inline CSV rows: vpd_only matched row -> entry with the detail url and the note's VPD sentence (the quote must be a substring of the note and at least 15 chars); `processes` row -> `forPerson` (no entry); `special` -> `forPerson`; unmatched -> `forPerson`; a row matching two institutions -> one entry with both slugs.
- [ ] **Step 2: Implement** the mapper (`parseCsv` from `staging.ts`), wire `--uniassist-sheet` into `main`, make the tests pass.
- [ ] **Step 3: Curate `national-de-channel.json`.** For each university listed above that has programmes without a channel in `data/programs/de-*.yaml` (check the slugs and the institution slug in `data/institutions/`), fetch its own admissions page (not uni-assist's list) and add an entry only when you can quote a sentence of at least 15 characters that the existing channel verifier accepts: for `de-uni-assist` the quote must match `/uni-assist|uniassist/i`; for `de-uni-assist-vpd` it must match `/\bVPD\b|Vorp[üu]fungsdokumentation|preliminary (review|evaluation)/i`; for `de-university-direct` it must match `/application portal|apply directly|directly (to|at) the (higher education institution|university)|application via the university/i` (read `CHANNEL_WORDS` and `CHANNEL_EXCLUDES` in `scripts/import/evidence.ts` ~711-745 and use them as the ground truth; do NOT widen them in this task: report institutions whose page uses other wording instead). HSHL-type cases (the sheet says processes but the page describes a document check by uni-assist followed by an upload to the university's own portal) are `de-uni-assist-vpd` or `de-university-direct` according to the quote, not according to the sheet. One entry per institution (selector `institutions: [slug]`).
- [ ] **Step 4: Real dry run:** `pnpm data:national scripts/import/registries/national-de-channel.json --uniassist-sheet data-staging/UNIASSIST.csv --dry-run`: report per entry counts, the `forPerson` list with reasons, the institutions you could not evidence and why; total proposals (expect about 29 from sheet + registry, up to about 40). Then run it without `--dry-run`.
- [ ] **Step 5: Tests, typecheck, lint, commit.**

```bash
git add scripts/import/national-uniassist.ts scripts/import/national.ts tests/scripts/import/national-uniassist.test.ts scripts/import/registries/national-de-channel.json
git commit -m "feat: German application channel from the uni-assist sheet and a curated university registry"
```

---

### Task 5: German documents (guidance)

**Files:** Create `scripts/import/registries/national-de-documents.json`. Read first: research file Germany "Documents".

**Interfaces:** one or more entries `fact: "documents"`, `infoKind: "guidance"`, selector `{ country: "DE", institutions: [...] }` where the institution list is the set of institutions whose uni-assist mode is `processes` or `vpd_only` in `data-staging/UNIASSIST.csv` (column `matchedInstitutions`, `;`-separated slugs; include the campus matches a person confirmed in Task 4). Do not select by programme channel (the channel is promoted later).

- [ ] **Step 1: Read the pages with the project fetch layer** (see Task 3 step 1): `https://www.uni-assist.de/en/tools/info-country-by-country/details-country/country/ma/` (Morocco), `https://www.uni-assist.de/en/how-to-apply/assemble-your-documents/educational-certificates/`, and `https://www.uni-assist.de/en/how-to-apply/assemble-your-documents/translations/`.
- [ ] **Step 2: Registry.** Items only from wording found verbatim: the Baccalauréat "Relevé de Notes", degree certificate and complete transcript of records for university studies, transcripts for classes préparatoires, and where found the certified-copy statement ("signature and stamp") and the sworn-translation statement (`translationRequired: true` only for items a translation quote covers). `notes`: "General uni-assist guidance; the university may require more; the Baccalauréat alone leads to Studienkolleg and the Feststellungsprüfung (see the route)". Evidence: the Morocco page quote plus the translation/certified-copy page quotes.
- [ ] **Step 3: Dry run** `pnpm data:national scripts/import/registries/national-de-documents.json --dry-run`; report counts (expect about 35); then run without `--dry-run`.
- [ ] **Step 4: Registry test passes; commit** `git add scripts/import/registries/national-de-documents.json && git commit -m "feat: national registry for German application documents (uni-assist guidance)"`.

---

### Task 6: Dutch channel (official)

**Files:** Create `scripts/import/registries/national-nl.json`. Read first: research file Netherlands "Documents/channel".

**Interfaces:** one entry `fact: "applicationChannel"`, `channel: "nl-studielink"`, `infoKind: "official"`, selector `{ country: "NL" }` (programmes without a channel only, enforced by the tool), evidence: a sentence of at least 15 characters from `https://www.studyinnl.org/plan-your-stay/how-to-apply` containing "Studielink" (checked by `CHANNEL_WORDS`); add a second quote from `https://info.studielink.nl/en/` pages only if it names how foreign applicants enrol.

- [ ] **Step 1: Read the page** with the project fetch layer; pick the sentence that says applicants enrol through Studielink.
- [ ] **Step 2: Registry + registry test.**
- [ ] **Step 3: Dry run** (`--dry-run`): expect 13 selected, 13 proposed; report; run without `--dry-run`.
- [ ] **Step 4: Commit** `git add scripts/import/registries/national-nl.json && git commit -m "feat: national registry for the Dutch application channel (Studielink)"`.

---

### Task 7: Italian channel and documents

**Files:** Create `scripts/import/registries/national-it.json`. Read first: research file Italy "Channel", "Documents"; `scripts/import/pdf.ts`.

**Interfaces:** entries:
1. `it-channel-universitaly`: `applicationChannel` `it-universitaly`, official, selector `{ country: "IT" }` MINUS the institutions that apply on their own portal (list those slugs in entry 2 and exclude them from entry 1 by making entry 1's selector an explicit `institutions` list of every other Italian institution slug in `data/institutions/it-*.yaml`; the tool has no "exclude" field on purpose). Evidence: the Universitaly sentence "dovrà essere presentata esclusivamente per il tramite del portale UNIVERSITALY" (verify the page text first, `https://www.universitaly.it/en/studenti-stranieri`; if the wording differs, quote what is there). The audience is not checked by the channel verifier: put in `notes` that the page does not state its audience in the sentence and that it concerns applicants abroad (quote that audience if the page has it).
2. `it-channel-university-direct`: `it-university-direct`, official, for the universities whose own page says the university portal is used (Ca' Foscari apply.unive.it, Padova apply.unipd.it, Udine Elix, Bocconi, Unimi apply.unimi.it): one entry per university with a quote the `it-university-direct` regex accepts and that does NOT contain "universitaly", EU, "Italian citizens", "residing in Italy" (read `CHANNEL_WORDS` / `CHANNEL_EXCLUDES`); skip any university whose page cannot give such a quote and report it.
3. `it-documents-circolare`: `documents`, `infoKind: "guidance"`, selector `{ country: "IT" }`, evidence the section 4 sentence of the circular "La documentazione normalmente richiesta ... è la seguente" (PDF `https://universitaly-private.cineca.it/uploads/universitaly-pubblico/Circolare_2026-2027_studenti_internazionali.pdf`, read through `pageText`, which extracts PDF text; confirm the exact text first), items from the list under it only with verbatim wording (secondary diploma of at least 12 years, CIMEA statement or "Dichiarazione di valore", translations, aptitude certificate if applicable). `translationRequired: true` only for the translation item. `notes`: "Ministry circular: documents normally required; universities are autonomous".

- [ ] **Step 1: Read pages/PDF with the project fetch layer.** If the circular text is not extractable, stop and report; do not proceed with entry 3.
- [ ] **Step 2: Registry + registry test.**
- [ ] **Step 3: Dry run** (`--dry-run`): expect channel about 17 and documents about 28; report exact numbers and any university excluded; then run without `--dry-run`.
- [ ] **Step 4: Commit** `git add scripts/import/registries/national-it.json && git commit -m "feat: national registry for the Italian application channel and documents"`.

---

### Task 8: Audited batches (orchestrator and owner; not delegated)

For each batch (FR documents; DE channel then DE documents; NL channel + IT channel and documents), run from the worktree, in this order, and show the owner the output:

- [ ] `pnpm data:coverage` (before numbers, saved).
- [ ] `pnpm data:evidence restage --enrich data-staging/proposals-national/<run> --slugs data-staging/proposals-national/<run>/slugs.txt`
- [ ] `pnpm data:evidence verify --enrich data-staging/proposals-national/<run> --dry-run`, then without `--dry-run`. Read the rejected reasons; a quote that fails is a registry bug, not something to bypass.
- [ ] Draw the audit sample with the project's command (`data/README.md` "audit": `pnpm data:audit draw`; read `scripts/import/audit.ts` for the exact flags). The sample is `max(10, ceil(10%))` of the batch: 70 records for the French documents. **Decision for the owner at this point**, before drawing: (a) read the sample as is; (b) split the French batch by institution group to keep each sheet short (the total does not shrink); (c) pass the sample as `waived` (allowed for programmes, not for scholarships or cost profiles); (d) ask for a small code change so a batch made only of identical national facts is sampled at 12 records plus the national page read once. Default if no answer: (a).
- [ ] The owner reads the sample (`data-staging/AUDIT-SAMPLE.md`) and answers "correct" or lists errors; errors go back to the registry (fix, re-run Tasks' dry run and this batch).
- [ ] Promote with the recipe in `data/README.md` (it needs `--confirm-human-read --verified-on <today> --audited-batch --replace-revisions`; check `data/programs` for `*.tmp` files afterwards, and move held-out staged files aside first as the README says).
- [ ] `pnpm data:check` (0 errors) and `pnpm data:coverage` (after numbers). Commit the changed `data/` files by explicit directory path (`git add data/programs data/...`) with `feat(data): <batch>` and the before/after coverage in the message body.

---

### Task 9: Whole-branch review, gates, PR

- [ ] Whole-branch Opus review of `git diff origin/main...HEAD` (code, registries, data).
- [ ] Gates: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm data:check`, `pnpm build`, `pnpm perf:js` (the programme page now renders documents/channel for more programmes: confirm first-load JS is unchanged, since facts are static data in snapshots, not client code; shard sizes stay under 300 KB gzip), then alone `pnpm test:e2e`.
- [ ] Draft PR `feat(data): wave 1 national facts (documents and application channels)` with: before/after coverage, per-batch audit result, what was skipped and why (private French schools, special uni-assist rows, universities whose pages gave no acceptable quote), and the guidance caveat. Update `.claude/CLAUDE.md` only if a command or architecture fact changed (add `pnpm data:national`).
