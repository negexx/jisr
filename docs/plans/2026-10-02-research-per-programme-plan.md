# Per-programme research for the German and Dutch programmes: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Tasks 1 to 5 are code and are done by subagents; Task 6 is a run with paid APIs and the owner's keys and is done by the controller, never by a subagent.

**Goal:** Fill the missing tuition, teaching language, intake/deadline, application channel, duration and document facts of the 202 German and Dutch programmes in `data/`, from official pages with verified quotes, without resetting or loosening anything already there.

**Architecture:** Extend the existing proof-gated pipeline (`scripts/import/`): institution-level, topic-specific web searches add more candidate pages (HTML and PDF) per programme; the existing cheap reader proposes facts with verbatim quotes, the checker model and the code verify them; a new *enrichment* apply mode writes only the facts the reader proved into records that are already promoted, keeping every other value and source; the existing audit sample and promotion remain the only way into `data/`.

**Tech Stack:** TypeScript (strict), tsx scripts, Vitest, Biome, pnpm, `unpdf` (new dev dependency, PDF.js build for Node, text extraction only).

Design: `docs/plans/2026-10-02-research-per-programme-design.md` (read its "Changes after reading the code" section too).

## Global Constraints

- A model only proposes; code decides. Every accepted fact needs a verbatim quote that code re-fetches and finds on the page (`quoteInText`, min 15 characters). A fact without a verifiable quote is dropped.
- Only the institution's own site (and the registers already trusted) count as `official`; an aggregator is never labelled official. `tuition` must be `official` (`data:check`).
- Unknown stays unknown. A tuition value of 0 is a real value only when the quote says there are no tuition fees (`NO_FEE` in `evidence.ts`).
- `verifyInstitution`, the quote check and the audit gate are not loosened. `data:evidence verify`, `data:audit` and `data:promote` stay the only way into `data/`. Nothing in `data/` is edited by hand.
- Requirement rules (`requirements`) of existing records are never rewritten by this work; `officialUrl` and `summary` are never changed by enrichment.
- An existing `official` value is never overwritten by enrichment; a disagreement is recorded in `_review.notes`.
- Money is integer minor units plus ISO currency; dates are ISO 8601.
- No secrets: API keys live only in `.env.local`; never read, printed, logged or committed. Subagents never read `.env.local` and never call a paid API.
- Spend cap for the run: USD 10 (`--max-usd`), plus a query cap.
- Code rules: named exports, no `any`, no `@ts-ignore`, no non-null `!`; tests mirror `scripts/import/*` in `tests/scripts/import/*.test.ts` (Vitest, no network: fake `fetch`, fake `SearchProvider`, temp dirs); conventional commits ending with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; stage explicit paths only (never `git add -A`); never commit `next.config.ts` or `.env*`.
- Environment: `export SWC_NATIVE_BINDING_CACHE='C:\Users\dagda\.swc-cache'` before any pnpm command; normalise touched files to LF (`sed -i 's/\r$//' <file>`); never commit line-ending-only changes. No dev server or browser in subagents.
- Counts to keep honest: DE 147 programmes (136 with an institution website), NL 55 (55 with a website); French programmes are out of scope until this batch is reviewed.

## File structure

| File | Responsibility |
|---|---|
| `package.json`, `pnpm-lock.yaml` | add `unpdf` (dev), `data:coverage` script |
| `scripts/import/pdf.ts` (new) | PDF bytes to text, cached; `isPdfUrl`, `pdfText` |
| `scripts/import/http.ts` | export `USER_AGENT` |
| `scripts/import/evidence.ts` | `pageText` reads PDFs; `mentionsTranslation` |
| `scripts/import/topics.ts` (new) | topic searches per institution, scoring, `mergeTopicPages` |
| `scripts/import/pages.ts` | `--topics` flag: add topic pages to the pages file |
| `scripts/import/proposals.ts` | `documents` fact in `ProposalSchema`, verification, `recordValue`, `applyEnrichment` |
| `scripts/import/checker.ts` | claim text for `documents` |
| `scripts/import/reader.ts` | instruction text for `documents`, salvage rule |
| `scripts/import/evidence-cli.ts` | `restage` / `verify` take `--enrich <dir>` |
| `scripts/data/coverage.ts` (new) | before/after coverage table per fact and country |
| `data/README.md` | document the topic pages, PDFs, enrichment and coverage command |
| `tests/scripts/import/{pdf,topics,enrich}.test.ts` (new), `proposals/reader/checker/evidence-cli/pages.test.ts`, `tests/scripts/data/coverage.test.ts` (new) | tests |

---

### Task 1: PDF text extraction

**Files:**
- Modify: `package.json` (dependency), `scripts/import/http.ts` (export `USER_AGENT`), `scripts/import/evidence.ts` (`pageText`)
- Create: `scripts/import/pdf.ts`
- Test: `tests/scripts/import/pdf.test.ts`

**Interfaces:**
- Produces: `isPdfUrl(url: string): boolean`; `pdfBytesToText(bytes: Uint8Array): Promise<string>`; `pdfText(url: string, deps?: { fetchFn?: typeof fetch; cacheDir?: string }): Promise<string>`; `MAX_PDF_BYTES`; `pageText(url)` now returns the extracted text for a `.pdf` URL.

- [ ] **Step 1: Add the dependency.** Look the API up with `ctx7` first (`MSYS_NO_PATHCONV=1 npx ctx7@latest docs /unjs/unpdf "extractText getDocumentProxy mergePages"`), then run `pnpm add -D unpdf`. Justify it in the commit message: fee schedules, deadline tables and document lists of German and Dutch institutions are often PDFs, which the pipeline cannot read today.

- [ ] **Step 2: Write the failing test** `tests/scripts/import/pdf.test.ts`:

```ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  isPdfUrl,
  MAX_PDF_BYTES,
  pdfBytesToText,
  pdfText,
} from "../../../scripts/import/pdf";

// A valid one-page PDF with a correct cross-reference table, built in memory (ASCII only).
export function makePdf(text: string): Uint8Array {
  const stream = `BT /F1 12 Tf 10 50 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 100] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}

const pdfResponse = (bytes: Uint8Array, headers: Record<string, string> = {}): Response =>
  new Response(bytes, { status: 200, headers });

describe("isPdfUrl", () => {
  it("is true for a .pdf path, with or without a query, and false otherwise", () => {
    expect(isPdfUrl("https://uni.example/fees/2026.pdf")).toBe(true);
    expect(isPdfUrl("https://uni.example/fees/2026.PDF?v=3")).toBe(true);
    expect(isPdfUrl("https://uni.example/fees")).toBe(false);
    expect(isPdfUrl("https://uni.example/pdf-guide")).toBe(false);
    expect(isPdfUrl("not a url")).toBe(false);
  });
});

describe("pdfBytesToText", () => {
  it("returns the visible text of the PDF with whitespace collapsed", async () => {
    const text = await pdfBytesToText(makePdf("Tuition fee: EUR 1,500 per semester"));
    expect(text).toContain("Tuition fee: EUR 1,500 per semester");
  });
});

