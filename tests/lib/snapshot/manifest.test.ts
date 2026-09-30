import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Manifest } from "@/data-schema/snapshot";
import { SnapshotError } from "@/lib/snapshot/errors";
import {
  checkShardShape,
  destinationsIn,
  parseManifest,
  programShardsIn,
} from "@/lib/snapshot/manifest";

import { buildSnapshot, E2E_DATA_DIR, readManifest, removeTempDirs } from "./fixture";

let manifest: Manifest;

beforeAll(() => {
  manifest = readManifest(buildSnapshot(E2E_DATA_DIR));
}, 180_000);

afterAll(removeTempDirs);

function formatError(run: () => unknown): SnapshotError {
  try {
    run();
  } catch (error) {
    if (error instanceof SnapshotError) return error;
    throw error;
  }
  throw new Error("expected a SnapshotError");
}

describe("parseManifest", () => {
  it("accepts a built manifest", () => {
    expect(parseManifest(JSON.parse(JSON.stringify(manifest)))).toEqual(manifest);
  });

  it("rejects an unknown formatVersion as a format error", () => {
    expect(formatError(() => parseManifest({ ...manifest, formatVersion: 2 })).kind).toBe("format");
  });

  it("rejects a shard file outside the s/<name>.<hash>.json pattern", () => {
    const core = manifest.shards.core;
    const bad = { ...manifest, shards: { core: { ...core, file: "../evil.json" } } };
    expect(formatError(() => parseManifest(bad)).kind).toBe("format");
  });

  it("rejects non-object input", () => {
    expect(formatError(() => parseManifest("not a manifest")).kind).toBe("format");
  });
});

describe("programShardsIn / destinationsIn", () => {
  it("enumerates every programs.<DEST>.<field> shard", () => {
    expect(programShardsIn(manifest)).toEqual([
      { name: "programs.XB.xx-test-field-cs", destination: "XB", field: "xx-test-field-cs" },
      { name: "programs.XB.xx-test-field-eng", destination: "XB", field: "xx-test-field-eng" },
      { name: "programs.XC.xx-test-field-cs", destination: "XC", field: "xx-test-field-cs" },
    ]);
  });

  it("ignores text shards whose name embeds a programs shard", () => {
    expect(programShardsIn(manifest).every((p) => p.name.startsWith("programs."))).toBe(true);
  });

  it("lists destinations from institutions, costs, scholarships and programs shards", () => {
    expect(destinationsIn(manifest)).toEqual(["XB", "XC"]);
  });

  it("returns empty lists for a core-only manifest", () => {
    const coreOnly = { ...manifest, shards: { core: manifest.shards.core } } as Manifest;
    expect(programShardsIn(coreOnly)).toEqual([]);
    expect(destinationsIn(coreOnly)).toEqual([]);
  });
});

describe("checkShardShape", () => {
  it("accepts a shard whose kind and identity match its name", () => {
    const shard = { kind: "programs", destination: "XB", field: "f", programs: [] };
    expect(checkShardShape("programs.XB.f", shard)).toBe(shard);
    const text = { kind: "text", locale: "ar", shard: "costs.XB", entries: {} };
    expect(checkShardShape("text.ar.costs.XB", text)).toBe(text);
  });

  it.each([
    ["programs.XB.f", { kind: "core" }],
    ["programs.XB.f", { kind: "programs", destination: "XC", field: "f", programs: [] }],
    ["programs.XB.f", { kind: "programs", destination: "XB", field: "g", programs: [] }],
    ["routes.XA", { kind: "routes", origin: "XB", routes: [] }],
    ["institutions.XB", { kind: "institutions", destination: "XC", institutions: [] }],
    ["costs.XB", { kind: "scholarships", destination: "XB", scholarships: [] }],
    ["text.en.core", { kind: "text", locale: "fr", shard: "core", entries: {} }],
    ["text.en.core", { kind: "text", locale: "en", shard: "routes.XA", entries: {} }],
    ["core", null],
    ["core", []],
    ["unknown.name", { kind: "core" }],
  ])("rejects %s with a mismatching body as a format error", (name, body) => {
    const error = formatError(() => checkShardShape(name, body));
    expect(error.kind).toBe("format");
    expect(error.shard).toBe(name);
  });
});
