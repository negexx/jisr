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
  try {
    const { text } = await extractText(pdf, { mergePages: true });
    return text.replace(/\s+/g, " ").trim();
  } finally {
    // The proxy has no destroy() in the installed pdfjs; the loading task releases the document and
    // its worker (what unpdf itself does for documents it opens).
    await pdf.loadingTask.destroy();
  }
}

export type PdfDeps = { fetchFn?: typeof fetch; cacheDir?: string };

const pdfCacheFile = (url: string, deps: PdfDeps): string =>
  path.join(deps.cacheDir ?? CACHE_DIR, `${createHash("sha1").update(url).digest("hex")}.pdf.txt`);

// The extracted text of a PDF already fetched for this url, or null.
export async function cachedPdfText(url: string, deps: PdfDeps = {}): Promise<string | null> {
  const file = pdfCacheFile(url, deps);
  if (process.env.JISR_IMPORT_REFRESH === "1" || !existsSync(file)) return null;
  return readFile(file, "utf8");
}

// One polite GET per url (cached as text next to the HTML cache, `.pdf.txt`); no retries: a PDF
// that does not load is reported by the caller like any page that cannot be fetched.
export async function pdfText(url: string, deps: PdfDeps = {}): Promise<string> {
  if (!url.startsWith("https://")) throw new Error("evidence pages must be https");
  const dir = deps.cacheDir ?? CACHE_DIR;
  const file = pdfCacheFile(url, deps);
  const cached = await cachedPdfText(url, deps);
  if (cached !== null) return cached;
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
