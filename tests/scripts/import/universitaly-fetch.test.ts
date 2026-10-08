import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchPages,
  httpGet,
  PortalStopError,
  parsePages,
  readCache,
  searchUrl,
  writeCache,
} from "../../../scripts/import/sources/universitaly-fetch";

import { course, page } from "./universitaly-helpers";

const noSleep = async (): Promise<void> => {};

// A fake portal: `total` English courses, 10 per page, ids 1..total, all valid.
function fakePortal(
  total: number,
  over: (id: number) => Partial<ReturnType<typeof course>> = () => ({}),
) {
  const calls: string[] = [];
  const get = async (url: string): Promise<string> => {
    calls.push(url);
    const pageNo = Number(new URL(url).searchParams.get("page"));
    const ids = Array.from({ length: total }, (_v, i) => i + 1).slice(
      (pageNo - 1) * 10,
      pageNo * 10,
    );
    return JSON.stringify(
      page(
        ids.map((id) => course({ id, ...over(id) })),
        total,
        Math.ceil(total / 10),
        String(pageNo),
      ),
    );
  };
  return { get, calls };
}

describe("searchUrl", () => {
  it("asks for Triennale courses in a stable order, one page at a time", () => {
    const url = new URL(searchUrl("EN", 3));
    expect(url.origin + url.pathname).toBe(
      "https://universitaly-backend.cineca.it/api/offerta-formativa/cerca-corsi",
    );
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
    const pages = await fetchPages("IT", {
      get: portal.get,
      sleep: noSleep,
      delayMs: 0,
      maxPages: 60,
      firstOnly: true,
    });
    expect(pages).toHaveLength(1);
  });
  it("stops when the portal wants more pages than the safety limit", async () => {
    const portal = fakePortal(250);
    await expect(
      fetchPages("EN", { get: portal.get, sleep: noSleep, delayMs: 0, maxPages: 5 }),
    ).rejects.toThrow(PortalStopError);
  });
  it("stops, without retrying, when a request fails or the shape changed", async () => {
    const failing = async (): Promise<string> => {
      throw new PortalStopError("HTTP 403");
    };
    await expect(
      fetchPages("EN", { get: failing, sleep: noSleep, delayMs: 0, maxPages: 5 }),
    ).rejects.toThrow(/403/);
    const wrongShape = async (): Promise<string> => JSON.stringify({ universita: { corsi: [] } });
    await expect(
      fetchPages("EN", { get: wrongShape, sleep: noSleep, delayMs: 0, maxPages: 5 }),
    ).rejects.toThrow(/shape/);
    const notJson = async (): Promise<string> => "<html>blocked</html>";
    await expect(
      fetchPages("EN", { get: notJson, sleep: noSleep, delayMs: 0, maxPages: 5 }),
    ).rejects.toThrow(/shape|JSON/);
  });
});

describe("parsePages", () => {
  it("returns every course when the count and the ids are consistent", async () => {
    const portal = fakePortal(120);
    const pages = await fetchPages("EN", {
      get: portal.get,
      sleep: noSleep,
      delayMs: 0,
      maxPages: 60,
    });
    const parsed = parsePages("EN", pages);
    expect(parsed.totalResults).toBe(120);
    expect(parsed.courses).toHaveLength(120);
  });
  it("stops when courses repeat or go missing (an unstable order)", async () => {
    const portal = fakePortal(120, (id) => ({ id: id === 15 ? 5 : id }));
    const pages = await fetchPages("EN", {
      get: portal.get,
      sleep: noSleep,
      delayMs: 0,
      maxPages: 60,
    });
    expect(() => parsePages("EN", pages)).toThrow(/unique|repeat/);
  });
  it("stops when the total is implausible for the English search", async () => {
    const small = fakePortal(12);
    const pages = await fetchPages("EN", {
      get: small.get,
      sleep: noSleep,
      delayMs: 0,
      maxPages: 60,
    });
    expect(() => parsePages("EN", pages)).toThrow(/implausible/);
  });
  it("stops when the English search returns a course of another language", async () => {
    const portal = fakePortal(120, (id) => (id === 3 ? { lingua: "IT" } : {}));
    const pages = await fetchPages("EN", {
      get: portal.get,
      sleep: noSleep,
      delayMs: 0,
      maxPages: 60,
    });
    expect(() => parsePages("EN", pages)).toThrow(/language/);
  });
  it("accepts a single page of the Italian search and uses only its total", async () => {
    const portal = fakePortal(2713);
    const pages = await fetchPages("IT", {
      get: portal.get,
      sleep: noSleep,
      delayMs: 0,
      maxPages: 60,
      firstOnly: true,
    });
    const parsed = parsePages("IT", pages);
    expect(parsed.totalResults).toBe(2713);
  });
  it("stops when the Italian total is implausible", async () => {
    const portal = fakePortal(40);
    const pages = await fetchPages("IT", {
      get: portal.get,
      sleep: noSleep,
      delayMs: 0,
      maxPages: 60,
      firstOnly: true,
    });
    expect(() => parsePages("IT", pages)).toThrow(/implausible/);
  });
  it("stops when a page is dropped even though the ids are unique", async () => {
    const portal = fakePortal(120);
    const pages = await fetchPages("EN", {
      get: portal.get,
      sleep: noSleep,
      delayMs: 0,
      maxPages: 60,
    });
    const withoutPage2 = pages.filter((p) => p.page !== 2);
    expect(() => parsePages("EN", withoutPage2)).toThrow(/collected/);
  });
  it("accepts an English-search course taught in mixed languages", async () => {
    const portal = fakePortal(120, (id) => (id === 3 ? { lingua: "mu" } : {}));
    const pages = await fetchPages("EN", {
      get: portal.get,
      sleep: noSleep,
      delayMs: 0,
      maxPages: 60,
    });
    const parsed = parsePages("EN", pages);
    expect(parsed.courses.filter((c) => c.lingua === "mu")).toHaveLength(1);
  });
});

