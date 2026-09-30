import { LOCALES, type Locale } from "@/data-schema/primitives";
import { type Manifest, ManifestSchema, type Shard } from "@/data-schema/snapshot";

import { SnapshotError } from "./errors";

export function parseManifest(json: unknown): Manifest {
  const result = ManifestSchema.safeParse(json);
  if (!result.success) throw new SnapshotError("format");
  return result.data;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
