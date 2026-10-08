// CLI entry, deliberately thin: it runs main() unconditionally (see scripts/data/build.ts for why
// there is no "is this the entry script" guard). Logic lives in checks.ts and run.ts, which tests import.
// Usage: pnpm ops:smoke <base-url> --expect=indexable|noindex
// Read-only: only GET requests, no secrets, and neither bodies nor header values are printed.
import { runSmoke } from "./run";

const USAGE = "Usage: pnpm ops:smoke <base-url> --expect=indexable|noindex";

type Args = { baseUrl: string; expectIndexable: boolean };

function parseArgs(argv: string[]): Args | null {
  const flags = argv.filter((arg) => arg.startsWith("--"));
  const positional = argv.filter((arg) => !arg.startsWith("--"));
  const [rawUrl] = positional;
  if (positional.length !== 1 || rawUrl === undefined || flags.length !== 1) return null;
  const expect = flags[0];
  if (expect !== "--expect=indexable" && expect !== "--expect=noindex") return null;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  return { baseUrl: url.origin, expectIndexable: expect === "--expect=indexable" };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args === null) {
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }
  const results = await runSmoke(args.baseUrl, args.expectIndexable);
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
