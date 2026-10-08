# Italy discovery from Universitaly: Implementation Plan (Italy completeness, piece 2 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A repeatable, read-only command (`pnpm data:it-discovery`) that reads the Universitaly search endpoint for the 2026/27 English-taught Bachelor courses, caches the raw responses with provenance, and writes a comparison report (new programmes, new universities, programmes we have that the portal does not list, mismatches, exclusion counts) plus a candidate list for the owner. Nothing enters `data/` or the staging area.

**Architecture:** Three pure-ish modules under `scripts/import/sources/` (`universitaly.ts` parse and classify; `universitaly-fetch.ts` polite paged fetch, plausibility checks, raw cache; `universitaly-compare.ts` load our Italy data, compare, render) and one CLI (`scripts/import/it-discovery.ts`). Network is injected, so every test runs offline on inline fixtures. The degree-class to field rule is reused from `scripts/import/sources/mur.ts` (`fieldOfClass`): the field is decided by code, never by a model.

**Tech Stack:** TypeScript strict, Zod (scripts side), `yaml`, Vitest, Biome, pnpm, tsx.

Spec: `docs/superpowers/specs/2026-10-08-italy-completeness-design.md`, section "Piece 2: Italy discovery" (approved 2026-10-08). Branch `feat/italy-discovery` (worktree `C:\Users\dagda\Downloads\nex\UniWay-italy-discovery`), stacked on `feat/italy-completeness` (PR #20, piece 1); piece 2 touches none of piece 1's files except by adding new ones, so it only needs the spec and plan documents that live there.

## Facts verified against the live endpoint on 2026-10-08 (these correct the spec's assumptions)

- `GET https://universitaly-backend.cineca.it/api/offerta-formativa/cerca-corsi?searchText=&area=&tipoLaurea=1&tipoClasse=0&durata=&lingua=EN&tipoAccesso=&modalitaErogazione=&order=ASC&provincia=&provinciaSigla=&page=N` answers HTTP 200 JSON with no token, via CloudFront. `tipoLaurea=1` is Triennale (2 is Magistrale). Paging parameter: `page` (1-based; `pagina` is ignored). 10 courses per page.
- `order=RND` (the default of the site) is **random per request** and would make paging skip and repeat courses. `order=ASC` (also `AZ`, `NAME`: any other value) gives a stable order. The importer therefore uses `order=ASC` and, as a hard check, requires unique ids == `totalResults`.
- `lingua=EN` returns courses whose `lingua` is `EN` **or `mu`** (mixed Italian-English). `lingua=IT` returns `IT` and `mu`. Triennale totals today: EN filter 241 (25 pages), of which `mu` 137 only when asked with `lingua=mu`; IT filter 2713.
- Top-level keys of the response: `universita` (`totalResults`, `totalPages`, `currentPage` as a string, `corsi`), `afam`, `equipollenti` (ignored).
- A course carries: `id`, `anno.descrizione` ("2026/2027"), `codeUn`, `idStrutture`, `nomeStruttura` (university, mixed case), `nomeCorso`, `nomeCorsoEn`, `url` (never null in 90 sampled), `durataAnni`, `lingua`, `modalitaDidattica.descrizione` ("In presenza" or "Teledidattica"), `modalitaErogazione.codice` (`C` conventional, `B`, `T`, `P`), `modalitaAccesso`, `programmazione.descrizione` (Libero, Test d'ingresso, Numero programmato), `tipoLaurea.descrizione` ("Triennale"), `classe.codice` (padded: `"L-34  "`), `classeInterclasse` (null or an object with `codice`), `interateneo` (null or an object).
- **`sede` is null for every sampled course**, so the list gives **no city**. The spec's "city from `sede`" does not hold; city stays unknown here and is filled in piece 3 (programme page) or taken from our own institution when the course is matched.
- `robots.txt` of the site is a 404 page; there is no published API documentation. The request budget stays small: 25 pages of English courses plus 1 page of Italian-taught courses (only its total is used) = 26 requests, 1.5 s apart, with the importer's descriptive User-Agent.

## Global Constraints

- Official sources only; nothing enters `data/` or `data-staging/` records from this piece. The cache and report go to `data-staging/universitaly/<YYYY-MM-DD>/` (untracked, never `git add` anything under `data-staging/`). The new CLI writes nothing else and never edits `data/`.
- If the endpoint answers anything other than HTTP 200, changes shape, or fails a plausibility check, the importer stops with a clear message (`PortalStopError`), does not retry, and does not work around it; the owner decides.
- Tests never touch the network: the fetch layer takes an injected getter; fixtures are inline.
- Scope of "missing programmes" is the owner brief of 2026-10-05: Laurea (Triennale), English-taught (`lingua` `EN`), in person (`modalitaDidattica` "In presenza" and `modalitaErogazione.codice` `C`), classes L-31, L-8, L-9, L-7, L-23, L-18, L-33 and low-confidence L-41 (that is exactly `fieldOfClass`). Mixed (`mu`) and Italian-taught courses are counted and reported, never made candidates.
- Latest academic year only; the report says which year the portal reports (taken from the data, not assumed).
- The field comes from the degree class by code (`fieldOfClass`); no model is involved anywhere in this piece.
- No `any`, no `@ts-ignore`, no non-null `!`; named exports; explicit `git add` paths; conventional commits, each ending with the line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; never push to `main`, never force-push, PRs only.
- Scripts-side code may import Zod and `yaml`. Do not touch `src/` (client code). Biome formatting: run `pnpm exec biome check --write <your files>` before committing.
- Keep files focused: no source file above about 300 lines.

## Environment (this machine)

- Work in the worktree `C:\Users\dagda\Downloads\nex\UniWay-italy-discovery`, NOT in `C:\Users\dagda\Downloads\nex\UniWay` or `...\UniWay-italy`. Do not touch ports 3000 or 3101. `pnpm install --frozen-lockfile` is already done.
- Before any `pnpm` command: `export SWC_NATIVE_BINDING_CACHE='C:\Users\dagda\.swc-cache'` (does not persist between Bash calls).
- The shell strips backslashes: never write regexes or `\n` through heredocs; use the Edit/Write tools. `rm -rf` is denied.
- Do not run `pnpm build` or `pnpm test:e2e` (this piece changes no app code). Gates: `pnpm typecheck`, `pnpm lint` (2 pre-existing infos are fine), `pnpm test`, `pnpm data:check`.

## File Structure

| File | Responsibility |
|---|---|
| `scripts/import/sources/universitaly.ts` (create) | Zod schemas of the response, `classify` (status of one course), `toCandidate`. Pure. |
| `scripts/import/sources/universitaly-fetch.ts` (create) | `searchUrl`, `PortalStopError`, `httpGet`, `fetchPages` (paced, injected getter), `parsePages` (plausibility), cache `writeCache` / `readCache` with sha256. |
| `scripts/import/sources/universitaly-compare.ts` (create) | `loadItalyData`, `compare`, `renderReport`. |
| `scripts/import/it-discovery.ts` (create) | CLI wiring: fetch or read cache, classify, compare, write report and candidates. |
| `package.json` (modify) | Script `data:it-discovery`. |
| `data/README.md`, `.claude/CLAUDE.md` (modify) | One short section and one command-table row. |
| `tests/scripts/import/universitaly-helpers.ts` (create) | Fixture builders `course`, `page`. |
| `tests/scripts/import/universitaly.test.ts`, `universitaly-fetch.test.ts`, `universitaly-compare.test.ts` (create) | Tests. |

---

### Task 1: Parse and classify

**Files:**
- Create: `scripts/import/sources/universitaly.ts`, `tests/scripts/import/universitaly-helpers.ts`, `tests/scripts/import/universitaly.test.ts`

**Interfaces:**
- Produces (used by Tasks 2 to 4):
  ```ts
  export const PortalCourseSchema, PortalPageSchema;      // Zod
  export type PortalCourse; export type PortalPage;
  export type ExclusionReason = "not-bachelor" | "not-english" | "class-out-of-scope" | "mixed-language" | "not-in-person";
  export type Status = "candidate" | ExclusionReason;
  export type Classified = { course: PortalCourse; status: Status; classCodes: string[]; classCode: string | null; field: string | null; confidence: "high" | "low" | null };
  export type Candidate = { portalId: number; university: string; name: string; classCode: string; classCodes: string[]; field: string; confidence: "high" | "low"; durationYears: number | null; url: string | null; academicYear: string };
  export function classCodesOf(course: PortalCourse): string[];
  export function courseName(course: PortalCourse): string;
  export function classify(course: PortalCourse): Classified;
  export function toCandidate(classified: Classified): Candidate;   // throws on a non-candidate
  ```
- Fixture builders (tests): `course(over?)` returns a valid `PortalCourse`; `page(courses, totalResults?, totalPages?, currentPage?)` returns the raw response object.

- [ ] **Step 1: Write the helpers and the failing tests**

Create `tests/scripts/import/universitaly-helpers.ts`:

```ts
import type { PortalCourse } from "../../../scripts/import/sources/universitaly";

// A valid portal course (shape verified against the live endpoint on 2026-10-08).
export function course(over: Partial<PortalCourse> = {}): PortalCourse {
  return {
    id: 1,
    anno: { descrizione: "2026/2027" },
    codeUn: "02",
    nomeCorso: "Computer Science",
    nomeCorsoEn: "Computer Science",
    url: "https://www.uniba.test/it/corsi/computer-science",
    modalitaDidattica: { descrizione: "In presenza" },
    modalitaErogazione: { codice: "C" },
    durataAnni: 3,
    lingua: "EN",
    nomeStruttura: "Università degli Studi di BARI ALDO MORO",
    tipoLaurea: { descrizione: "Triennale" },
    classe: { codice: "L-31  " },
    classeInterclasse: null,
    interateneo: null,
    ...over,
  };
}

export function page(
  courses: PortalCourse[],
  totalResults = courses.length,
  totalPages = 1,
  currentPage = "1",
): unknown {
  return { universita: { totalResults, totalPages, currentPage, corsi: courses }, afam: [], equipollenti: [] };
}
```

Create `tests/scripts/import/universitaly.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  classCodesOf,
  classify,
  courseName,
  PortalPageSchema,
  toCandidate,
} from "../../../scripts/import/sources/universitaly";

import { course, page } from "./universitaly-helpers";

describe("PortalPageSchema", () => {
  it("accepts the response shape and ignores the other top-level keys", () => {
    const parsed = PortalPageSchema.parse(page([course()], 241, 25, "2"));
    expect(parsed.universita.totalPages).toBe(25);
    expect(parsed.universita.corsi).toHaveLength(1);
  });
  it("rejects a response whose shape changed", () => {
    expect(PortalPageSchema.safeParse({ universita: { corsi: [] } }).success).toBe(false);
    expect(PortalPageSchema.safeParse(page([{ ...course(), id: "x" } as never])).success).toBe(false);
  });
});

describe("classCodesOf and courseName", () => {
  it("trims the padded class code and adds the interclass", () => {
    expect(classCodesOf(course({ classe: { codice: "L-34  " }, classeInterclasse: { codice: "L-36  " } }))).toEqual(["L-34", "L-36"]);
    expect(classCodesOf(course({ classe: null, classeInterclasse: null }))).toEqual([]);
  });
  it("prefers the English name and collapses spaces", () => {
    expect(courseName(course({ nomeCorsoEn: "  Data   Science ", nomeCorso: "Scienza dei dati" }))).toBe("Data Science");
    expect(courseName(course({ nomeCorsoEn: null, nomeCorso: "Informatica" }))).toBe("Informatica");
  });
});

describe("classify", () => {
  it("makes an English, in-person Triennale course of an in-scope class a candidate with its field", () => {
    const c = classify(course({ classe: { codice: "L-31  " } }));
    expect(c).toMatchObject({ status: "candidate", classCode: "L-31", field: "computer-science", confidence: "high" });
    expect(classify(course({ classe: { codice: "L-8" } }))).toMatchObject({ field: "engineering" });
    expect(classify(course({ classe: { codice: "L-33" } }))).toMatchObject({ field: "business-economics", confidence: "high" });
  });
  it("marks L-41 as a low-confidence candidate", () => {
    expect(classify(course({ classe: { codice: "L-41" } }))).toMatchObject({ status: "candidate", confidence: "low" });
  });
  it("uses the interclass when the main class is out of scope", () => {
    const c = classify(course({ classe: { codice: "L-36" }, classeInterclasse: { codice: "L-18" } }));
    expect(c).toMatchObject({ status: "candidate", classCode: "L-18" });
    expect(c.classCodes).toEqual(["L-36", "L-18"]);
  });
  it("excludes by reason, in this order", () => {
    expect(classify(course({ tipoLaurea: { descrizione: "Magistrale" } })).status).toBe("not-bachelor");
    expect(classify(course({ lingua: "IT" })).status).toBe("not-english");
    expect(classify(course({ classe: { codice: "L-34" } })).status).toBe("class-out-of-scope");
    expect(classify(course({ lingua: "mu" })).status).toBe("mixed-language");
    expect(classify(course({ lingua: "mu", classe: { codice: "L-34" } })).status).toBe("class-out-of-scope");
    expect(classify(course({ modalitaDidattica: { descrizione: "Teledidattica" } })).status).toBe("not-in-person");
    expect(classify(course({ modalitaErogazione: { codice: "B" } })).status).toBe("not-in-person");
  });
});

describe("toCandidate", () => {
  it("carries what the portal states and the year", () => {
    const cand = toCandidate(classify(course({ id: 7, durataAnni: 3 })));
    expect(cand).toEqual({
      portalId: 7,
      university: "Università degli Studi di BARI ALDO MORO",
      name: "Computer Science",
      classCode: "L-31",
      classCodes: ["L-31"],
      field: "computer-science",
      confidence: "high",
      durationYears: 3,
      url: "https://www.uniba.test/it/corsi/computer-science",
      academicYear: "2026/2027",
    });
  });
  it("refuses a course that is not a candidate", () => {
    expect(() => toCandidate(classify(course({ lingua: "IT" })))).toThrow(/not a candidate/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `export SWC_NATIVE_BINDING_CACHE='C:\Users\dagda\.swc-cache' && pnpm vitest run tests/scripts/import/universitaly.test.ts`
Expected: FAIL (module `scripts/import/sources/universitaly` does not exist).

- [ ] **Step 3: Implement**

Create `scripts/import/sources/universitaly.ts`:

```ts
import { z } from "zod";

import { collapseSpaces } from "../text";
import { fieldOfClass } from "./mur";

// Universitaly (universitaly.it, Ministero dell'Universita e della Ricerca / CINECA): the public
// search of the university offer. The response shape was checked on 2026-10-08; anything else
// makes the importer stop (see universitaly-fetch.ts).
const Named = z.object({ descrizione: z.string() });
const ClassRef = z.object({ codice: z.string() });

export const PortalCourseSchema = z.object({
  id: z.number().int(),
  anno: Named,
  codeUn: z.string(),
  nomeCorso: z.string(),
  nomeCorsoEn: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  modalitaDidattica: Named,
  modalitaErogazione: z.object({ codice: z.string() }),
  durataAnni: z.number().nullable().optional(),
  lingua: z.string(),
  nomeStruttura: z.string(),
  tipoLaurea: Named,
  classe: ClassRef.nullable().optional(),
  classeInterclasse: ClassRef.nullable().optional(),
  interateneo: z.unknown().optional(),
});
export type PortalCourse = z.infer<typeof PortalCourseSchema>;

export const PortalPageSchema = z.object({
  universita: z.object({
    totalResults: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
    currentPage: z.union([z.string(), z.number()]),
    corsi: z.array(PortalCourseSchema),
  }),
});
export type PortalPage = z.infer<typeof PortalPageSchema>;

export type ExclusionReason =
  | "not-bachelor"
  | "not-english"
  | "class-out-of-scope"
  | "mixed-language"
  | "not-in-person";
export type Status = "candidate" | ExclusionReason;

export type Classified = {
  course: PortalCourse;
  status: Status;
  classCodes: string[];
  classCode: string | null;
  field: string | null;
  confidence: "high" | "low" | null;
};

export type Candidate = {
  portalId: number;
  university: string;
  name: string;
  classCode: string;
  classCodes: string[];
  field: string;
  confidence: "high" | "low";
  durationYears: number | null;
  url: string | null;
  academicYear: string;
};

// The portal pads class codes ("L-34  "); the interclass is a second class of the same course.
export function classCodesOf(course: PortalCourse): string[] {
  return [course.classe, course.classeInterclasse]
    .map((ref) => (ref === null || ref === undefined ? "" : collapseSpaces(ref.codice)))
    .filter((code) => code !== "");
}

export function courseName(course: PortalCourse): string {
  return collapseSpaces(course.nomeCorsoEn ?? course.nomeCorso);
}

// One course, one status. The order makes the counts meaningful: mixed-language and not-in-person
// are only counted for courses that are otherwise in scope (a Bachelor course of one of the classes).
export function classify(course: PortalCourse): Classified {
  const classCodes = classCodesOf(course);
  const base = { course, classCodes, classCode: null, field: null, confidence: null } as const;
  if (course.tipoLaurea.descrizione !== "Triennale") return { ...base, status: "not-bachelor" };
  if (course.lingua !== "EN" && course.lingua !== "mu") return { ...base, status: "not-english" };
  const name = courseName(course);
  const code = classCodes.find((c) => fieldOfClass(c, name) !== null);
  const match = code === undefined ? null : fieldOfClass(code, name);
  if (code === undefined || match === null) return { ...base, status: "class-out-of-scope" };
  const scoped = { course, classCodes, classCode: code, field: match.field, confidence: match.confidence };
  if (course.lingua === "mu") return { ...scoped, status: "mixed-language" };
  const inPerson =
    course.modalitaDidattica.descrizione === "In presenza" && course.modalitaErogazione.codice === "C";
  return { ...scoped, status: inPerson ? "candidate" : "not-in-person" };
}

export function toCandidate(classified: Classified): Candidate {
  const { course, classCode, field, confidence } = classified;
  if (classified.status !== "candidate" || classCode === null || field === null || confidence === null) {
    throw new Error(`course ${course.id} is not a candidate (${classified.status})`);
  }
  return {
    portalId: course.id,
    university: collapseSpaces(course.nomeStruttura),
    name: courseName(course),
    classCode,
    classCodes: classified.classCodes,
    field,
    confidence,
    durationYears: course.durataAnni ?? null,
    url: course.url === undefined || course.url === null || course.url.trim() === "" ? null : course.url.trim(),
    academicYear: course.anno.descrizione,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec biome check --write scripts/import/sources/universitaly.ts tests/scripts/import/universitaly-helpers.ts tests/scripts/import/universitaly.test.ts && pnpm vitest run tests/scripts/import/universitaly.test.ts && pnpm typecheck`
Expected: PASS. If `fieldOfClass` returns the class for a code with different inner spacing, the `collapseSpaces` in `classCodesOf` already normalised it.

- [ ] **Step 5: Commit**

```bash
git add scripts/import/sources/universitaly.ts tests/scripts/import/universitaly-helpers.ts tests/scripts/import/universitaly.test.ts
git commit -m "feat: parse and classify Universitaly courses

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Polite paged fetch, plausibility checks and the raw cache

**Files:**
- Create: `scripts/import/sources/universitaly-fetch.ts`, `tests/scripts/import/universitaly-fetch.test.ts`

**Interfaces:**
- Consumes: `PortalPageSchema`, `PortalPage` (Task 1); `USER_AGENT` from `../http`.
- Produces (used by Tasks 3 and 4):
  ```ts
  export const SEARCH_URL: string;
  export type SearchLanguage = "EN" | "IT";
  export class PortalStopError extends Error {}
  export function searchUrl(language: SearchLanguage, page: number): string;
  export type Getter = (url: string) => Promise<string>;
  export function httpGet(url: string): Promise<string>;               // real network; HTTP != 200 throws PortalStopError
  export type FetchedPage = { language: SearchLanguage; page: number; url: string; body: string; sha256: string; bytes: number };
  export function fetchPages(language: SearchLanguage, options: { get: Getter; sleep: (ms: number) => Promise<void>; delayMs: number; maxPages: number; firstOnly?: boolean }): Promise<FetchedPage[]>;
  export function parsePages(language: SearchLanguage, pages: FetchedPage[]): { totalResults: number; courses: PortalCourse[] };
  export type CacheManifest = { fetchedAt: string; userAgent: string; pages: { file: string; language: SearchLanguage; page: number; url: string; sha256: string; bytes: number }[] };
  export function writeCache(dir: string, pages: FetchedPage[], fetchedAt: string): Promise<void>;
  export function readCache(dir: string): Promise<{ fetchedAt: string; pages: FetchedPage[] }>;
  ```

- [ ] **Step 1: Write the failing tests**

Create `tests/scripts/import/universitaly-fetch.test.ts`:

```ts
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  fetchPages,
  parsePages,
  PortalStopError,
  readCache,
  searchUrl,
  writeCache,
} from "../../../scripts/import/sources/universitaly-fetch";

import { course, page } from "./universitaly-helpers";

const noSleep = async (): Promise<void> => {};

// A fake portal: `total` English courses, 10 per page, ids 1..total, all valid.
function fakePortal(total: number, over: (id: number) => Partial<ReturnType<typeof course>> = () => ({})) {
  const calls: string[] = [];
  const get = async (url: string): Promise<string> => {
    calls.push(url);
    const pageNo = Number(new URL(url).searchParams.get("page"));
    const ids = Array.from({ length: total }, (_v, i) => i + 1).slice((pageNo - 1) * 10, pageNo * 10);
    return JSON.stringify(
      page(ids.map((id) => course({ id, ...over(id) })), total, Math.ceil(total / 10), String(pageNo)),
    );
  };
  return { get, calls };
}

describe("searchUrl", () => {
  it("asks for Triennale courses in a stable order, one page at a time", () => {
    const url = new URL(searchUrl("EN", 3));
    expect(url.origin + url.pathname).toBe("https://universitaly-backend.cineca.it/api/offerta-formativa/cerca-corsi");
    expect(url.searchParams.get("tipoLaurea")).toBe("1");
    expect(url.searchParams.get("lingua")).toBe("EN");
    expect(url.searchParams.get("order")).toBe("ASC");
    expect(url.searchParams.get("page")).toBe("3");
  });
});

describe("fetchPages", () => {
  it("fetches every page once, in order, pausing between requests", async () => {
    const portal = fakePortal(25);
    const sleeps: number[] = [];
    const pages = await fetchPages("EN", {
      get: portal.get,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      delayMs: 1500,
      maxPages: 60,
    });
    expect(pages.map((p) => p.page)).toEqual([1, 2, 3]);
    expect(portal.calls).toHaveLength(3);
    expect(sleeps).toEqual([1500, 1500]);
    expect(pages[0]?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(pages[0]?.bytes).toBe(Buffer.byteLength(pages[0]?.body ?? ""));
  });
  it("reads only the first page when asked", async () => {
    const portal = fakePortal(25);
    const pages = await fetchPages("IT", { get: portal.get, sleep: noSleep, delayMs: 0, maxPages: 60, firstOnly: true });
    expect(pages).toHaveLength(1);
  });
  it("stops when the portal wants more pages than the safety limit", async () => {
    const portal = fakePortal(250);
    await expect(fetchPages("EN", { get: portal.get, sleep: noSleep, delayMs: 0, maxPages: 5 })).rejects.toThrow(PortalStopError);
  });
  it("stops, without retrying, when a request fails or the shape changed", async () => {
    const failing = async (): Promise<string> => {
      throw new PortalStopError("HTTP 403");
    };
    await expect(fetchPages("EN", { get: failing, sleep: noSleep, delayMs: 0, maxPages: 5 })).rejects.toThrow(/403/);
    const wrongShape = async (): Promise<string> => JSON.stringify({ universita: { corsi: [] } });
    await expect(fetchPages("EN", { get: wrongShape, sleep: noSleep, delayMs: 0, maxPages: 5 })).rejects.toThrow(/shape/);
    const notJson = async (): Promise<string> => "<html>blocked</html>";
    await expect(fetchPages("EN", { get: notJson, sleep: noSleep, delayMs: 0, maxPages: 5 })).rejects.toThrow(/shape|JSON/);
  });
});

describe("parsePages", () => {
  it("returns every course when the count and the ids are consistent", async () => {
    const portal = fakePortal(120);
    const pages = await fetchPages("EN", { get: portal.get, sleep: noSleep, delayMs: 0, maxPages: 60 });
    const parsed = parsePages("EN", pages);
    expect(parsed.totalResults).toBe(120);
    expect(parsed.courses).toHaveLength(120);
  });
  it("stops when courses repeat or go missing (an unstable order)", async () => {
    const portal = fakePortal(120, (id) => ({ id: id === 15 ? 5 : id }));
    const pages = await fetchPages("EN", { get: portal.get, sleep: noSleep, delayMs: 0, maxPages: 60 });
    expect(() => parsePages("EN", pages)).toThrow(/unique|repeat/);
  });
  it("stops when the total is implausible for the English search", async () => {
    const small = fakePortal(12);
    const pages = await fetchPages("EN", { get: small.get, sleep: noSleep, delayMs: 0, maxPages: 60 });
    expect(() => parsePages("EN", pages)).toThrow(/implausible/);
  });
  it("stops when the English search returns a course of another language", async () => {
    const portal = fakePortal(120, (id) => (id === 3 ? { lingua: "IT" } : {}));
    const pages = await fetchPages("EN", { get: portal.get, sleep: noSleep, delayMs: 0, maxPages: 60 });
    expect(() => parsePages("EN", pages)).toThrow(/language/);
  });
  it("accepts a single page of the Italian search and uses only its total", async () => {
    const portal = fakePortal(2713);
    const pages = await fetchPages("IT", { get: portal.get, sleep: noSleep, delayMs: 0, maxPages: 60, firstOnly: true });
    const parsed = parsePages("IT", pages);
    expect(parsed.totalResults).toBe(2713);
  });
});

describe("cache", () => {
  it("writes the raw pages with a manifest and reads them back, checking the hashes", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "uni-cache-"));
    const portal = fakePortal(30);
    const pages = await fetchPages("EN", { get: portal.get, sleep: noSleep, delayMs: 0, maxPages: 60 });
    await writeCache(dir, pages, "2026-10-08T10:00:00.000Z");
    const manifest = JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8")) as { fetchedAt: string; pages: { file: string }[] };
    expect(manifest.fetchedAt).toBe("2026-10-08T10:00:00.000Z");
    expect(manifest.pages.map((p) => p.file)).toEqual(["EN-page-001.json", "EN-page-002.json", "EN-page-003.json"]);
    const back = await readCache(dir);
    expect(back.pages.map((p) => p.sha256)).toEqual(pages.map((p) => p.sha256));
    await writeFile(path.join(dir, "EN-page-002.json"), "tampered");
    await expect(readCache(dir)).rejects.toThrow(/sha256/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/scripts/import/universitaly-fetch.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

Create `scripts/import/sources/universitaly-fetch.ts`:

```ts
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { USER_AGENT } from "../http";
import { type PortalCourse, PortalPageSchema } from "./universitaly";

export const SEARCH_URL =
  "https://universitaly-backend.cineca.it/api/offerta-formativa/cerca-corsi";

export type SearchLanguage = "EN" | "IT";

// The portal said no, changed shape or answered something implausible. The importer stops and the
// owner decides: no retry, no workaround.
export class PortalStopError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PortalStopError";
  }
}

// tipoLaurea=1 is Triennale. order=ASC is a stable order; the site's own default (RND) is random
// per request and would skip and repeat courses while paging.
export function searchUrl(language: SearchLanguage, page: number): string {
  const query = new URLSearchParams({
    searchText: "",
    area: "",
    tipoLaurea: "1",
    tipoClasse: "0",
    durata: "",
    lingua: language,
    tipoAccesso: "",
    modalitaErogazione: "",
    order: "ASC",
    provincia: "",
    provinciaSigla: "",
    page: String(page),
  });
  return `${SEARCH_URL}?${query.toString()}`;
}

export type Getter = (url: string) => Promise<string>;

export async function httpGet(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "user-agent": USER_AGENT, accept: "application/json" },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new PortalStopError(
      `Universitaly answered HTTP ${response.status} for ${url}: stop and tell the owner (no retry, no workaround)`,
    );
  }
  return await response.text();
}

