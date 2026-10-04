import "server-only";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type {
  ApplicationChannel,
  CostProfile,
  Institution,
  Program,
  Scholarship,
} from "@/data-schema/resolved";
import {
  type CoreShard,
  type CostsShard,
  type InstitutionsShard,
  type Manifest,
  type ProgramsShard,
  type ScholarshipsShard,
  type Shard,
  shardNames,
  type TextShard,
} from "@/data-schema/snapshot";
import type { AppLocale } from "@/i18n/routing";

import { SnapshotError } from "./errors";
import { checkShardShape, parseManifest, programShardsIn } from "./manifest";
import { createTextLookup, type TextLookup } from "./text";

// Build-time reader for the statically generated program pages. `pnpm build` runs data:build
// first, so public/snapshots holds the snapshot the pages are generated from.
const DEFAULT_DIR = "public/snapshots";

export type BuildSnapshot = {
  dir: string;
  manifest: Manifest;
  shard(name: string): Promise<Shard>;
};

const snapshots = new Map<string, Promise<BuildSnapshot>>();

async function openSnapshot(dir: string): Promise<BuildSnapshot> {
  let json: unknown;
  try {
    json = JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) throw new SnapshotError("format");
    throw error;
  }
  const manifest = parseManifest(json);
  const shards = new Map<string, Promise<Shard>>();

  async function readShard(name: string): Promise<Shard> {
    const entry = manifest.shards[name];
    if (entry === undefined) throw new SnapshotError("format", name);
    const bytes = await readFile(path.join(dir, entry.file));
    if (bytes.length !== entry.bytes) throw new SnapshotError("integrity", name);
    if (createHash("sha256").update(bytes).digest("hex") !== entry.sha256) {
      throw new SnapshotError("integrity", name);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(bytes.toString("utf8"));
    } catch {
      throw new SnapshotError("format", name);
    }
    return checkShardShape(name, parsed);
  }

  return {
    dir,
    manifest,
    shard(name) {
      const cached = shards.get(name);
      if (cached !== undefined) return cached;
      const pending = readShard(name);
      shards.set(name, pending);
      pending.catch(() => {
        if (shards.get(name) === pending) shards.delete(name);
      });
      return pending;
    },
  };
}

// Memoised per process and directory; shards are verified (length + sha256) when first read.
export function readBuildSnapshot(dir: string = DEFAULT_DIR): Promise<BuildSnapshot> {
  const key = path.resolve(dir);
  const cached = snapshots.get(key);
  if (cached !== undefined) return cached;
  const pending = openSnapshot(key);
  snapshots.set(key, pending);
  pending.catch(() => {
    if (snapshots.get(key) === pending) snapshots.delete(key);
  });
  return pending;
}

function listed(snapshot: BuildSnapshot, name: string): boolean {
  return Object.hasOwn(snapshot.manifest.shards, name);
}

async function optionalShard<T extends Shard>(
  snapshot: BuildSnapshot,
  name: string,
): Promise<T | undefined> {
  // checkShardShape has matched the kind to the name, so the name fixes the shard type.
  return listed(snapshot, name) ? ((await snapshot.shard(name)) as T) : undefined;
}

async function programShards(snapshot: BuildSnapshot): Promise<ProgramsShard[]> {
  return Promise.all(
    programShardsIn(snapshot.manifest).map(
      async ({ name }) => (await snapshot.shard(name)) as ProgramsShard,
    ),
  );
}

export async function programStaticParams(
  dir: string = DEFAULT_DIR,
): Promise<Array<{ slug: string }>> {
  const snapshot = await readBuildSnapshot(dir);
  const slugs = new Set(
    (await programShards(snapshot)).flatMap((shard) => shard.programs.map((p) => p.slug)),
  );
  return [...slugs].sort().map((slug) => ({ slug }));
}

// Everything the program page can render at build time: nothing here depends on the clock or on
// the student (routes, budget fit and the nationality filter are client concerns).
export type ProgramPageData = {
  snapshotVersion: string;
  program: Program;
  institution: Institution | null;
  // City-level and country-level profiles for the program's destination, as estimateCost needs.
  costProfiles: CostProfile[];
  // Linked and destination scholarships; no nationality filter.
  scholarships: Scholarship[];
  // Reference data for describing rules, channels and names in general terms.
  core: CoreShard;
  applicationChannel: ApplicationChannel | null;
  text: TextLookup;
};

export async function loadProgramPageData(
  slug: string,
  locale: AppLocale,
  dir: string = DEFAULT_DIR,
): Promise<ProgramPageData | null> {
  const snapshot = await readBuildSnapshot(dir);
  let found: { name: string; program: Program } | null = null;
  for (const { name } of programShardsIn(snapshot.manifest)) {
    const shard = (await snapshot.shard(name)) as ProgramsShard;
    const program = shard.programs.find((p) => p.slug === slug);
    if (program !== undefined) {
      found = { name, program };
      break;
    }
  }
  if (found === null) return null;
  const { program } = found;

  const core = await optionalShard<CoreShard>(snapshot, shardNames.core());
  if (core === undefined) throw new SnapshotError("format", shardNames.core());
  const [institutions, costs, scholarships] = await Promise.all([
    optionalShard<InstitutionsShard>(snapshot, shardNames.institutions(program.country)),
    optionalShard<CostsShard>(snapshot, shardNames.costs(program.country)),
    optionalShard<ScholarshipsShard>(snapshot, shardNames.scholarships(program.country)),
  ]);

  const structural = [
    shardNames.core(),
    found.name,
    shardNames.institutions(program.country),
    shardNames.costs(program.country),
    shardNames.scholarships(program.country),
  ];
  const textShards = await Promise.all(
    structural
      .map((name) => shardNames.text(locale, name))
      .filter((name) => listed(snapshot, name))
      .map(async (name) => (await snapshot.shard(name)) as TextShard),
  );

  const channelSlug = program.applicationChannel.value;
  return {
    snapshotVersion: snapshot.manifest.snapshotVersion,
    program,
    institution: institutions?.institutions.find((i) => i.slug === program.institution) ?? null,
    costProfiles: (costs?.profiles ?? []).filter((p) => p.city === null || p.city === program.city),
    // Same selection and slug order as domain scholarshipsForProgram, minus its nationality
    // filter, so the static page and the client's personal box list scholarships alike. Only the
    // destination's shard is read (as the client's shardsForProgram): a linked scholarship whose
    // `destinations` omit the program's country is not found here nor on the client; data:check
    // does not reject that yet (follow-up).
    scholarships: (scholarships?.scholarships ?? [])
      .filter(
        (s) =>
          program.scholarships.includes(s.slug) ||
          ((s.fields.length === 0 || s.fields.includes(program.field)) &&
            (!s.institutions?.length || s.institutions.includes(program.institution))),
      )
      .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0)),
    core,
    applicationChannel: core.applicationChannels.find((c) => c.slug === channelSlug) ?? null,
    text: createTextLookup(textShards, locale),
  };
}
