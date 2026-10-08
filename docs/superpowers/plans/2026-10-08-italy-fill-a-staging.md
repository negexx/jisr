# Italy fill, part A: stage the 12 new Universitaly programmes Implementation Plan (Italy completeness, piece 3a)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A command `pnpm data:it-stage --ids <portal ids>` that turns the owner-approved Universitaly candidates (the 12 new programmes found by piece 2) into normal staged records (`data-staging/programs`, `data-staging/institutions`, `REVIEW.csv`), so they enter the existing audited pipeline (pages, reader, checker, verify, audit, promote). Nothing is promoted and no model or search service is called.

**Architecture:** A pure builder (`buildUniversitalyRecords`) in `scripts/import/sources/universitaly-stage.ts` turns portal candidates plus the MUR university list into `StagedRecord`s with the same shape as the MUR importer's (`mur.ts`); a thin CLI (`scripts/import/it-stage.ts`) reads `candidates.json` from piece 2, fetches the MUR university list and website candidates (existing code), calls the builder, and writes through `writeStaged` / `mergeReviewSheet` exactly like `run.ts`. The portal's `url` becomes the programme's `officialUrl` (the page the reader reads next); every other fact stays `TODO_read_source`, because the portal's JSON is not a page whose quote code can re-fetch. A hint line in the review note carries what the portal states (duration, class) for the human and the reader.

**Tech Stack:** TypeScript strict, `yaml`, Vitest, Biome, pnpm, tsx.

