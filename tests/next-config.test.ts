import { describe, expect, it } from "vitest";

import nextConfig from "../next.config";

async function cacheControlFor(source: string): Promise<string | undefined> {
  const rules = (await nextConfig.headers?.()) ?? [];
  const rule = rules.find((candidate) => candidate.source === source);
  return rule?.headers.find((header) => header.key === "Cache-Control")?.value;
}

describe("next.config snapshot cache headers", () => {
  it("serves hashed shards as immutable for a year", async () => {
    expect(await cacheControlFor("/snapshots/s/:path*")).toBe(
      "public, max-age=31536000, immutable",
    );
  });

  it("makes the manifest revalidate on every load", async () => {
    expect(await cacheControlFor("/snapshots/manifest.json")).toBe("no-cache");
  });
});

describe("next.config site environment", () => {
  // Importing the config runs readSiteEnv(), which throws on a malformed deployment variable.
  it("loads with the current environment", () => {
    expect(nextConfig).toBeDefined();
  });
});

describe("next.config not-found page", () => {
  // Without it every unmatched URL gets Next's bare English 404 with no lang (src/app/global-not-found.tsx).
  it("turns on the experimental global-not-found page", () => {
    expect(nextConfig.experimental?.globalNotFound).toBe(true);
  });
});