describe("pdfText", () => {
  it("fetches, extracts and caches by url", async () => {
    const cacheDir = await mkdtemp(path.join(tmpdir(), "pdf-"));
    let calls = 0;
    const fetchFn = (async () => {
      calls++;
      return pdfResponse(makePdf("Application deadline: 15 July 2026"));
    }) as typeof fetch;
    const url = "https://uni.example/deadlines.pdf";
    expect(await pdfText(url, { fetchFn, cacheDir })).toContain("15 July 2026");
    expect(await pdfText(url, { fetchFn, cacheDir })).toContain("15 July 2026");
    expect(calls).toBe(1);
  });

  it("refuses a body that is not a PDF", async () => {
    const cacheDir = await mkdtemp(path.join(tmpdir(), "pdf-"));
    const fetchFn = (async () => new Response("<html>nope</html>", { status: 200 })) as typeof fetch;
    await expect(pdfText("https://uni.example/a.pdf", { fetchFn, cacheDir })).rejects.toThrow(
      /not a PDF/,
    );
  });

  it("refuses a declared size above the limit without reading the body", async () => {
    const cacheDir = await mkdtemp(path.join(tmpdir(), "pdf-"));
    const fetchFn = (async () =>
      pdfResponse(makePdf("x"), { "content-length": String(MAX_PDF_BYTES + 1) })) as typeof fetch;
    await expect(pdfText("https://uni.example/b.pdf", { fetchFn, cacheDir })).rejects.toThrow(
      /too large/,
    );
  });

  it("refuses a PDF with no extractable text (a scan)", async () => {
    const cacheDir = await mkdtemp(path.join(tmpdir(), "pdf-"));
    const fetchFn = (async () => pdfResponse(makePdf(""))) as typeof fetch;
    await expect(pdfText("https://uni.example/c.pdf", { fetchFn, cacheDir })).rejects.toThrow(
      /no extractable text/,
    );
  });

  it("refuses http and a failed request", async () => {
    const cacheDir = await mkdtemp(path.join(tmpdir(), "pdf-"));
    await expect(pdfText("http://uni.example/a.pdf", { cacheDir })).rejects.toThrow(/https/);
    const fetchFn = (async () => new Response("", { status: 404 })) as typeof fetch;
    await expect(pdfText("https://uni.example/d.pdf", { fetchFn, cacheDir })).rejects.toThrow(
      /HTTP 404/,
    );
  });
});
```

- [ ] **Step 3: Run it to verify it fails.** `pnpm vitest run tests/scripts/import/pdf.test.ts` — Expected: FAIL (module `scripts/import/pdf` missing).

- [ ] **Step 4: Implement.** In `scripts/import/http.ts` change `const USER_AGENT = ...` to `export const USER_AGENT = ...` (nothing else). Create `scripts/import/pdf.ts`:

```ts
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { extractText, getDocumentProxy } from "unpdf";

import { USER_AGENT } from "./http";

// Fee schedules, deadline tables and document lists are often PDFs. The text is extracted the same
// way for the reader and for the verifier, so a quote is checked against exactly what the model saw.
const CACHE_DIR = ".cache/import";
const TIMEOUT_MS = 90_000;
export const MAX_PDF_BYTES = 8_000_000;

