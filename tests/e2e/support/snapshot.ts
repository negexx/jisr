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

// Same length, one letter changed inside a string VALUE (after a colon): the JSON stays well formed
// and keeps its keys, so only the SHA-256 check can tell that the bytes are not the published ones.
export function withCorruptedStringValue(body: Buffer): Buffer {
  const bytes = Buffer.from(body);
  const QUOTE = 0x22;
  const BACKSLASH = 0x5c;
  const COLON = 0x3a;
  let inString = false;
  let isValue = false;
  let previous = 0;
  for (let at = 0; at < bytes.length; at += 1) {
    const byte = bytes[at] ?? 0;
    if (inString) {
      if (byte === BACKSLASH) {
        at += 1;
      } else if (byte === QUOTE) {
        inString = false;
        previous = QUOTE;
      } else if (isValue && byte >= 0x61 && byte <= 0x7a) {
        bytes[at] = byte === 0x61 ? 0x62 : 0x61;
        return bytes;
      }
    } else if (byte === QUOTE) {
      inString = true;
      isValue = previous === COLON;
    } else if (byte > 0x20) {
      previous = byte;
    }
  }
  throw new Error("no string value with a lowercase letter to corrupt");
}
