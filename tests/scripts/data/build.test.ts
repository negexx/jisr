import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { BuildError } from "@scripts/data/build-error";
import { sha256Hex } from "@scripts/data/hash";
import { assertShardBudget, formatBuildSummary, runBuild } from "@scripts/data/run-build";
import { describe, expect, it } from "vitest";
import type { Manifest } from "@/data-schema/snapshot";
import { ManifestSchema } from "@/data-schema/snapshot";

const FIXTURES = "tests/fixtures/data";
const NOW = "2026-09-29";
const GENERATED_AT = "2026-09-29T00:00:00.000Z";
const ROOT = process.cwd();
const BUILD_ENTRY = path.join(ROOT, "scripts/data/build.ts");
const TSX_LOADER = pathToFileURL(path.join(ROOT, "node_modules/tsx/dist/esm/index.mjs")).href;

function tempDir(label: string): string {
  return mkdtempSync(path.join(tmpdir(), `jisr-build-${label}-`));
}

function build(dataDir: string, outDir: string, extra: { generatedAt?: string } = {}): Manifest {
  return runBuild({
    dataDir,
    outDir,
    generatedAt: extra.generatedAt ?? GENERATED_AT,
    now: NOW,
  });
}

function cli(args: string[], opts: { cwd?: string; entry?: string } = {}) {
  const result = spawnSync(
    process.execPath,
    ["--import", TSX_LOADER, opts.entry ?? BUILD_ENTRY, ...args],
    {
      encoding: "utf8",
      cwd: opts.cwd ?? ROOT,
      env: { ...process.env, TSX_TSCONFIG_PATH: path.join(ROOT, "tsconfig.json") },
      timeout: 60_000,
    },
  );
  return { exit: result.status, stdout: result.stdout, stderr: result.stderr };
}

function shardEntry(manifest: Manifest, name: string) {
  const entry = manifest.shards[name];
  if (entry === undefined) throw new Error(`no shard ${name}`);
  return entry;
}