describe("httpGet", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it("stops on a 403 and names the status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("no", { status: 403 })),
    );
    await expect(httpGet("https://example.test/x")).rejects.toThrow(PortalStopError);
    await expect(httpGet("https://example.test/x")).rejects.toThrow(/403/);
  });
  it("sends the User-Agent header and returns the body on a 200", async () => {
    const stub = vi.fn(
      async (_url: string, _init?: RequestInit) => new Response("{}", { status: 200 }),
    );
    vi.stubGlobal("fetch", stub);
    await expect(httpGet("https://example.test/x")).resolves.toBe("{}");
    const headers = new Headers(stub.mock.calls[0]?.[1]?.headers);
    expect(headers.get("user-agent")).toMatch(/\S+/);
  });
});

describe("cache", () => {
  it("writes the raw pages with a manifest and reads them back, checking the hashes", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "uni-cache-"));
    const portal = fakePortal(30);
    const pages = await fetchPages("EN", {
      get: portal.get,
      sleep: noSleep,
      delayMs: 0,
      maxPages: 60,
    });
    await writeCache(dir, pages, "2026-10-08T10:00:00.000Z");
    const manifest = JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8")) as {
      fetchedAt: string;
      pages: { file: string }[];
    };
    expect(manifest.fetchedAt).toBe("2026-10-08T10:00:00.000Z");
    expect(manifest.pages.map((p) => p.file)).toEqual([
      "EN-page-001.json",
      "EN-page-002.json",
      "EN-page-003.json",
    ]);
    const back = await readCache(dir);
    expect(back.pages.map((p) => p.sha256)).toEqual(pages.map((p) => p.sha256));
    await writeFile(path.join(dir, "EN-page-002.json"), "tampered");
    await expect(readCache(dir)).rejects.toThrow(/sha256/);
  });
  it("removes the stale manifest and stale page files before writing a refresh", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "uni-cache-"));
    const portal = fakePortal(30);
    const pages = await fetchPages("EN", {
      get: portal.get,
      sleep: noSleep,
      delayMs: 0,
      maxPages: 60,
    });
    await writeCache(dir, pages, "2026-10-08T10:00:00.000Z");
    await writeFile(path.join(dir, "EN-page-009.json"), "stale");
    await writeFile(path.join(dir, "notes.txt"), "keep");
    await writeCache(dir, pages.slice(0, 2), "2026-10-09T10:00:00.000Z");
    expect((await readdir(dir)).sort()).toEqual([
      "EN-page-001.json",
      "EN-page-002.json",
      "manifest.json",
      "notes.txt",
    ]);
    expect((await readCache(dir)).pages).toHaveLength(2);
  });
  it("leaves no manifest when a refresh fails half way", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "uni-cache-"));
    const portal = fakePortal(30);
    const pages = await fetchPages("EN", {
      get: portal.get,
      sleep: noSleep,
      delayMs: 0,
      maxPages: 60,
    });
    await writeCache(dir, pages, "2026-10-08T10:00:00.000Z");
    // A directory where the second page file must go makes the second write fail.
    await rm(path.join(dir, "EN-page-002.json"));
    await mkdir(path.join(dir, "EN-page-002.json"));
    await expect(writeCache(dir, pages, "2026-10-09T10:00:00.000Z")).rejects.toThrow();
    await expect(readCache(dir)).rejects.toThrow(PortalStopError);
    await expect(readCache(dir)).rejects.toThrow(/manifest/);
  });
  it("stops with a clear message on a missing, malformed or incomplete cache", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "uni-cache-"));
    await expect(readCache(dir)).rejects.toThrow(/no manifest/);
    await writeFile(path.join(dir, "manifest.json"), "{not json");
    await expect(readCache(dir)).rejects.toThrow(PortalStopError);
    await writeFile(path.join(dir, "manifest.json"), JSON.stringify({ fetchedAt: "x", pages: [] }));
    await expect(readCache(dir)).rejects.toThrow(/manifest/);
    const bad = {
      fetchedAt: "2026-10-08T10:00:00.000Z",
      userAgent: "ua",
      pages: [
        {
          file: "../../etc/passwd",
          language: "EN",
          page: 1,
          url: "u",
          sha256: "a".repeat(64),
          bytes: 1,
        },
      ],
    };
    await writeFile(path.join(dir, "manifest.json"), JSON.stringify(bad));
    await expect(readCache(dir)).rejects.toThrow(PortalStopError);
    const missing = {
      ...bad,
      pages: [{ ...bad.pages[0], file: "EN-page-001.json" }],
    };
    await writeFile(path.join(dir, "manifest.json"), JSON.stringify(missing));
    await expect(readCache(dir)).rejects.toThrow(/EN-page-001\.json/);
  });
});