export type FetchedPage = {
  language: SearchLanguage;
  page: number;
  url: string;
  body: string;
  sha256: string;
  bytes: number;
};

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

function parseBody(body: string, url: string) {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new PortalStopError(`Universitaly answered something that is not JSON for ${url}: the shape changed or the request was blocked`);
  }
  const parsed = PortalPageSchema.safeParse(json);
  if (!parsed.success) {
    throw new PortalStopError(`Universitaly response shape changed for ${url}: ${parsed.error.issues[0]?.message ?? "invalid"} at ${parsed.error.issues[0]?.path.join(".") ?? ""}`);
  }
  return parsed.data;
}

export async function fetchPages(
  language: SearchLanguage,
  options: {
    get: Getter;
    sleep: (ms: number) => Promise<void>;
    delayMs: number;
    maxPages: number;
    firstOnly?: boolean;
  },
): Promise<FetchedPage[]> {
  const pages: FetchedPage[] = [];
  const fetchOne = async (pageNo: number): Promise<number> => {
    const url = searchUrl(language, pageNo);
    const body = await options.get(url);
    const parsed = parseBody(body, url);
    pages.push({ language, page: pageNo, url, body, sha256: sha256(body), bytes: Buffer.byteLength(body) });
    return parsed.universita.totalPages;
  };
  const totalPages = await fetchOne(1);
  if (options.firstOnly === true) return pages;
  if (totalPages > options.maxPages) {
    throw new PortalStopError(`Universitaly reports ${totalPages} pages, more than the safety limit of ${options.maxPages}: stop and tell the owner`);
  }
  for (let pageNo = 2; pageNo <= totalPages; pageNo++) {
    await options.sleep(options.delayMs);
    await fetchOne(pageNo);
  }
  return pages;
}