describe("runBuild", () => {
  it("builds a core-only snapshot from an existing empty data dir", () => {
    const outDir = tempDir("empty");
    const manifest = build(`${FIXTURES}/empty`, outDir);
    expect(Object.keys(manifest.shards)).toEqual(["core"]);
    expect(readdirSync(path.join(outDir, "s"))).toHaveLength(1);
    expect(manifest.locales).toEqual(["fr", "en", "ar"]);
  });

  it("fails when the data dir does not exist, and writes nothing", () => {
    const outDir = tempDir("missing");
    expect(() => build(`${FIXTURES}/does-not-exist`, outDir)).toThrow(BuildError);
    expect(() => build(`${FIXTURES}/does-not-exist`, outDir)).toThrow(/data directory not found/);
    expect(readdirSync(outDir)).toEqual([]);
  });

  it("fails when the data dir is a file", () => {
    const outDir = tempDir("file");
    expect(() => build("package.json", outDir)).toThrow(/data directory not found/);
    expect(readdirSync(outDir)).toEqual([]);
  });

  it("runs the full pipeline on valid-minimal", () => {
    const outDir = tempDir("full");
    const manifest = build(`${FIXTURES}/valid-minimal`, outDir);
    expect(Object.keys(manifest.shards)).toHaveLength(25);
    for (const entry of Object.values(manifest.shards)) {
      const bytes = readFileSync(path.join(outDir, entry.file));
      expect(sha256Hex(bytes)).toBe(entry.sha256);
      expect(entry.file).toContain(`.${entry.sha256.slice(0, 12)}.json`);
      expect(entry.bytes).toBe(bytes.length);
      expect(bytes.at(-1)).not.toBe(0x0a);
    }
    const manifestBytes = readFileSync(path.join(outDir, "manifest.json"));
    expect(manifestBytes.at(-1)).not.toBe(0x0a);
    expect(ManifestSchema.parse(JSON.parse(manifestBytes.toString("utf8")))).toEqual(manifest);
    const core = JSON.parse(
      readFileSync(path.join(outDir, shardEntry(manifest, "core").file), "utf8"),
    );
    expect(core.kind).toBe("core");
  });

  it("is deterministic: same input gives identical hashes, versions and file bytes", () => {
    const [outA, outB] = [tempDir("det-a"), tempDir("det-b")];
    const a = build(`${FIXTURES}/valid-minimal`, outA, { generatedAt: GENERATED_AT });
    const b = build(`${FIXTURES}/valid-minimal`, outB, { generatedAt: "2030-01-01T12:00:00.000Z" });
    expect(a.snapshotVersion).toBe(b.snapshotVersion);
    expect(a.shards).toEqual(b.shards);
    expect(a.generatedAt).not.toBe(b.generatedAt);
    for (const entry of Object.values(a.shards)) {
      expect(readFileSync(path.join(outA, entry.file))).toEqual(
        readFileSync(path.join(outB, entry.file)),
      );
    }
  });

  it("changes the version and only the affected shard hashes when content changes", () => {
    const dataDir = path.join(tempDir("change-data"), "data");
    cpSync(`${FIXTURES}/valid-minimal`, dataDir, { recursive: true });
    const before = build(dataDir, tempDir("change-a"));

    const programFile = path.join(dataDir, "programs", "xx-test-prog.yaml");
    const original = readFileSync(programFile, "utf8");
    expect(original).toContain("name: XX Test Programme");
    writeFileSync(programFile, original.replace("name: XX Test Programme", "name: XX Renamed"));
    const after = build(dataDir, tempDir("change-b"));

    expect(after.snapshotVersion).not.toBe(before.snapshotVersion);
    const programs = "programs.XB.xx-test-field";
    expect(shardEntry(after, programs).sha256).not.toBe(shardEntry(before, programs).sha256);
    expect(shardEntry(after, "core").sha256).toBe(shardEntry(before, "core").sha256);
    expect(shardEntry(after, `text.fr.${programs}`).sha256).toBe(
      shardEntry(before, `text.fr.${programs}`).sha256,
    );
  });

  it("changes only a text shard when a translation changes", () => {
    const dataDir = path.join(tempDir("text-data"), "data");
    cpSync(`${FIXTURES}/valid-minimal`, dataDir, { recursive: true });
    const before = build(dataDir, tempDir("text-a"));
    const fieldFile = path.join(dataDir, "fields", "xx-test-field.yaml");
    writeFileSync(
      fieldFile,
      readFileSync(fieldFile, "utf8").replace("Domaine test", "Domaine test bis"),
    );
    const after = build(dataDir, tempDir("text-b"));
    expect(after.snapshotVersion).not.toBe(before.snapshotVersion);
    expect(shardEntry(after, "core").sha256).toBe(shardEntry(before, "core").sha256);
    expect(shardEntry(after, "text.fr.core").sha256).not.toBe(
      shardEntry(before, "text.fr.core").sha256,
    );
  });

  it("clears stale shard files and the previous manifest", () => {
    const outDir = tempDir("stale");
    mkdirSync(path.join(outDir, "s"));
    const stale = path.join(outDir, "s", "old.000000000000.json");
    writeFileSync(stale, "{}");
    build(`${FIXTURES}/empty`, outDir);
    expect(existsSync(stale)).toBe(false);
  });

  it("fails over budget before touching the out dir", () => {
    const outDir = tempDir("budget");
    const run = () =>
      runBuild({
        dataDir: `${FIXTURES}/valid-minimal`,
        outDir,
        generatedAt: GENERATED_AT,
        now: NOW,
        gzipBudgetBytes: 50,
      });
    expect(run).toThrow(BuildError);
    expect(run).toThrow(/over the 50 byte budget/);
    expect(existsSync(path.join(outDir, "manifest.json"))).toBe(false);
    expect(existsSync(path.join(outDir, "s"))).toBe(false);
  });

  it("refuses invalid data and leaves existing output untouched", () => {
    const outDir = tempDir("invalid");
    build(`${FIXTURES}/empty`, outDir);
    const before = readdirSync(path.join(outDir, "s"));
    expect(() => build(`${FIXTURES}/invalid-missing-source`, outDir)).toThrow(BuildError);
    expect(() => build(`${FIXTURES}/invalid-missing-source`, outDir)).toThrow(/data is invalid/);
    expect(readdirSync(path.join(outDir, "s"))).toEqual(before);
    expect(existsSync(path.join(outDir, "manifest.json"))).toBe(true);
  });

  it("refuses every invalid fixture", () => {
    for (const scenario of [
      "invalid-bad-reference",
      "invalid-http-source",
      "invalid-structure",
      "invalid-missing-source",
    ]) {
      const outDir = tempDir(scenario);
      expect(() => build(`${FIXTURES}/${scenario}`, outDir)).toThrow(/data is invalid/);
      expect(readdirSync(outDir)).toEqual([]);
    }
  });
});

describe("assertShardBudget", () => {
  it("throws BuildError for an incompressible shard over the real budget", () => {
    expect(() => assertShardBudget("core", randomBytes(400 * 1024), 300 * 1024)).toThrow(
      BuildError,
    );
  });

  it("returns the gzip size when within budget", () => {
    expect(assertShardBudget("core", new TextEncoder().encode("{}"), 300 * 1024)).toBeGreaterThan(
      0,
    );
  });
});

