import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { runCheck } from "@scripts/data/check";
import { describe, expect, it } from "vitest";

const FIXTURES = "tests/fixtures/data";
const NOW = "2026-09-29";
const CHECK_SCRIPT = path.join(process.cwd(), "scripts/data/check.ts");
// Absolute so the loader resolves even when a test runs the CLI from another cwd.
const TSX_LOADER = pathToFileURL(
  path.join(process.cwd(), "node_modules/tsx/dist/esm/index.mjs"),
).href;

function cli(args: string[], cwd = process.cwd()) {
  const result = spawnSync(process.execPath, ["--import", TSX_LOADER, CHECK_SCRIPT, ...args], {
    encoding: "utf8",
    cwd,
    env: { ...process.env, TSX_TSCONFIG_PATH: path.join(process.cwd(), "tsconfig.json") },
    timeout: 60_000,
  });
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
      name: "usage error",
      args: ["--bogus"],
      exit: 2,
      stdout: [],
      stderr: ["data:check: "],
    },
    {
      name: "invalid --now",
      args: ["--now", "2026-02-30"],
      exit: 2,
      stdout: [],
      stderr: ["data:check: "],
    },
  ];

  it.each(rows)("$name", ({ args, exit, stdout, stderr }) => {
    const result = cli(args);
    expect(result.exit).toBe(exit);
    for (const text of stdout) expect(result.stdout).toContain(text);
    for (const text of stderr) expect(result.stderr).toContain(text);
  }, 60_000);

  it("treats a missing default data dir as empty", () => {
    const result = cli([], mkdtempSync(path.join(tmpdir(), "jisr-data-check-")));
    expect(result.exit).toBe(0);
    expect(result.stdout).toContain("data:check: 0 records, 0 errors, 0 warnings");
  }, 60_000);
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
    expect(stderr).toEqual([...stderr].sort());
    expect(stderr).toContain(
      'ERROR fields/xx-test-renamed.yaml: id "xx-test-other" must equal the file name "xx-test-renamed"',
    );
    expect(stdout.at(-1)).toBe("data:check: FAILED");
  });

  it("prints warnings to stdout and stays green", () => {
    const { stdout, exitCode } = runCheck({ ...base, dataDir: dataDir("valid-minimal") });
    expect(exitCode).toBe(0);
    expect(stdout.some((line) => line.startsWith("WARN "))).toBe(false);
    expect(stdout).toContain("freshness: 26 fresh, 0 aging, 0 stale");
  });

  it("reports a missing data dir as an error", () => {
    const { stderr, exitCode } = runCheck({ ...base, dataDir: dataDir("does-not-exist") });
    expect(exitCode).toBe(1);
    expect(stderr).toEqual([expect.stringContaining("data dir not found")]);
  });
});