// English search: 241 Triennale courses on 2026-10-08. A total outside 50..2000 means the filter or
// the shape changed, not that the offer did.
const EN_MIN = 50;
const EN_MAX = 2000;

export function parsePages(
  language: SearchLanguage,
  pages: FetchedPage[],
): { totalResults: number; courses: PortalCourse[] } {
  const first = pages[0];
  if (first === undefined) throw new PortalStopError(`no ${language} page was fetched`);
  const parsedPages = pages.map((p) => parseBody(p.body, p.url).universita);
  const totalResults = parsedPages[0]?.totalResults ?? 0;
  const courses = parsedPages.flatMap((p) => p.corsi);
  if (language === "IT") return { totalResults, courses };
  if (totalResults < EN_MIN || totalResults > EN_MAX) {
    throw new PortalStopError(`Universitaly reports ${totalResults} English courses, an implausible number (expected ${EN_MIN}..${EN_MAX}): the response shape or the filter changed`);
  }
  const ids = new Set(courses.map((c) => c.id));
  if (ids.size !== courses.length) {
    throw new PortalStopError(`Universitaly returned repeated courses (${courses.length} rows, ${ids.size} unique ids): the paging order is not stable`);
  }
  if (courses.length !== totalResults) {
    throw new PortalStopError(`Universitaly reported ${totalResults} courses but ${courses.length} were collected: pages are missing or the order is not stable`);
  }
  const stray = courses.find((c) => c.lingua !== "EN" && c.lingua !== "mu");
  if (stray !== undefined) {
    throw new PortalStopError(`the English search returned course ${stray.id} with language "${stray.lingua}": the language filter changed`);
  }
  return { totalResults, courses };
}