describe("formatBuildSummary", () => {
  it("names the largest shard by gzip size", () => {
    const outDir = tempDir("summary");
    const manifest = build(`${FIXTURES}/valid-minimal`, outDir);
    const line = formatBuildSummary(manifest);
    expect(line).toMatch(
      new RegExp(
        `^data:build: 25 shards, snapshot ${manifest.snapshotVersion}, largest \\S+ \\d+ B gzip$`,
      ),
    );
  });
});

describe("data:build CLI", () => {
  it("builds valid-minimal and prints the summary", () => {
    const outDir = tempDir("cli-ok");
    const result = cli([
      "--data-dir",
      `${FIXTURES}/valid-minimal`,
      "--out-dir",
      outDir,
      "--now",
      NOW,
    ]);
    expect(result.stderr).toBe("");
    expect(result.exit).toBe(0);
    expect(result.stdout).toMatch(
      /^data:build: 25 shards, snapshot [0-9a-f]{12}, largest \S+ \d+ B gzip\n$/,
    );
    expect(existsSync(path.join(outDir, "manifest.json"))).toBe(true);
  }, 60_000);

  it("fails with exit 1 and writes nothing when the data dir is missing", () => {
    const outDir = tempDir("cli-missing");
    const result = cli(["--data-dir", `${FIXTURES}/does-not-exist`, "--out-dir", outDir]);
    expect(result.exit).toBe(1);
    expect(result.stderr).toMatch(/^data:build: data directory not found/);
    expect(readdirSync(outDir)).toEqual([]);
  }, 60_000);

  it("fails with exit 1 when the default data dir is missing", () => {
    const cwd = tempDir("cli-cwd");
    const result = cli(["--out-dir", path.join(cwd, "out")], { cwd });
    expect(result.exit).toBe(1);
    expect(result.stderr).toMatch(/^data:build: data directory not found/);
    expect(existsSync(path.join(cwd, "out"))).toBe(false);
  }, 60_000);

  it("fails with exit 1 on invalid data and writes nothing", () => {
    const outDir = tempDir("cli-invalid");
    const result = cli([
      "--data-dir",
      `${FIXTURES}/invalid-missing-source`,
      "--out-dir",
      outDir,
      "--now",
      NOW,
    ]);
    expect(result.exit).toBe(1);
    expect(result.stderr).toContain("data:build: data is invalid; run pnpm data:check");
    expect(result.stdout).toBe("");
    expect(readdirSync(outDir)).toEqual([]);
  }, 60_000);

  const usageErrors: Array<{ name: string; args: string[]; message: string }> = [
    { name: "unknown flag", args: ["--bogus"], message: "data:build: unknown argument --bogus" },
    {
      name: "invalid --now",
      args: ["--now", "2026-02-30"],
      message: "data:build: --now expects a real date",
    },
    {
      name: "--strict",
      args: ["--strict"],
      message: "data:build: --strict is not supported by data:build",
    },
  ];
  it.each(usageErrors)("exits 2 on $name", ({ args, message }) => {
    const result = cli(args);
    expect(result.exit).toBe(2);
    expect(result.stderr).toContain(message);
    expect(result.stdout).toBe("");
  }, 60_000);

  it("fails closed with a clean message when the data dir cannot be read", () => {
    const outDir = tempDir("cli-unreadable");
    const result = cli(["--data-dir", "package.json", "--out-dir", outDir]);
    expect(result.exit).toBe(1);
    expect(result.stderr).toMatch(/^data:build: \S/);
    expect(result.stderr).not.toMatch(/\n\s+at /);
    expect(readdirSync(outDir)).toEqual([]);
  }, 60_000);

  describe("entry point is fail-closed", () => {
    const args = (outDir: string) => [
      "--data-dir",
      `${FIXTURES}/invalid-missing-source`,
      "--out-dir",
      outDir,
      "--now",
      NOW,
    ];

    it("has no import.meta.url / argv[1] guard that could skip main()", () => {
      const source = readFileSync(BUILD_ENTRY, "utf8");
      expect(source).not.toMatch(/import\.meta\.url/);
      expect(source).not.toMatch(/argv\[1\]/);
    });

    it("runs through a path spelled with a .. segment", () => {
      const entry = path.join(ROOT, "scripts", "data", "..", "data", "build.ts");
      const result = cli(args(tempDir("cli-dotdot")), { entry });
      expect(result.exit).toBe(1);
      expect(result.stderr).toContain("data:build: data is invalid");
    }, 60_000);

    it("runs through a directory junction / symlink to scripts/", () => {
      const link = path.join(mkdtempSync(path.join(tmpdir(), "jisr-scripts-link-")), "scripts");
      symlinkSync(path.join(ROOT, "scripts"), link, "junction");
      const result = cli(args(tempDir("cli-link")), { entry: path.join(link, "data", "build.ts") });
      expect(result.exit).toBe(1);
      expect(result.stderr).toContain("data:build: data is invalid");
    }, 60_000);
  });
});
