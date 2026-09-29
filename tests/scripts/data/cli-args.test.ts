import { CliUsageError, parseDataCliArgs } from "@scripts/data/cli-args";
import { describe, expect, it } from "vitest";

describe("parseDataCliArgs", () => {
  it("returns the defaults for no arguments", () => {
    expect(parseDataCliArgs([])).toEqual({
      dataDir: "data",
      outDir: "public/snapshots",
      strict: false,
      now: null,
    });
  });

  const parsed: Array<[string, string[], Record<string, unknown>]> = [
    ["--data-dir", ["--data-dir", "somewhere"], { dataDir: "somewhere" }],
    ["--out-dir", ["--out-dir", "out"], { outDir: "out" }],
    ["--strict", ["--strict"], { strict: true }],
    ["--now", ["--now", "2026-09-29"], { now: "2026-09-29" }],
  ];

  it.each(parsed)("parses %s", (_flag, argv, expected) => {
    expect(parseDataCliArgs(argv)).toMatchObject(expected);
  });

  const rejected: Array<[string, string[]]> = [
    ["unknown flag", ["--bogus"]],
    ["positional argument", ["somewhere"]],
    ["--data-dir without a value", ["--data-dir"]],
    ["--data-dir followed by a flag", ["--data-dir", "--strict"]],
    ["--out-dir without a value", ["--out-dir"]],
    ["--now without a value", ["--now"]],
    ["--now that is not a real date", ["--now", "2026-02-30"]],
    ["--now with the wrong shape", ["--now", "29/09/2026"]],
  ];

  it.each(rejected)("rejects %s", (_name, argv) => {
    expect(() => parseDataCliArgs(argv)).toThrow(CliUsageError);
  });
});
