import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  applyDictionary,
  BATCH_SIZE,
  batchPath,
  buildTodo,
  checkDictionary,
  chunk,
  DICTIONARY_FILE,
  type DictionaryEntry,
  markReviewed,
  mergeRows,
  parseBatchRows,
  readDictionary,
  reviewSheet,
  scanDataDir,
  type TodoEntry,
  usageOf,
  type Violation,
  writeDictionary,
} from "./translate-ar-core";

const TODO_FILE = "data-staging/translations/ar-todo.json";
const REVIEW_FILE = "data-staging/translations/AR-REVIEW.md";

type Args = {
  command: string;
  positional: string[];
  out: string | null;
  dataDir: string;
  dictionary: string;
  frFile: string | null;
  dryRun: boolean;
  onlyReviewed: boolean;
  all: boolean;
};

export class UsageError extends Error {}

const VALUE_FLAGS = new Set(["--out", "--data-dir", "--dictionary", "--fr-file"]);
const BOOLEAN_FLAGS = new Set(["--dry-run", "--only-reviewed", "--all"]);

export function parseArgs(argv: readonly string[]): Args {
  const args: Args = {
    command: "",
    positional: [],
    out: null,
    dataDir: "data",
    dictionary: DICTIONARY_FILE,
    frFile: null,
    dryRun: false,
    onlyReviewed: false,
    all: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    if (VALUE_FLAGS.has(arg)) {
      const value = argv[++i];
      if (value === undefined || value.startsWith("--"))
        throw new UsageError(`${arg} needs a value`);
      if (arg === "--out") args.out = value;
      else if (arg === "--data-dir") args.dataDir = value;
      else if (arg === "--dictionary") args.dictionary = value;
      else args.frFile = value;
    } else if (BOOLEAN_FLAGS.has(arg)) {
      if (arg === "--dry-run") args.dryRun = true;
      else if (arg === "--only-reviewed") args.onlyReviewed = true;
      else args.all = true;
    } else if (arg.startsWith("--")) {
      throw new UsageError(`unknown option ${arg}`);
    } else if (args.command === "") {
      args.command = arg;
    } else {
      args.positional.push(arg);
    }
  }
  return args;
}

