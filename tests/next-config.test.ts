import { describe, expect, it } from "vitest";

import nextConfig from "../next.config";

async function cacheControlFor(source: string): Promise<string | undefined> {
  const resolved = await nextConfig("phase-production-build", {});
  const rules = (await resolved.headers?.()) ?? [];
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
