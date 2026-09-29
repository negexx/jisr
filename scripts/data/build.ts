// CLI entry, deliberately thin: it runs main() unconditionally. Do not add a "run only when
// this file is the script" guard comparing the module URL with the script argument: Node
// realpaths one and not the other, so under a symlink, junction or subst drive the guard
// skips main(), prints nothing and exits 0 (fail open). Logic lives in run-build.ts, which
// tests import.
import { CliUsageError, parseDataCliArgs } from "./cli-args";
import { formatBuildSummary, runBuild } from "./run-build";
import { todayUtc } from "./run-check";

function main(): void {
  process.exitCode = 1;
  try {
    const args = parseDataCliArgs(process.argv.slice(2));
    if (args.strict) throw new CliUsageError("--strict is not supported by data:build");
    const manifest = runBuild({
      dataDir: args.dataDir,
      outDir: args.outDir,
      generatedAt: new Date().toISOString(),
      now: args.now ?? todayUtc(),
    });
    console.log(formatBuildSummary(manifest));
    process.exitCode = 0;
  } catch (error) {
    console.error(`data:build: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = error instanceof CliUsageError ? 2 : 1;
  }
}

main();
