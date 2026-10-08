import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LOCALES as ORACLE_LOCALES } from "@/data-schema/primitives";
import {
  ManifestSchema,
  SNAPSHOT_FORMAT_VERSION as ORACLE_FORMAT_VERSION,
  shardNames as oracleShardNames,
} from "@/data-schema/snapshot";
import { LOCALES, SNAPSHOT_FORMAT_VERSION } from "@/lib/constants";
import { SnapshotError } from "@/lib/snapshot/errors";
import { parseManifest } from "@/lib/snapshot/manifest";
import { shardNames } from "@/lib/snapshot/shard-names";

import { cloneValue, compare, fuzz, newTally } from "../differential";
import { buildSnapshot, E2E_DATA_DIR, readManifest, removeTempDirs } from "./fixture";

const SHA = "0123456789abcdef".repeat(4);
const ENTRY = { file: "s/core.0123456789ab.json", sha256: SHA, bytes: 10, gzipBytes: 8 };
const HAND_MADE: Record<string, unknown> = {
  formatVersion: 2,
  snapshotVersion: "0123456789ab",
  generatedAt: "2026-09-30T10:00:00.000Z",
  locales: ["fr", "en", "ar"],
  shards: {
    core: ENTRY,
    "programs.FR.computer-science": {
      ...ENTRY,
      file: "s/programs.FR.computer-science.abcdef012345.json",
    },
  },
};

let built: Record<string, unknown>;

beforeAll(() => {
  built = cloneValue(readManifest(buildSnapshot(E2E_DATA_DIR))) as Record<string, unknown>;
}, 180_000);

afterAll(removeTempDirs);

type Editable = Record<string, unknown> & { shards: Record<string, Record<string, unknown>> };

function edited(change: (manifest: Editable) => void, base: Record<string, unknown> = HAND_MADE) {
  const copy = cloneValue(base) as Editable;
  change(copy);
  return copy;
}

function withCore(entry: Record<string, unknown>): unknown {
  return edited((m) => {
    m.shards.core = entry;
  });
}

// JSON.parse makes "__proto__" an own key, which is how it reaches the client from the network.
function withProtoShard(entry: unknown, base: Record<string, unknown> = HAND_MADE): unknown {
  const others = Object.keys(base.shards as object).length > 0 ? "," : "";
  const json = JSON.stringify(base).replace(
    '"shards":{',
    `"shards":{"__proto__":${JSON.stringify(entry)}${others}`,
  );
  return JSON.parse(json);
}

function hasOwnProtoShard(input: unknown): boolean {
  if (typeof input !== "object" || input === null) return false;
  const shards: unknown = (input as { shards?: unknown }).shards;
  return typeof shards === "object" && shards !== null && Object.hasOwn(shards, "__proto__");
}

class ShardsClass {
  core = ENTRY;
}

function attempt(input: unknown): unknown {
  try {
    return parseManifest(input);
  } catch (error) {
    if (error instanceof SnapshotError && error.kind === "format") return null;
    throw error;
  }
}

const VALID: Array<[string, () => unknown]> = [
  ["hand-made manifest", () => HAND_MADE],
  ["built manifest", () => built],
  ["no shards", () => edited((m) => (m.shards = {}))],
  ["one locale", () => edited((m) => (m.locales = ["ar"]))],
  ["repeated locale", () => edited((m) => (m.locales = ["fr", "fr"]))],
  ["empty generatedAt", () => edited((m) => (m.generatedAt = ""))],
  [
    "dots and dashes in file name",
    () => withCore({ ...ENTRY, file: "s/a.b-c.D.0123456789ab.json" }),
  ],
  ["odd shard name", () => edited((m) => (m.shards["a b/c"] = { ...ENTRY }))],
  // Zod's record skips a "__proto__" key entirely: it neither validates nor keeps it.
  ["own __proto__ shard with an invalid entry", () => withProtoShard({ bad: 1 })],
  ["own __proto__ shard with a null entry", () => withProtoShard(null)],
  ["own __proto__ shard with a valid entry", () => withProtoShard(ENTRY)],
  [
    "own __proto__ shard next to an empty shard list",
    () => withProtoShard(ENTRY, { ...HAND_MADE, shards: {} }),
  ],
  [
    "own constructor shard",
    () => edited((m) => Reflect.set(m.shards, "constructor", { ...ENTRY })),
  ],
  [
    "shards without a prototype",
    () => edited((m) => (m.shards = Object.assign(Object.create(null), m.shards))),
  ],
  [
    "inherited entries are not shards",
    () => edited((m) => (m.shards = Object.create({ core: ENTRY }))),
  ],
  ["class instance as the manifest", () => Object.assign(new (class Loaded {})(), HAND_MADE)],
];

