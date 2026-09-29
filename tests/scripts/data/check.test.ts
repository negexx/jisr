import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { runCheck } from "@scripts/data/run-check";
import { describe, expect, it } from "vitest";

const FIXTURES = "tests/fixtures/data";
const NOW = "2026-09-29";
const ROOT = process.cwd();
const CHECK_ENTRY = path.join(ROOT, "scripts/data/check.ts");
// Absolute so the loader resolves even when a test runs the CLI from another cwd.
const TSX_LOADER = pathToFileURL(path.join(ROOT, "node_modules/tsx/dist/esm/index.mjs")).href;

function cli(args: string[], opts: { cwd?: string; entry?: string } = {}) {
  const result = spawnSync(
    process.execPath,
    ["--import", TSX_LOADER, opts.entry ?? CHECK_ENTRY, ...args],
    {
      encoding: "utf8",
      cwd: opts.cwd ?? ROOT,
      env: { ...process.env, TSX_TSCONFIG_PATH: path.join(ROOT, "tsconfig.json") },
      timeout: 60_000,
    },
  );
  return { exit: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe("data:check CLI", () => {
  type Row = {
    name: string;
    args: string[];
    exit: number;
    stdout: string[];
    stderr: string[];
  };

  const rows: Row[] = [
    {
      name: "empty data dir",
      args: ["--data-dir", `${FIXTURES}/empty`],
      exit: 0,
      stdout: ["data:check: 0 records, 0 errors, 0 warnings", "data:check: OK"],
      stderr: [],
    },
    {
      name: "valid-minimal",
      args: ["--data-dir", `${FIXTURES}/valid-minimal`, "--now", NOW],
      exit: 0,
      stdout: ["16 records, 0 errors, 0 warnings", "data:check: OK"],
      stderr: [],
    },
    {
      name: "invalid-missing-source",
      args: ["--data-dir", `${FIXTURES}/invalid-missing-source`, "--now", NOW],
      exit: 1,
      stdout: ["data:check: FAILED"],
      stderr: ["ERROR grading-scales/xx-test-scale-a.yaml: source: unknown source key"],
    },
    {
      name: "invalid-bad-reference",
      args: ["--data-dir", `${FIXTURES}/invalid-bad-reference`, "--now", NOW],
      exit: 1,
      stdout: ["data:check: FAILED"],
      stderr: [
        'ERROR grade-conversions/xx-test-conv.yaml: from: unknown grading-scales "xx-test-scale-nope"',
      ],
    },
    {
      name: "stale data is only a warning report",
      args: ["--data-dir", `${FIXTURES}/stale`, "--now", NOW],
      exit: 0,
      stdout: [
        "STALE grading-scales/xx-test-scale-old.yaml",
        "AGING grading-scales/xx-test-scale-aging.yaml",
        "1 stale",
        "data:check: OK",
      ],
      stderr: [],
    },
    {
      name: "stale data under --strict",
      args: ["--data-dir", `${FIXTURES}/stale`, "--now", NOW, "--strict"],
      exit: 1,
      stdout: ["data:check: FAILED (--strict: 1 stale)"],
      stderr: [],
    },
    {
      name: "unknown flag is a usage error",
      args: ["--bogus"],
      exit: 2,
      stdout: [],
      stderr: ["data:check: unknown argument --bogus"],
    },
    {
      name: "invalid --now is a usage error",
      args: ["--now", "2026-02-30"],
      exit: 2,
      stdout: [],
      stderr: ["data:check: --now expects a real date"],
    },
    {
      name: "a missing explicit data dir fails",
      args: ["--data-dir", `${FIXTURES}/does-not-exist`],
      exit: 1,
      stdout: ["data:check: FAILED"],
      stderr: ["data dir not found"],
    },
  ];

  it.each(rows)("$name", ({ args, exit, stdout, stderr }) => {
    const result = cli(args);
    expect(result.exit).toBe(exit);
    for (const text of stdout) expect(result.stdout).toContain(text);
    for (const text of stderr) expect(result.stderr).toContain(text);
  }, 60_000);

  it("fails closed with a clean message when the data dir cannot be read", () => {
    const result = cli(["--data-dir", "package.json"]);
    expect(result.exit).toBe(1);
    expect(result.stderr).toMatch(/^data:check: \S/);
    expect(result.stderr).not.toMatch(/\n\s+at /);
    expect(result.stdout).not.toContain("data:check: OK");
  }, 60_000);

  it("warns and passes when the default data dir does not exist", () => {
    const result = cli([], { cwd: mkdtempSync(path.join(tmpdir(), "jisr-data-check-")) });
    expect(result.exit).toBe(0);
    expect(result.stdout).toContain("WARN data directory not found: data");
    expect(result.stdout).toContain("data:check: 0 records, 0 errors, 0 warnings");
  }, 60_000);

  describe("entry point is fail-closed", () => {
    const args = ["--data-dir", `${FIXTURES}/invalid-missing-source`, "--now", NOW];

    it("has no import.meta.url / argv[1] guard that could skip main()", () => {
      const source = readFileSync(CHECK_ENTRY, "utf8");
      expect(source).not.toMatch(/import\.meta\.url/);
      expect(source).not.toMatch(/argv\[1\]/);
    });

    it("runs through a path spelled with a .. segment", () => {
      const entry = path.join(ROOT, "scripts", "data", "..", "data", "check.ts");
      const result = cli(args, { entry });
      expect(result.exit).toBe(1);
      expect(result.stderr).toContain("ERROR grading-scales/xx-test-scale-a.yaml:");
    }, 60_000);

    it("runs through a directory junction / symlink to scripts/", () => {
      const link = path.join(mkdtempSync(path.join(tmpdir(), "jisr-scripts-link-")), "scripts");
      symlinkSync(path.join(ROOT, "scripts"), link, "junction");
      const result = cli(args, { entry: path.join(link, "data", "check.ts") });
      expect(result.exit).toBe(1);
      expect(result.stderr).toContain("ERROR grading-scales/xx-test-scale-a.yaml:");
    }, 60_000);
  });
});

describe("runCheck", () => {
  const dataDir = (name: string) => `${FIXTURES}/${name}`;
  const base = { outDir: "unused", strict: false, now: NOW };

  it("orders the report lines: warnings, stale, aging, summaries, verdict", () => {
    const { stdout, stderr, exitCode } = runCheck({ ...base, dataDir: dataDir("stale") });
    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout).toEqual([
      "STALE grading-scales/xx-test-scale-old.yaml: (record) last verified 2020-01-01, 2463 days ago (stable)",
      "AGING grading-scales/xx-test-scale-aging.yaml: (record) last verified 2026-01-01, 271 days ago (stable)",
      "freshness: 0 fresh, 1 aging, 1 stale",
      "translations: fr 0/0 (0 reviewed), en 0/0 (0 reviewed), ar 0/0 (0 reviewed)",
      "data:check: 2 records, 0 errors, 0 warnings",
      "data:check: OK",
    ]);
  });

  it("prints errors to stderr sorted by file, without a path prefix when the path is empty", () => {
    const { stdout, stderr, exitCode } = runCheck({
      ...base,
      dataDir: dataDir("invalid-structure"),
    });
    expect(exitCode).toBe(1);
    const files = stderr.map((line) => line.split(": ")[0]);
    expect(files).toEqual([...files].sort());
    expect(stderr).toContain(
      'ERROR fields/xx-test-renamed.yaml: id "xx-test-other" must equal the file name "xx-test-renamed"',
    );
    expect(stdout.at(-1)).toBe("data:check: FAILED");
  });

  it("prints warnings to stdout and stays green", () => {
    const { stdout, stderr, exitCode } = runCheck({
      ...base,
      dataDir: dataDir("warning-unused-source"),
    });
    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout[0]).toBe(
      'WARN grading-scales/xx-test-scale-w.yaml: sources.extra: source "extra" is never used',
    );
    expect(stdout).toContain("data:check: 1 records, 0 errors, 1 warnings");
    expect(stdout.at(-1)).toBe("data:check: OK");
  });

  it("reports no warning lines for valid-minimal", () => {
    const { stdout, exitCode } = runCheck({ ...base, dataDir: dataDir("valid-minimal") });
    expect(exitCode).toBe(0);
    expect(stdout.some((line) => line.startsWith("WARN "))).toBe(false);
    expect(stdout).toContain("freshness: 26 fresh, 0 aging, 0 stale");
  });

  it("rejects an http:// source URL", () => {
    const { stderr, exitCode } = runCheck({ ...base, dataDir: dataDir("invalid-http-source") });
    expect(exitCode).toBe(1);
    expect(stderr).toEqual([
      "ERROR grading-scales/xx-test-scale-h.yaml: sources.main.url: Expected an https URL",
    ]);
  });

  it("reports a missing explicit data dir as an error", () => {
    const { stderr, exitCode } = runCheck({ ...base, dataDir: dataDir("does-not-exist") });
    expect(exitCode).toBe(1);
    expect(stderr).toEqual([expect.stringContaining("data dir not found")]);
  });
});