export type CacheManifest = {
  fetchedAt: string;
  userAgent: string;
  pages: {
    file: string;
    language: SearchLanguage;
    page: number;
    url: string;
    sha256: string;
    bytes: number;
  }[];
};

const fileOf = (p: { language: SearchLanguage; page: number }): string =>
  `${p.language}-page-${String(p.page).padStart(3, "0")}.json`;

export async function writeCache(dir: string, pages: FetchedPage[], fetchedAt: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  for (const p of pages) await writeFile(path.join(dir, fileOf(p)), p.body, "utf8");
  const manifest: CacheManifest = {
    fetchedAt,
    userAgent: USER_AGENT,
    pages: pages.map((p) => ({
      file: fileOf(p),
      language: p.language,
      page: p.page,
      url: p.url,
      sha256: p.sha256,
      bytes: p.bytes,
    })),
  };
  await writeFile(path.join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

export async function readCache(dir: string): Promise<{ fetchedAt: string; pages: FetchedPage[] }> {
  const manifest = JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8")) as CacheManifest;
  const pages: FetchedPage[] = [];
  for (const entry of manifest.pages) {
    const body = await readFile(path.join(dir, entry.file), "utf8");
    if (sha256(body) !== entry.sha256) {
      throw new PortalStopError(`cached file ${entry.file} does not match its sha256 in the manifest: the cache was modified`);
    }
    pages.push({ language: entry.language, page: entry.page, url: entry.url, body, sha256: entry.sha256, bytes: entry.bytes });
  }
  return { fetchedAt: manifest.fetchedAt, pages };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec biome check --write scripts/import/sources/universitaly-fetch.ts tests/scripts/import/universitaly-fetch.test.ts && pnpm vitest run tests/scripts/import/universitaly-fetch.test.ts tests/scripts/import/universitaly.test.ts && pnpm typecheck`
Expected: PASS. (`fakePortal(12)` has `totalResults` 12 below the English minimum, `fakePortal(2713)` for IT passes because only its total is used.)

- [ ] **Step 5: Commit**

```bash
git add scripts/import/sources/universitaly-fetch.ts tests/scripts/import/universitaly-fetch.test.ts
git commit -m "feat: polite paged Universitaly fetch with plausibility checks and a hashed raw cache

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Compare with our Italy data and render the report

**Files:**
- Create: `scripts/import/sources/universitaly-compare.ts`, `tests/scripts/import/universitaly-compare.test.ts`

**Interfaces:**
- Consumes: `Classified`, `Candidate`, `Status`, `classify`, `toCandidate`, `courseName` (Task 1); `nameKey`, `hostKey`, `collapseSpaces` from `../text`; `DATA_DIR` from `../staging`.
- Produces (used by Task 4):
  ```ts
  export type OurProgramme = { slug: string; institutionSlug: string; institutionName: string; name: string; classCode: string | null; officialUrl: string | null; durationYears: number | null; languages: string[] };
  export function loadItalyData(dataDir?: string): Promise<OurProgramme[]>;
  export type Comparison = {
    academicYear: string;
    tally: Record<Status, number>;
    candidates: number;
    matched: { ours: string; portalId: number }[];
    possible: { ours: string; candidate: Candidate; why: string }[];
    newProgrammes: Candidate[];            // at a university we already have
    newUniversities: { university: string; programmes: Candidate[] }[];   // no institution of ours has this name
    notListed: { ours: OurProgramme; portalStatus: Status | "absent" }[];
    institutionsNotSeen: string[];         // our institutions whose name matches no portal university
    mismatches: { slug: string; field: "duration" | "language" | "url-host"; ours: string; portal: string }[];
  };
  export function compare(classified: Classified[], ours: OurProgramme[]): Comparison;
  export type ReportMeta = { fetchedAt: string; cacheDir: string; englishTotal: number; mixedTotal: number; italianTotal: number };
  export function renderReport(cmp: Comparison, meta: ReportMeta): string;   // Markdown
  ```

- [ ] **Step 1: Write the failing tests**

Create `tests/scripts/import/universitaly-compare.test.ts`:

```ts
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { classify } from "../../../scripts/import/sources/universitaly";
import {
  compare,
  loadItalyData,
  type OurProgramme,
  renderReport,
} from "../../../scripts/import/sources/universitaly-compare";

import { course } from "./universitaly-helpers";

const ours = (over: Partial<OurProgramme> = {}): OurProgramme => ({
  slug: "it-bari-politecnico-bari-management-engineering-for-innovation-l9",
  institutionSlug: "it-bari-politecnico-bari",
  institutionName: "Politecnico di Bari",
  name: "Management Engineering for Innovation",
  classCode: "L-9",
  officialUrl: "https://orientami.poliba.it/management",
  durationYears: 3,
  languages: ["en"],
  ...over,
});

const poliba = (over = {}) =>
  course({ id: 10, nomeStruttura: "POLITECNICO DI BARI", nomeCorso: "Management Engineering for Innovation", nomeCorsoEn: "Management Engineering for Innovation", classe: { codice: "L-9" }, url: "https://www.poliba.it/en/management", ...over });

describe("loadItalyData", () => {
  it("reads our Italy programmes with their institution name and the class from the slug", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "uni-data-"));
    await mkdir(path.join(dir, "programs"));
    await mkdir(path.join(dir, "institutions"));
    await writeFile(path.join(dir, "institutions", "it-bari-politecnico-bari.yaml"), "slug: it-bari-politecnico-bari\nname: Politecnico di Bari\n");
    await writeFile(
      path.join(dir, "programs", "it-bari-politecnico-bari-management-engineering-for-innovation-l9.yaml"),
      "slug: it-bari-politecnico-bari-management-engineering-for-innovation-l9\ninstitution: it-bari-politecnico-bari\nname: Management Engineering for Innovation\nofficialUrl: https://orientami.poliba.it/management\ndurationYears:\n  value: 3\nteachingLanguages:\n  value:\n    - en\n",
    );
    await writeFile(path.join(dir, "programs", "fr-paris-something-l9.yaml"), "slug: fr-paris-something-l9\ninstitution: fr-paris\nname: X\n");
    const result = await loadItalyData(dir);
    expect(result).toEqual([ours()]);
  });
});

describe("compare", () => {
  it("matches a candidate to our programme by university, class and name", () => {
    const cmp = compare([classify(poliba())], [ours()]);
    expect(cmp.matched).toEqual([{ ours: ours().slug, portalId: 10 }]);
    expect(cmp.newProgrammes).toEqual([]);
    expect(cmp.notListed).toEqual([]);
    expect(cmp.candidates).toBe(1);
  });
  it("calls a same-university same-class course with another name a possible match, not a new one", () => {
    const cmp = compare([classify(poliba({ nomeCorsoEn: "Management Engineering and Innovation" }))], [ours()]);
    expect(cmp.matched).toEqual([]);
    expect(cmp.possible).toHaveLength(1);
    expect(cmp.possible[0]?.ours).toBe(ours().slug);
    expect(cmp.newProgrammes).toEqual([]);
  });
  it("separates a new programme at a known university from a new university", () => {
    const newProg = classify(poliba({ id: 11, nomeCorsoEn: "Computer Engineering", nomeCorso: "Computer Engineering", classe: { codice: "L-8" } }));
    const newUni = classify(course({ id: 12, nomeStruttura: "Università di Trento", nomeCorsoEn: "Computer Science", classe: { codice: "L-31" } }));
    const cmp = compare([classify(poliba()), newProg, newUni], [ours()]);
    expect(cmp.newProgrammes.map((c) => c.portalId)).toEqual([11]);
    expect(cmp.newUniversities).toEqual([{ university: "Università di Trento", programmes: [expect.objectContaining({ portalId: 12 })] }]);
  });
  it("lists our programmes the portal does not offer, with the portal's reason when it lists them differently", () => {
    const mixed = classify(poliba({ lingua: "mu" }));
    const cmpMixed = compare([mixed], [ours()]);
    expect(cmpMixed.notListed).toEqual([{ ours: ours(), portalStatus: "mixed-language" }]);
    const cmpAbsent = compare([], [ours()]);
    expect(cmpAbsent.notListed).toEqual([{ ours: ours(), portalStatus: "absent" }]);
    expect(cmpAbsent.institutionsNotSeen).toEqual(["Politecnico di Bari"]);
  });
  it("reports duration, language and url-host mismatches of matched programmes", () => {
    const cmp = compare([classify(poliba({ durataAnni: 4 }))], [ours({ languages: ["it"] })]);
    expect(cmp.mismatches).toEqual([
      { slug: ours().slug, field: "duration", ours: "3", portal: "4" },
      { slug: ours().slug, field: "language", ours: "it", portal: "en" },
      { slug: ours().slug, field: "url-host", ours: "orientami.poliba.it", portal: "www.poliba.it" },
    ]);
  });
  it("counts every status and states the academic year the portal reports", () => {
    const cmp = compare([classify(poliba()), classify(course({ id: 2, lingua: "IT" })), classify(course({ id: 3, classe: { codice: "L-34" } }))], [ours()]);
    expect(cmp.tally).toMatchObject({ candidate: 1, "not-english": 1, "class-out-of-scope": 1, "mixed-language": 0 });
    expect(cmp.academicYear).toBe("2026/2027");
  });
});

describe("renderReport", () => {
  it("renders the sections and the owner's decision list", () => {
    const newUni = classify(course({ id: 12, nomeStruttura: "Università di Trento", nomeCorsoEn: "Computer Science", classe: { codice: "L-31" }, url: "https://www.unitn.test/cs" }));
    const cmp = compare([classify(poliba()), newUni], [ours(), ours({ slug: "it-x-y-l18", institutionName: "Università X", name: "Y", classCode: "L-18" })]);
    const text = renderReport(cmp, { fetchedAt: "2026-10-08T10:00:00.000Z", cacheDir: "data-staging/universitaly/2026-10-08", englishTotal: 241, mixedTotal: 137, italianTotal: 2713 });
    expect(text).toContain("# Universitaly discovery report");
    expect(text).toContain("2026/2027");
    expect(text).toContain("## New universities");
    expect(text).toContain("Università di Trento");
    expect(text).toContain("https://www.unitn.test/cs");
    expect(text).toContain("## Programmes we have that the portal does not list");
    expect(text).toContain("it-x-y-l18");
    expect(text).toContain("## Counts");
    expect(text).toContain("2713");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/scripts/import/universitaly-compare.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

Create `scripts/import/sources/universitaly-compare.ts`:

```ts
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";

import { DATA_DIR } from "../staging";
import { collapseSpaces, hostKey, nameKey } from "../text";
import {
  type Candidate,
  type Classified,
  courseName,
  type Status,
  toCandidate,
} from "./universitaly";

export type OurProgramme = {
  slug: string;
  institutionSlug: string;
  institutionName: string;
  name: string;
  classCode: string | null;
  officialUrl: string | null;
  durationYears: number | null;
  languages: string[];
};

type Loose = Record<string, unknown>;
const asRecord = (value: unknown): Loose => (typeof value === "object" && value !== null ? (value as Loose) : {});
const asString = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value.trim() : null);

// "…-l31" -> "L-31": the class is the last slug segment (scripts/import/sources/mur.ts classSlug).
function classOfSlug(slug: string): string | null {
  const match = /-l(\d+)$/.exec(slug);
  return match === null ? null : `L-${match[1]}`;
}

async function yamlFiles(dir: string): Promise<Loose[]> {
  const names = (await readdir(dir)).filter((n) => n.startsWith("it-") && n.endsWith(".yaml")).sort();
  return Promise.all(names.map(async (n) => asRecord(parse(await readFile(path.join(dir, n), "utf8")))));
}

export async function loadItalyData(dataDir: string = DATA_DIR): Promise<OurProgramme[]> {
  const institutions = new Map<string, string>();
  for (const inst of await yamlFiles(path.join(dataDir, "institutions"))) {
    const slug = asString(inst.slug);
    const name = asString(inst.name);
    if (slug !== null && name !== null) institutions.set(slug, name);
  }
  const out: OurProgramme[] = [];
  for (const p of await yamlFiles(path.join(dataDir, "programs"))) {
    const slug = asString(p.slug);
    const institutionSlug = asString(p.institution);
    const name = asString(p.name);
    if (slug === null || institutionSlug === null || name === null) continue;
    const duration = asRecord(p.durationYears).value;
    const languages = asRecord(p.teachingLanguages).value;
    out.push({
      slug,
      institutionSlug,
      institutionName: institutions.get(institutionSlug) ?? institutionSlug,
      name,
      classCode: classOfSlug(slug),
      officialUrl: asString(p.officialUrl),
      durationYears: typeof duration === "number" ? duration : null,
      languages: Array.isArray(languages) ? languages.filter((l): l is string => typeof l === "string") : [],
    });
  }
  return out;
}

export type Comparison = {
  academicYear: string;
  tally: Record<Status, number>;
  candidates: number;
  matched: { ours: string; portalId: number }[];
  possible: { ours: string; candidate: Candidate; why: string }[];
  newProgrammes: Candidate[];
  newUniversities: { university: string; programmes: Candidate[] }[];
  notListed: { ours: OurProgramme; portalStatus: Status | "absent" }[];
  institutionsNotSeen: string[];
  mismatches: { slug: string; field: "duration" | "language" | "url-host"; ours: string; portal: string }[];
};

const STATUSES: Status[] = ["candidate", "not-bachelor", "not-english", "class-out-of-scope", "mixed-language", "not-in-person"];

function mostFrequent(values: string[]): string {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";
}

export function compare(classified: Classified[], ours: OurProgramme[]): Comparison {
  const tally = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;
  for (const c of classified) tally[c.status]++;
  const academicYear = mostFrequent(classified.map((c) => c.course.anno.descrizione));
  const candidates = classified.filter((c) => c.status === "candidate").map(toCandidate);

  const used = new Set<string>();
  const matched: Comparison["matched"] = [];
  const possible: Comparison["possible"] = [];
  const newProgrammes: Candidate[] = [];
  const newByUniversity = new Map<string, Candidate[]>();
  const mismatches: Comparison["mismatches"] = [];

  for (const cand of candidates) {
    const sameUniversity = ours.filter((o) => nameKey(o.institutionName) === nameKey(cand.university));
    if (sameUniversity.length === 0) {
      newByUniversity.set(cand.university, [...(newByUniversity.get(cand.university) ?? []), cand]);
      continue;
    }
    const sameClass = sameUniversity.filter((o) => o.classCode !== null && cand.classCodes.includes(o.classCode));
    const exact = sameClass.find((o) => nameKey(o.name) === nameKey(cand.name));
    if (exact !== undefined) {
      used.add(exact.slug);
      matched.push({ ours: exact.slug, portalId: cand.portalId });
      if (exact.durationYears !== null && cand.durationYears !== null && exact.durationYears !== cand.durationYears) {
        mismatches.push({ slug: exact.slug, field: "duration", ours: String(exact.durationYears), portal: String(cand.durationYears) });
      }
      if (!exact.languages.includes("en")) {
        mismatches.push({ slug: exact.slug, field: "language", ours: exact.languages.join(",") || "none", portal: "en" });
      }
      const ourHost = exact.officialUrl === null ? null : hostKey(exact.officialUrl);
      const portalHost = cand.url === null ? null : hostKey(cand.url);
      if (ourHost !== null && portalHost !== null && ourHost !== portalHost) {
        mismatches.push({ slug: exact.slug, field: "url-host", ours: ourHost, portal: portalHost });
      }
      continue;
    }
    const near = sameClass[0];
    if (near !== undefined) {
      used.add(near.slug);
      possible.push({ ours: near.slug, candidate: cand, why: `same university and class ${near.classCode}, name differs ("${near.name}" / "${cand.name}")` });
      continue;
    }
    newProgrammes.push(cand);
  }

  const notListed: Comparison["notListed"] = ours
    .filter((o) => !used.has(o.slug))
    .map((o) => {
      const seen = classified.find(
        (c) => nameKey(c.course.nomeStruttura) === nameKey(o.institutionName) && nameKey(courseName(c.course)) === nameKey(o.name),
      );
      return { ours: o, portalStatus: seen?.status ?? "absent" };
    });

  const portalUniversities = new Set(classified.map((c) => nameKey(c.course.nomeStruttura)));
  const institutionsNotSeen = [...new Set(ours.map((o) => o.institutionName))]
    .filter((name) => !portalUniversities.has(nameKey(name)))
    .sort();

  return {
    academicYear,
    tally,
    candidates: candidates.length,
    matched,
    possible,
    newProgrammes,
    newUniversities: [...newByUniversity.entries()].map(([university, programmes]) => ({ university, programmes })),
    notListed,
    institutionsNotSeen,
    mismatches,
  };
}

export type ReportMeta = {
  fetchedAt: string;
  cacheDir: string;
  englishTotal: number;
  mixedTotal: number;
  italianTotal: number;
};

const line = (c: Candidate): string =>
  `- ${c.name} (${c.classCode}, ${c.field}${c.confidence === "low" ? ", low confidence" : ""}, ${c.durationYears ?? "?"} years) ${c.url ?? "no portal link"} [portal id ${c.portalId}]`;

export function renderReport(cmp: Comparison, meta: ReportMeta): string {
  const out: string[] = [];
  out.push("# Universitaly discovery report", "");
  out.push(`Academic year reported by the portal: ${cmp.academicYear}. Fetched ${meta.fetchedAt}. Raw responses: \`${meta.cacheDir}\` (sha256 in manifest.json). Nothing here is in data/ or in staging: this is a candidate list for the owner.`, "");
  out.push("## Counts", "");
  out.push(`- English search (Triennale, includes mixed): ${meta.englishTotal} courses; of these mixed Italian-English in an in-scope class: ${cmp.tally["mixed-language"]}; mixed in all classes (portal total for the mixed filter): ${meta.mixedTotal}`);
  out.push(`- Italian search (Triennale, includes mixed): ${meta.italianTotal} courses (counted only)`);
  for (const [status, n] of Object.entries(cmp.tally)) out.push(`- ${status}: ${n}`);
  out.push(`- candidates (English, in person, in scope): ${cmp.candidates}; matched to our programmes: ${cmp.matched.length}; possible matches: ${cmp.possible.length}; new at a university we have: ${cmp.newProgrammes.length}; at new universities: ${cmp.newUniversities.reduce((n, u) => n + u.programmes.length, 0)}`, "");
  out.push("## New universities", "");
  if (cmp.newUniversities.length === 0) out.push("None.");
  for (const u of cmp.newUniversities) {
    out.push(`### ${u.university}`);
    for (const c of u.programmes) out.push(line(c));
    out.push("");
  }
  out.push("## New programmes at universities we already have", "");
  if (cmp.newProgrammes.length === 0) out.push("None.");
  for (const c of cmp.newProgrammes) out.push(`${line(c)} at ${c.university}`);
  out.push("", "## Possible matches (same university and class, different name)", "");
  if (cmp.possible.length === 0) out.push("None.");
  for (const p of cmp.possible) out.push(`- ${p.ours}: ${p.why} ${p.candidate.url ?? ""}`);
  out.push("", "## Programmes we have that the portal does not list", "");
  if (cmp.notListed.length === 0) out.push("None.");
  for (const n of cmp.notListed) out.push(`- ${n.ours.slug} (${n.ours.institutionName}): portal status ${n.portalStatus}`);
  out.push("", "## Mismatches on matched programmes", "");
  if (cmp.mismatches.length === 0) out.push("None.");
  for (const m of cmp.mismatches) out.push(`- ${m.slug}: ${m.field}, ours ${m.ours}, portal ${m.portal}`);
  out.push("", "## Our universities no portal course name matches", "");
  if (cmp.institutionsNotSeen.length === 0) out.push("None.");
  for (const name of cmp.institutionsNotSeen) out.push(`- ${collapseSpaces(name)}`);
  out.push("");
  return out.join("\n");
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec biome check --write scripts/import/sources/universitaly-compare.ts tests/scripts/import/universitaly-compare.test.ts && pnpm vitest run tests/scripts/import/universitaly-compare.test.ts && pnpm typecheck`
Expected: PASS. If `hostKey` strips `www.`, the expected host strings in the url-host test must match what `hostKey` returns (read `hostKey` in `scripts/import/text.ts` and adjust the test's expected strings, not the behaviour).

- [ ] **Step 5: Commit**

```bash
git add scripts/import/sources/universitaly-compare.ts tests/scripts/import/universitaly-compare.test.ts
git commit -m "feat: compare Universitaly candidates with our Italy data and render the report

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: CLI, script entry and docs

**Files:**
- Create: `scripts/import/it-discovery.ts`, `tests/scripts/import/it-discovery.test.ts`
- Modify: `package.json` (scripts), `data/README.md`, `.claude/CLAUDE.md`

**Interfaces:**
- Consumes: Tasks 1 to 3.
- Produces: `pnpm data:it-discovery [--refresh] [--from-cache <dir>] [--delay-ms <n>] [--out <dir>]`; `export async function runDiscovery(options: { out: string; fromCache: string | null; delayMs: number; get: Getter; sleep: (ms: number) => Promise<void>; now: () => Date; dataDir?: string }): Promise<{ runDir: string; report: string }>`. Writes `<runDir>/report.md` and `<runDir>/candidates.json` (`{ meta, newUniversities, newProgrammes, possible }`).

- [ ] **Step 1: Write the failing test**

Create `tests/scripts/import/it-discovery.test.ts`:

```ts
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { runDiscovery } from "../../../scripts/import/it-discovery";

import { course, page } from "./universitaly-helpers";

// 60 English courses; ids 1..60. Course 1 is Politecnico di Bari L-9 (ours), 2 is a new university.
function portal() {
  const calls: string[] = [];
  const get = async (url: string): Promise<string> => {
    calls.push(url);
    const q = new URL(url).searchParams;
    if (q.get("lingua") === "IT") return JSON.stringify(page([course({ id: 900, lingua: "IT" })], 2713, 272));
    const pageNo = Number(q.get("page"));
    const ids = Array.from({ length: 60 }, (_v, i) => i + 1).slice((pageNo - 1) * 10, pageNo * 10);
    const courses = ids.map((id) =>
      id === 1
        ? course({ id, nomeStruttura: "POLITECNICO DI BARI", nomeCorsoEn: "Management Engineering for Innovation", classe: { codice: "L-9" } })
        : id === 2
          ? course({ id, nomeStruttura: "Università di Trento", nomeCorsoEn: "Computer Science", classe: { codice: "L-31" } })
          : course({ id, nomeCorsoEn: `Geology ${id}`, classe: { codice: "L-34" } }),
    );
    return JSON.stringify(page(courses, 60, 6, String(pageNo)));
  };
  return { get, calls };
}

async function fixtureData(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "uni-run-data-"));
  await mkdir(path.join(dir, "programs"));
  await mkdir(path.join(dir, "institutions"));
  await writeFile(path.join(dir, "institutions", "it-bari-politecnico-bari.yaml"), "slug: it-bari-politecnico-bari\nname: Politecnico di Bari\n");
  await writeFile(
    path.join(dir, "programs", "it-bari-politecnico-bari-management-engineering-for-innovation-l9.yaml"),
    "slug: it-bari-politecnico-bari-management-engineering-for-innovation-l9\ninstitution: it-bari-politecnico-bari\nname: Management Engineering for Innovation\n",
  );
  return dir;
}

describe("runDiscovery", () => {
  it("fetches, caches, compares and writes the report and the candidate list", async () => {
    const out = await mkdtemp(path.join(tmpdir(), "uni-run-out-"));
    const p = portal();
    const result = await runDiscovery({ out, fromCache: null, delayMs: 0, get: p.get, sleep: async () => {}, now: () => new Date("2026-10-08T10:00:00.000Z"), dataDir: await fixtureData() });
    expect(result.runDir).toBe(path.join(out, "2026-10-08"));
    // 6 English pages + the first Italian page
    expect(p.calls).toHaveLength(7);
    const report = await readFile(path.join(result.runDir, "report.md"), "utf8");
    expect(report).toContain("Università di Trento");
    expect(report).toContain("2713");
    const candidates = JSON.parse(await readFile(path.join(result.runDir, "candidates.json"), "utf8")) as { newUniversities: { university: string }[] };
    expect(candidates.newUniversities.map((u) => u.university)).toEqual(["Università di Trento"]);
  });
  it("reruns from the cache without any request", async () => {
    const out = await mkdtemp(path.join(tmpdir(), "uni-run-out-"));
    const first = portal();
    const data = await fixtureData();
    const run1 = await runDiscovery({ out, fromCache: null, delayMs: 0, get: first.get, sleep: async () => {}, now: () => new Date("2026-10-08T10:00:00.000Z"), dataDir: data });
    const second = portal();
    const run2 = await runDiscovery({ out, fromCache: run1.runDir, delayMs: 0, get: second.get, sleep: async () => {}, now: () => new Date("2026-10-09T10:00:00.000Z"), dataDir: data });
    expect(second.calls).toHaveLength(0);
    expect(run2.report).toContain("Università di Trento");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/scripts/import/it-discovery.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

Create `scripts/import/it-discovery.ts`:

```ts
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { DATA_DIR } from "./staging";
import { classify } from "./sources/universitaly";
import { compare, loadItalyData, renderReport } from "./sources/universitaly-compare";
import {
  fetchPages,
  type FetchedPage,
  type Getter,
  httpGet,
  parsePages,
  PortalStopError,
  readCache,
  writeCache,
} from "./sources/universitaly-fetch";

// Read-only discovery of Italian programmes from the Universitaly search (see
// docs/superpowers/plans/2026-10-08-italy-discovery.md). Fetches the English Triennale search
// (about 25 pages) and the first page of the Italian one (only its total), 1.5 s apart, caches the
// raw responses with sha256 under data-staging/universitaly/<day>/, compares with data/ and writes
// report.md and candidates.json. It never edits data/ or the staging area.
const MAX_PAGES = 60;

export type DiscoveryOptions = {
  out: string;
  fromCache: string | null;
  delayMs: number;
  get: Getter;
  sleep: (ms: number) => Promise<void>;
  now: () => Date;
  dataDir?: string;
};

export async function runDiscovery(
  options: DiscoveryOptions,
): Promise<{ runDir: string; report: string }> {
  let fetchedAt: string;
  let pages: FetchedPage[];
  let runDir: string;
  if (options.fromCache !== null) {
    const cached = await readCache(options.fromCache);
    fetchedAt = cached.fetchedAt;
    pages = cached.pages;
    runDir = options.fromCache;
  } else {
    const now = options.now();
    fetchedAt = now.toISOString();
    runDir = path.join(options.out, fetchedAt.slice(0, 10));
    const base = { get: options.get, sleep: options.sleep, delayMs: options.delayMs, maxPages: MAX_PAGES };
    const english = await fetchPages("EN", base);
    await options.sleep(options.delayMs);
    const italian = await fetchPages("IT", { ...base, firstOnly: true });
    pages = [...english, ...italian];
    await writeCache(runDir, pages, fetchedAt);
  }

  const english = parsePages("EN", pages.filter((p) => p.language === "EN"));
  const italian = parsePages("IT", pages.filter((p) => p.language === "IT"));
  const classified = english.courses.map(classify);
  const mixedTotal = english.courses.filter((c) => c.lingua === "mu").length;
  const comparison = compare(classified, await loadItalyData(options.dataDir ?? DATA_DIR));
  const meta = {
    fetchedAt,
    cacheDir: runDir,
    englishTotal: english.totalResults,
    mixedTotal,
    italianTotal: italian.totalResults,
  };
  const report = renderReport(comparison, meta);
  await mkdir(runDir, { recursive: true });
  await writeFile(path.join(runDir, "report.md"), report, "utf8");
  const candidates = {
    meta,
    academicYear: comparison.academicYear,
    newUniversities: comparison.newUniversities,
    newProgrammes: comparison.newProgrammes,
    possible: comparison.possible,
  };
  await writeFile(path.join(runDir, "candidates.json"), `${JSON.stringify(candidates, null, 2)}\n`, "utf8");
  return { runDir, report };
}

function argValue(args: string[], flag: string): string | null {
  const index = args.indexOf(flag);
  const value = index === -1 ? undefined : args[index + 1];
  return value === undefined ? null : value;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const delay = Number(argValue(args, "--delay-ms") ?? "1500");
  if (!Number.isFinite(delay) || delay < 0) throw new Error("--delay-ms must be a number >= 0");
  const { runDir, report } = await runDiscovery({
    out: argValue(args, "--out") ?? path.join("data-staging", "universitaly"),
    fromCache: argValue(args, "--from-cache"),
    delayMs: delay,
    get: httpGet,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => new Date(),
  });
  console.log(report.split("\n").slice(0, 24).join("\n"));
  console.log(`\nreport: ${path.join(runDir, "report.md")}\ncandidates: ${path.join(runDir, "candidates.json")}`);
}

if (process.argv[1]?.endsWith("it-discovery.ts") === true) {
  main().catch((error: unknown) => {
    if (error instanceof PortalStopError) console.error(`STOPPED: ${error.message}`);
    else console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
```

`package.json` scripts: add `"data:it-discovery": "tsx scripts/import/it-discovery.ts",` after the `data:it-language` line.

`data/README.md`: add a short section "## Italy discovery (Universitaly)" after the existing Italy notes (find where `data:it-calendar` or `data:it-language` is described and place it next to them): what the command does (read-only; 26 requests; cache and report under `data-staging/universitaly/<day>/`; stops on any non-200, shape change or implausible count; never edits `data/`; mixed and Italian-taught counted not staged; city is not in the list and is read from the programme page later).

`.claude/CLAUDE.md`: in the "How to run things" table add a row after the `data:fr-calendar` row: `| Italy discovery from Universitaly: candidate list and comparison report (read-only; 26 requests, cache under data-staging/universitaly/; \`--from-cache <dir>\` reruns offline) | \`pnpm data:it-discovery\` |`.

- [ ] **Step 4: Run to verify it passes, then the gates**

Run: `pnpm exec biome check --write scripts/import/it-discovery.ts tests/scripts/import/it-discovery.test.ts package.json && pnpm vitest run tests/scripts/import && pnpm typecheck && pnpm lint && pnpm data:check`
Expected: PASS; lint shows only the 2 pre-existing infos; `data:check` 0 errors; `git diff --stat origin/main -- data` shows only `data/README.md` and the piece 1 README change.

- [ ] **Step 5: Commit**

```bash
git add scripts/import/it-discovery.ts tests/scripts/import/it-discovery.test.ts package.json data/README.md .claude/CLAUDE.md
git commit -m "feat: data:it-discovery command (Universitaly candidate list and comparison report)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The real run, gates and PR (controller)

**Files:** none new.

- [ ] **Step 1: Gates:** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm data:check` (0 errors; `git diff --stat origin/main -- data` shows only README changes). No build or e2e (no app code changed).
- [ ] **Step 2: The real run (owner checkpoint 1):** announce the plan (26 requests, 1.5 s apart, about 40 s, User-Agent of the importer), then `pnpm data:it-discovery`. If it stops (`STOPPED:`), do not retry or work around: report to the owner. Read `report.md`; sanity-check (counts add up, matched count close to our 45 minus those the portal lists differently, no obviously wrong grouping); the candidate list goes to the owner.
- [ ] **Step 3: Reviews and PR:** Opus `reviewer` after each of Tasks 1 to 4, one whole-branch Opus review; push `feat/italy-discovery`; open a draft PR with base `feat/italy-completeness` (stacked on PR #20; retarget to `main` after #20 merges), body ending `🤖 Generated with [Claude Code](https://claude.com/claude-code)`; bind the PR; read CI once.

---

## Self-review (against the spec, section "Piece 2")

- Source module with filters (Laurea, English, in person), paged, polite pace, descriptive User-Agent, raw responses cached with fetch time and sha256: Tasks 2 and 4. Spec said "one request per class group"; the live endpoint filters poorly by class, and one English search (25 pages) plus client-side class filtering is fewer requests (26 vs "a few dozen") and exact, so classes are filtered by code (`fieldOfClass`).
- MUR "le università" page and Universitaly institutions listing: not fetched in this piece. The portal course list already carries the university name; universities are matched against the 32 institutions we have by name (`nameKey`), and "our universities no portal course name matches" is reported so the owner sees naming differences. Fetching the MUR HTML page adds a second undocumented source for no new fact in piece 2; the existing MUR `01_atenei.csv` stays the university list for staging in piece 3. Flagged to the owner.
- Comparison (university, normalised name, class; new programmes, new universities, programmes we have that the portal no longer lists, mismatches in language, duration, class, counts per exclusion reason with mixed and Italian-taught counted not staged): Tasks 1 and 3 (class equality is part of the match, so a class mismatch shows as "possible match" / "not listed").
- What the portal fills by code (`officialUrl`, `durationYears`, `teachingLanguages`, city, class code, field): the candidate list carries url, duration, language (English by filter), class and field; **city is not available** (`sede` null), recorded above. Nothing is written to `data/` or staging (spec: nothing enters `data/` here); the provenance fields (`source` = the Universitaly search page, `last_verified_at` = the fetch day) are added when piece 3 stages the records.
- Owner checkpoint 1: Task 5 step 2.
- Limits (stop on auth, shape change, rate limit or block; plausibility check as the MUR importer does): `PortalStopError`, `parsePages`.
- Placeholder scan: none; the one place that defers to reading neighbouring code is the expected host strings of the `url-host` test (`hostKey` behaviour), with the assertion stated.
- Type consistency: `Classified`, `Candidate`, `Status` (Task 1) are used unchanged by Tasks 3 and 4; `FetchedPage`, `Getter`, `PortalStopError` (Task 2) by Task 4; `OurProgramme`, `Comparison`, `ReportMeta` (Task 3) by Task 4.

## Amendments after the real run (2026-10-08)

- **Blended delivery counts as in person.** The plan's Global Constraints and Task 1 code accept only `modalitaErogazione.codice` `C`. The real run showed code `B` ("Corso di studio in modalità mista", `modalitaDidattica` "In presenza", 17 courses of the 241, 6 in scope) and that 3 of our 45 promoted programmes are `B` on the portal; the earlier MUR importer (`DISTANCE_MODES` in `scripts/import/sources/mur.ts`) excluded only "Teledidattica" and "Prevalentemente a distanza". So `classify` accepts `C` and `B`, each candidate carries `delivery` (`conventional` | `blended`), and the report flags blended lines. `T` and `P` stay excluded. A blended course can be mostly online (Piemonte Orientale's URL says "online degree program"; LUM was excluded by the owner earlier for its blended mode): piece 3 must check the delivery mode on the programme page before staging.
- **Cache hygiene and CLI strictness** added after review: the manifest is deleted before pages are written, validated with Zod on read, flags are strict, status must be 200 and redirects are errors, the Italian total has a floor of 500.
- **Biome** excludes `data-staging/universitaly` (raw one-line JSON).
