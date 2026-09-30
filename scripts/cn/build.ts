// CLI entry, deliberately thin (see scripts/data/build.ts): runs unconditionally.
// Usage: pnpm cn:build
import { build } from "cn/build";

import { CN_BUILD_OPTIONS } from "./options";

async function main(): Promise<void> {
  process.exitCode = 1;
  try {
    const result = await build({ ...CN_BUILD_OPTIONS });
    for (const warning of result.warnings) console.warn(`cn:build: ${warning}`);
    console.log(
      `cn:build: ${result.usedGroups}/${result.totalGroups} class groups kept from ${result.scannedFiles} files (${result.changed ? "written" : "unchanged"}) -> ${CN_BUILD_OPTIONS.out}`,
    );
    process.exitCode = 0;
  } catch (error) {
    console.error(`cn:build: ${error instanceof Error ? error.message : String(error)}`);
  }
}

await main();
