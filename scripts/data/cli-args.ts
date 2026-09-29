import type { IsoDate } from "@/data-schema/dates";
import { isValidIsoDate } from "@/data-schema/dates";

export type DataCliArgs = { dataDir: string; outDir: string; strict: boolean; now: IsoDate | null };

export class CliUsageError extends Error {}

function flagValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new CliUsageError(`${flag} needs a value`);
  }
  return value;
}

export function parseDataCliArgs(argv: readonly string[]): DataCliArgs {
  const args: DataCliArgs = {
    dataDir: "data",
    outDir: "public/snapshots",
    strict: false,
    now: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    switch (flag) {
      case "--data-dir":
        args.dataDir = flagValue(argv, i++, flag);
        break;
      case "--out-dir":
        args.outDir = flagValue(argv, i++, flag);
        break;
      case "--now": {
        const now = flagValue(argv, i++, flag);
        if (!isValidIsoDate(now)) throw new CliUsageError(`--now expects a real date YYYY-MM-DD`);
        args.now = now;
        break;
      }
      case "--strict":
        args.strict = true;
        break;
      default:
        throw new CliUsageError(`unknown argument ${flag}`);
    }
  }
  return args;
}
