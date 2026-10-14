import "server-only";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { CountryCode, Slug } from "@/data-schema/primitives";
import type {
  ApplicationChannel,
  CostProfile,
  FactMeta,
  Institution,
  Program,
  Scholarship,
  TextKey,
} from "@/data-schema/resolved";
import {
  type CoreShard,
  type CostsShard,
  type InstitutionsShard,
  type Manifest,
  type ProgramsShard,
  type RoutesShard,
  type ScholarshipsShard,
  type Shard,
  shardNames,
  type TextShard,
} from "@/data-schema/snapshot";
import { appliesToProgram } from "@/domain/scholarships";
import type { AppLocale } from "@/i18n/routing";
import {
  buildSections,
  type CountrySection,
  type DestinationInput,
} from "@/lib/scholarships/sections";

import { SnapshotError } from "./errors";
import { checkShardShape, parseManifest, programShardsIn } from "./manifest";
import { resolveProgramSlug } from "./resolve-program-slug";
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

const ROUTES_SHARD = /^routes\.[A-Z]{2}$/;

async function routeGuidanceFor(
  snapshot: BuildSnapshot,
  destination: CountryCode,
): Promise<{ notes: RouteGuidanceNote[]; shardNames: string[] }> {
  const names = Object.keys(snapshot.manifest.shards)
    .filter((name) => ROUTES_SHARD.test(name))
    .sort();
  const notes: RouteGuidanceNote[] = [];
  const used: string[] = [];
  for (const name of names) {
    const shard = (await snapshot.shard(name)) as RoutesShard;
    const found = shard.routes
      .filter((route) => route.destination === destination)
      .flatMap((route) =>
        (route.guidance ?? []).map((g) => ({ route: route.slug, origin: route.origin, ...g })),
      );
    if (found.length > 0) used.push(name);
    notes.push(...found);
  }
  notes.sort((a, b) =>
    a.origin !== b.origin ? (a.origin < b.origin ? -1 : 1) : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  return { notes, shardNames: used };
}

async function programShards(snapshot: BuildSnapshot): Promise<ProgramsShard[]> {
  return Promise.all(
    programShardsIn(snapshot.manifest).map(
      async ({ name }) => (await snapshot.shard(name)) as ProgramsShard,
    ),
  );
}

async function liveProgramSlugs(snapshot: BuildSnapshot): Promise<Set<string>> {
  return new Set(
    (await programShards(snapshot)).flatMap((shard) => shard.programs.map((p) => p.slug)),
  );
}

// The alias map also holds former institution slugs: only a key that resolves to a live programme
// is a programme alias.
function programAliases(snapshot: BuildSnapshot, live: ReadonlySet<string>): Map<string, string> {
  const found = new Map<string, string>();
  for (const former of Object.keys(snapshot.manifest.aliases ?? {})) {
    const target = resolveProgramSlug(former, snapshot.manifest);
    if (live.has(target) && !live.has(former)) found.set(former, target);
  }
  return found;
}

// The slugs that have a programme page of their own, sorted: what the sitemap lists.
export async function programSlugs(dir: string = DEFAULT_DIR): Promise<string[]> {
  return [...(await liveProgramSlugs(await readBuildSnapshot(dir)))].sort();
}

// Live slugs plus former slugs: the page at a former slug is a redirect to the current one.
export async function programStaticParams(
  dir: string = DEFAULT_DIR,
): Promise<Array<{ slug: string }>> {
  const snapshot = await readBuildSnapshot(dir);
  const live = await liveProgramSlugs(snapshot);
  const slugs = new Set([...live, ...programAliases(snapshot, live).keys()]);
  return [...slugs].sort().map((slug) => ({ slug }));
}

// The slug a renamed programme is published under now, or null when `slug` is not a former
// programme slug.
export async function programAliasTarget(
  slug: string,
  dir: string = DEFAULT_DIR,
): Promise<string | null> {
  const snapshot = await readBuildSnapshot(dir);
  return programAliases(snapshot, await liveProgramSlugs(snapshot)).get(slug) ?? null;
}

// Advice about the destination country's own student aid, from a route into that country. Shown on
// the page, never evaluated: match status does not read it.
export type RouteGuidanceNote = {
  route: Slug;
  origin: CountryCode;
  id: Slug;
  note: TextKey;
  fact: FactMeta;
};

// Everything the program page can render at build time: nothing here depends on the clock or on
// the student (route matching, budget fit and the nationality filter are client concerns; route
// guidance is general advice, shown to every student alike).
export type ProgramPageData = {
  snapshotVersion: string;
  program: Program;
  institution: Institution | null;
  // City-level and country-level profiles for the program's destination, as estimateCost needs.
  costProfiles: CostProfile[];
  // Linked and destination scholarships; no nationality filter.
  scholarships: Scholarship[];
  // Guidance of every route into the program's country (one origin today), ordered by origin, id.
  routeGuidance: RouteGuidanceNote[];
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

  const guidance = await routeGuidanceFor(snapshot, program.country);
  const structural = [
    ...guidance.shardNames,
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
    // The domain's appliesToProgram (shared with scholarshipsForProgram) and its slug order, minus
    // the nationality filter, so the static page and the client's personal box list scholarships
    // alike. Only the destination's shard is read (as the client's shardsForProgram): a linked
    // scholarship whose `destinations` omit the program's country is not found here nor on the
    // client; data:check does not reject that yet (follow-up).
    scholarships: (scholarships?.scholarships ?? [])
      .filter((s) => appliesToProgram(s, program))
      .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0)),
    routeGuidance: guidance.notes,
    core,
    applicationChannel: core.applicationChannels.find((c) => c.slug === channelSlug) ?? null,
    text: createTextLookup(textShards, locale),
  };
}

