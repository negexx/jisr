import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

export function sha256Hex(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

export function shortHash(hex: string): string {
  return hex.slice(0, 12);
}

export function gzipSize(data: Uint8Array): number {
  return gzipSync(data, { level: 9 }).length;
}
