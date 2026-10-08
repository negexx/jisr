// Pure checks behind `pnpm ops:smoke` (see run.ts and smoke.ts). Nothing here touches the network,
// and no check ever returns a header value, a body or a URL: a result carries a check name and a
// short fixed reason, so a smoke log is safe to paste anywhere.

export type CheckResult = { name: string; ok: boolean; reason: string | null };

export const SMOKE_LOCALES = ["fr", "en", "ar"] as const;
export type SmokeLocale = (typeof SMOKE_LOCALES)[number];

// The sitemap lists (3 paths + every programme) x 3 locales, about 3,400 URLs today. A floor far
// below that still catches an empty or truncated sitemap.
export const MIN_INDEXABLE_SITEMAP_URLS = 3000;

function pass(name: string): CheckResult {
  return { name, ok: true, reason: null };
}

function fail(name: string, reason: string): CheckResult {
  return { name, ok: false, reason };
}

function verdict(name: string, failure: string | null): CheckResult {
  return failure === null ? pass(name) : fail(name, failure);
}

export function checkStatus(name: string, status: number, expected: number): CheckResult {
  return verdict(name, status === expected ? null : `expected ${expected}, got ${status}`);
}

function isRedirectStatus(status: number): boolean {
  return status === 307 || status === 308;
}

// `location` may be absolute or relative; only its path is inspected.
export function checkLocaleRedirect(
  name: string,
  status: number,
  location: string | null,
  baseUrl: string,
  expectedLocale: SmokeLocale | null,
): CheckResult {
  if (!isRedirectStatus(status)) return fail(name, `expected 307 or 308, got ${status}`);
  if (location === null) return fail(name, "no Location header");
  let pathname: string;
  try {
    pathname = new URL(location, baseUrl).pathname;
  } catch {
    return fail(name, "Location is not a URL");
  }
  const target = SMOKE_LOCALES.find((locale) => pathname === `/${locale}`);
  if (target === undefined) return fail(name, "Location is not a locale home");
  if (expectedLocale !== null && target !== expectedLocale) {
    return fail(name, `expected /${expectedLocale}`);
  }
  return pass(name);
}

function htmlTag(html: string): string | null {
  return /<html\b[^>]*>/i.exec(html)?.[0] ?? null;
}

function attribute(tag: string, attr: string): string | null {
  return new RegExp(`\\s${attr}="([^"]*)"`, "i").exec(tag)?.[1] ?? null;
}

export function checkHtmlPage(
  name: string,
  status: number,
  contentType: string | null,
  html: string,
  locale: SmokeLocale,
): CheckResult {
  if (status !== 200) return fail(name, `expected 200, got ${status}`);
  if (contentType === null || !contentType.toLowerCase().includes("text/html")) {
    return fail(name, "content-type is not html");
  }
  const tag = htmlTag(html);
  if (tag === null) return fail(name, "no <html> tag");
  if (attribute(tag, "lang") !== locale) return fail(name, `<html lang> is not ${locale}`);
  const expectedDir = locale === "ar" ? "rtl" : "ltr";
  if (attribute(tag, "dir") !== expectedDir) return fail(name, `<html dir> is not ${expectedDir}`);
  return pass(name);
}

// global-not-found speaks all three languages, so an Arabic block is present on every 404.
export function checkNotFound(name: string, status: number, html: string): CheckResult {
  if (status !== 404) return fail(name, `expected 404, got ${status}`);
  if (!html.includes('lang="ar"')) return fail(name, "trilingual 404 marker missing");
  return pass(name);
}

