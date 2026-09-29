// CLI entry, deliberately thin: it runs main() unconditionally. Do not add a "run only when
// this file is the script" guard comparing the module URL with the script argument: Node
// realpaths one and not the other, so under a symlink, junction or subst drive the guard
// skips main(), prints nothing and exits 0 (fail open). Logic lives in run-check.ts, which
// tests import.
import { CliUsageError, parseDataCliArgs } from "./cli-args";
import { runCheck } from "./run-check";

function main(): void {
  process.exitCode = 1;
  try {
    const output = runCheck(parseDataCliArgs(process.argv.slice(2)));
    for (const line of output.stderr) console.error(line);
    for (const line of output.stdout) console.log(line);
    process.exitCode = output.exitCode;
  } catch (error) {
    console.error(`data:check: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = error instanceof CliUsageError ? 2 : 1;
  }
}

main();
