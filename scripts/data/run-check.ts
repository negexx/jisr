import { existsSync } from "node:fs";

import type { IsoDate } from "@/data-schema/dates";

import type { DataCliArgs } from "./cli-args";
import { DEFAULT_DATA_DIR, loadData } from "./load-data";
import type { CheckOutput } from "./report";
import { formatReport } from "./report";
import { validateData } from "./validate";

export function todayUtc(): IsoDate {
  return new Date().toISOString().slice(0, 10);
}

export function runCheck(args: DataCliArgs): CheckOutput {
  const result = validateData(loadData(args.dataDir), { now: args.now ?? todayUtc() });
  const output = formatReport(result, { strict: args.strict });
  if (args.dataDir === DEFAULT_DATA_DIR && !existsSync(args.dataDir)) {
    output.stdout.unshift(`WARN data directory not found: ${args.dataDir}`);
  }
  return output;
}
