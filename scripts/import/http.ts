import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const CACHE_DIR = ".cache/import";
export const USER_AGENT =
  "jisr-data-importer/0.1 (+https://github.com/negexx/jisr; non-commercial, EU)";
const MAX_ATTEMPTS = 4;

// A response that arrived but is unusable (wrong shape, truncated): fail at once, do not retry.
class ValidationError extends Error {}

// A final HTTP error status, so callers can tell "slow down" (429) and "blocked" (403) from the rest.
export class HttpStatusError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "HttpStatusError";
  }
}
const TIMEOUT_MS = 90_000;

export type FetchOptions = {
  accept?: string;
  // Ignore the cache (also set by JISR_IMPORT_REFRESH=1, which `pnpm data:import --refresh` sets).
  refresh?: boolean;
  // Retry policy for flaky hosts: attempts (default 4) and the first backoff in ms (default 2000).
  attempts?: number;
  retryDelayMs?: number;
  // Extra request headers (an API key, for instance).
  headers?: Record<string, string>;
  // Character encoding of the response body (some official files are cp1252 / latin1).
  encoding?: string;
  // Throws when the body is unusable; a bad body is never cached.
  validate?: (body: string) => void;
};

// Bytes 0x80-0x9F in windows-1252 (punctuation such as the en dash at 0x96). Node's built-in
// "windows-1252" decoder treats them as C1 control codes, which would corrupt names and break YAML.
const CP1252_HIGH =
  "\u20ac\u0081\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u008d\u017d\u008f\u0090\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u009d\u017e\u0178";

export function decodeBytes(bytes: Uint8Array, encoding = "utf-8"): string {
  const decoder = new TextDecoder(encoding);
  // "latin1" and "iso-8859-1" are labels of windows-1252 in the WHATWG standard, with the same bug.
  if (decoder.encoding !== "windows-1252") return decoder.decode(bytes);
  let out = "";
  for (const byte of bytes) {
    out +=
      byte >= 0x80 && byte <= 0x9f ? CP1252_HIGH.charAt(byte - 0x80) : String.fromCharCode(byte);
  }
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function cachePath(url: string, cacheDir = CACHE_DIR): string {
  return path.join(cacheDir, `${createHash("sha1").update(url).digest("hex")}.txt`);
}

// True when `fetchText` would answer from the cache (no request). A refresh always requests.
export function isCached(
  url: string,
  options: { refresh?: boolean; cacheDir?: string } = {},
): boolean {
  const refresh = options.refresh === true || process.env.JISR_IMPORT_REFRESH === "1";
  return !refresh && existsSync(cachePath(url, options.cacheDir));
}

function retryDelayMs(response: Response | null, attempt: number, base: number): number {
  const header = Number(response?.headers.get("retry-after"));
  if (Number.isFinite(header) && header > 0) return Math.min(header, 120) * 1000;
  return base * 2 ** (attempt - 1);
}

// Polite, cached GET: one request per URL per cache lifetime. Retries network errors, 429 and 5xx
// (honouring Retry-After), times out, and only caches a body that passed `validate`.
export async function fetchText(url: string, options: FetchOptions = {}): Promise<string> {
  const file = cachePath(url);
  const refresh = options.refresh === true || process.env.JISR_IMPORT_REFRESH === "1";
  if (!refresh && existsSync(file)) {
    const cached = await readFile(file, "utf8");
    try {
      options.validate?.(cached);
      return cached;
    } catch {
      // a cache entry from an older run that no longer validates: fetch again
    }
  }

  let lastError = "unknown error";
  let lastStatus: number | null = null;
  const maxAttempts = options.attempts ?? MAX_ATTEMPTS;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let response: Response | null = null;
    try {
      response = await fetch(url, {
        headers: { "user-agent": USER_AGENT, accept: options.accept ?? "*/*", ...options.headers },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (response.ok) {
        const body = decodeBytes(new Uint8Array(await response.arrayBuffer()), options.encoding);
        try {
          options.validate?.(body);
        } catch (error) {
          // The server answered with something unusable: retrying will not change that.
          throw new ValidationError(
            `GET ${url}: ${error instanceof Error ? error.message : error}`,
          );
        }
        await mkdir(CACHE_DIR, { recursive: true });
        const temp = `${file}.${process.pid}.tmp`;
        await writeFile(temp, body);
        await rename(temp, file);
        return body;
      }
      lastError = `HTTP ${response.status}`;
      lastStatus = response.status;
      if (response.status !== 429 && response.status < 500) break;
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      lastError = error instanceof Error ? error.message : String(error);
      lastStatus = null;
    }
    if (attempt < maxAttempts) {
      await sleep(retryDelayMs(response, attempt, options.retryDelayMs ?? 2000));
    }
  }
  const message = `GET ${url} failed: ${lastError}`;
  throw lastStatus === null ? new Error(message) : new HttpStatusError(message, lastStatus);
}

export async function fetchJson(url: string, options: FetchOptions = {}): Promise<unknown> {
  const body = await fetchText(url, {
    accept: "application/json",
    ...options,
    validate: (text) => {
      JSON.parse(text);
      options.validate?.(text);
    },
  });
  return JSON.parse(body);
}

const PROBE_CACHE = path.join(CACHE_DIR, "https-probe.json");

type ProbeFetch = (url: string, init: RequestInit) => Promise<Response>;
export type ProbeOptions = {
  concurrency?: number;
  cacheFile?: string;
  refresh?: boolean;
  fetchImpl?: ProbeFetch;
};

async function readProbeCache(file: string): Promise<Record<string, string>> {
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(await readFile(file, "utf8")) as Record<string, string>;
  } catch {
    return {};
  }
}

// For a website given as "http://host/", "host" or "www.host": returns the final https URL (query
// and fragment removed) if requesting the https form works after redirects, else null. It proves
// only that the address answers over https: the final host can differ from the listed one, and a
// human still confirms it is the right site. Only successes are cached; failures are retried on the
// next run (a timeout or a bot block is not proof that https is unavailable).
export async function probeHttps(
  urls: readonly string[],
  options: ProbeOptions = {},
): Promise<Map<string, string | null>> {
  const file = options.cacheFile ?? PROBE_CACHE;
  const refresh = options.refresh === true || process.env.JISR_IMPORT_REFRESH === "1";
  const request: ProbeFetch = options.fetchImpl ?? ((url, init) => fetch(url, init));
  const cache = refresh ? {} : await readProbeCache(file);
  const todo = urls.filter((u) => !(u in cache));
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const url = todo[next++];
      if (url === undefined) return;
      const host = url.replace(/^https?:\/\//, "");
      try {
        const response = await request(`https://${host}`, {
          method: "GET",
          redirect: "follow",
          headers: { "user-agent": USER_AGENT },
          signal: AbortSignal.timeout(15_000),
        });
        await response.body?.cancel();
        if (response.ok && response.url.startsWith("https://")) {
          const final = new URL(response.url);
          final.search = "";
          final.hash = "";
          cache[url] = final.toString();
        }
      } catch {
        // not cached: retried on the next run
      }
    }
  };
  await Promise.all(Array.from({ length: options.concurrency ?? 8 }, worker));
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(cache));
  return new Map(urls.map((u) => [u, cache[u] ?? null]));
}
