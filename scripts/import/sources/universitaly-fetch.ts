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
    throw new PortalStopError(
      `Universitaly answered something that is not JSON for ${url}: the shape changed or the request was blocked`,
    );
  }
  const parsed = PortalPageSchema.safeParse(json);
  if (!parsed.success) {
    throw new PortalStopError(
      `Universitaly response shape changed for ${url}: ${parsed.error.issues[0]?.message ?? "invalid"} at ${parsed.error.issues[0]?.path.join(".") ?? ""}`,
    );
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
    pages.push({
      language,
      page: pageNo,
      url,
      body,
      sha256: sha256(body),
      bytes: Buffer.byteLength(body),
    });
    return parsed.universita.totalPages;
  };
  const totalPages = await fetchOne(1);
  if (options.firstOnly === true) return pages;
  if (totalPages > options.maxPages) {
    throw new PortalStopError(
      `Universitaly reports ${totalPages} pages, more than the safety limit of ${options.maxPages}: stop and tell the owner`,
    );
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
    throw new PortalStopError(
      `Universitaly reports ${totalResults} English courses, an implausible number (expected ${EN_MIN}..${EN_MAX}): the response shape or the filter changed`,
    );
  }
  const ids = new Set(courses.map((c) => c.id));
  if (ids.size !== courses.length) {
    throw new PortalStopError(
      `Universitaly returned repeated courses (${courses.length} rows, ${ids.size} unique ids): the paging order is not stable`,
    );
  }
  if (courses.length !== totalResults) {
    throw new PortalStopError(
      `Universitaly reported ${totalResults} courses but ${courses.length} were collected: pages are missing or the order is not stable`,
    );
  }
  const stray = courses.find((c) => c.lingua !== "EN" && c.lingua !== "mu");
  if (stray !== undefined) {
    throw new PortalStopError(
      `the English search returned course ${stray.id} with language "${stray.lingua}": the language filter changed`,
    );
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

export async function writeCache(
  dir: string,
  pages: FetchedPage[],
  fetchedAt: string,
): Promise<void> {
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
  await writeFile(
    path.join(dir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
}

export async function readCache(dir: string): Promise<{ fetchedAt: string; pages: FetchedPage[] }> {
  const manifest = JSON.parse(
    await readFile(path.join(dir, "manifest.json"), "utf8"),
  ) as CacheManifest;
  const pages: FetchedPage[] = [];
  for (const entry of manifest.pages) {
    const body = await readFile(path.join(dir, entry.file), "utf8");
    if (sha256(body) !== entry.sha256) {
      throw new PortalStopError(
        `cached file ${entry.file} does not match its sha256 in the manifest: the cache was modified`,
      );
    }
    pages.push({
      language: entry.language,
      page: entry.page,
      url: entry.url,
      body,
      sha256: entry.sha256,
      bytes: entry.bytes,
    });
  }
  return { fetchedAt: manifest.fetchedAt, pages };
}