export function isPdfUrl(url: string): boolean {
  try {
    return /\.pdf$/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

export async function pdfBytesToText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  return text.replace(/\s+/g, " ").trim();
}

export type PdfDeps = { fetchFn?: typeof fetch; cacheDir?: string };

// One polite GET per url (cached as text next to the HTML cache, `.pdf.txt`); no retries: a PDF
// that does not load is reported by the caller like any page that cannot be fetched.
export async function pdfText(url: string, deps: PdfDeps = {}): Promise<string> {
  if (!url.startsWith("https://")) throw new Error("evidence pages must be https");
  const dir = deps.cacheDir ?? CACHE_DIR;
  const file = path.join(dir, `${createHash("sha1").update(url).digest("hex")}.pdf.txt`);
  if (process.env.JISR_IMPORT_REFRESH !== "1" && existsSync(file)) return readFile(file, "utf8");
  const response = await (deps.fetchFn ?? fetch)(url, {
    headers: { "user-agent": USER_AGENT, accept: "application/pdf" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`GET ${url} failed: HTTP ${response.status}`);
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_PDF_BYTES)
    throw new Error(`PDF too large: ${declared} bytes (limit ${MAX_PDF_BYTES})`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > MAX_PDF_BYTES)
    throw new Error(`PDF too large: ${bytes.length} bytes (limit ${MAX_PDF_BYTES})`);
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-")
    throw new Error(`${url} is not a PDF`);
  const text = await pdfBytesToText(bytes);
  if (text === "") throw new Error(`${url} has no extractable text (a scanned PDF?)`);
  await mkdir(dir, { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, text);
  await rename(temp, file);
  return text;
}
```

In `scripts/import/evidence.ts` add `import { isPdfUrl, pdfText } from "./pdf";` and make `pageText` start with the https check, then `if (isPdfUrl(url)) return pdfText(url);` before the existing HTML fetch (leave the rest unchanged).

- [ ] **Step 5: Run to verify it passes.** `pnpm vitest run tests/scripts/import/pdf.test.ts tests/scripts/import/evidence.test.ts && pnpm typecheck && pnpm lint` — Expected: PASS. If `getDocumentProxy` needs a different call in the installed version, follow the docs fetched in Step 1, not this snippet.

- [ ] **Step 6: Commit.**

```bash
git add package.json pnpm-lock.yaml scripts/import/pdf.ts scripts/import/http.ts scripts/import/evidence.ts tests/scripts/import/pdf.test.ts
git commit -m "feat: read PDF pages (fee schedules, deadlines, document lists) for the research pipeline

Adds unpdf as a dev dependency: German and Dutch institutions often publish fees and
deadlines in PDFs, which pageText could not read.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Topic page discovery

**Files:**
- Create: `scripts/import/topics.ts`
- Modify: `scripts/import/pages.ts` (flag `--topics`, one extra pass)
- Test: `tests/scripts/import/topics.test.ts`, add a `mergeTopicPages` case file section in the same file (pages.ts is only wired, not unit-tested beyond existing tests)

**Interfaces:**
- Consumes: `registrable`, `sameSite` (`discover.ts`), `normalizeForMatch` (`evidence.ts`), `QueryBudget`, `SearchHit`, `SearchProvider` (`search.ts`), `pool`, `flagValue`, `loadMeta` (`reader.ts`).
- Produces: `TOPICS = ["fees","language","deadline","documents"] as const`, `type Topic`; `scoreTopicLink(link: { url: string; text: string }, topic: Topic): number`; `discoverTopicPages(input: TopicInput): Promise<Record<Topic, string[]>>`; `mergeTopicPages(existing: readonly string[], topics: Record<Topic, readonly string[]>, cap?: number): string[]`.

Behaviour: one query per topic per institution (`site:<registrable domain> <country keywords>`), shared by all that institution's programmes through the `memo` map and counted by the `QueryBudget`. Hits must be https, on the institution's own site, not a dated news path, not a non-PDF file; PDFs are allowed. A hit is kept when `scoreTopicLink >= 0.4`; at most 2 per topic. `mergeTopicPages` keeps every existing page first, then adds topic pages in topic order, deduplicated, up to `cap` (default 10) pages in total.

- [ ] **Step 1: Write the failing test** `tests/scripts/import/topics.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  discoverTopicPages,
  mergeTopicPages,
  scoreTopicLink,
  TOPICS,
} from "../../../scripts/import/topics";
import {
  QueryBudget,
  SearchBudgetExceeded,
  type SearchHit,
  type SearchProvider,
} from "../../../scripts/import/search";

const hit = (url: string, title = "", snippet = ""): SearchHit => ({ url, title, snippet });

function provider(answers: (query: string) => SearchHit[]): SearchProvider & { queries: string[] } {
  const queries: string[] = [];
  return {
    name: "fake",
    queries,
    search: async (query) => {
      queries.push(query);
      return answers(query);
    },
  };
}

describe("scoreTopicLink", () => {
  it("scores a german fee page and a dutch fee page", () => {
    expect(
      scoreTopicLink({ url: "https://uni.example/studium/studiengebuehren", text: "Studiengebühren" }, "fees"),
    ).toBeGreaterThanOrEqual(0.4);
    expect(
      scoreTopicLink({ url: "https://uni.example/nl/collegegeld", text: "Collegegeld 2026" }, "fees"),
    ).toBeGreaterThanOrEqual(0.4);
  });

  it("scores deadline, language and documents pages and rejects an unrelated page", () => {
    expect(scoreTopicLink({ url: "https://uni.example/bewerbungsfrist", text: "Bewerbungsfrist" }, "deadline")).toBeGreaterThanOrEqual(0.4);
    expect(scoreTopicLink({ url: "https://uni.example/language", text: "Language of instruction" }, "language")).toBeGreaterThanOrEqual(0.4);
    expect(scoreTopicLink({ url: "https://uni.example/documents", text: "Required documents" }, "documents")).toBeGreaterThanOrEqual(0.4);
    expect(scoreTopicLink({ url: "https://uni.example/campus-life", text: "Campus life" }, "fees")).toBeLessThan(0.4);
  });

  it("halves the score of a news path", () => {
    const plain = scoreTopicLink({ url: "https://uni.example/fees", text: "Tuition fees" }, "fees");
    const news = scoreTopicLink({ url: "https://uni.example/news/fees", text: "Tuition fees" }, "fees");
    expect(news).toBeLessThan(plain);
  });
});

describe("discoverTopicPages", () => {
  const website = "https://www.hs-example.de/";

  it("asks one site-scoped query per topic and keeps own-site, topic-matching hits (PDFs included)", async () => {
    const search = provider((query) => {
      if (query.includes("Studiengebühren"))
        return [
          hit("https://www.hs-example.de/studium/studiengebuehren", "Studiengebühren"),
          hit("https://other.example/studiengebuehren", "Studiengebühren"),
          hit("https://www.hs-example.de/downloads/gebuehren.pdf", "Gebührenordnung Studiengebühren"),
          hit("https://www.hs-example.de/news/2019/05/studiengebuehren", "Studiengebühren"),
          hit("https://www.hs-example.de/bild.jpg", "Studiengebühren"),
        ];
      return [];
    });
    const out = await discoverTopicPages({ country: "DE", website, search });
    expect(search.queries).toHaveLength(TOPICS.length);
    expect(search.queries.every((q) => q.startsWith("site:hs-example.de "))).toBe(true);
    expect(out.fees).toEqual([
      "https://www.hs-example.de/studium/studiengebuehren",
      "https://www.hs-example.de/downloads/gebuehren.pdf",
    ]);
    expect(out.language).toEqual([]);
  });

  it("shares answers between programmes of one institution and counts each query once", async () => {
    const search = provider(() => []);
    const memo = new Map<string, Promise<SearchHit[]>>();
    const budget = new QueryBudget(100);
    await discoverTopicPages({ country: "NL", website: "https://www.hr.example.nl/", search, memo, budget });
    await discoverTopicPages({ country: "NL", website: "https://www.hr.example.nl/", search, memo, budget });
    expect(search.queries).toHaveLength(TOPICS.length);
    expect(budget.used).toBe(TOPICS.length);
  });

  it("stops with the budget error when the query cap is reached", async () => {
    const search = provider(() => []);
    await expect(
      discoverTopicPages({ country: "DE", website, search, budget: new QueryBudget(2) }),
    ).rejects.toBeInstanceOf(SearchBudgetExceeded);
  });

  it("asks nothing for a country without keywords", async () => {
    const search = provider(() => []);
    const out = await discoverTopicPages({ country: "FR", website, search });
    expect(search.queries).toEqual([]);
    expect(out).toEqual({ fees: [], language: [], deadline: [], documents: [] });
  });
});

describe("mergeTopicPages", () => {
  it("keeps existing pages first, adds topic pages in topic order, dedupes and caps", () => {
    const existing = ["https://a.example/1", "https://a.example/2"];
    const topics = {
      fees: ["https://a.example/2", "https://a.example/fees"],
      language: ["https://a.example/lang"],
      deadline: [],
      documents: ["https://a.example/docs"],
    };
    expect(mergeTopicPages(existing, topics)).toEqual([
      "https://a.example/1",
      "https://a.example/2",
      "https://a.example/fees",
      "https://a.example/lang",
      "https://a.example/docs",
    ]);
    expect(mergeTopicPages(existing, topics, 3)).toEqual([
      "https://a.example/1",
      "https://a.example/2",
      "https://a.example/fees",
    ]);
  });

  it("never drops an existing page, even above the cap", () => {
    const existing = ["https://a.example/1", "https://a.example/2", "https://a.example/3"];
    expect(
      mergeTopicPages(existing, { fees: ["https://a.example/f"], language: [], deadline: [], documents: [] }, 2),
    ).toEqual(existing);
  });
});
```

- [ ] **Step 2: Run to verify it fails.** `pnpm vitest run tests/scripts/import/topics.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement** `scripts/import/topics.ts`:

```ts
import { registrable, sameSite } from "./discover";
import { normalizeForMatch } from "./evidence";
import type { QueryBudget, SearchHit, SearchProvider } from "./search";

// Institution-level searches for the pages that state what a programme page often leaves out: fees,
// the language of instruction, the application deadline and the documents. Tuition, deadline and
// document pages are mostly institution-wide, so one query serves every programme of the institution
// (through `memo`) and the cost stays near (institutions x 4) queries. The reader still has to quote
// each page and the verifier still has to find the quote: a wrong page costs tokens, not a wrong fact.
export const TOPICS = ["fees", "language", "deadline", "documents"] as const;
export type Topic = (typeof TOPICS)[number];

const WORDS: Record<string, Record<Topic, string>> = {
  DE: {
    fees: "Studiengebühren Semesterbeitrag internationale Studierende tuition fees",
    language: "Unterrichtssprache Studiensprache language of instruction",
    deadline: "Bewerbungsfrist internationale Bewerber application deadline",
    documents: "Bewerbungsunterlagen erforderliche Unterlagen international applicants required documents",
  },
  NL: {
    fees: "collegegeld niet-EER studenten tuition fees non-EEA",
    language: "voertaal taal van het onderwijs language of instruction",
    deadline: "aanmelddeadline aanmelden deadline application",
    documents: "benodigde documenten toelating international students required documents",
  },
};

const LANGUAGE: Record<string, string> = { DE: "de", NL: "nl" };

const PATTERN: Record<Topic, RegExp> = {
  fees: /tuition|\bfees?\b|\bcosts?\b|gebuhr|studienbeitr|semesterbeitr|collegegeld|kosten/,
  language: /language of instruction|teaching language|instruction|unterrichtssprache|studiensprache|\bsprache|voertaal|\btaal\b|language/,
  deadline: /deadline|frist|termine?\b|aanmeld|application period|dates/,
  documents: /documents?|unterlagen|nachweis|documenten|required|checklist|erforderlich|benodigde/,
};

const NEWSISH = /\/(news|blog|events?|actualit|presse|press|agenda|nieuws|aktuell|veranstaltung)/;
// PDFs are wanted here (fee schedules); every other file type is not a page to read
const OTHER_FILE = /\.(jpe?g|png|gif|svg|webp|zip|docx?|xlsx?|pptx?|mp[34]|ics)(\?|$)/i;
const DATED_POST = /\/(19|20)\d{2}\/(0[1-9]|1[0-2])(\/|$)/;

const fold = (text: string): string =>
  normalizeForMatch(text)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

export function scoreTopicLink(link: { url: string; text: string }, topic: Topic): number {
  let path: string;
  try {
    path = decodeURIComponent(new URL(link.url).pathname);
  } catch {
    path = new URL(link.url).pathname;
  }
  const penalty = NEWSISH.test(fold(path)) ? 0.5 : 1;
  const pattern = PATTERN[topic];
  return ((pattern.test(fold(link.text)) ? 0.6 : 0) + (pattern.test(fold(path)) ? 0.4 : 0)) * penalty;
}

export type TopicInput = {
  country: string;
  website: string;
  search: SearchProvider;
  budget?: QueryBudget;
  memo?: Map<string, Promise<SearchHit[]>>;
  // hits kept per topic
  perTopic?: number;
};

export async function discoverTopicPages(input: TopicInput): Promise<Record<Topic, string[]>> {
  const out: Record<Topic, string[]> = { fees: [], language: [], deadline: [], documents: [] };
  const words = WORDS[input.country];
  if (words === undefined) return out;
  const scope = `site:${registrable(input.website)}`;
  const memo = input.memo ?? new Map<string, Promise<SearchHit[]>>();
  const ask = (query: string): Promise<SearchHit[]> => {
    const known = memo.get(query);
    if (known !== undefined) return known;
    input.budget?.take();
    const pending = input.search.search(query, {
      country: input.country,
      ...(LANGUAGE[input.country] === undefined ? {} : { language: LANGUAGE[input.country] }),
    });
    memo.set(query, pending);
    // a failed search is forgotten, so the institution's next programme can ask again
    pending.catch(() => memo.delete(query));
    return pending;
  };
  for (const topic of TOPICS) {
    const hits = await ask(`${scope} ${words[topic]}`);
    out[topic] = hits
      .filter((h) => h.url.startsWith("https://") && sameSite(h.url, input.website))
      .filter((h) => {
        try {
          const pathname = new URL(h.url).pathname;
          return !OTHER_FILE.test(pathname) && !DATED_POST.test(pathname);
        } catch {
          return false;
        }
      })
      .map((h) => ({ url: h.url, score: scoreTopicLink({ url: h.url, text: `${h.title} ${h.snippet}` }, topic) }))
      .filter((c) => c.score >= 0.4)
      .sort((a, b) => b.score - a.score)
      .slice(0, input.perTopic ?? 2)
      .map((c) => c.url);
  }
  return out;
}

// Every page the programme already has stays; topic pages fill what is left up to `cap` in total.
export function mergeTopicPages(
  existing: readonly string[],
  topics: Record<Topic, readonly string[]>,
  cap = 10,
): string[] {
  const out = [...new Set(existing)];
  for (const topic of TOPICS) {
    for (const url of topics[topic]) {
      if (out.length >= cap) return out;
      if (!out.includes(url)) out.push(url);
    }
  }
  return out;
}
```

- [ ] **Step 4: Run to verify it passes.** `pnpm vitest run tests/scripts/import/topics.test.ts && pnpm typecheck && pnpm lint` — Expected: PASS (adjust a regex in `PATTERN` only if a score assertion above fails for a reason you can explain; do not weaken the 0.4 threshold).

- [ ] **Step 5: Wire it into `pages.ts`.** Import `discoverTopicPages`, `mergeTopicPages`, `TOPICS` from `./topics` and `registrable` from `./discover`. Update the usage comment (`[--topics]`). Add `const useTopics = argv.includes("--topics");`, extend the key check to `(useSearch || useTopics) && !dryRun && base === null`, and after the existing `await pool(...)` call, still inside the `try`, add:

```ts
    const topicSites = new Set<string>();
    if (useTopics) {
      await pool(slugs, Number(flag("concurrency") ?? 4), async (slug) => {
        const meta = await loadMeta(slug);
        const record = await recordOf(slug);
        if (meta === null || record === null) return;
        const website = await websiteOf(String(record.institution ?? ""));
        if (website === null) return;
        topicSites.add(registrable(website));
        if (dryRun || search === null) return;
        const topics = await discoverTopicPages({
          country: meta.country,
          website,
          search,
          budget,
          memo,
        });
        programmes[slug] = mergeTopicPages(programmes[slug] ?? [], topics);
      });
    }
```

Declare `topicSites` before the `try` so the dry-run branch can use it, and extend the dry-run message: when `useTopics`, print `plus at most ${topicSites.size * TOPICS.length} topic queries` and make the early `return` condition `if (dryRun && (useSearch || useTopics))` (with the existing text for `useSearch` unchanged). Add `searched`/topic counts to the final summary: `console.log(\`topic pages added for ${...}\`)` is optional; the search-queries-used line already prints `budget.used`.

- [ ] **Step 6: Verify and commit.** `pnpm vitest run tests/scripts/import && pnpm typecheck && pnpm lint` — Expected: PASS (existing `pages.test.ts` unchanged). Then:

```bash
git add scripts/import/topics.ts scripts/import/pages.ts tests/scripts/import/topics.test.ts
git commit -m "feat: topic searches (fees, language, deadline, documents) add pages per institution

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The `documents` fact

**Files:**
- Modify: `scripts/import/evidence.ts` (`mentionsTranslation`), `scripts/import/proposals.ts`, `scripts/import/checker.ts`, `scripts/import/reader.ts`
- Test: `tests/scripts/import/proposals.test.ts`, `reader.test.ts`, `checker.test.ts` (add cases; read the existing tests first and follow their helpers)

**Interfaces:**
- Produces: `DocumentProposalSchema`, `type DocumentProposal = { slug: string; name: { fr: string; en?: string }; translationRequired: boolean | null }`; `Proposal["facts"].documents?: { value: DocumentProposal[]; evidence: ... }`; `recordValue(field: string, value: unknown): unknown` (converts a `documents` value to the record shape `{ slug, name: LocalizedText, translationRequired }`, any other field unchanged); `mentionsTranslation(quote: string): boolean`.
- Rules: a list needs at least one document and unique slugs (else the fact is dropped by `salvageProposal`); `translationRequired: false` can never be verified from a quote, so the reader's output is normalised to `null` (like the unverifiable "no certificate needed"); `translationRequired: true` survives verification only when an accepted quote mentions translation, otherwise it is set to `null` and the document is kept; the checker judges the list as a claim; `applyVerified` writes the record shape through `recordValue`.

- [ ] **Step 1: Write the failing tests** (append to the matching existing files, reusing their helpers for a fake `getText`):

In `tests/scripts/import/proposals.test.ts`:

```ts
describe("documents fact", () => {
  const page = "https://uni.example/apply";
  const text =
    "International applicants must submit: a certified copy of the school-leaving certificate (translation into German or English required), a CV and a passport copy.";
  const getText = async () => text;
  const doc = (slug: string, translationRequired: boolean | null) => ({
    slug,
    name: { fr: "Diplôme", en: "School-leaving certificate" },
    translationRequired,
  });
  const proposal = (documents: unknown) =>
    ProposalSchema.parse({
      slug: "xx-prog",
      programmePage: null,
      facts: {
        documents: {
          value: documents,
          evidence: [{ url: page, quote: "a certified copy of the school-leaving certificate (translation into German or English required)" }],
        },
      },
    });

  it("accepts a document list whose quote is on the page and keeps a translation claim the quote supports", async () => {
    const verified = await verifyProposal(proposal([doc("school-leaving-certificate", true)]), "Prog", getText);
    expect(verified.facts.documents?.value).toEqual([doc("school-leaving-certificate", true)]);
  });

  it("turns translationRequired true into null when no accepted quote mentions translation", async () => {
    const noTranslation = ProposalSchema.parse({
      slug: "xx-prog",
      programmePage: null,
      facts: {
        documents: {
          value: [doc("cv", true)],
          evidence: [{ url: page, quote: "a CV and a passport copy" }],
        },
      },
    });
    const verified = await verifyProposal(noTranslation, "Prog", getText);
    expect(verified.facts.documents?.value).toEqual([doc("cv", null)]);
  });

  it("rejects a document list whose quote is not on the page", async () => {
    const wrong = ProposalSchema.parse({
      slug: "xx-prog",
      programmePage: null,
      facts: { documents: { value: [doc("cv", null)], evidence: [{ url: page, quote: "a sentence that is not on the page at all" }] } },
    });
    const verified = await verifyProposal(wrong, "Prog", getText);
    expect(verified.facts.documents).toBeUndefined();
    expect(verified.rejected.map((r) => r.fact)).toContain("documents");
  });

  it("refuses an empty list and duplicate slugs at the schema", () => {
    expect(() => proposal([])).toThrow();
    expect(() => proposal([doc("cv", null), doc("cv", null)])).toThrow();
  });

  it("recordValue gives the record shape with draft localized names and leaves other fields alone", () => {
    expect(recordValue("documents", [doc("cv", null)])).toEqual([
      {
        slug: "cv",
        name: { fr: { text: "Diplôme", status: "draft" }, en: { text: "School-leaving certificate", status: "draft" } },
        translationRequired: null,
      },
    ]);
    expect(recordValue("tuition", { amountMinor: 0 })).toEqual({ amountMinor: 0 });
  });
});
```

In `tests/scripts/import/reader.test.ts` add: `expect(INSTRUCTION).toMatch(/documents:/)`; and a `salvageProposal` case: a raw proposal whose `facts.documents.value[0].translationRequired` is `false` comes back with `null`; one with a duplicate slug has the `documents` fact dropped (`dropped` contains `"facts.documents"`).

In `tests/scripts/import/checker.test.ts` add: `claimText("documents", [{ slug: "cv", name: { fr: "CV", en: "CV" }, translationRequired: null }])` contains `"CV"`.

- [ ] **Step 2: Run them to verify they fail.** `pnpm vitest run tests/scripts/import/proposals.test.ts tests/scripts/import/reader.test.ts tests/scripts/import/checker.test.ts` — Expected: FAIL (`documents` unknown; `recordValue` missing).

- [ ] **Step 3: Implement.**

`scripts/import/evidence.ts` — add and export:

```ts
const TRANSLATION_WORDS =
  /translat|übersetz|uebersetz|vertaling|vertaald|traduction|traduit|beglaubigt|certified cop/i;
export const mentionsTranslation = (quote: string): boolean => TRANSLATION_WORDS.test(quote);
```

`scripts/import/proposals.ts` — add (near the other schemas; import `mentionsTranslation` from `./evidence`):

```ts
const DocumentSlug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const DocumentProposalSchema = z.object({
  slug: DocumentSlug,
  name: z.object({
    fr: z.string().min(1).max(200),
    en: z.string().min(1).max(200).optional(),
  }),
  translationRequired: z.boolean().nullable(),
});
export type DocumentProposal = z.infer<typeof DocumentProposalSchema>;
```

In `ProposalSchema.facts` add:

```ts
    documents: fact(
      z
        .array(DocumentProposalSchema)
        .min(1)
        .refine((docs) => new Set(docs.map((d) => d.slug)).size === docs.length, {
          message: "document slugs must be unique",
        }),
    ).optional(),
```

In `checkValue` add `case "documents": return ok;` (the verbatim quote is already required; the checker model judges the list). In `verifyProposal`, inside the `for (const [key, entry] ...)` loop, replace the final acceptance line so the value can be adjusted:

```ts
    let value: unknown = entry.value;
    if (key === "documents") {
      const supportsTranslation = accepted.some((e) => mentionsTranslation(e.quote));
      value = (entry.value as DocumentProposal[]).map((d) =>
        d.translationRequired === true && !supportsTranslation ? { ...d, translationRequired: null } : d,
      );
    }
    if (reason !== null) result.rejected.push({ fact: key, reason });
    else result.facts[key] = { value, evidence: accepted };
```

Add and export `recordValue` (before `applyVerified`) and use it there: `next[field] = { value: recordValue(field, accepted.value), source: keyFor(first.url), info_kind: "official" };`

```ts
// The reader's shape for a fact value becomes the record's shape (documents carry localized names).
export function recordValue(field: string, value: unknown): unknown {
  if (field !== "documents") return value;
  return (value as DocumentProposal[]).map((d) => ({
    slug: d.slug,
    name: {
      fr: { text: d.name.fr, status: "draft" },
      ...(d.name.en === undefined ? {} : { en: { text: d.name.en, status: "draft" } }),
    },
    translationRequired: d.translationRequired,
  }));
}
```

`scripts/import/checker.ts` — in `claimText` add:

```ts
    case "documents": {
      const docs = value as { name: { fr: string; en?: string }; translationRequired: boolean | null }[];
      const names = docs.map((d) => d.name.en ?? d.name.fr).join("; ");
      const translated = docs.filter((d) => d.translationRequired === true).map((d) => d.name.en ?? d.name.fr);
      return `An international applicant must submit these documents: ${names}.${
        translated.length === 0 ? "" : ` A translation is required for: ${translated.join("; ")}.`
      }`;
    }
```

`scripts/import/reader.ts` — in `INSTRUCTION`: add to the OUTPUT example after `applicationChannel`:
`    "documents": { "value": [{"slug":"school-leaving-certificate","name":{"fr":"Diplôme de fin d'études secondaires","en":"School-leaving certificate"},"translationRequired":true}], "evidence": [...] }`
(with a comma on the previous line), and add to FACT DETAILS:

```
- documents: the documents an international applicant must submit, one list item per document that the quotes name (never a document the pages do not name). slug: lowercase English kebab-case ("school-leaving-certificate"). name.fr (required) and name.en: the document's name. translationRequired: true only if a quote says that document must be translated or officially translated; otherwise null (never false). Leave the fact out if the pages give no document list.
```

In `salvageProposal`, after the intakes block add:

```ts
  const documents =
    typeof facts === "object" && facts !== null
      ? (facts as Record<string, unknown>).documents
      : undefined;
  const documentList =
    typeof documents === "object" && documents !== null
      ? (documents as Record<string, unknown>).value
      : undefined;
  if (Array.isArray(documentList)) {
    // a negative ("no translation needed") cannot be verified from a quote: unknown instead
    for (const item of documentList) {
      if (typeof item === "object" && item !== null) {
        const d = item as Record<string, unknown>;
        if (d.translationRequired === false) d.translationRequired = null;
      }
    }
  }
```

- [ ] **Step 4: Run to verify they pass.** `pnpm vitest run tests/scripts/import && pnpm typecheck && pnpm lint` — Expected: PASS. If an existing reader test compares the full prompt text or its length, update that test with a reason, and say so in the report.

- [ ] **Step 5: Commit.**

```bash
git add scripts/import/evidence.ts scripts/import/proposals.ts scripts/import/checker.ts scripts/import/reader.ts tests/scripts/import/proposals.test.ts tests/scripts/import/reader.test.ts tests/scripts/import/checker.test.ts
git commit -m "feat: documents fact in research proposals (verified quote, unknown translation stays unknown)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Enrichment of records already in `data/`

**Files:**
- Modify: `scripts/import/proposals.ts` (add `applyEnrichment`), `scripts/import/evidence-cli.ts` (`--enrich <dir>` for `restage` and `verify`; testable directory options)
- Test: `tests/scripts/import/enrich.test.ts` (new), `tests/scripts/import/evidence-cli.test.ts` (add cases)

**Interfaces:**
- Consumes: `Verified`, `recordValue`, `PREPARED_TEXT` (module-private constants in `proposals.ts`).
- Produces: `applyEnrichment(staged: Staged, verified: Verified, today: string): Staged`; `restage(only?: ReadonlySet<string> | null, options?: { enrichDir?: string | null; stagingDir?: string; dataDir?: string }): Promise<string[]>` (returns the restaged `programs/<slug>` keys; prints as before); `verifyAll(dryRun, only, options?: { enrichDir?: string | null; stagingDir?: string })` exported for tests.

`applyEnrichment` rules, in this order, for each fact in `durationYears, teachingLanguages, tuition, intakes, applicationChannel, documents` that `verified.facts` holds with at least one evidence item: (1) if the record's field has a non-null value and `info_kind === "official"`, keep it and add `"<field>: kept the existing official value"` to the conflict list (only when the new value differs: `JSON.stringify` of both); (2) otherwise set `{ value: recordValue(field, value), source: <key of the first evidence url>, info_kind: "official" }`. Source keys: reuse the key of an existing source with the same url; otherwise add `page-N` with the smallest free N and `last_verified_at: null`. Existing sources keep their dates. The function returns the **same object** (`===`) when nothing changes, so callers can tell. It never touches `requirements`, `officialUrl`, `summary`, `scholarships`. When something changed it sets `_review` like `applyVerified` does (`preparedBy: "assistant"`, `preparedAt: today`, `evidence`, the `PREPARED_TEXT` todo, plus `notes` holding the conflict list and `verified.notes`) so the audit sample draws it.

- [ ] **Step 1: Write the failing tests** `tests/scripts/import/enrich.test.ts`. Start from this setup, then write one `it` per numbered case below with real assertions:

```ts
import { describe, expect, it } from "vitest";

import { applyEnrichment, type Verified } from "../../../scripts/import/proposals";

type Rec = Record<string, unknown>;

const registerRecord = (): Rec => ({
  slug: "de-xx",
  officialUrl: "https://www2.daad.de/x/10648/",
  summary: { fr: { text: "s", status: "draft" } },
  durationYears: { value: 3, source: "daad", info_kind: "guidance" },
  teachingLanguages: { value: ["en"], source: "daad", info_kind: "guidance" },
  tuition: { value: null, source: "daad", info_kind: "guidance" },
  intakes: { value: null, source: "daad", info_kind: "guidance" },
  applicationChannel: { value: null, source: "daad", info_kind: "guidance" },
  documents: { value: null, source: "daad", info_kind: "guidance" },
  requirements: { coverage: "partial", source: "daad", info_kind: "guidance", rules: [] },
  scholarships: [],
  sources: { daad: { url: "https://www2.daad.de/x/10648/", last_verified_at: "2026-10-01" } },
  _review: { revises: true },
});

const verified = (facts: Verified["facts"], extra: Partial<Verified> = {}): Verified => ({
  programmePage: null,
  facts,
  rejected: [],
  ...extra,
});

const tuitionFact = {
  value: { amountMinor: 150000, currency: "EUR", period: "semester" },
  evidence: [
    { url: "https://hs.example/fees", quote: "Tuition for non-EU students: EUR 1,500 per semester" },
  ],
};

// read a nested record without casts in every test
const at = (record: Rec, key: string): Rec => record[key] as Rec;

describe("applyEnrichment", () => {
  // one `it` per case 1 to 10 below
});
```

1. **fills a missing fact:** `tuition` becomes `{ value, source: "page-1", info_kind: "official" }` and `sources["page-1"]` is `{ url: "https://hs.example/fees", last_verified_at: null }`; use `next.sources["page-1"]` (bracket access).
2. **keeps old sources and their dates:** `sources.daad.last_verified_at === "2026-10-01"` after enrichment.
3. **replaces a `guidance` value:** `teachingLanguages` accepted as `["en","de"]` becomes official with the new source; `durationYears` (not accepted) stays `{ value: 3, source: "daad", info_kind: "guidance" }` exactly.
4. **never overwrites an existing official value:** a record whose `tuition` is `{ value: <A>, source: "programme", info_kind: "official" }` and a verified tuition `<B>` keeps `<A>`, and `_review.notes` contains `tuition: kept the existing official value`; with `<B>` equal to `<A>` nothing is noted and the record is returned unchanged (`toBe` the input).
5. **reuses a source key:** evidence url equal to an existing source url reuses that key and adds no `page-N`.
6. **smallest free key:** with an existing `page-1`, a new url gets `page-2`.
7. **documents are converted:** a verified `documents` value `[{ slug: "cv", name: { fr: "CV", en: "CV" }, translationRequired: null }]` is stored as `[{ slug: "cv", name: { fr: { text: "CV", status: "draft" }, en: { text: "CV", status: "draft" } }, translationRequired: null }]`.
8. **leaves requirements, officialUrl, summary, scholarships untouched** (deep-equal to the input values) when facts are added.
9. **nothing accepted returns the same object** (`toBe`), and so does a verified fact with an empty evidence list.
10. **marks the record for the audit sample:** after a change `_review.preparedBy === "assistant"`, `_review.preparedAt === "2026-10-02"`, `_review.evidence` has `{ fact: "tuition", url, quote }`, and `_review.todo` matches `/prepared by the assistant from the quoted pages/`; `_review.revises` is still `true`.

Add to `tests/scripts/import/evidence-cli.test.ts` (read how it builds temp dirs first; the functions take `stagingDir`/`dataDir` options now, so no `chdir` is needed): (a) `restage` with `enrichDir` restages a promoted programme whose proposal in `enrichDir` has at least one fact, keeps `last_verified_at` dates unchanged and sets `_review.revises: true`; (b) it skips a proposal with `facts: {}`; (c) without `enrichDir` its behaviour is unchanged (dates cleared); (d) `verifyAll` with `enrichDir` writes the enriched staged record and leaves `requirements` as restaged.

- [ ] **Step 2: Run to verify it fails.** `pnpm vitest run tests/scripts/import/enrich.test.ts tests/scripts/import/evidence-cli.test.ts` — Expected: FAIL (`applyEnrichment` missing).

- [ ] **Step 3: Implement `applyEnrichment`** in `scripts/import/proposals.ts` (after `applyVerified`):

```ts
const ENRICH_FIELDS = [
  "durationYears",
  "teachingLanguages",
  "tuition",
  "intakes",
  "applicationChannel",
  "documents",
] as const;

// Applies what the reader proved to a record that is already in data/. Unlike applyVerified it never
// resets a fact the reader did not establish, never replaces an existing official value, and never
// touches requirements, the official URL, the summary or the scholarships. Returns `staged` itself
// when nothing changed.
export function applyEnrichment(staged: Staged, verified: Verified, today: string): Staged {
  const sources: Record<string, unknown> = { ...asRecord(staged.sources) };
  const keyOfUrl = new Map<string, string>();
  for (const [key, value] of Object.entries(sources)) {
    const url = asRecord(value).url;
    if (typeof url === "string") keyOfUrl.set(url, key);
  }
  const keyFor = (url: string): string => {
    const known = keyOfUrl.get(url);
    if (known !== undefined) return known;
    let n = 1;
    while (`page-${n}` in sources) n++;
    const key = `page-${n}`;
    sources[key] = { url, last_verified_at: null };
    keyOfUrl.set(url, key);
    return key;
  };

  const next: Staged = { ...staged };
  const evidenceLog: { fact: string; url: string; quote: string }[] = [];
  const conflicts: string[] = [];
  let changed = false;
  for (const field of ENRICH_FIELDS) {
    const accepted = verified.facts[field];
    const first = accepted?.evidence[0];
    if (accepted === undefined || first === undefined) continue;
    const existing = asRecord(staged[field]);
    const value = recordValue(field, accepted.value);
    if (existing.value !== null && existing.value !== undefined && existing.info_kind === "official") {
      if (JSON.stringify(existing.value) !== JSON.stringify(value))
        conflicts.push(`${field}: kept the existing official value`);
      continue;
    }
    next[field] = { value, source: keyFor(first.url), info_kind: "official" };
    for (const e of accepted.evidence) evidenceLog.push({ fact: field, url: e.url, quote: e.quote });
    changed = true;
  }
  if (!changed && conflicts.length === 0) return staged;
  if (!changed) {
    // only disagreements: record them for the auditor, change nothing else
    next._review = { ...asRecord(staged._review), notes: conflicts.join("; ") };
    return next;
  }
  next.sources = sources;
  const review = asRecord(staged._review);
  const notes = [...conflicts, ...(verified.notes === undefined ? [] : [verified.notes])];
  next._review = {
    ...review,
    preparedBy: "assistant",
    preparedAt: today,
    evidence: evidenceLog,
    ...(notes.length === 0 ? {} : { notes: notes.join("; ") }),
    todo: PREPARED_NOTE.test(String(review.todo ?? ""))
      ? String(review.todo)
      : `${String(review.todo ?? "")}; ${PREPARED_TEXT}`.replace(/^; /, ""),
  };
  return next;
}
```

Test 4's "with `<B>` equal to `<A>` the record is returned unchanged" holds because no conflict is added and nothing changed.

- [ ] **Step 4: Wire the CLI** in `scripts/import/evidence-cli.ts`:
  - Add a small local `flagOf(argv, name)` (value after `--name`, error if missing) and in `main` read `const enrichDir = flagOf(rest, "enrich") ?? null;` for `verify` and `restage`; update the usage comment block (`data:evidence restage --enrich <dir> --slugs <file>`, `data:evidence verify --enrich <dir> --slugs <file>`).
  - `restage(only = null, options = {})`: `const stagingDir = options.stagingDir ?? STAGING_DIR`, `const dataDir = options.dataDir ?? DATA_DIR`; the proposals directory is `options.enrichDir ?? path.join(stagingDir, "proposals", "programs")`; in enrich mode a proposal whose parsed JSON has no keys under `facts` is skipped, the promoted record is copied **without** `clearVerified` (dates stay), and `_review.todo` is `"enrichment of a record already in data/: new facts only; promote with --replace-revisions after the audit"`. Pass `stagingDir`/`dataDir` to `stageFile`, `readLedgerRows`, the AUDIT.csv path and `readAudit` if it accepts a dir (read `audit.ts`; if it does not, add an optional dir parameter with the current default). Return the restaged keys.
  - `verifyAll(dryRun, only = null, options = {})` exported: when `options.enrichDir` is set, only the `programs` kind is processed, from that directory, using `applyEnrichment(staged, verified, today())` instead of `applyVerified` (no `programmePage` gate; print `enriched <fields>` or `no new facts`, and `kept existing official value` conflicts). Default behaviour is unchanged.

- [ ] **Step 5: Run to verify it passes.** `pnpm vitest run tests/scripts/import && pnpm typecheck && pnpm lint` — Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add scripts/import/proposals.ts scripts/import/evidence-cli.ts tests/scripts/import/enrich.test.ts tests/scripts/import/evidence-cli.test.ts
git commit -m "feat: enrichment mode fills proven facts into records already in data/ without resetting anything

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

(Include `scripts/import/audit.ts` in the `git add` if Step 4 changed it.)

---

### Task 5: Coverage report and docs

**Files:**
- Create: `scripts/data/coverage.ts`, `tests/scripts/data/coverage.test.ts`
- Modify: `package.json` (`"data:coverage": "tsx scripts/data/coverage.ts"`), `data/README.md`

**Interfaces:**
- Produces: `coverageOf(records: readonly Record<string, unknown>[]): Record<string, Record<string, number>>` (country to counts of programmes and of programmes holding a non-null value per fact, plus `official` counts for tuition); `renderCoverage(table): string` (a markdown table with one column per country in alphabetical order, rows in this order: programmes, tuition, tuition (official), teaching language, intakes, application channel, documents, duration, requirement rules).

A fact "holds a value" when `value` is not `null`/`undefined` and, for arrays, not empty. "requirement rules" counts programmes with `requirements.rules.length > 0`.

- [ ] **Step 1: Write the failing test** `tests/scripts/data/coverage.test.ts`: three records (DE with tuition official and documents `[]`, DE with nothing, NL with language and a rule) and assert exact counts (`DE.n === 2`, `DE.tuition === 1`, `DE["tuition official"] === 1`, `DE.documents === 0` because an empty array is not a value, `NL.rules === 1`), and that `renderCoverage` contains the header `| Fact | DE | NL |` and the row `| tuition | 1 | 0 |`.
- [ ] **Step 2: Run to verify it fails.** `pnpm vitest run tests/scripts/data/coverage.test.ts` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `scripts/data/coverage.ts` exporting `coverageOf` and `renderCoverage`, with a CLI guard (`process.argv[1]?.endsWith("coverage.ts") === true`) that reads every `data/programs/*.yaml` with `yaml` `parse`, prints `renderCoverage(coverageOf(records))`, and exits 0. No Zod (it is a build-side script, not client code).
- [ ] **Step 4: Run to verify it passes**, then run `pnpm data:coverage` and check the DE/NL/FR columns equal the table in the design document (FR 757 / DE 147 / NL 55; tuition 733 / 42 / 11).
- [ ] **Step 5: Docs.** In `data/README.md`, section "Reading pages with cheap models": document `data:pages --topics` (one query per topic per institution, PDFs allowed, cap on pages per programme), PDF text (`pdf.ts`, 8 MB limit, scans unsupported), the `documents` fact, the enrichment commands (`data:evidence restage --enrich <dir>`, `data:evidence verify --enrich <dir>`) and the rule "enrichment never overwrites an official value and never touches requirements", and `pnpm data:coverage`. Keep it short and accurate.
- [ ] **Step 6: Verify and commit.** `pnpm typecheck && pnpm lint && pnpm test && pnpm data:check` — Expected: all green. Commit:

```bash
git add scripts/data/coverage.ts tests/scripts/data/coverage.test.ts package.json data/README.md
git commit -m "feat: data:coverage prints how many programmes hold each fact per country

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The run (controller only; paid APIs; the owner confirms the audit)

No subagent does this task: it uses `OPENCODE_API_KEY` and `SERPER_API_KEY` from `.env.local` (never read or printed), spends money, and ends with the owner reading the audit sample. Stop at every "Owner:" line and show the numbers. Models as in the earlier batches: reader `deepseek-v4.1-flash`, checker `qwen3.7-plus`.

- [ ] **Step 1: Baseline.** `pnpm data:coverage > data-staging/coverage-before.md` and keep it for the PR body.
- [ ] **Step 2: Slug lists.** `ls data/programs | grep -E '^(de|nl)-' | sed 's/\.yaml$//' > data-staging/enrich-slugs.txt` (expect 202 lines), and a sample of ten per country: `(grep '^de-' data-staging/enrich-slugs.txt | shuf -n 10 --random-source=<(yes); grep '^nl-' data-staging/enrich-slugs.txt | shuf -n 10 --random-source=<(yes)) > data-staging/enrich-sample.txt`.
- [ ] **Step 3: Dry runs (spend nothing).** `pnpm data:pages --slugs data-staging/enrich-slugs.txt --search --topics --max-queries 900 --dry-run` prints the query estimate; then, with a pages file produced for the sample in Step 4, `pnpm data:read --model deepseek-v4.1-flash --pages <file> --slugs data-staging/enrich-sample.txt --dry-run` prints the token and cost estimate. **Owner:** confirm the numbers are under the USD 10 cap.
- [ ] **Step 4: Sample run (about USD 0.50).** `pnpm data:pages --slugs data-staging/enrich-sample.txt --search --topics --max-queries 200 --out data-staging/pages-enrich-sample.json`, then `pnpm data:read --model deepseek-v4.1-flash --check qwen3.7-plus --pages data-staging/pages-enrich-sample.json --slugs data-staging/enrich-sample.txt --max-usd 1 --out data-staging/proposals-read/enrich-sample`. Print, per programme, the accepted facts with their quotes and the rejected ones with reasons (`calls.jsonl`, `raw/`), and show them. **Owner:** read the sample; decide whether quality is good enough to scale.
- [ ] **Step 5: Diagnose the rejected intakes** found in the earlier batches (27 of them) on real pages from the sample: for each rejected `intakes` date, show the quote and say whether the year is missing, the date format is not parsed, or the page genuinely does not say it. Report the split. Do not change `checkDeadline` unless the cause is a parsing gap with a test that proves it; a missing year stays rejected (a recurring-deadline data model is a separate owner decision).
- [ ] **Step 6: Full run (cap USD 8).** Same commands on `data-staging/enrich-slugs.txt` with `--max-queries 900`, `--max-usd 8`, `--out data-staging/proposals-read/enrich-full`. Report spend, programmes with at least one accepted fact per country, and facts accepted/rejected per kind.
- [ ] **Step 7: Enrich staging.** `mkdir -p data-staging/proposals-enrich && cp data-staging/proposals-read/enrich-full/*.json data-staging/proposals-enrich/` (top-level files only; `raw/` and `calls.jsonl` stay behind), then `pnpm data:evidence restage --enrich data-staging/proposals-enrich --slugs data-staging/enrich-slugs.txt`, `pnpm data:evidence verify --enrich data-staging/proposals-enrich --slugs data-staging/enrich-slugs.txt --dry-run`, and the same without `--dry-run`. Report how many records changed, which facts, and every "kept the existing official value" conflict.
- [ ] **Step 8: Audit.** `pnpm data:audit draw`, then `pnpm data:audit sheet` and show the sample records with their quotes. **Owner:** read them and answer "correct" (or name what is wrong). Only after that confirmation record the audit outcome as the operating notes in memory describe (scripted edit of `data-staging/AUDIT.csv`).
- [ ] **Step 9: Promote and check.** `pnpm data:promote --confirm-human-read --verified-on <today> --audited-batch --replace-revisions`, then `pnpm data:check` (0 errors, 0 warnings), `pnpm data:build`, `pnpm test`, `pnpm typecheck`, `pnpm lint`; `pnpm data:coverage > data-staging/coverage-after.md`.
- [ ] **Step 10: Report.** Open a draft PR from `feat/research-per-programme` with the before/after table, the spend, the per-kind hit rates, the list of programmes whose institution has no website (not searched), the held-out and still-unknown facts, and the owner decisions pending (recurring deadlines without a year; Plan B: scholarships). Stop. Do not start France without the owner's go-ahead.

---

## Self-review

- **Spec coverage:** topic searches and per-institution memo (Task 2); PDF pages (Task 1); `documents` fact (Task 3); scholarships moved to Plan B with the reason (design "Changes after reading the code"); enrichment of promoted records with restage, audit and promotion unchanged (Task 4, Task 6); dry-run, sample, full run under the USD 10 cap, coverage table, stop before France (Tasks 5 and 6); intake-rejection diagnosis (Task 6 Step 5); tests and gates in every task.
- **Placeholders:** Task 4's first test snippet is explicitly replaced by the enumerated list of ten tests; every other step has code or an exact command. The evidence-cli test additions are described precisely but follow the existing file's helpers, which the implementer must read first.
- **Types:** `Topic`, `TOPICS`, `discoverTopicPages`, `mergeTopicPages`, `DocumentProposal`, `recordValue`, `applyEnrichment`, `coverageOf`, `renderCoverage` are defined once and used with the same names.
