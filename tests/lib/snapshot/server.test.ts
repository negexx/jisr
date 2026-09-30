import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Manifest } from "@/data-schema/snapshot";
import { SnapshotError } from "@/lib/snapshot/errors";
import { loadProgramPageData, programStaticParams, readBuildSnapshot } from "@/lib/snapshot/server";

import { E2E_SCHOLARSHIP_SLUGS, E2E_SLUGS } from "../../fixtures/e2e/profiles";
import {
  buildSnapshot,
  copySnapshot,
  E2E_DATA_DIR,
  EMPTY_DATA_DIR,
  readManifest,
  removeTempDirs,
} from "./fixture";

let base = "";
let empty = "";
let manifest: Manifest;

beforeAll(() => {
  base = buildSnapshot(E2E_DATA_DIR);
  empty = buildSnapshot(EMPTY_DATA_DIR);
  manifest = readManifest(base);
}, 180_000);

afterAll(removeTempDirs);

describe("readBuildSnapshot", () => {
  it("reads and validates the manifest, memoised per directory", async () => {
    const snapshot = await readBuildSnapshot(base);
    expect(snapshot.manifest).toEqual(manifest);
    expect(await readBuildSnapshot(base)).toBe(snapshot);
  });

  it("verifies shards when read", async () => {
    const snapshot = await readBuildSnapshot(base);
    const core = await snapshot.shard("core");
    expect(core.kind).toBe("core");
  });

  it("rejects an invalid manifest as a format error", async () => {
    const dir = copySnapshot(base);
    writeFileSync(
      path.join(dir, "manifest.json"),
      JSON.stringify({ ...manifest, formatVersion: 2 }),
    );
    await expect(readBuildSnapshot(dir)).rejects.toMatchObject({ kind: "format" });
  });
});

describe("programStaticParams", () => {
  it("lists every fixture program slug, sorted and unique", async () => {
    expect(await programStaticParams(base)).toEqual(
      Object.values(E2E_SLUGS)
        .sort()
        .map((slug) => ({ slug })),
    );
  });

  it("returns [] for an empty catalogue", async () => {
    expect(await programStaticParams(empty)).toEqual([]);
  });
});

describe("loadProgramPageData", () => {
  it("returns the static data of a known program", async () => {
    const data = await loadProgramPageData(E2E_SLUGS.ok, "en", base);
    if (data === null) throw new Error("expected data");
    expect(data.snapshotVersion).toBe(manifest.snapshotVersion);
    expect(data.program.slug).toBe(E2E_SLUGS.ok);
    expect(data.institution?.slug).toBe("xx-test-inst-pub-b");
    expect(data.applicationChannel?.slug).toBe("xx-test-channel-portal");
    expect(data.core.kind).toBe("core");
    expect(data.costProfiles.map((p) => p.slug)).toEqual(["xx-test-costs-xb"]);
    // No nationality filter on the server: the XZ-only scholarship is still listed.
    expect(data.scholarships.map((s) => s.slug).sort()).toEqual(
      Object.values(E2E_SCHOLARSHIP_SLUGS).sort(),
    );
    expect(data.text(`programs/${E2E_SLUGS.ok}#summary`)).toEqual({
      text: "Complete matching test programme",
      note: "none",
    });
  });

  it("looks up text in the requested locale", async () => {
    const data = await loadProgramPageData(E2E_SLUGS.frOnly, "ar", base);
    expect(data?.text(`programs/${E2E_SLUGS.frOnly}#summary`)?.note).toBe("french_fallback");
  });

  it("returns null for an unknown slug", async () => {
    expect(await loadProgramPageData("xx-test-prog-unknown", "fr", base)).toBeNull();
    expect(await loadProgramPageData(E2E_SLUGS.ok, "fr", empty)).toBeNull();
  });

  it("throws an integrity error on a tampered shard", async () => {
    const dir = copySnapshot(base);
    const entry = manifest.shards["programs.XB.xx-test-field-cs"];
    if (entry === undefined) throw new Error("fixture shard missing");
    const file = path.join(dir, entry.file);
    const source = readFileSync(file, "utf8");
    writeFileSync(file, source.replace("Programme OK", "Programme OX"));
    const error = await loadProgramPageData(E2E_SLUGS.ok, "fr", dir).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SnapshotError);
    expect(error).toMatchObject({ kind: "integrity" });
  });
});