const INVALID: Array<[string, () => unknown]> = [
  ["shards as a class instance", () => edited((m) => (m.shards = new ShardsClass() as never))],
  [
    "shards with an enumerable symbol key",
    () =>
      edited((m) =>
        Object.defineProperty(m.shards, Symbol("k"), { value: ENTRY, enumerable: true }),
      ),
  ],
  [
    "inherited enumerable extra manifest key",
    () => Object.assign(Object.create({ extra: 1 }), HAND_MADE),
  ],
  [
    "an own invalid shard beside an inherited one",
    () =>
      edited(
        (m) => (m.shards = Object.assign(Object.create({ core: ENTRY }), { bad: { bad: 1 } })),
      ),
  ],
  ["null root", () => null],
  ["undefined root", () => undefined],
  ["string root", () => "not a manifest"],
  ["number root", () => 1],
  ["array root", () => [HAND_MADE]],
  ["empty object", () => ({})],
  ["formatVersion 3", () => edited((m) => (m.formatVersion = 3))],
  ["formatVersion string", () => edited((m) => (m.formatVersion = "2"))],
  ["formatVersion missing", () => edited((m) => delete m.formatVersion)],
  ["unknown top-level key", () => edited((m) => (m.extra = 1))],
  [
    "own __proto__ key",
    () => JSON.parse(`${JSON.stringify(HAND_MADE).slice(0, -1)},"__proto__":{}}`),
  ],
  ["snapshotVersion too short", () => edited((m) => (m.snapshotVersion = "0123456789a"))],
  ["snapshotVersion too long", () => edited((m) => (m.snapshotVersion = "0123456789abc"))],
  ["snapshotVersion uppercase", () => edited((m) => (m.snapshotVersion = "0123456789AB"))],
  ["snapshotVersion non-hex", () => edited((m) => (m.snapshotVersion = "0123456789zz"))],
  ["snapshotVersion trailing newline", () => edited((m) => (m.snapshotVersion = "0123456789ab\n"))],
  ["snapshotVersion number", () => edited((m) => (m.snapshotVersion = 123))],
  ["snapshotVersion missing", () => edited((m) => delete m.snapshotVersion)],
  ["generatedAt number", () => edited((m) => (m.generatedAt = 1))],
  ["generatedAt null", () => edited((m) => (m.generatedAt = null))],
  ["generatedAt missing", () => edited((m) => delete m.generatedAt)],
  ["locales empty", () => edited((m) => (m.locales = []))],
  ["locales unknown locale", () => edited((m) => (m.locales = ["fr", "es"]))],
  ["locales uppercase", () => edited((m) => (m.locales = ["FR"]))],
  ["locales string", () => edited((m) => (m.locales = "fr"))],
  ["locales missing", () => edited((m) => delete m.locales)],
  ["locales with number", () => edited((m) => (m.locales = ["fr", 1]))],
  ["shards null", () => edited((m) => (m.shards = null as never))],
  ["shards array", () => edited((m) => (m.shards = [] as never))],
  ["shards missing", () => edited((m) => Reflect.deleteProperty(m, "shards"))],
  ["shard null", () => edited((m) => (m.shards.core = null as never))],
  ["shard array", () => edited((m) => (m.shards.core = [] as never))],
  ["shard unknown key", () => withCore({ ...ENTRY, extra: 1 })],
  ["shard file missing", () => withCore({ sha256: SHA, bytes: 1, gzipBytes: 1 })],
  ["shard file with ..", () => withCore({ ...ENTRY, file: "s/../core.0123456789ab.json" })],
  ["shard file traversal", () => withCore({ ...ENTRY, file: "../evil.json" })],
  ["shard file without prefix", () => withCore({ ...ENTRY, file: "core.0123456789ab.json" })],
  ["shard file absolute", () => withCore({ ...ENTRY, file: "/s/core.0123456789ab.json" })],
  ["shard file nested", () => withCore({ ...ENTRY, file: "s/x/core.0123456789ab.json" })],
  ["shard file short hash", () => withCore({ ...ENTRY, file: "s/core.0123456789a.json" })],
  ["shard file uppercase hash", () => withCore({ ...ENTRY, file: "s/core.0123456789AB.json" })],
  ["shard file wrong extension", () => withCore({ ...ENTRY, file: "s/core.0123456789ab.txt" })],
  ["shard file trailing newline", () => withCore({ ...ENTRY, file: "s/core.0123456789ab.json\n" })],
  ["shard file space", () => withCore({ ...ENTRY, file: "s/co re.0123456789ab.json" })],
  ["shard file number", () => withCore({ ...ENTRY, file: 1 })],
  ["sha256 short", () => withCore({ ...ENTRY, sha256: SHA.slice(1) })],
  ["sha256 long", () => withCore({ ...ENTRY, sha256: `${SHA}0` })],
  ["sha256 uppercase", () => withCore({ ...ENTRY, sha256: SHA.toUpperCase() })],
  ["sha256 missing", () => withCore({ file: ENTRY.file, bytes: 1, gzipBytes: 1 })],
  ["bytes zero", () => withCore({ ...ENTRY, bytes: 0 })],
  ["bytes negative", () => withCore({ ...ENTRY, bytes: -1 })],
  ["bytes float", () => withCore({ ...ENTRY, bytes: 1.5 })],
  ["bytes NaN", () => withCore({ ...ENTRY, bytes: Number.NaN })],
  ["bytes Infinity", () => withCore({ ...ENTRY, bytes: Number.POSITIVE_INFINITY })],
  ["bytes unsafe", () => withCore({ ...ENTRY, bytes: 2 ** 53 })],
  ["bytes string", () => withCore({ ...ENTRY, bytes: "10" })],
  ["bytes missing", () => withCore({ file: ENTRY.file, sha256: SHA, gzipBytes: 1 })],
  ["gzipBytes zero", () => withCore({ ...ENTRY, gzipBytes: 0 })],
  ["gzipBytes negative", () => withCore({ ...ENTRY, gzipBytes: -8 })],
  ["gzipBytes float", () => withCore({ ...ENTRY, gzipBytes: 0.5 })],
  ["gzipBytes null", () => withCore({ ...ENTRY, gzipBytes: null })],
  ["gzipBytes missing", () => withCore({ file: ENTRY.file, sha256: SHA, bytes: 1 })],
];

