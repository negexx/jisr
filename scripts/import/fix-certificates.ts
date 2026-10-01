import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";

import { certificateUnknown } from "./reader";
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
  const proposalsDir = path.join(STAGING_DIR, "proposals", "programs");
  for (const name of existsSync(proposalsDir) ? await readdir(proposalsDir) : []) {
    if (!name.endsWith(".json")) continue;
    const file = path.join(proposalsDir, name);
    const proposal = JSON.parse(await readFile(file, "utf8")) as Json;
    // a proposal keeps its rules under requirements.rules too
    const { record: fixed, changed } = fixRules(proposal);
    if (changed === 0) continue;
    files++;
    rules += changed;
    if (!dryRun) await writeFile(file, `${JSON.stringify(fixed, null, 2)}\n`);
  }
  console.log(`${dryRun ? "would fix" : "fixed"} ${rules} rule(s) in ${files} file(s)`);
}

if (process.argv[1]?.endsWith("fix-certificates.ts") === true) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
