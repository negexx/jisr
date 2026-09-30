// CLI entry, deliberately thin: it runs main() unconditionally (see scripts/data/build.ts for why
// there is no "is this the entry script" guard). Logic lives in measure.ts, which tests import.
// Usage: pnpm build && pnpm perf:js [/fr /ar ...]   (default: every prerendered page)
import { discoverRoutes, findZodMarkers, formatReport, measureRoute } from "./measure";

const BUILD_DIR = ".next";

function main(): void {
  process.exitCode = 1;
  try {
    const requested = process.argv.slice(2);
    const routes = requested.length > 0 ? requested : discoverRoutes(BUILD_DIR);
    console.log(formatReport(routes.map((route) => measureRoute(BUILD_DIR, route))));
    const zodChunks = findZodMarkers(BUILD_DIR);
    if (zodChunks.length > 0) {
      console.error(
        `perf:js: Zod reached the browser (about 120 KB gzipped); client code must use the hand-written validators. Chunks: ${zodChunks.join(", ")}`,
      );
      return;
    }
    process.exitCode = 0;
  } catch (error) {
    console.error(`perf:js: ${error instanceof Error ? error.message : String(error)}`);
  }
}

main();