describe("parseManifest against ManifestSchema", () => {
  it("shares its constants with the schema", () => {
    expect(LOCALES).toEqual(ORACLE_LOCALES);
    expect(SNAPSHOT_FORMAT_VERSION).toBe(ORACLE_FORMAT_VERSION);
    expect(SNAPSHOT_FORMAT_VERSION).toBe(2);
  });

  it("builds the same shard names as the schema module", () => {
    expect(shardNames.core()).toBe(oracleShardNames.core());
    expect(shardNames.routes("XA")).toBe(oracleShardNames.routes("XA"));
    expect(shardNames.institutions("XB")).toBe(oracleShardNames.institutions("XB"));
    expect(shardNames.costs("XB")).toBe(oracleShardNames.costs("XB"));
    expect(shardNames.programs("XB", "f-1")).toBe(oracleShardNames.programs("XB", "f-1"));
    expect(shardNames.scholarships("XB")).toBe(oracleShardNames.scholarships("XB"));
    for (const locale of ORACLE_LOCALES) {
      expect(shardNames.text(locale, "core")).toBe(oracleShardNames.text(locale, "core"));
    }
  });

  it.each(VALID)("accepts and returns an equal copy of: %s", (_label, input) => {
    const value = input();
    const oracle = ManifestSchema.safeParse(value);
    expect(oracle.success).toBe(true);
    expect(parseManifest(value)).toEqual(oracle.data);
  });

  it.each(
    INVALID,
  )("rejects %s exactly as the schema does, with a format error", (_label, input) => {
    const value = input();
    expect(ManifestSchema.safeParse(value).success).toBe(false);
    expect(() => parseManifest(value)).toThrow(SnapshotError);
    expect(attempt(value)).toBeNull();
  });

  it("agrees with the schema on every table row", () => {
    const tally = newTally();
    for (const [label, input] of [...VALID, ...INVALID]) {
      compare(ManifestSchema, attempt, input(), label, tally);
    }
    expect(tally.disagreements).toEqual([]);
    expect(tally.accepted).toBe(VALID.length);
    expect(tally.rejected).toBe(INVALID.length);
  });

  it("throws a fixed message that never quotes the input", () => {
    try {
      parseManifest({ formatVersion: "secret-value" });
    } catch (error) {
      expect(error).toBeInstanceOf(SnapshotError);
      expect(String((error as Error).message)).not.toContain("secret-value");
      return;
    }
    throw new Error("expected a SnapshotError");
  });

  it("agrees with the schema on 3000 seeded mutations of the built manifest", () => {
    const tally = fuzz(ManifestSchema, attempt, built, 3000, 20260930);
    expect(tally.disagreements).toEqual([]);
    expect(tally.accepted).toBeGreaterThan(50);
    expect(tally.rejected).toBeGreaterThan(1000);
  });

  it.each([
    ["invalid", { bad: 1 }],
    ["valid", ENTRY],
  ])("drops an own __proto__ shard with a %s entry exactly like the schema", (_label, entry) => {
    const input = withProtoShard(entry);
    const parsed = parseManifest(input);
    expect(Object.hasOwn(parsed.shards, "__proto__")).toBe(false);
    expect(Object.keys(parsed.shards)).toEqual(Object.keys(HAND_MADE.shards as object));
    expect(Object.getPrototypeOf(parsed.shards)).toBe(Object.prototype);
  });

  it.each([
    ["invalid", { bad: 1 }],
    ["valid", ENTRY],
  ])("reaches an own __proto__ shard with a %s entry when fuzzing", (_label, entry) => {
    const base = withProtoShard(entry);
    const tally = fuzz(ManifestSchema, attempt, base, 1500, 11, hasOwnProtoShard);
    expect(tally.disagreements).toEqual([]);
    expect(tally.probed).toBeGreaterThan(20);
  });

  it("adds an own __proto__ shard to ordinary manifests in the plain fuzz runs", () => {
    const tally = fuzz(ManifestSchema, attempt, HAND_MADE, 6000, 3, hasOwnProtoShard);
    expect(tally.disagreements).toEqual([]);
    expect(tally.probed).toBeGreaterThan(0);
  });

  it("agrees with the schema on 2000 seeded mutations of a hand-made manifest", () => {
    const tally = fuzz(ManifestSchema, attempt, HAND_MADE, 2000, 5);
    expect(tally.disagreements).toEqual([]);
    expect(tally.accepted).toBeGreaterThan(50);
  });
});
