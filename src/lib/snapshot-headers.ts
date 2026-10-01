import type { NextConfig } from "next";

type HeaderRules = Awaited<ReturnType<NonNullable<NextConfig["headers"]>>>;

// Shards are content-hashed (s/<name>.<hash>.json), so they never change under one URL; the manifest
// is the only mutable pointer and must always be revalidated.
export const SNAPSHOT_HEADER_RULES: HeaderRules = [
  {
    source: "/snapshots/s/:path*",
    headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
  },
  {
    source: "/snapshots/manifest.json",
    headers: [{ key: "Cache-Control", value: "no-cache" }],
  },
];
