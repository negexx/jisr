import { readdirSync, statSync } from "node:fs";

import type { IsoDate } from "@/data-schema/dates";
import { formatBuildSummary, runBuild } from "../data/run-build";
import { runCheck } from "../data/run-check";

export const DEFAULT_E2E_DATA_DIR = "tests/fixtures/data/e2e-journey";

export type E2eDataOptions = {
  dataDir: string;
  outDir: string;
  generatedAt: string;
  now: IsoDate;
};

export function resolveE2eDataDir(env: Readonly<Record<string, string | undefined>>): string {
  const override = env.E2E_DATA_DIR?.trim();
  return override === undefined || override === "" ? DEFAULT_E2E_DATA_DIR : override;
}

export function assertUsableDataDir(dataDir: string): void {
  if (statSync(dataDir, { throwIfNoEntry: false })?.isDirectory() !== true) {
    throw new Error(
      `data directory not found: ${dataDir}. Set E2E_DATA_DIR to a fixture directory (default ${DEFAULT_E2E_DATA_DIR}).`,
    );
  }
  if (readdirSync(dataDir).length === 0) {
    throw new Error(
      `data directory is empty: ${dataDir}. An e2e build needs a populated fixture; set E2E_DATA_DIR.`,
    );
  }
}

// Returns the report lines; throws (never returns) when the data does not pass data:check.
export function runE2eData(opts: E2eDataOptions): string[] {
  assertUsableDataDir(opts.dataDir);
  const check = runCheck({
    dataDir: opts.dataDir,
    outDir: opts.outDir,
    strict: false,
    now: opts.now,
  });
  if (check.exitCode !== 0) {
    throw new Error(["data:check failed", ...check.stdout, ...check.stderr].join("\n"));
  }
  const manifest = runBuild(opts);
  return [...check.stdout, formatBuildSummary(manifest)];
}
