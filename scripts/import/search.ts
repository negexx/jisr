import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Web search for page discovery: one interface over Serper (Google results) and Brave Search. A key
// is read from SERPER_API_KEY or BRAVE_API_KEY (env or .env.local; never logged, never in a URL,
// never echoed in an error). A hard QueryBudget caps the number of queries of a run.
export type SearchHit = { url: string; title: string; snippet: string };
export type SearchOptions = { country?: string; language?: string; count?: number };

export type SearchProvider = {
  name: string;
  // false when the provider's terms do not allow keeping its results (Brave): nothing is cached
  cacheable?: boolean;
  search(query: string, options?: SearchOptions): Promise<SearchHit[]>;
};

const text = (value: unknown): string => (typeof value === "string" ? value : "");
const obj = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

export function parseSerper(json: unknown): SearchHit[] {
  const organic = obj(json).organic;
  if (!Array.isArray(organic)) return [];
  return organic.flatMap((item) => {
    const r = obj(item);
    return text(r.link) === ""
      ? []
      : [{ url: text(r.link), title: text(r.title), snippet: text(r.snippet) }];
  });
}

export function parseBrave(json: unknown): SearchHit[] {
  const results = obj(obj(json).web).results;
  if (!Array.isArray(results)) return [];
  return results.flatMap((item) => {
    const r = obj(item);
    return text(r.url) === ""
      ? []
      : [{ url: text(r.url), title: text(r.title), snippet: text(r.description) }];
  });
}

export class SearchBudgetExceeded extends Error {}

export class QueryBudget {
  used = 0;
  constructor(private readonly max: number) {}

  take(): void {
    if (this.used >= this.max) {
      throw new SearchBudgetExceeded(`search budget reached: ${this.used} of ${this.max} queries`);
    }
    this.used++;
  }
}

function readKey(name: string): string {
  if (process.env[name] === undefined || process.env[name] === "") {
    try {
      (process as { loadEnvFile?: (p: string) => void }).loadEnvFile?.(".env.local");
    } catch {
      // no .env.local
    }
  }
  return process.env[name] ?? "";
}

type Deps = { fetchFn?: typeof fetch; retryDelayMs?: number };

async function request(deps: Deps, key: string, url: string, init: RequestInit): Promise<unknown> {
  const doFetch = deps.fetchFn ?? fetch;
  const redact = (body: string) => body.split(key).join("[redacted]");
  let last = "unknown error";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await doFetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
      if (response.ok) return await response.json();
      last = `HTTP ${response.status}: ${redact(await response.text()).slice(0, 200)}`;
      if (response.status !== 429 && response.status < 500) break;
    } catch (error) {
      last = redact(error instanceof Error ? error.message : String(error));
    }
    if (attempt < 3) await new Promise((r) => setTimeout(r, (deps.retryDelayMs ?? 1500) * attempt));
  }
  throw new Error(`search failed: ${last}`);
}

// The provider whose key is set (Serper first), or null when no key is available.
export function makeProvider(deps: Deps = {}): SearchProvider | null {
  const serper = readKey("SERPER_API_KEY");
  if (serper !== "") {
    return {
      name: "serper",
      cacheable: true,
      search: async (query, options = {}) =>
        parseSerper(
          await request(deps, serper, "https://google.serper.dev/search", {
            method: "POST",
            headers: { "X-API-KEY": serper, "content-type": "application/json" },
            body: JSON.stringify({
              q: query,
              num: options.count ?? 8,
              ...(options.country === undefined ? {} : { gl: options.country.toLowerCase() }),
              ...(options.language === undefined ? {} : { hl: options.language }),
            }),
          }),
        ),
    };
  }
  const brave = readKey("BRAVE_API_KEY");
  if (brave !== "") {
    return {
      name: "brave",
      cacheable: false,
      search: async (query, options = {}) => {
        const params = new URLSearchParams({ q: query, count: String(options.count ?? 8) });
        if (options.country !== undefined) params.set("country", options.country.toUpperCase());
        if (options.language !== undefined) params.set("search_lang", options.language);
        return parseBrave(
          await request(deps, brave, `https://api.search.brave.com/res/v1/web/search?${params}`, {
            method: "GET",
            headers: { "X-Subscription-Token": brave, accept: "application/json" },
          }),
        );
      },
    };
  }
  return null;
}

// Answers a repeated query from disk. With no directory nothing is kept.
export function withCache(provider: SearchProvider, dir: string | null): SearchProvider {
  if (dir === null) return provider;
  return {
    name: provider.name,
    ...(provider.cacheable === undefined ? {} : { cacheable: provider.cacheable }),
    search: async (query, options) => {
      const key = createHash("sha1")
        .update(`${provider.name}|${query}|${JSON.stringify(options ?? {})}`)
        .digest("hex");
      const file = path.join(dir, `${key}.json`);
      if (existsSync(file)) return JSON.parse(await readFile(file, "utf8")) as SearchHit[];
      const hits = await provider.search(query, options);
      await mkdir(dir, { recursive: true });
      await writeFile(file, JSON.stringify(hits));
      return hits;
    },
  };
}
