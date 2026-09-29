import { pathToFileURL } from "node:url";

import type { IsoDate } from "@/data-schema/dates";

import type { DataCliArgs } from "./cli-args";
import { CliUsageError, parseDataCliArgs } from "./cli-args";
import { loadData } from "./load-data";
import type { CheckOutput } from "./report";
import { formatReport } from "./report";
import { validateData } from "./validate";

function todayUtc(): IsoDate {
  return new Date().toISOString().slice(0, 10);
}

export function runCheck(args: DataCliArgs): CheckOutput {
  const result = validateData(loadData(args.dataDir), { now: args.now ?? todayUtc() });
  return formatReport(result, { strict: args.strict });
}

function main(): void {
  let args: DataCliArgs;
  try {
    args = parseDataCliArgs(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof CliUsageError)) throw error;
    console.error(`data:check: ${error.message}`);
    process.exitCode = 2;
    return;
  }
  const output = runCheck(args);
  for (const line of output.stderr) console.error(line);
  for (const line of output.stdout) console.log(line);
  process.exitCode = output.exitCode;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
