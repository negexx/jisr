export type SiteEnv = {
  siteUrl: string | null;
  indexable: boolean;
  snapshotBaseUrl: string | null;
  goatCounterUrl: string | null;
};

export class SiteEnvError extends Error {}

type RawEnv = Record<string, string | undefined>;

const SITE_URL = "NEXT_PUBLIC_SITE_URL";
const SNAPSHOT_BASE_URL = "NEXT_PUBLIC_SNAPSHOT_BASE_URL";
const GOATCOUNTER_URL = "NEXT_PUBLIC_GOATCOUNTER_URL";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const GOATCOUNTER_PATTERN = /^https:\/\/[a-z0-9-]+\.goatcounter\.com\/count$/;

function readTrimmed(env: RawEnv, name: string): string | undefined {
  const value = env[name]?.trim();
  return value === undefined || value === "" ? undefined : value;
}

function fail(name: string, why: string): never {
  throw new SiteEnvError(`${name}: ${why}`);
}

function parseAbsolute(name: string, raw: string): URL {
  try {
    return new URL(raw);
  } catch {
    return fail(name, `"${raw}" is not an absolute URL`);
  }
}

function parseSiteUrl(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const url = parseAbsolute(SITE_URL, raw);
  const local = LOCAL_HOSTS.has(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    return fail(SITE_URL, "must be https (http only for localhost)");
  }
  if (url.username !== "" || url.password !== "" || url.origin !== raw) {
    return fail(
      SITE_URL,
      "must be a bare origin: no credentials, path, query, hash or trailing slash",
    );
  }
  return url.origin;
}

// The browser (snapshotBaseUrl in src/lib/snapshot/use-snapshot.ts) uses the raw value untrimmed
// and builds `${base}/manifest.json`, so padding or a trailing slash would break every fetch.
function parseSnapshotBaseUrl(raw: string | undefined): string | null {
  if (raw === undefined || raw === "") return null;
  if (raw !== raw.trim()) return fail(SNAPSHOT_BASE_URL, "must not have surrounding whitespace");
  if (raw.includes("?") || raw.includes("#")) {
    return fail(SNAPSHOT_BASE_URL, "must not contain a query or hash");
  }
  if (raw.endsWith("/")) return fail(SNAPSHOT_BASE_URL, "must not end with a slash");
  if (raw.startsWith("/")) {
    if (raw.startsWith("//")) return fail(SNAPSHOT_BASE_URL, "must not be protocol-relative");
    return raw;
  }
  const url = parseAbsolute(SNAPSHOT_BASE_URL, raw);
  if (url.protocol !== "https:") return fail(SNAPSHOT_BASE_URL, "must be https or a /path");
  if (url.username !== "" || url.password !== "") {
    return fail(SNAPSHOT_BASE_URL, "must not contain credentials");
  }
  return raw;
}

function parseGoatCounterUrl(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  if (!GOATCOUNTER_PATTERN.test(raw)) {
    return fail(GOATCOUNTER_URL, "must look like https://<code>.goatcounter.com/count");
  }
  return raw;
}

export function readSiteEnv(env: RawEnv = process.env): SiteEnv {
  const siteUrl = parseSiteUrl(readTrimmed(env, SITE_URL));
  const snapshotBaseUrl = parseSnapshotBaseUrl(env[SNAPSHOT_BASE_URL]);
  const goatCounterUrl = parseGoatCounterUrl(readTrimmed(env, GOATCOUNTER_URL));
  const indexable = siteUrl !== null && env.VERCEL_ENV !== "preview";
  return {
    siteUrl,
    indexable,
    snapshotBaseUrl,
    goatCounterUrl: indexable ? goatCounterUrl : null,
  };
}