Spec: `docs/superpowers/specs/2026-10-08-italy-completeness-design.md` (Piece 3, "Italy fill"). Branch `feat/italy-fill` (worktree `C:\Users\dagda\Downloads\nex\UniWay-italy-fill`), stacked on `feat/italy-discovery` (PR #21) which is stacked on `feat/italy-completeness` (PR #20).

## Owner decisions (2026-10-08)

- All 12 genuinely new candidates of the discovery report are to be added to the Italian data: Politecnico di Milano (Engineering Science, Process Engineering, Industrial Engineering), Genova (Computer Engineering), Messina (Heritage Innovation Engineering), Palermo (Industrial and Information Engineering), Teramo (Business Management), LUM (Business Economics and Organization, blended), Piemonte Orientale (Management for Sustainability, blended), Cassino (Computer Engineering), Padova (Economics, governance and decision-making, blended), Napoli Federico II (Electrical Engineering and Information Technology). Portal ids: 1625451, 1625568, 1625569, 1625723, 1625559, 1625434, 1626160, 1634282, 1625456, 1625437, 1625480, 1625562.
- Merge order of the PRs is left to the assistant: #20 first, then retarget #21 and this branch to `main`.
- Staging is not promotion: every new record still goes through the reader, the code verifier, the 100% audit of anything new at university level and the owner's reading of the sample, with the blended ones checked on their programme page (delivery mode) before they are accepted.

## Deviations from the spec (and why)

- The spec said the portal fills `officialUrl`, `durationYears`, `teachingLanguages` and field "by code" with `info_kind: official`. The pipeline rule is that an official fact needs a quote that code re-fetches from a page; the portal answers JSON from an API, not a page, so duration and language stay `TODO_read_source` with the portal value in the review note, and the reader (piece 3b) reads them from the programme page. `officialUrl` (the portal's course link) and the field (from the class, by code) are filled.
- City: the portal gives none. The staged programme city is the university's MUR town (campus towns such as Politecnico di Milano's Lecco or Piacenza are not known), and the review note says so.

## Global Constraints

- Official sources only; a model proposes, code decides; every fact needs a verbatim quote that code re-fetches; unknown stays unknown; nothing enters `data/` here. This piece writes only under `data-staging/` (the staging area) through `writeStaged` and the review sheet, and never overwrites an existing staged file (no `--overwrite`).
- No model and no search service (Serper) is called in this piece. Network: the existing MUR university list and contacts-table fetches (cached under `.cache/import/`) and the website probes of `websiteCandidates`; tests are offline with inline fixtures and temp directories.
- The field comes from the degree class by code (`fieldOfClass` result carried in the candidate), never from a model.
- A candidate whose university cannot be resolved to exactly one MUR university (or to exactly one of our existing institutions) is NOT staged: the command stops with a clear message and the owner decides.
- No `any`, no `@ts-ignore`, no non-null `!`; named exports; explicit `git add` paths (never `git add -A`, never anything under `data-staging/`); conventional commits, each ending with the line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; never push to `main`, never force-push, PRs only. Biome: run `pnpm exec biome check --write <files>` before committing.
- Keep files focused: no source file above about 300 lines.

## Environment (this machine)

- Work in the worktree `C:\Users\dagda\Downloads\nex\UniWay-italy-fill`, NOT in `...\UniWay`, `...\UniWay-italy` or `...\UniWay-italy-discovery`. Do not touch ports 3000 or 3101. `pnpm install --frozen-lockfile` is done.
- Before any `pnpm` command: `export SWC_NATIVE_BINDING_CACHE='C:\Users\dagda\.swc-cache'`.
- The shell strips backslashes: never write regexes or `\n` through heredocs; use the Edit/Write tools. `rm -rf` is denied.
- Do not run `pnpm build` or `pnpm test:e2e`. Gates: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm data:check`.
- Tests that stage or review must use temp directories (`stagingDir`, `dataDir` options), never the real `data-staging/` (an earlier test run once wrote 167 files into it).

## File Structure

| File | Responsibility |
|---|---|
| `scripts/import/sources/mur.ts` (modify) | Export the helpers the new builder reuses: `DATASET`, `classSlug`, `titleCase`, `tidyName`, `isSubSite`, `websiteCandidates`. No behaviour change. |
| `scripts/import/summaries.ts` (modify) | New `SummarySource` `"universitaly"` with its three-language line. |
| `scripts/import/sources/universitaly-stage.ts` (create) | `resolveAteneo`, `buildUniversitalyRecords`: pure. |
| `scripts/import/it-stage.ts` (create) | CLI: read `candidates.json`, select by `--ids`, fetch MUR list and websites, build, write staging and the review sheet. |
| `package.json`, `data/README.md`, `.claude/CLAUDE.md` (modify) | Script `data:it-stage`, one README paragraph, one command-table row. |
| `tests/scripts/import/universitaly-stage.test.ts`, `it-stage.test.ts` (create) | Tests. |

---

### Task 1: Builder (pure)

**Files:**
- Modify: `scripts/import/sources/mur.ts` (exports only), `scripts/import/summaries.ts`
- Create: `scripts/import/sources/universitaly-stage.ts`, `tests/scripts/import/universitaly-stage.test.ts`

**Interfaces:**
- Consumes: `Candidate` (`scripts/import/sources/universitaly.ts`: `portalId, university, name, classCode, classCodes, field, confidence, durationYears, url, academicYear, delivery`), `Ateneo` and `parseAtenei` (`mur.ts`), `StagedRecord`, `ReviewRow`, `READ_SOURCE` (`staging.ts`), `stagedInstitution` (`institutions.ts`), `nameKey`, `slugify`, `collapseSpaces` (`text.ts`), `universityTokens` (`universitaly-compare.ts`).
- Produces (used by Task 2):
  ```ts
  export type OurInstitution = { slug: string; name: string };   // institutions already in data/ (Italy)
  export function resolveAteneo(portalName: string, atenei: readonly Ateneo[]): Ateneo | "ambiguous" | null;
  export type StageReport = { staged: string[]; reusedInstitutions: string[]; refused: { portalId: number; reason: string }[] };
  export function buildUniversitalyRecords(input: {
    candidates: readonly Candidate[];
    atenei: readonly Ateneo[];
    ourInstitutions: readonly OurInstitution[];
    websites?: ReadonlyMap<string, string>;      // MUR university code -> https website candidate
    fetchedAt: string;                             // ISO date of the portal fetch, for the review note
  }): { records: StagedRecord[]; report: StageReport };
  ```
  Rules: a university resolves first to ONE of `ourInstitutions` (by `nameKey` of its name equal to the MUR `fullName` of the resolved ateneo) and then NO institution record is staged and the programme's `institution` is that slug; if the ateneo has several of our institutions the candidate is refused ("several institutions of ours: campus unknown"); else a new institution record `it-<slug(shortName,40)>-<slug(city)>` (same formula as `mur.ts`) with `sourceId` `mur-institution:<code>@<city slug>` is staged once per university. Programme slug `<instSlug>-<slug(name,40)>-<classSlug(classCode)>`, `sourceId` `universitaly:<portalId>`.

- [ ] **Step 1: Write the failing tests**

Create `tests/scripts/import/universitaly-stage.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { Ateneo } from "../../../scripts/import/sources/mur";
import type { Candidate } from "../../../scripts/import/sources/universitaly";
import {
  buildUniversitalyRecords,
  resolveAteneo,
} from "../../../scripts/import/sources/universitaly-stage";
import { READ_SOURCE } from "../../../scripts/import/staging";

const atenei: Ateneo[] = [
  { code: "0201", fullName: "Università degli studi di Genova", shortName: "Genova", statale: true, city: "GENOVA", region: "Liguria" },
  { code: "0301", fullName: "Politecnico di Milano", shortName: "Milano Politecnico", statale: true, city: "MILANO", region: "Lombardia" },
  { code: "0401", fullName: "Università degli studi di Padova", shortName: "Padova", statale: true, city: "PADOVA", region: "Veneto" },
  { code: "0501", fullName: "Libera Università Mediterranea \"Giuseppe Degennaro\"", shortName: "LUM G. Degennaro", statale: false, city: "CASAMASSIMA", region: "Puglia" },
  { code: "0601", fullName: "Università degli studi di Milano", shortName: "Milano", statale: true, city: "MILANO", region: "Lombardia" },
];

const cand = (over: Partial<Candidate> = {}): Candidate => ({
  portalId: 1625723,
  university: "Università degli Studi di GENOVA",
  name: "Computer Engineering",
  classCode: "L-8",
  classCodes: ["L-8"],
  field: "engineering",
  confidence: "high",
  durationYears: 3,
  url: "https://corsi.unige.it/corsi/12133",
  academicYear: "2026/2027",
  delivery: "conventional",
  ...over,
});

const build = (candidates: Candidate[], ours: { slug: string; name: string }[] = []) =>
  buildUniversitalyRecords({ candidates, atenei, ourInstitutions: ours, fetchedAt: "2026-10-08" });

describe("resolveAteneo", () => {
  it("resolves by exact name key, ignoring case and accents", () => {
    expect(resolveAteneo("Università degli Studi di GENOVA", atenei)).toMatchObject({ code: "0201" });
    expect(resolveAteneo("POLITECNICO DI MILANO", atenei)).toMatchObject({ code: "0301" });
  });
  it("resolves a short portal spelling to the one university that contains its distinctive words", () => {
    expect(resolveAteneo('LUM "Giuseppe Degennaro"', atenei)).toMatchObject({ code: "0501" });
  });
  it("returns null for an unknown university and 'ambiguous' when two match equally", () => {
    expect(resolveAteneo("Università di Trento", atenei)).toBeNull();
    expect(resolveAteneo("Università di Milano", atenei)).toBe("ambiguous");
  });
});

describe("buildUniversitalyRecords", () => {
  it("stages a new university once and one programme per candidate, with the portal link and TODO facts", () => {
    const { records, report } = build([cand(), cand({ portalId: 7, name: "Electrical Engineering", url: null })]);
    const inst = records.filter((r) => r.collection === "institutions");
    const progs = records.filter((r) => r.collection === "programs");
    expect(inst).toHaveLength(1);
    expect(inst[0]?.id).toBe("it-genova-genova");
    expect(inst[0]?.sourceId).toBe("mur-institution:0201@genova");
    expect(progs.map((p) => p.id)).toEqual([
      "it-genova-genova-computer-engineering-l8",
      "it-genova-genova-electrical-engineering-l8",
    ]);
    const p = progs[0];
    expect(p?.sourceId).toBe("universitaly:1625723");
    expect(p?.data).toMatchObject({
      institution: "it-genova-genova",
      country: "IT",
      city: "genova",
      field: "engineering",
      level: "bachelor",
      name: "Computer Engineering",
      officialUrl: "https://corsi.unige.it/corsi/12133",
    });
    expect((p?.data.durationYears as { info_kind: string }).info_kind).toBe(READ_SOURCE);
    expect((p?.data.tuition as { info_kind: string }).info_kind).toBe(READ_SOURCE);
    expect(p?.review.todo).toContain("portal");
    expect(p?.review.todo).toContain("3 years");
    expect(progs[1]?.data.officialUrl).toBeNull();
    expect(progs[1]?.review.todo).toContain("no portal link");
    expect(report.staged).toHaveLength(2);
  });
  it("reuses one of our institutions and stages no institution record", () => {
    const { records, report } = build(
      [cand({ university: "Università degli Studi di PADOVA", name: "Economics, governance and decision-making", classCode: "L-33", classCodes: ["L-33"], field: "business-economics", delivery: "blended" })],
      [{ slug: "it-padova-padova", name: "Università degli studi di Padova" }],
    );
    expect(records.filter((r) => r.collection === "institutions")).toHaveLength(0);
    expect(records[0]?.data.institution).toBe("it-padova-padova");
    expect(records[0]?.review.todo).toContain("blended");
    expect(report.reusedInstitutions).toEqual(["it-padova-padova"]);
  });
  it("reuses the existing slug of a university whose portal spelling differs (LUM)", () => {
    const { records } = build(
      [cand({ university: 'LUM "Giuseppe Degennaro"', name: "Business Economics and Organization", classCode: "L-18", classCodes: ["L-18"], field: "business-economics", delivery: "blended" })],
      [{ slug: "it-casamassima-lum-g-degennaro-casamassima", name: 'Libera Università Mediterranea "Giuseppe Degennaro"' }],
    );
    expect(records.filter((r) => r.collection === "institutions")).toHaveLength(0);
    expect(records[0]?.data.institution).toBe("it-casamassima-lum-g-degennaro-casamassima");
  });
  it("refuses a candidate whose university is unknown, ambiguous or has several institutions of ours", () => {
    const unknown = build([cand({ portalId: 1, university: "Università di Trento" })]);
    expect(unknown.records).toEqual([]);
    expect(unknown.report.refused).toEqual([{ portalId: 1, reason: expect.stringContaining("no MUR university") }]);
    const ambiguous = build([cand({ portalId: 2, university: "Università di Milano" })]);
    expect(ambiguous.report.refused[0]?.reason).toContain("more than one");
    const campus = build([cand({ portalId: 3, university: "Università degli Studi di PADOVA" })], [
      { slug: "it-padova-padova", name: "Università degli studi di Padova" },
      { slug: "it-padova-rovigo", name: "Università degli studi di Padova" },
    ]);
    expect(campus.report.refused[0]?.reason).toContain("campus");
  });
  it("refuses two candidates that would get the same programme slug", () => {
    expect(() => build([cand(), cand({ portalId: 99 })])).toThrow(/same slug/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `export SWC_NATIVE_BINDING_CACHE='C:\Users\dagda\.swc-cache' && pnpm vitest run tests/scripts/import/universitaly-stage.test.ts`
Expected: FAIL (module missing; `delivery` may also be flagged by typecheck if Task 1 of piece 2 lacks it: it exists since the blended fix).

- [ ] **Step 3: Implement**

`scripts/import/sources/mur.ts`: add `export` to `DATASET` (const), `classSlug`, `titleCase`, `tidyName`, `isSubSite`, and `websiteCandidates` (no other change). `scripts/import/summaries.ts`: `SummarySource` gains `| "universitaly"`, and `SOURCE_LINE` gains

```ts
  universitaly: {
    fr: "Programme recensé sur Universitaly, le portail de l'offre de formation du ministère italien de l'Université et de la Recherche (MUR).",
    en: "Programme listed on Universitaly, the Italian Ministry of University and Research (MUR) portal of the degree offer.",
    ar: "برنامج مدرج على بوابة Universitaly لعرض التكوين التابعة لوزارة الجامعات والبحث الإيطالية (MUR).",
  },
```

Create `scripts/import/sources/universitaly-stage.ts`:

```ts
import { programmeSummary } from "../summaries";
import { READ_SOURCE, type ReviewRow, type StagedRecord } from "../staging";
import { collapseSpaces, nameKey, slugify } from "../text";
import { stagedInstitution } from "./institutions";
import { type Ateneo, classSlug, DATASET, isSubSite, tidyName, titleCase } from "./mur";
import type { Candidate } from "./universitaly";
import { universityTokens } from "./universitaly-compare";

export const UNIVERSITALY_SEARCH_PAGE = "https://www.universitaly.it/en/cerca-corsi";

export type OurInstitution = { slug: string; name: string };

export type StageReport = {
  staged: string[];
  reusedInstitutions: string[];
  refused: { portalId: number; reason: string }[];
};

// A portal spelling ("Università degli Studi di GENOVA", 'LUM "Giuseppe Degennaro"') to the one MUR
// university it names: exact name key of the full or the operating name first; else the one
// university whose distinctive words contain all of the portal name's (and no other does).
export function resolveAteneo(
  portalName: string,
  atenei: readonly Ateneo[],
): Ateneo | "ambiguous" | null {
  const key = nameKey(portalName);
  const exact = atenei.filter((a) => nameKey(a.fullName) === key || nameKey(a.shortName) === key);
  if (exact.length === 1) return exact[0] ?? null;
  if (exact.length > 1) return "ambiguous";
  const tokens = universityTokens(portalName);
  if (tokens.length === 0) return null;
  const contained = atenei.filter((a) => {
    const have = new Set(universityTokens(`${a.fullName} ${a.shortName}`));
    return tokens.every((t) => have.has(t));
  });
  if (contained.length === 1) return contained[0] ?? null;
  return contained.length > 1 ? "ambiguous" : null;
}

const fmt = (c: Candidate): string =>
  [
    `Universitaly (${c.academicYear}, fetched in the discovery run) lists: class ${c.classCode}${c.classCodes.length > 1 ? ` (also ${c.classCodes.filter((x) => x !== c.classCode).join(", ")})` : ""}, ${c.durationYears === null ? "duration not stated" : `${c.durationYears} years`}, ${c.delivery === "blended" ? "blended (mixed) delivery" : "conventional delivery"}, English-taught`,
    c.url === null ? "no portal link: find the programme's own page (officialUrl is required)" : `portal link ${c.url}: read the programme page it leads to`,
  ].join("; ");

export function buildUniversitalyRecords(input: {
  candidates: readonly Candidate[];
  atenei: readonly Ateneo[];
  ourInstitutions: readonly OurInstitution[];
  websites?: ReadonlyMap<string, string>;
  fetchedAt: string;
}): { records: StagedRecord[]; report: StageReport } {
  const report: StageReport = { staged: [], reusedInstitutions: [], refused: [] };
  const institutions = new Map<string, StagedRecord>();
  const programmes = new Map<string, StagedRecord>();
  const websites = input.websites ?? new Map<string, string>();

  for (const c of input.candidates) {
    const ateneo = resolveAteneo(c.university, input.atenei);
    if (ateneo === null) {
      report.refused.push({ portalId: c.portalId, reason: `no MUR university matches "${c.university}"` });
      continue;
    }
    if (ateneo === "ambiguous") {
      report.refused.push({ portalId: c.portalId, reason: `"${c.university}" matches more than one MUR university` });
      continue;
    }
    const city = titleCase(ateneo.city);
    const mine = input.ourInstitutions.filter((i) => nameKey(i.name) === nameKey(ateneo.fullName));
    if (mine.length > 1) {
      report.refused.push({ portalId: c.portalId, reason: `${ateneo.fullName} has several institutions of ours (${mine.map((i) => i.slug).join(", ")}): campus unknown` });
      continue;
    }
    let instSlug: string;
    const own = mine[0];
    if (own !== undefined) {
      instSlug = own.slug;
      if (!report.reusedInstitutions.includes(instSlug)) report.reusedInstitutions.push(instSlug);
    } else {
      instSlug = `it-${slugify(ateneo.shortName, 40)}-${slugify(city)}`;
      if (!institutions.has(instSlug)) {
        const candidate = websites.get(ateneo.code) ?? null;
        institutions.set(
          instSlug,
          stagedInstitution({
            slug: instSlug,
            name: ateneo.fullName,
            country: "IT",
            city,
            type: ateneo.statale ? "public" : "private",
            website: candidate,
            source: "mur",
            sourceUrl: DATASET,
            sourceId: `mur-institution:${ateneo.code}@${slugify(city)}`,
            todo: `university ${ateneo.code} in the MUR list (${ateneo.statale ? "state" : "non-state"}, region ${ateneo.region}); found through the Universitaly discovery run. ${candidate === null ? "No website candidate was found" : `Candidate from the international students portal contacts table: ${candidate} (not confirmed${isSubSite(candidate) ? "; it is a sub-site: use the university's main home page" : ""})`}. Check the university's home page names it, that it is a recognised Italian university, add its page as the source, then info_kind: official`,
          }),
        );
      }
    }

    const slug = `${instSlug}-${slugify(c.name, 40)}-${classSlug(c.classCode)}`;
    if (programmes.has(slug)) throw new Error(`Universitaly: two candidates would get the same slug ${slug}`);
    const name = tidyName(collapseSpaces(c.name));
    const review: ReviewRow = {
      kind: "programs",
      slug,
      name,
      institution: ateneo.fullName,
      city,
      field: c.field,
      confidence: c.confidence,
      officialUrl: c.url ?? "",
      todo: [
        fmt(c),
        `the portal gives no campus town: the town is the university's MUR town (${city}); check the programme page for the real campus`,
        "duration, teaching language, tuition for a non-EU student living abroad, intakes, documents, requirements and the application channel are read from the programme page",
        ...(c.delivery === "blended"
          ? ["blended delivery: read the programme page for how much is online; a course that is mostly online is not offered in person and stays out"]
          : []),
        ...(c.confidence === "low"
          ? ["the degree class and the course name point to different fields: check the content"]
          : []),
      ].join("; "),
    };
    programmes.set(slug, {
      collection: "programs",
      id: slug,
      sourceId: `universitaly:${c.portalId}`,
      data: {
        slug,
        institution: instSlug,
        country: "IT",
        city: slugify(city),
        field: c.field,
        level: "bachelor",
        name,
        summary: programmeSummary(name, ateneo.fullName, city, "universitaly"),
        officialUrl: c.url,
        durationYears: { value: null, source: "universitaly", info_kind: READ_SOURCE },
        teachingLanguages: { value: ["en"], source: "universitaly", info_kind: READ_SOURCE },
        tuition: { value: null, source: "universitaly", info_kind: READ_SOURCE },
        intakes: { value: null, source: "universitaly", info_kind: READ_SOURCE },
        applicationChannel: { value: null, source: "universitaly", info_kind: READ_SOURCE },
        documents: { value: null, source: "universitaly", info_kind: READ_SOURCE },
        requirements: { coverage: "partial", source: "universitaly", info_kind: READ_SOURCE, rules: [] },
        scholarships: [],
        sources: { universitaly: { url: UNIVERSITALY_SEARCH_PAGE, last_verified_at: null } },
      },
      review,
    });
    report.staged.push(slug);
  }
  return {
    records: [...institutions.values(), ...[...programmes.values()].sort((a, b) => a.id.localeCompare(b.id))],
    report,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec biome check --write scripts/import/sources/mur.ts scripts/import/summaries.ts scripts/import/sources/universitaly-stage.ts tests/scripts/import/universitaly-stage.test.ts && pnpm vitest run tests/scripts/import/universitaly-stage.test.ts tests/scripts/import/mur.test.ts tests/scripts/import/summaries.test.ts && pnpm typecheck`
Expected: PASS. If the "Università di Milano" ambiguity test resolves differently because `universityTokens` drops the shared word, adjust the TEST's university name to one that is genuinely contained in two MUR names in the fixture, not the rule. Check that the `READ_SOURCE` `info_kind` programme shape is accepted by `toYaml` (the staged shape is the same as `mur.ts`'s). A `sources` entry named `universitaly` must be allowed by the staged-record validation used in `data:promote`: read `scripts/import/promote.ts` for how `source:` names are resolved against `sources` (it is a free key in the MUR records, `mur`), and if a fixed list exists add `universitaly` to it with a test.

- [ ] **Step 5: Commit**

```bash
git add scripts/import/sources/mur.ts scripts/import/summaries.ts scripts/import/sources/universitaly-stage.ts tests/scripts/import/universitaly-stage.test.ts
git commit -m "feat: build staged records for Universitaly candidates

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: CLI `data:it-stage`

**Files:**
- Create: `scripts/import/it-stage.ts`, `tests/scripts/import/it-stage.test.ts`
- Modify: `package.json`, `data/README.md`, `.claude/CLAUDE.md`

**Interfaces:**
- Consumes: Task 1; `loadItalyData` (`universitaly-compare.ts`) for `ourInstitutions` (derive unique `{slug: institutionSlug, name: institutionName}`); `writeStaged`, `readReviewState`, `mergeReviewSheet`, `reviewCsv`, `reviewFile`, `stageFile`, `STAGING_DIR` (`staging.ts`); `ATENEI_URL`, `parseAtenei`, `websiteCandidates` (`mur.ts`); `fetchText` (`http.ts`).
- Produces: `pnpm data:it-stage --ids <comma separated portal ids> [--run <dir>] [--dry-run]` and
  ```ts
  export async function runStage(options: {
    ids: number[];
    runDir: string;                      // directory holding candidates.json (piece 2)
    atenei: readonly Ateneo[];
    websites: ReadonlyMap<string, string>;
    dataDir?: string;                    // default "data"
    stagingDir?: string;                 // default "data-staging"
    dryRun: boolean;
  }): Promise<{ staged: string[]; refused: { portalId: number; reason: string }[]; written: number; skipped: number; inData: number }>;
  ```
  `--ids` is required (no default: nothing is staged by accident); every id must be a candidate in `candidates.json` (`newProgrammes` or `newUniversities[].programmes`), else the command stops listing the unknown ids; `--run` defaults to the newest directory under `data-staging/universitaly/`. Writes with `overwrite: false`; prints the report; the review sheet is rewritten with `mergeReviewSheet` like `run.ts`; `--dry-run` builds and prints without writing.

- [ ] **Step 1: Write the failing tests** (`tests/scripts/import/it-stage.test.ts`), all with temp dirs

```ts
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { runStage } from "../../../scripts/import/it-stage";
import type { Ateneo } from "../../../scripts/import/sources/mur";

const atenei: Ateneo[] = [
  { code: "0201", fullName: "Università degli studi di Genova", shortName: "Genova", statale: true, city: "GENOVA", region: "Liguria" },
];

const candidate = (over = {}) => ({
  portalId: 1625723,
  university: "Università degli Studi di GENOVA",
  name: "Computer Engineering",
  classCode: "L-8",
  classCodes: ["L-8"],
  field: "engineering",
  confidence: "high",
  durationYears: 3,
  url: "https://corsi.unige.it/corsi/12133",
  academicYear: "2026/2027",
  delivery: "conventional",
  ...over,
});

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "it-stage-"));
  const runDir = path.join(root, "run");
  await mkdir(runDir);
  await writeFile(
    path.join(runDir, "candidates.json"),
    JSON.stringify({ newUniversities: [{ university: "Università degli Studi di GENOVA", programmes: [candidate()], possiblyOurs: [] }], newProgrammes: [], possible: [] }),
  );
  const dataDir = path.join(root, "data");
  await mkdir(path.join(dataDir, "programs"), { recursive: true });
  await mkdir(path.join(dataDir, "institutions"), { recursive: true });
  const stagingDir = path.join(root, "staging");
  return { root, runDir, dataDir, stagingDir };
}

describe("runStage", () => {
  it("stages the selected candidates and the review sheet, and never overwrites", async () => {
    const f = await fixture();
    const base = { ids: [1625723], runDir: f.runDir, atenei, websites: new Map(), dataDir: f.dataDir, stagingDir: f.stagingDir, dryRun: false };
    const first = await runStage(base);
    expect(first.staged).toEqual(["it-genova-genova-computer-engineering-l8"]);
    expect(first.written).toBe(2); // the institution and the programme
    const yaml = await readFile(path.join(f.stagingDir, "programs", "it-genova-genova-computer-engineering-l8.yaml"), "utf8");
    expect(yaml).toContain("officialUrl: https://corsi.unige.it/corsi/12133");
    expect(yaml).toContain("TODO_read_source");
    const sheet = await readFile(path.join(f.stagingDir, "REVIEW.csv"), "utf8");
    expect(sheet).toContain("it-genova-genova-computer-engineering-l8");
    const second = await runStage(base);
    expect(second.written).toBe(0);
    expect(second.skipped).toBe(2);
  });
  it("writes nothing on a dry run", async () => {
    const f = await fixture();
    const result = await runStage({ ids: [1625723], runDir: f.runDir, atenei, websites: new Map(), dataDir: f.dataDir, stagingDir: f.stagingDir, dryRun: true });
    expect(result.staged).toHaveLength(1);
    await expect(readFile(path.join(f.stagingDir, "REVIEW.csv"), "utf8")).rejects.toThrow();
  });
  it("stops on an id that is not a candidate, and reports a refused university", async () => {
    const f = await fixture();
    await expect(runStage({ ids: [1], runDir: f.runDir, atenei, websites: new Map(), dataDir: f.dataDir, stagingDir: f.stagingDir, dryRun: false })).rejects.toThrow(/not a candidate.*1/);
    const noAteneo = await runStage({ ids: [1625723], runDir: f.runDir, atenei: [], websites: new Map(), dataDir: f.dataDir, stagingDir: f.stagingDir, dryRun: false });
    expect(noAteneo.staged).toEqual([]);
    expect(noAteneo.refused).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails** (`pnpm vitest run tests/scripts/import/it-stage.test.ts`): module missing.

- [ ] **Step 3: Implement** `scripts/import/it-stage.ts`: read `candidates.json` (parse with Zod: `newUniversities[].programmes` and `newProgrammes` as arrays of the `Candidate` shape; `delivery` required), select `ids`, error `not a candidate: <ids>` for missing ones, `loadItalyData(dataDir)` to derive `ourInstitutions` (unique by slug), call `buildUniversitalyRecords`, then unless `dryRun`: `readReviewState(stagingDir)`, `writeStaged(records, { overwrite: false, stagingDir, dataDir, approved })`, `mergeReviewSheet({ existingRows, approved, records, rewritten, fileExists: (kind, slug) => existsSync(stageFile(kind, slug, stagingDir)) })`, `mkdir(stagingDir)`, `writeFile(reviewFile(stagingDir), reviewCsv(rows, approved))` (read `run.ts` lines 60-100 and `staging.ts` for the exact signatures; every staging function takes the directory as an optional last argument or option: pass it so tests use temp dirs). CLI `main`: parse `--ids` (required, comma separated positive integers; unknown or value-less flags throw like `parseArgs` in `it-discovery.ts`), `--run`, `--dry-run`; fetch the MUR university list with `fetchText(ATENEI_URL, ...)` + `parseAtenei` and `websiteCandidates(atenei)` (both cached/probed, existing code), call `runStage`, print staged slugs, refused (with reasons), written/skipped/inData and `review sheet: <path>`, and set a non-zero exit code if anything was refused. Guard the entry point with `process.argv[1]?.endsWith("it-stage.ts") === true` like the other scripts.

`package.json`: `"data:it-stage": "tsx scripts/import/it-stage.ts",` after `data:it-discovery`. `data/README.md`: a short paragraph after the Italy discovery section: what `data:it-stage` does (stages only the portal ids you name; nothing is promoted; no model or search service; officialUrl and field come from the portal, every other fact stays `TODO_read_source` for the reader; refuses a university it cannot resolve). `.claude/CLAUDE.md`: a table row after the `data:it-discovery` row.

- [ ] **Step 4: Run to verify it passes, then the gates**

Run: `pnpm exec biome check --write scripts/import/it-stage.ts tests/scripts/import/it-stage.test.ts package.json && pnpm vitest run tests/scripts/import && pnpm typecheck && pnpm lint && pnpm data:check`
Expected: PASS; lint only the 2 pre-existing infos; `data:check` 0 errors; `git status` shows nothing under `data-staging/` modified by the tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/import/it-stage.ts tests/scripts/import/it-stage.test.ts package.json data/README.md .claude/CLAUDE.md
git commit -m "feat: data:it-stage command (stage approved Universitaly candidates)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The real staging (controller) and the hand-off to part B

- [ ] **Step 1: Gates:** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm data:check`.
- [ ] **Step 2: Dry run on the real discovery cache:** copy or point `--run` at the discovery worktree's `data-staging/universitaly/2026-10-08` (untracked there; pass its absolute path). `pnpm data:it-stage --dry-run --ids 1625451,1625568,1625569,1625723,1625559,1625434,1626160,1634282,1625456,1625437,1625480,1625562`. Expected: 12 programmes staged, 7 new institutions at most (Politecnico di Milano, Genova, Messina, Palermo, Teramo, Piemonte Orientale + none for LUM, Cassino, Padova, Napoli), nothing refused. Any refusal is reported to the owner; do not loosen the resolver.
- [ ] **Step 3: Real staging** (same command without `--dry-run`). Check `data-staging/REVIEW.csv` rows and that the staged YAML validates (`pnpm data:promote` is NOT run). Hazards from earlier rounds: held-out staged records (Hanze, ISM, every `hu-*`, LUM's old staged programme if present) must not be promoted by a later `--audited-batch`; check `data-staging/programs` for the old LUM programme before part B.
- [ ] **Step 4: Reviews and PR:** Opus `reviewer` after Tasks 1 and 2, one whole-branch Opus review; push `feat/italy-fill`; open a draft PR with base `feat/italy-discovery` (stacked), body ending `🤖 Generated with [Claude Code](https://claude.com/claude-code)`; bind the PR; read CI once. Staged files under `data-staging/` are the review queue: whether they are committed follows the repository's current practice (`git ls-files data-staging | head` before deciding; do not commit the raw `universitaly/` cache).

## Part B (runbook, after this plan merges or is stacked: filling the facts for 57 programmes)

Part B runs the existing audited tools; it needs no new code except prompt/guard fixes found on the way. Order, with the cost announced before each paid step:

1. Slugs file for the 12 new + the 45 existing Italian programmes missing facts (`pnpm data:coverage --detail` for Italy).
2. `pnpm data:pages --slugs <file> --topics --search --max-queries <n> --dry-run` (prints the upper bound of Serper queries; four topic searches per institution, about 4 x 39 institutions) then the real run with the key in `.env.local` (copied into the worktree without opening it). The portal URL is used first.
3. `pnpm data:read --slugs <file> --check --max-usd <cap>` (reader `deepseek-v4.1-flash`, checker `qwen3.7-plus`; about USD 0.1-0.3 per programme; Italy prompt now allows a tuition range).
4. `pnpm data:evidence restage` (new records: restage; existing: `--enrich <dir>`) and `verify`; hazards in `memory/research-de-nl-status.md` (always `--slugs`, temp dirs in tests, move held-out files aside before promote).
5. `pnpm data:audit draw`: 100% of anything new at university level, a 10% sample (at least 15) of programme facts; blended candidates are checked on their programme page for delivery; the owner reads `data-staging/AUDIT-SAMPLE.md` and says "correct" before `pnpm data:promote --confirm-human-read --verified-on <date> --audited-batch` (check `data/programs` for stray `*.tmp` after promote).
6. `pnpm data:check`, `pnpm data:build`, before/after `pnpm data:coverage`, `pnpm data:check --strict`.

## Self-review (against the spec, section "Piece 3" and the owner's decision)

- All 12 candidates staged (ids listed), through the existing audited path: Tasks 1-3 and the runbook. Intakes/deadlines, documents, channel, duration and tuition are read in part B with the extended reader; the Italy prompt was already rewritten (PR #20).
- Spec deviation recorded: portal facts are hints, not `official` facts, because the portal JSON is not a re-fetchable page.
- Placeholder scan: two places defer to reading neighbouring code for exact signatures (`mergeReviewSheet`/`writeStaged` options in `it-stage.ts`; how `promote.ts` resolves `source:` names), each with the assertion to write.
- Type consistency: `Candidate` (piece 2) is used unchanged; `OurInstitution`, `StageReport` (Task 1) by Task 2.