export function checkHeaders(headers: Headers, expectIndexable: boolean): CheckResult[] {
  const results: CheckResult[] = [];
  const check = (header: string, accepts: (value: string) => boolean, reason: string) => {
    const value = headers.get(header);
    const name = `header ${header}`;
    if (value === null) results.push(fail(name, "missing"));
    else results.push(accepts(value) ? pass(name) : fail(name, reason));
  };
  check("strict-transport-security", (v) => /max-age=\d+/.test(v), "no max-age");
  check("x-content-type-options", (v) => v.toLowerCase() === "nosniff", "not nosniff");
  check("referrer-policy", (v) => v === "strict-origin-when-cross-origin", "unexpected policy");
  check("permissions-policy", (v) => v.includes("camera=()"), "camera not denied");
  check(
    "content-security-policy",
    (v) => v.includes("frame-ancestors 'none'"),
    "no frame-ancestors",
  );

  const robotsTag = headers.get("x-robots-tag");
  const marksNoindex = robotsTag?.toLowerCase().includes("noindex") === true;
  const name = "header x-robots-tag";
  if (expectIndexable) {
    results.push(marksNoindex ? fail(name, "noindex on an indexable site") : pass(name));
  } else {
    results.push(marksNoindex ? pass(name) : fail(name, "noindex missing"));
  }
  return results;
}

export function checkCacheControl(
  name: string,
  headers: Headers,
  mustInclude: "no-cache" | "immutable",
): CheckResult {
  const value = headers.get("cache-control");
  if (value === null) return fail(name, "missing");
  return verdict(name, value.toLowerCase().includes(mustInclude) ? null : `not ${mustInclude}`);
}

export function checkRobots(body: string, expectIndexable: boolean): CheckResult {
  const name = "robots.txt";
  const disallowsAll = /^disallow:\s*\/\s*$/im.test(body);
  const allowsAll = /^allow:\s*\/\s*$/im.test(body);
  const sitemapLine = /^sitemap:\s*\S+\/sitemap\.xml\s*$/im.test(body);
  if (!expectIndexable) {
    if (!disallowsAll) return fail(name, "no Disallow: /");
    return verdict(name, allowsAll || sitemapLine ? "allows crawling" : null);
  }
  if (disallowsAll) return fail(name, "Disallow: / on an indexable site");
  if (!allowsAll) return fail(name, "no Allow: /");
  return verdict(name, sitemapLine ? null : "no Sitemap line");
}

export function sitemapUrlCount(xml: string): number {
  return xml.match(/<url>/g)?.length ?? 0;
}

const PERSONAL_SHELL_PATH = /<loc>[^<]*\/(?:matches|plan|compare)(?:\/[^<]*)?<\/loc>/;

export function checkSitemap(xml: string, expectIndexable: boolean): CheckResult {
  const name = "sitemap.xml";
  const count = sitemapUrlCount(xml);
  if (!expectIndexable) return verdict(name, count === 0 ? null : "has URLs on a noindex site");
  if (count <= MIN_INDEXABLE_SITEMAP_URLS) return fail(name, `only ${count} URLs`);
  if (!xml.includes('hreflang="x-default"')) return fail(name, "no x-default alternate");
  if (PERSONAL_SHELL_PATH.test(xml)) return fail(name, "lists a personal-shell page");
  return pass(name);
}

// First programme page the sitemap lists, as a path (the sitemap's origin may differ from the host
// being tested, for example a localhost build that names http://localhost:3101).
export function firstProgramPathInSitemap(xml: string): string | null {
  const loc = /<loc>([^<]*\/(?:fr|en|ar)\/programs\/[^<]+)<\/loc>/.exec(xml)?.[1];
  if (loc === undefined) return null;
  try {
    return new URL(loc).pathname;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type ManifestFiles = { programsShard: string | null; coreShard: string | null };

// Shard keys are "core" and "programs.<DESTINATION>.<field>" (src/lib/snapshot/manifest.ts); each
// entry's `file` is relative to the snapshots directory.
export function manifestFiles(manifest: unknown): ManifestFiles {
  const files: ManifestFiles = { programsShard: null, coreShard: null };
  if (!isRecord(manifest) || !isRecord(manifest.shards)) return files;
  for (const [key, entry] of Object.entries(manifest.shards)) {
    if (!isRecord(entry) || typeof entry.file !== "string") continue;
    if (key === "core") files.coreShard = entry.file;
    if (key.startsWith("programs.") && files.programsShard === null) {
      files.programsShard = entry.file;
    }
  }
  return files;
}

export function firstProgramSlugInShard(shard: unknown): string | null {
  if (!isRecord(shard) || !Array.isArray(shard.programs)) return null;
  for (const program of shard.programs) {
    if (isRecord(program) && typeof program.slug === "string" && program.slug !== "") {
      return program.slug;
    }
  }
  return null;
}
