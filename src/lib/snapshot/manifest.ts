import type { Locale } from "@/data-schema/primitives";
import type { Manifest, Shard } from "@/data-schema/snapshot";
import { LOCALES, SNAPSHOT_FORMAT_VERSION } from "@/lib/constants";
import {
  hasOnlyKeys,
  isInteger,
  isOneOf,
  isPlainObject,
  isRecord,
  matches,
  parseEach,
} from "@/lib/guards";

import { SnapshotError } from "./errors";

// Hand-written twin of ManifestSchema (src/data-schema/snapshot.ts): the manifest is read in the
// browser, where importing Zod costs about 120 KB gzipped. tests/lib/snapshot/manifest-guard.test.ts
// runs both over a built manifest, one mutation per rule and a seeded fuzzer, and fails on any
// disagreement, so change both together.
const SNAPSHOT_VERSION = /^[0-9a-f]{12}$/;
const SHARD_FILE = /^s\/[A-Za-z0-9.-]+\.[0-9a-f]{12}\.json$/;
const SHA256 = /^[0-9a-f]{64}$/;

type ManifestShard = Manifest["shards"][string];

function parseShardEntry(value: unknown): ManifestShard | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ["file", "sha256", "bytes", "gzipBytes"]))
    return null;
  const { file, sha256, bytes, gzipBytes } = value;
  if (
    !matches(file, SHARD_FILE) ||
    !matches(sha256, SHA256) ||
    !isInteger(bytes) ||
    bytes <= 0 ||
    !isInteger(gzipBytes) ||
    gzipBytes <= 0
  ) {
    return null;
  }
  return { file, sha256, bytes, gzipBytes };
}

function parseLocale(value: unknown): Locale | null {
  return isOneOf(value, LOCALES) ? value : null;
}

// z.record(z.string(), ...): a plain object whose own enumerable keys are all valid entries. Zod
// skips a "__proto__" key without validating or keeping it, and rejects a symbol key.
function parseShards(value: unknown): Manifest["shards"] | null {
  if (!isPlainObject(value)) return null;
  const shards: Manifest["shards"] = {};
  for (const key of Reflect.ownKeys(value)) {
    if (key === "__proto__" || !Object.prototype.propertyIsEnumerable.call(value, key)) continue;
    if (typeof key !== "string") return null;
    const entry = parseShardEntry(value[key]);
    if (entry === null) return null;
    shards[key] = entry;
  }
  return shards;
}

// Throws a SnapshotError("format") without echoing anything from the input.
export function parseManifest(json: unknown): Manifest {
  if (
    !isRecord(json) ||
    !hasOnlyKeys(json, ["formatVersion", "snapshotVersion", "generatedAt", "locales", "shards"]) ||
    json.formatVersion !== SNAPSHOT_FORMAT_VERSION
  ) {
    throw new SnapshotError("format");
  }
  const { snapshotVersion, generatedAt } = json;
  const locales = parseEach(json.locales, parseLocale);
  const shards = parseShards(json.shards);
  if (
    !matches(snapshotVersion, SNAPSHOT_VERSION) ||
    typeof generatedAt !== "string" ||
    locales === null ||
    locales.length < 1 ||
    shards === null
  ) {
    throw new SnapshotError("format");
  }
  return { formatVersion: SNAPSHOT_FORMAT_VERSION, snapshotVersion, generatedAt, locales, shards };
}

const COUNTRY = "[A-Z]{2}";
const SLUG = "[a-z0-9]+(?:-[a-z0-9]+)*";
const PROGRAMS_NAME = new RegExp(`^programs\\.(${COUNTRY})\\.(${SLUG})$`);
const DESTINATION_NAME = new RegExp(`^(institutions|costs|scholarships)\\.(${COUNTRY})$`);
const ROUTES_NAME = new RegExp(`^routes\\.(${COUNTRY})$`);
const TEXT_NAME = /^text\.([a-z]{2})\.(.+)$/;

type StructuralIdentity =
  | { kind: "core" }
  | { kind: "routes"; origin: string }
  | { kind: "institutions" | "costs" | "scholarships"; destination: string }
  | { kind: "programs"; destination: string; field: string };
type ShardIdentity = StructuralIdentity | { kind: "text"; locale: Locale; shard: string };

function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

function identifyStructural(name: string): StructuralIdentity | null {
  if (name === "core") return { kind: "core" };
  const routes = ROUTES_NAME.exec(name);
  if (routes?.[1] !== undefined) return { kind: "routes", origin: routes[1] };
  const programs = PROGRAMS_NAME.exec(name);
  if (programs?.[1] !== undefined && programs[2] !== undefined) {
    return { kind: "programs", destination: programs[1], field: programs[2] };
  }
  const byDestination = DESTINATION_NAME.exec(name);
  const kind = byDestination?.[1];
  const destination = byDestination?.[2];
  if ((kind === "institutions" || kind === "costs" || kind === "scholarships") && destination) {
    return { kind, destination };
  }
  return null;
}

function identifyShard(name: string): ShardIdentity | null {
  const text = TEXT_NAME.exec(name);
  if (text !== null) {
    const [, locale = "", shard = ""] = text;
    return isLocale(locale) && identifyStructural(shard) !== null
      ? { kind: "text", locale, shard }
      : null;
  }
  return identifyStructural(name);
}

export function programShardsIn(
  manifest: Manifest,
): Array<{ name: string; destination: string; field: string }> {
  return Object.keys(manifest.shards).flatMap((name) => {
    const identity = identifyStructural(name);
    return identity?.kind === "programs"
      ? [{ name, destination: identity.destination, field: identity.field }]
      : [];
  });
}

export function destinationsIn(manifest: Manifest): string[] {
  const destinations = new Set<string>();
  for (const name of Object.keys(manifest.shards)) {
    const identity = identifyStructural(name);
    if (identity !== null && "destination" in identity) destinations.add(identity.destination);
  }
  return [...destinations].sort();
}

// The structural guard behind the integrity check: a shard must be what its manifest name says,
// so a mis-pointed manifest entry cannot feed one destination's data in as another's.
export function checkShardShape(name: string, value: unknown): Shard {
  const identity = identifyShard(name);
  const matches =
    identity !== null &&
    isRecord(value) &&
    Object.entries(identity).every(([key, expected]) => value[key] === expected);
  if (!matches) throw new SnapshotError("format", name);
  // Identity checked above; the content itself was validated by data:build and is pinned by sha256.
  return value as Shard;
}
