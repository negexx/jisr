// CLI entry, deliberately thin: it runs main() unconditionally (see scripts/data/check.ts for why
// there is no "is this the entry script" guard). Logic lives in run-e2e-data.ts, which tests import.
// Builds the fixture snapshots only; `next build` / `next dev` are chained by the package.json scripts.
import { todayUtc } from "../data/run-check";
import { resolveE2eDataDir, runE2eData } from "./run-e2e-data";

function main(): void {
  process.exitCode = 1;
  try {
    const dataDir = resolveE2eDataDir(process.env);
    const lines = runE2eData({
      dataDir,
      outDir: "public/snapshots",
      generatedAt: new Date().toISOString(),
      now: todayUtc(),
    });
    console.log(`e2e data: ${dataDir}`);
    for (const line of lines) console.log(line);
    process.exitCode = 0;
  } catch (error) {
    console.error(`e2e:data: ${error instanceof Error ? error.message : String(error)}`);
  }
}

main();
