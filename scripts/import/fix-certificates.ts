import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";

import { certificateUnknown } from "./proposals";
import { DATA_DIR, STAGING_DIR, toYaml } from "./staging";

// A language rule that says a certificate is required but names no accepted tests means "any
// certificate counts, in any language" in the matcher. This rewrites it to "certificate requirement
// unknown" (certificateRequired: null) in data/programs and in the saved proposals, so a later restage
// cannot bring the permissive rule back. The change only removes a way to be satisfied.
// Usage: data:fix-certificates [--dry-run]
type Json = Record<string, unknown>;

export function fixRules(record: Json): { record: Json; changed: number } {
  const requirements = record.requirements;
  if (typeof requirements !== "object" || requirements === null) return { record, changed: 0 };
  const rules = (requirements as Json).rules;
  if (!Array.isArray(rules)) return { record, changed: 0 };
  let changed = 0;
  const next = rules.map((rule) => {
    if (typeof rule !== "object" || rule === null) return rule;
    const fixed = certificateUnknown(rule as Json);
    if (fixed !== rule) changed++;
    return fixed;
  });
  return {
    record: { ...record, requirements: { ...(requirements as Json), rules: next } },
    changed,
  };
}

async function main(argv: readonly string[]): Promise<void> {
  const dryRun = argv.includes("--dry-run");
  let files = 0;
  let rules = 0;
  const dataDir = path.join(DATA_DIR, "programs");
  for (const name of existsSync(dataDir) ? await readdir(dataDir) : []) {
    if (!name.endsWith(".yaml")) continue;
    const file = path.join(dataDir, name);
    const record = parse(await readFile(file, "utf8")) as Json;
    const { record: fixed, changed } = fixRules(record);
    if (changed === 0) continue;
    files++;
    rules += changed;
    if (!dryRun) await writeFile(file, toYaml(fixed));
  }
  // staged records already applied from an older proposal, so they cannot be promoted as they are
  const stagedDir = path.join(STAGING_DIR, "programs");
  for (const name of existsSync(stagedDir) ? await readdir(stagedDir) : []) {
    if (!name.endsWith(".yaml")) continue;
    const file = path.join(stagedDir, name);
    const record = parse(await readFile(file, "utf8")) as Json;
    const { record: fixed, changed } = fixRules(record);
    if (changed === 0) continue;
    files++;
    rules += changed;
    if (!dryRun) await writeFile(file, toYaml(fixed));
  }
  // saved proposals (the ones verify reads) and the reader's output folders (one level down; raw/
  // keeps what the model wrote and is left as it is)
  const jsonDirs = [path.join(STAGING_DIR, "proposals", "programs")];
  const readDir = path.join(STAGING_DIR, "proposals-read");
  if (existsSync(readDir)) {
    for (const run of await readdir(readDir)) jsonDirs.push(path.join(readDir, run));
  }
  for (const dir of jsonDirs) {
    for (const name of existsSync(dir) ? await readdir(dir) : []) {
      if (!name.endsWith(".json")) continue;
      const file = path.join(dir, name);
      let proposal: Json;
      try {
        proposal = JSON.parse(await readFile(file, "utf8")) as Json;
      } catch {
        continue;
      }
      const { record: fixed, changed } = fixRules(proposal);
      if (changed === 0) continue;
      files++;
      rules += changed;
      if (!dryRun)
        await writeFile(
          file,
          `${JSON.stringify(fixed, null, 2)}
`,
        );
    }
  }
  console.log(`${dryRun ? "would fix" : "fixed"} ${rules} rule(s) in ${files} file(s)`);
}

if (process.argv[1]?.endsWith("fix-certificates.ts") === true) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
