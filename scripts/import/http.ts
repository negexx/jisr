import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const CACHE_DIR = ".cache/import";
const USER_AGENT = "jisr-data-importer/0.1 (+https://github.com/negexx/jisr; non-commercial, EU)";
const MAX_ATTEMPTS = 4;
const TIMEOUT_MS = 90_000;

export type FetchOptions = {
  accept?: string;
  // Ignore the cache (also set by JISR_IMPORT_REFRESH=1, which `pnpm data:import --refresh` sets).
  refresh?: boolean;
  // Throws when the body is unusable; a bad body is never cached.
  validate?: (body: string) => void;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cachePath(url: string): string {
  return path.join(CACHE_DIR, `${createHash("sha1").update(url).digest("hex")}.txt`);
}

function retryDelayMs(response: Response | null, attempt: number): number {
  const header = Number(response?.headers.get("retry-after"));
  if (Number.isFinite(header) && header > 0) return Math.min(header, 120) * 1000;
  return 2000 * 2 ** (attempt - 1);
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
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response: Response | null = null;
    try {
      response = await fetch(url, {
        headers: { "user-agent": USER_AGENT, accept: options.accept ?? "*/*" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (response.ok) {
        const body = await response.text();
        options.validate?.(body);
        await mkdir(CACHE_DIR, { recursive: true });
        const temp = `${file}.${process.pid}.tmp`;
        await writeFile(temp, body);
        await rename(temp, file);
        return body;
      }
      lastError = `HTTP ${response.status}`;
      if (response.status !== 429 && response.status < 500) break;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    if (attempt < MAX_ATTEMPTS) await sleep(retryDelayMs(response, attempt));
  }
  throw new Error(`GET ${url} failed: ${lastError}`);
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
