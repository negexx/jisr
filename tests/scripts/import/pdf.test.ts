import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { isPdfUrl, MAX_PDF_BYTES, pdfBytesToText, pdfText } from "../../../scripts/import/pdf";

// A valid one-page PDF with a correct cross-reference table, built in memory (ASCII only).
export function makePdf(text: string): Uint8Array<ArrayBuffer> {
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