export function writeTodoFiles(
  entries: readonly TodoEntry[],
  out: string,
): { batches: number; files: string[] } {
  mkdirSync(path.dirname(out), { recursive: true });
  const base = path.basename(out).replace(/\.json$/, "");
  const stale = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-batch-\\d+\\.json$`);
  for (const name of readdirSync(path.dirname(out))) {
    if (stale.test(name)) rmSync(path.join(path.dirname(out), name));
  }
  const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
  writeFileSync(out, json(entries));
  const batches = chunk(entries, BATCH_SIZE);
  const files = batches.map((_, index) => batchPath(out, index + 1));
  batches.forEach((batch, index) => {
    writeFileSync(batchPath(out, index + 1), json(batch));
  });
  return { batches: batches.length, files };
}

function printViolations(violations: readonly Violation[]): void {
  for (const v of violations) {
    const label = v.severity === "error" ? "ERROR" : "warning";
    console.log(`${label} [${v.rule}] ${v.message}\n    fr: ${v.fr}`);
  }
}

function printCounts(label: string, counts: Record<string, number>): void {
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (rows.length === 0) return;
  console.log(`${label}:`);
  for (const [collection, count] of rows) console.log(`  ${collection}: ${count}`);
}

function runExport(args: Args): void {
  const summary = scanDataDir(args.dataDir);
  const dictionary = readDictionary(args.dictionary);
  const todo = buildTodo(summary, dictionary);
  const { batches } = writeTodoFiles(todo.entries, args.out ?? TODO_FILE);
  console.log(
    `${todo.missingNodes} nodes lack ar; ${todo.excludedNodes} are covered by the dictionary; ${todo.entries.length} unique French texts to translate in ${batches} batch file(s) of at most ${BATCH_SIZE}.`,
  );
  console.log(`wrote ${args.out ?? TODO_FILE} and ${batches} batch file(s) next to it`);
  if (summary.frWithoutStatus > 0)
    console.warn(
      `warning: ${summary.frWithoutStatus} fr objects have text but no status (skipped)`,
    );
  if (summary.unsupportedLayout > 0)
    console.warn(`warning: ${summary.unsupportedLayout} nodes have an inline layout (skipped)`);
  if (summary.extraKeyNodes > 0)
    console.warn(`note: ${summary.extraKeyNodes} nodes have keys other than fr, en and ar`);
}

function runApply(args: Args): number {
  const dictionary = readDictionary(args.dictionary);
  const errors = checkDictionary(dictionary).filter((v) => v.severity === "error");
  if (errors.length > 0) {
    printViolations(errors);
    console.error(`the dictionary has ${errors.length} error(s): run data:translate-ar check`);
    return 1;
  }
  const summary = scanDataDir(args.dataDir);
  const result = applyDictionary(summary, {
    dictionary,
    dryRun: args.dryRun,
    onlyReviewed: args.onlyReviewed,
  });
  console.log(args.dryRun ? "dry run: nothing written" : `${result.filesChanged} file(s) written`);
  printCounts("nodes filled per collection", result.filledByCollection);
  printCounts("draft nodes upgraded to reviewed per collection", result.upgradedByCollection);
  console.log(`nodes filled: ${result.filled}`);
  console.log(`draft nodes upgraded to reviewed: ${result.upgraded}`);
  console.log(`entries used: ${result.usedEntries}`);
  console.log(`entries unused: ${result.unusedEntries}`);
  console.log(`nodes still missing: ${result.stillMissing}`);
  return 0;
}

function runCheck(args: Args): number {
  const dictionary = readDictionary(args.dictionary);
  const violations = checkDictionary(dictionary);
  printViolations(violations);
  const errors = violations.filter((v) => v.severity === "error").length;
  console.log(
    `${dictionary.length} entries: ${errors} error(s), ${violations.length - errors} warning(s)`,
  );
  return errors > 0 ? 1 : 0;
}

function runMerge(args: Args): number {
  if (args.positional.length === 0) throw new UsageError("merge needs at least one batch file");
  const rows = args.positional.flatMap((file) =>
    parseBatchRows(JSON.parse(readFileSync(file, "utf8"))),
  );
  const dictionary = readDictionary(args.dictionary);
  const todo = buildTodo(scanDataDir(args.dataDir), dictionary);
  const result = mergeRows(dictionary, rows, new Set(todo.entries.map((entry) => entry.fr)));
  writeDictionary(args.dictionary, result.entries);
  console.log(
    `${rows.length} rows read: ${result.added} added, ${result.unchanged} already in the dictionary unchanged, ${result.conflicts.length} conflict(s), ${result.unknown.length} unknown, ${result.rejected.length} rejected`,
  );
  for (const c of result.conflicts)
    console.log(
      `CONFLICT kept the dictionary text\n    fr: ${c.fr}\n    kept: ${c.kept}\n    offered: ${c.offered}`,
    );
  for (const fr of result.unknown)
    console.warn(`warning: not in the current todo (skipped)\n    fr: ${fr}`);
  for (const r of result.rejected) console.log(`REJECTED ${r.reason}\n    fr: ${r.fr}`);
  const violations = checkDictionary(result.entries);
  const errors = violations.filter((v) => v.severity === "error");
  if (violations.length > 0) {
    printViolations(violations);
    console.log(
      `after the merge: ${errors.length} error(s), ${violations.length - errors.length} warning(s)`,
    );
  }
  return result.conflicts.length > 0 || result.rejected.length > 0 ? 1 : 0;
}

function runReview(args: Args): void {
  const dictionary = readDictionary(args.dictionary);
  const usage = usageOf(scanDataDir(args.dataDir));
  const out = args.out ?? REVIEW_FILE;
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, reviewSheet(dictionary, usage));
  console.log(`wrote ${out} (${dictionary.length} entries)`);
}

function runMarkReviewed(args: Args): number {
  if (!args.all && args.frFile === null)
    throw new UsageError("mark-reviewed needs --all or --fr-file");
  const dictionary: DictionaryEntry[] = readDictionary(args.dictionary);
  const selection =
    args.all || args.frFile === null
      ? "all"
      : new Set(
          readFileSync(args.frFile, "utf8")
            .split(/\r?\n/)
            .filter((line) => line.trim() !== ""),
        );
  const result = markReviewed(dictionary, selection);
  writeDictionary(args.dictionary, result.entries);
  console.log(`${result.changed} entries marked reviewed`);
  for (const fr of result.missing) console.warn(`warning: not in the dictionary\n    fr: ${fr}`);
  return 0;
}

function main(argv: readonly string[]): number {
  const args = parseArgs(argv);
  switch (args.command) {
    case "export":
      runExport(args);
      return 0;
    case "apply":
      return runApply(args);
    case "check":
      return runCheck(args);
    case "merge":
      return runMerge(args);
    case "review":
      runReview(args);
      return 0;
    case "mark-reviewed":
      return runMarkReviewed(args);
    default:
      throw new UsageError(
        "usage: data:translate-ar <export|merge|check|apply|review|mark-reviewed> [options]",
      );
  }
}

if (process.argv[1]?.endsWith("translate-ar.ts") === true) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
