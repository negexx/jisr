import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { IsoDate } from "@/data-schema/dates";
import { LOCALES } from "@/data-schema/primitives";
import type { Manifest } from "@/data-schema/snapshot";
import {
  ManifestSchema,
  SHARD_GZIP_BUDGET_BYTES,
  SNAPSHOT_FORMAT_VERSION,
} from "@/data-schema/snapshot";

import { BuildError } from "./build-error";
import { canonicalJson } from "./canonical-json";
import { gzipSize, sha256Hex, shortHash } from "./hash";
import type { Issue } from "./load-data";
import { loadData } from "./load-data";
import { issueLine } from "./report";
import { resolveCatalog } from "./resolve";
import { buildShards } from "./shard";
import { validateData } from "./validate";

export { BuildError } from "./build-error";

export type BuildOptions = {
  dataDir: string;
  outDir: string;
  generatedAt: string;
  gzipBudgetBytes?: number;
  now: IsoDate;
};

type Rendered = { name: string; file: string; bytes: Buffer; sha256: string; gzipBytes: number };

// Returns the gzip size so the caller does not compress the same bytes twice.
export function assertShardBudget(name: string, bytes: Uint8Array, budget: number): number {
  const gzipBytes = gzipSize(bytes);
  if (gzipBytes > budget) {
    throw new BuildError(
      `shard ${name} is ${gzipBytes} bytes gzipped, over the ${budget} byte budget`,
    );
  }
  return gzipBytes;
}

function requireDataDir(dataDir: string): void {
  if (statSync(dataDir, { throwIfNoEntry: false })?.isDirectory() !== true) {
    // An existing empty dir is a valid empty catalogue; a missing one must never publish one.
    throw new BuildError(`data directory not found: ${dataDir}`);
  }
}

const LISTED_ERRORS = 5;

function invalidDataMessage(errors: readonly Issue[]): string {
  const sorted = [...errors].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  const lines = sorted.slice(0, LISTED_ERRORS).map((issue) => issueLine("ERROR", issue));
  const more = sorted.length - lines.length;
  return [
    "data is invalid; run pnpm data:check",
    ...lines,
    ...(more > 0 ? [`... and ${more} more`] : []),
  ].join("\n");
}

function renderShards(opts: BuildOptions): Rendered[] {
  requireDataDir(opts.dataDir);
  const validation = validateData(loadData(opts.dataDir), { now: opts.now });
  if (validation.errors.length > 0) throw new BuildError(invalidDataMessage(validation.errors));

  const budget = opts.gzipBudgetBytes ?? SHARD_GZIP_BUDGET_BYTES;
  return buildShards(resolveCatalog(validation.catalog)).map(({ name, shard }) => {
    const bytes = Buffer.from(canonicalJson(shard), "utf8");
    const sha256 = sha256Hex(bytes);
    return {
      name,
      file: `s/${name}.${shortHash(sha256)}.json`,
      bytes,
      sha256,
      gzipBytes: assertShardBudget(name, bytes, budget),
    };
  });
}

function manifestOf(rendered: readonly Rendered[], generatedAt: string): Manifest {
  const snapshotVersion = shortHash(
    sha256Hex(canonicalJson(Object.fromEntries(rendered.map((r) => [r.name, r.sha256])))),
  );
  return ManifestSchema.parse({
    formatVersion: SNAPSHOT_FORMAT_VERSION,
    snapshotVersion,
    generatedAt,
    locales: [...LOCALES],
    shards: Object.fromEntries(
      rendered.map((r) => [
        r.name,
        { file: r.file, sha256: r.sha256, bytes: r.bytes.length, gzipBytes: r.gzipBytes },
      ]),
    ),
  });
}

export function runBuild(opts: BuildOptions): Manifest {
  // Everything that can fail runs before the out dir is touched.
  const rendered = renderShards(opts);
  const manifest = manifestOf(rendered, opts.generatedAt);

  // The old manifest goes first: a crash mid-write must not leave it pointing at deleted shards.
  rmSync(path.join(opts.outDir, "manifest.json"), { force: true });
  rmSync(path.join(opts.outDir, "s"), { recursive: true, force: true });
  mkdirSync(path.join(opts.outDir, "s"), { recursive: true });
  for (const shard of rendered) writeFileSync(path.join(opts.outDir, shard.file), shard.bytes);
  writeFileSync(path.join(opts.outDir, "manifest.json"), canonicalJson(manifest));
  return manifest;
}

export function formatBuildSummary(manifest: Manifest): string {
  const entries = Object.entries(manifest.shards);
  let largest: [string, number] = ["-", 0];
  for (const [name, shard] of entries) {
    if (shard.gzipBytes > largest[1]) largest = [name, shard.gzipBytes];
  }
  return `data:build: ${entries.length} shards, snapshot ${manifest.snapshotVersion}, largest ${largest[0]} ${largest[1]} B gzip`;
}
