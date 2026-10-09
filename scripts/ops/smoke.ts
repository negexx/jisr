// CLI entry, deliberately thin: it runs main() unconditionally (see scripts/data/build.ts for why
// there is no "is this the entry script" guard). Logic lives in args.ts, checks.ts and run.ts, which
// tests import.
// Usage: pnpm ops:smoke <base-url> --expect=indexable|noindex [--min-urls=N]
// Read-only: only GET requests, no secrets, and neither bodies nor header values are printed.
import { parseSmokeArgs, USAGE } from "./args";
import { runSmoke } from "./run";

async function main(): Promise<void> {
  const args = parseSmokeArgs(process.argv.slice(2));
  if (args === null) {
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }
  const results = await runSmoke(args.baseUrl, args.expectIndexable, { minUrls: args.minUrls });
  for (const result of results) {
    console.log(
      result.ok ? `PASS ${result.name}` : `FAIL ${result.name}: ${result.reason ?? "failed"}`,
    );
  }
  const failed = results.filter((result) => !result.ok).length;
  console.log(`${results.length - failed} passed, ${failed} failed`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main();
