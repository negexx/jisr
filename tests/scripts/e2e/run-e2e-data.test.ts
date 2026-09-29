import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  assertUsableDataDir,
  DEFAULT_E2E_DATA_DIR,
  resolveE2eDataDir,
  runE2eData,
} from "@scripts/e2e/run-e2e-data";
import { describe, expect, it } from "vitest";

const VALID_MINIMAL = "tests/fixtures/data/valid-minimal";
const NOW = "2026-09-29";

function tempDir(label: string): string {
  return mkdtempSync(path.join(tmpdir(), `jisr-e2e-${label}-`));
}

describe("resolveE2eDataDir", () => {
  it("defaults to the journey fixture", () => {
    expect(resolveE2eDataDir({})).toBe(DEFAULT_E2E_DATA_DIR);
    expect(DEFAULT_E2E_DATA_DIR).toBe("tests/fixtures/data/e2e-journey");
  });

  it("takes E2E_DATA_DIR when set and non-blank", () => {
    expect(resolveE2eDataDir({ E2E_DATA_DIR: VALID_MINIMAL })).toBe(VALID_MINIMAL);
    expect(resolveE2eDataDir({ E2E_DATA_DIR: "  " })).toBe(DEFAULT_E2E_DATA_DIR);
  });
});

describe("assertUsableDataDir", () => {
  it("names the missing directory and the override variable", () => {
    const missing = path.join(tempDir("missing"), "nope");
    expect(() => assertUsableDataDir(missing)).toThrow(/data directory not found/);
    expect(() => assertUsableDataDir(missing)).toThrow(/E2E_DATA_DIR/);
  });

  it("rejects an empty directory: an e2e run against zero programs proves nothing", () => {
    expect(() => assertUsableDataDir(tempDir("empty"))).toThrow(/is empty/);
  });

  it("accepts a populated directory", () => {
    const dir = tempDir("populated");
    mkdirSync(path.join(dir, "countries"));
    writeFileSync(path.join(dir, "countries", "x.yaml"), "a: 1\n");
    expect(() => assertUsableDataDir(dir)).not.toThrow();
  });
});

describe("runE2eData", () => {
  it("checks then builds snapshots into the out dir", () => {
    const outDir = path.join(tempDir("out"), "snapshots");
    const lines = runE2eData({
      dataDir: VALID_MINIMAL,
      outDir,
      now: NOW,
      generatedAt: "2026-09-29T00:00:00.000Z",
    });
    expect(existsSync(path.join(outDir, "manifest.json"))).toBe(true);
    expect(lines.at(-1)).toMatch(/^data:build: \d+ shards/);
  });

  it("stops before building when the data is invalid", () => {
    const outDir = path.join(tempDir("out-invalid"), "snapshots");
    expect(() =>
      runE2eData({
        dataDir: "tests/fixtures/data/invalid-structure",
        outDir,
        now: NOW,
        generatedAt: "2026-09-29T00:00:00.000Z",
      }),
    ).toThrow(/data:check failed/);
    expect(existsSync(path.join(outDir, "manifest.json"))).toBe(false);
  });
});
