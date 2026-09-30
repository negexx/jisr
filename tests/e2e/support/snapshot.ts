import type { Page } from "@playwright/test";

import type { Manifest } from "@/data-schema/snapshot";
import { parseManifest } from "@/lib/snapshot/manifest";

export const MANIFEST_URL = "**/snapshots/manifest.json";
export const SHARD_URLS = "**/snapshots/s/**";

// The manifest the production build serves, read through the page's own request context.
export async function readManifest(page: Page): Promise<Manifest> {
  const response = await page.request.get("/snapshots/manifest.json");
  return parseManifest(await response.json());
}

export function withoutProgramShards(manifest: Manifest): Manifest {
  const shards = Object.fromEntries(
    Object.entries(manifest.shards).filter(([name]) => !name.includes("programs.")),
  );
  return { ...manifest, shards };
}

export function shardPath(manifest: Manifest, name: string): string {
  const entry = manifest.shards[name];
  if (entry === undefined) throw new Error(`shard ${name} is not in the manifest`);
  return `/snapshots/${entry.file}`;
}
