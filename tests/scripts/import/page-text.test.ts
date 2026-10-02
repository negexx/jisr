import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { type PageTextDeps, pageText } from "../../../scripts/import/evidence";
import type { FetchOptions } from "../../../scripts/import/http";
import { pdfText } from "../../../scripts/import/pdf";
import { makePdf } from "./pdf-fixture";

const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

// Stands in for the cached HTTP fetch: runs the caller's validate like the real one does.
const fakeFetchHtml =
  (body: string): NonNullable<PageTextDeps["fetchHtml"]> =>
  async (_url: string, options: FetchOptions = {}) => {
    options.validate?.(body);
    return body;
  };

describe("pageText", () => {
  it("returns the visible text of a normal HTML page", async () => {
    const fetchHtml = fakeFetchHtml("<html><body><p>Tuition fee: 1,500 EUR</p></body></html>");
    expect(await pageText("https://uni.example/fees", { fetchHtml })).toBe(
      "Tuition fee: 1,500 EUR",
    );
  });

  it("extracts the text of a PDF served from an extensionless url", async () => {
    const cacheDir = await mkdtemp(path.join(tmpdir(), "page-text-"));
    const pdfBody = decode(makePdf("Application deadline: 15 July 2026"));
    const fetchFn = (async () =>
      new Response(makePdf("Application deadline: 15 July 2026"))) as typeof fetch;
    const text = await pageText("https://uni.example/download?id=42", {
      fetchHtml: fakeFetchHtml(pdfBody),
      pdfDeps: { fetchFn, cacheDir },
    });
    expect(text).toContain("Application deadline: 15 July 2026");
  });

  it("uses the cached PDF text before fetching the page again", async () => {
    const cacheDir = await mkdtemp(path.join(tmpdir(), "page-text-"));
    const url = "https://uni.example/download?id=7";
    const fetchFn = (async () =>
      new Response(makePdf("Fees are due in March 2026"))) as typeof fetch;
    await pdfText(url, { fetchFn, cacheDir });
    const fetchHtml = async (): Promise<string> => {
      throw new Error("the page must not be fetched");
    };
    expect(await pageText(url, { fetchHtml, pdfDeps: { cacheDir } })).toContain(
      "Fees are due in March 2026",
    );
  });

  it("refuses a binary body that is not a PDF", async () => {
    const binary = `PK${"�".repeat(200)} some text`;
    await expect(
      pageText("https://uni.example/archive", { fetchHtml: fakeFetchHtml(binary) }),
    ).rejects.toThrow(/not a text page/);
  });

  it("tolerates a stray replacement character in a long page", async () => {
    const body = `<p>${"Informatik studieren ".repeat(100)}�</p>`;
    expect(await pageText("https://uni.example/a", { fetchHtml: fakeFetchHtml(body) })).toContain(
      "Informatik studieren",
    );
  });
});