const SCHOLARSHIPS_SHARD = /^scholarships\.([A-Z]{2})$/;

// Everything the Scholarships page renders at build time: no clock, no student. The student's
// nationality and the freshness of a fact are client concerns (NationalityCheck, SourceBadge).
export type ScholarshipsPageData = {
  snapshotVersion: string;
  sections: CountrySection[];
  core: CoreShard;
  text: TextLookup;
};

export async function loadScholarshipsPageData(
  locale: AppLocale,
  dir: string = DEFAULT_DIR,
): Promise<ScholarshipsPageData> {
  const snapshot = await readBuildSnapshot(dir);
  const core = await optionalShard<CoreShard>(snapshot, shardNames.core());
  if (core === undefined) throw new SnapshotError("format", shardNames.core());

  const countries = Object.keys(snapshot.manifest.shards)
    .flatMap((name) => SCHOLARSHIPS_SHARD.exec(name)?.[1] ?? [])
    .sort();
  const programShardNames = programShardsIn(snapshot.manifest);

  const inputs: DestinationInput[] = [];
  const structural = [shardNames.core()];
  for (const country of countries) {
    const scholarships = await optionalShard<ScholarshipsShard>(
      snapshot,
      shardNames.scholarships(country),
    );
    const institutions = await optionalShard<InstitutionsShard>(
      snapshot,
      shardNames.institutions(country),
    );
    const programs = (
      await Promise.all(
        programShardNames
          .filter((p) => p.destination === country)
          .map(async ({ name }) => (await snapshot.shard(name)) as ProgramsShard),
      )
    ).flatMap((shard) => shard.programs);
    inputs.push({
      country,
      scholarships: scholarships?.scholarships ?? [],
      programs,
      institutions: institutions?.institutions ?? [],
    });
    structural.push(shardNames.scholarships(country));
  }

  const textShards = await Promise.all(
    structural
      .map((name) => shardNames.text(locale, name))
      .filter((name) => listed(snapshot, name))
      .map(async (name) => (await snapshot.shard(name)) as TextShard),
  );

  return {
    snapshotVersion: snapshot.manifest.snapshotVersion,
    sections: buildSections(inputs),
    core,
    text: createTextLookup(textShards, locale),
  };
}
