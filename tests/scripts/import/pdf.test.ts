import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  cachedPdfText,
  isPdfCached,
  isPdfUrl,
  MAX_PDF_BYTES,
  pdfBytesToText,
  pdfText,
} from "../../../scripts/import/pdf";
import { makePdf } from "./pdf-fixture";

const pdfResponse = (
  bytes: Uint8Array<ArrayBuffer>,
  headers: Record<string, string> = {},
): Response => new Response(bytes, { status: 200, headers });

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

  it("with refresh, asks again instead of serving the cached text, and refreshes the cache", async () => {
    const cacheDir = await mkdtemp(path.join(tmpdir(), "pdf-"));
    let version = "Fee: EUR 100 per year";
    let calls = 0;
    const fetchFn = (async () => {
      calls++;
      return pdfResponse(makePdf(version));
    }) as typeof fetch;
    const url = "https://uni.example/fees.pdf";
    expect(isPdfCached(url, { cacheDir })).toBe(false);
    expect(await pdfText(url, { fetchFn, cacheDir })).toContain("EUR 100");
    expect(isPdfCached(url, { cacheDir })).toBe(true);
    version = "Fee: EUR 120 per year";
    expect(await pdfText(url, { fetchFn, cacheDir, refresh: true })).toContain("EUR 120");
    expect(calls).toBe(2);
    expect(await cachedPdfText(url, { cacheDir, refresh: true })).toBeNull();
    expect(await cachedPdfText(url, { cacheDir })).toContain("EUR 120");
    expect(isPdfCached(url, { cacheDir, refresh: true })).toBe(false);
  });

  it("refuses a body that is not a PDF", async () => {
    const cacheDir = await mkdtemp(path.join(tmpdir(), "pdf-"));
    const fetchFn = (async () =>
      new Response("<html>nope</html>", { status: 200 })) as typeof fetch;
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
