import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

import { isMap, isScalar, type Pair, parse, parseDocument, stringify, type YAMLMap } from "yaml";
import { z } from "zod";

export const DICTIONARY_FILE = "scripts/import/translations/ar.json";
export const BATCH_SIZE = 120;

const ARABIC_LETTER = /[ؠ-يٮ-ۓۺ-ۿ]/;

const StatusSchema = z.enum(["draft", "reviewed"]);
export type EntryStatus = z.infer<typeof StatusSchema>;

export const DictionaryEntrySchema = z.strictObject({
  fr: z.string().min(1),
  ar: z
    .string()
    .min(1)
    .refine((text) => ARABIC_LETTER.test(text), "ar must contain Arabic-script letters"),
  status: StatusSchema.default("draft"),
});
export type DictionaryEntry = z.infer<typeof DictionaryEntrySchema>;

export const DictionarySchema = z
  .strictObject({ entries: z.array(DictionaryEntrySchema) })
  .superRefine((dictionary, ctx) => {
    const seen = new Set<string>();
    dictionary.entries.forEach((entry, index) => {
      if (seen.has(entry.fr)) {
        ctx.addIssue({
          code: "custom",
          path: ["entries", index, "fr"],
          message: `duplicate fr: ${entry.fr}`,
        });
      }
      seen.add(entry.fr);
    });
  });

function describeZodError(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
}

export function parseDictionary(json: unknown): DictionaryEntry[] {
  const result = DictionarySchema.safeParse(json);
  if (!result.success) throw new Error(`invalid dictionary: ${describeZodError(result.error)}`);
  return result.data.entries;
}

export function readDictionary(file: string): DictionaryEntry[] {
  if (!existsSync(file)) return [];
  return parseDictionary(JSON.parse(readFileSync(file, "utf8")));
}

function byFrOrder(a: { fr: string }, b: { fr: string }): number {
  return a.fr < b.fr ? -1 : a.fr > b.fr ? 1 : 0;
}

export function writeDictionary(file: string, entries: readonly DictionaryEntry[]): void {
  const sorted = [...entries]
    .sort(byFrOrder)
    .map((entry) => ({ fr: entry.fr, ar: entry.ar, status: entry.status }));
  writeFileSync(file, `${JSON.stringify({ entries: sorted }, null, 2)}\n`);
}

// ---------------------------------------------------------------------------------------------
// Scanning YAML for LocalizedText nodes

type PathKey = string | number;
type Insertion = { offset: number; indent: string; step: string; flow: boolean };
type ExistingArabic = { text: string; status: string; statusRange: [number, number] | null };

export type LocalizedNode = {
  path: PathKey[];
  fr: string;
  en: string | null;
  ar: ExistingArabic | null;
  // null when the node already has `ar`, or its layout (inline flow map) is not supported
  insertion: Insertion | null;
};

export type ScannedFile = {
  file: string;
  collection: string;
  raw: string;
  nodes: LocalizedNode[];
};

export type ScanSummary = {
  files: ScannedFile[];
  frWithoutStatus: number;
  extraKeyNodes: number;
  unsupportedLayout: number;
};

function keyName(pair: Pair): string {
  return isScalar(pair.key) ? String(pair.key.value) : "";
}

function pairOf(map: YAMLMap, name: string): Pair | undefined {
  return map.items.find((pair) => keyName(pair) === name);
}

function stringValue(node: unknown): string | null {
  return isScalar(node) && typeof node.value === "string" ? node.value : null;
}

function rangeOf(node: unknown): [number, number, number] | null {
  if (typeof node !== "object" || node === null || !("range" in node)) return null;
  const { range } = node;
  if (!Array.isArray(range) || range.length < 3) return null;
  const [a, b, c] = range;
  return typeof a === "number" && typeof b === "number" && typeof c === "number" ? [a, b, c] : null;
}

function insertionFor(raw: string, map: YAMLMap, anchor: Pair): Insertion | null {
  if (map.flow === true) return null;
  const keyRange = rangeOf(anchor.key);
  const valueRange = rangeOf(anchor.value);
  if (keyRange === null || valueRange === null) return null;
  const keyStart = keyRange[0];
  const lineStart = raw.lastIndexOf("\n", keyStart - 1) + 1;
  if (!/^[ -]*$/.test(raw.slice(lineStart, keyStart))) return null;
  const column = keyStart - lineStart;
  const valueEnd = valueRange[1];
  let offset: number;
  if (valueEnd > 0 && raw[valueEnd - 1] === "\n") {
    offset = valueEnd;
  } else {
    const newline = raw.indexOf("\n", valueEnd);
    offset = newline === -1 ? raw.length : newline + 1;
  }
  const value = anchor.value;
  const flow = isMap(value) && value.flow === true;
  let step = 2;
  if (isMap(value) && !flow) {
    const firstRange = rangeOf(value.items[0]?.key);
    if (firstRange !== null) {
      const firstLineStart = raw.lastIndexOf("\n", firstRange[0] - 1) + 1;
      const childColumn = firstRange[0] - firstLineStart;
      if (childColumn > column) step = childColumn - column;
    }
  }
  return { offset, indent: " ".repeat(column), step: " ".repeat(step), flow };
}

function existingArabic(arPair: Pair): ExistingArabic | null {
  const value = arPair.value;
  if (!isMap(value)) return null;
  const text = stringValue(pairOf(value, "text")?.value);
  const statusNode = pairOf(value, "status")?.value;
  const status = stringValue(statusNode);
  if (text === null || status === null) return null;
  const range = rangeOf(statusNode);
  return {
    text,
    status,
    statusRange: range === null ? null : [range[0], range[1]],
  };
}

type Counters = { frWithoutStatus: number; extraKeyNodes: number; unsupportedLayout: number };

function localizedNodeOf(
  raw: string,
  map: YAMLMap,
  nodePath: PathKey[],
  counters: Counters,
): LocalizedNode | null {
  const frPair = pairOf(map, "fr");
  const frValue = frPair?.value;
  if (frPair === undefined || !isMap(frValue)) return null;
  const frText = stringValue(pairOf(frValue, "text")?.value);
  if (frText === null) return null;
  if (pairOf(frValue, "status") === undefined) {
    counters.frWithoutStatus += 1;
    return null;
  }
  if (map.items.some((pair) => !["fr", "en", "ar"].includes(keyName(pair)))) {
    counters.extraKeyNodes += 1;
  }
  const enValue = pairOf(map, "en")?.value;
  const en = isMap(enValue) ? stringValue(pairOf(enValue, "text")?.value) : null;
  const arPair = pairOf(map, "ar");
  const ar = arPair === undefined ? null : existingArabic(arPair);
  let insertion: Insertion | null = null;
  if (arPair === undefined) {
    const anchor = pairOf(map, "en") ?? frPair;
    insertion = insertionFor(raw, map, anchor);
    if (insertion === null) counters.unsupportedLayout += 1;
  }
  return { path: nodePath, fr: frText, en, ar, insertion };
}

function collectNodes(
  raw: string,
  node: unknown,
  nodePath: PathKey[],
  out: LocalizedNode[],
  counters: Counters,
): void {
  if (isMap(node)) {
    const found = localizedNodeOf(raw, node, nodePath, counters);
    if (found !== null) out.push(found);
    for (const pair of node.items) {
      collectNodes(raw, pair.value, [...nodePath, keyName(pair)], out, counters);
    }
    return;
  }
  if (typeof node === "object" && node !== null && "items" in node && Array.isArray(node.items)) {
    node.items.forEach((item: unknown, index: number) => {
      collectNodes(raw, item, [...nodePath, index], out, counters);
    });
  }
}

function yamlFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...yamlFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".yaml")) files.push(full);
  }
  return files.sort();
}

export function scanDataDir(dataDir: string): ScanSummary {
  const summary: ScanSummary = {
    files: [],
    frWithoutStatus: 0,
    extraKeyNodes: 0,
    unsupportedLayout: 0,
  };
  const counters: Counters = { frWithoutStatus: 0, extraKeyNodes: 0, unsupportedLayout: 0 };
  for (const file of yamlFiles(dataDir)) {
    const raw = readFileSync(file, "utf8");
    const document = parseDocument(raw);
    if (document.errors.length > 0) {
      throw new Error(`${file}: ${document.errors[0]?.message ?? "YAML error"}`);
    }
    const nodes: LocalizedNode[] = [];
    collectNodes(raw, document.contents, [], nodes, counters);
    const relative = path.relative(dataDir, file).split(path.sep);
    summary.files.push({ file, collection: relative[0] ?? "", raw, nodes });
  }
  summary.frWithoutStatus = counters.frWithoutStatus;
  summary.extraKeyNodes = counters.extraKeyNodes;
  summary.unsupportedLayout = counters.unsupportedLayout;
  return summary;
}

// ---------------------------------------------------------------------------------------------
// Export

export type TodoEntry = { fr: string; en: string | null; uses: number; collections: string[] };

export type ExportResult = {
  entries: TodoEntry[];
  missingNodes: number;
  excludedNodes: number;
};

export function buildTodo(
  summary: ScanSummary,
  dictionary: readonly DictionaryEntry[],
): ExportResult {
  const known = new Set(dictionary.map((entry) => entry.fr));
  const byFr = new Map<string, { en: string | null; uses: number; collections: Set<string> }>();
  let missingNodes = 0;
  let excludedNodes = 0;
  for (const file of summary.files) {
    for (const node of file.nodes) {
      if (node.ar !== null || node.insertion === null) continue;
      missingNodes += 1;
      if (known.has(node.fr)) {
        excludedNodes += 1;
        continue;
      }
      const row = byFr.get(node.fr) ?? { en: null, uses: 0, collections: new Set<string>() };
      row.uses += 1;
      row.en ??= node.en;
      row.collections.add(file.collection);
      byFr.set(node.fr, row);
    }
  }
  const entries = [...byFr.entries()]
    .map(([fr, row]) => ({
      fr,
      en: row.en,
      uses: row.uses,
      collections: [...row.collections].sort(),
    }))
    .sort((a, b) => b.uses - a.uses || byFrOrder(a, b));
  return { entries, missingNodes, excludedNodes };
}

export function batchPath(out: string, index: number): string {
  return `${out.replace(/\.json$/, "")}-batch-${index}.json`;
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

// ---------------------------------------------------------------------------------------------
// Apply

export type ApplyOptions = {
  dictionary: readonly DictionaryEntry[];
  dryRun: boolean;
  onlyReviewed: boolean;
};

export type ApplyResult = {
  filled: number;
  upgraded: number;
  usedEntries: number;
  unusedEntries: number;
  stillMissing: number;
  filledByCollection: Record<string, number>;
  upgradedByCollection: Record<string, number>;
  filesChanged: number;
};

type Edit = { offset: number; remove: number; insert: string };

function renderScalarLines(text: string, status: EntryStatus, insertion: Insertion): string[] {
  if (insertion.flow) {
    return [`${insertion.indent}ar: { text: ${JSON.stringify(text)}, status: ${status} }`];
  }
  const inner = insertion.indent + insertion.step;
  const body = stringify({ text, status }, { lineWidth: 0, nullStr: "null" })
    .replace(/\n$/, "")
    .split("\n")
    .map((line) => inner + line);
  return [`${insertion.indent}ar:`, ...body];
}

function navigate(root: unknown, nodePath: readonly PathKey[]): Record<string, unknown> | null {
  let current: unknown = root;
  for (const key of nodePath) {
    if (typeof current !== "object" || current === null) return null;
    current = Reflect.get(current, key);
  }
  return typeof current === "object" && current !== null && !Array.isArray(current)
    ? (current as Record<string, unknown>)
    : null;
}

function applyEdits(raw: string, edits: readonly Edit[]): string {
  let result = raw;
  for (const edit of [...edits].sort((a, b) => b.offset - a.offset)) {
    result = result.slice(0, edit.offset) + edit.insert + result.slice(edit.offset + edit.remove);
  }
  return result;
}

type PlannedFile = { file: ScannedFile; next: string };

function planFile(
  file: ScannedFile,
  byFr: ReadonlyMap<string, DictionaryEntry>,
  reviewedByAr: ReadonlyMap<string, DictionaryEntry>,
  result: ApplyResult,
  used: Set<string>,
): PlannedFile | null {
  const eol = file.raw.includes("\r\n") ? "\r\n" : "\n";
  const edits: Edit[] = [];
  const expected: unknown = parse(file.raw);
  for (const node of file.nodes) {
    if (node.ar === null) {
      const entry = byFr.get(node.fr);
      if (entry === undefined || node.insertion === null) {
        result.stillMissing += 1;
        continue;
      }
      const lines = renderScalarLines(entry.ar, entry.status, node.insertion);
      const atEndWithoutNewline =
        node.insertion.offset >= file.raw.length && !file.raw.endsWith("\n");
      edits.push({
        offset: node.insertion.offset,
        remove: 0,
        insert: atEndWithoutNewline ? eol + lines.join(eol) : lines.join(eol) + eol,
      });
      const target = navigate(expected, node.path);
      if (target !== null) target.ar = { text: entry.ar, status: entry.status };
      used.add(entry.fr);
      result.filled += 1;
      result.filledByCollection[file.collection] =
        (result.filledByCollection[file.collection] ?? 0) + 1;
    } else if (node.ar.status === "draft" && node.ar.statusRange !== null) {
      const entry = reviewedByAr.get(node.ar.text);
      if (entry === undefined) continue;
      edits.push({
        offset: node.ar.statusRange[0],
        remove: node.ar.statusRange[1] - node.ar.statusRange[0],
        insert: "reviewed",
      });
      const target = navigate(expected, node.path);
      const arTarget = target === null ? null : navigate(target, ["ar"]);
      if (arTarget !== null) arTarget.status = "reviewed";
      used.add(entry.fr);
      result.upgraded += 1;
      result.upgradedByCollection[file.collection] =
        (result.upgradedByCollection[file.collection] ?? 0) + 1;
    }
  }
  if (edits.length === 0) return null;
  const next = applyEdits(file.raw, edits);
  if (!isDeepStrictEqual(parse(next), expected)) {
    throw new Error(`${file.file}: the edited file does not parse to the expected data (aborted)`);
  }
  return { file, next };
}

export function applyDictionary(summary: ScanSummary, options: ApplyOptions): ApplyResult {
  const usable = options.dictionary.filter(
    (entry) => !options.onlyReviewed || entry.status === "reviewed",
  );
  const byFr = new Map(usable.map((entry) => [entry.fr, entry]));
  const reviewedByAr = new Map(
    usable.filter((entry) => entry.status === "reviewed").map((entry) => [entry.ar, entry]),
  );
  const result: ApplyResult = {
    filled: 0,
    upgraded: 0,
    usedEntries: 0,
    unusedEntries: 0,
    stillMissing: 0,
    filledByCollection: {},
    upgradedByCollection: {},
    filesChanged: 0,
  };
  const used = new Set<string>();
  const planned: PlannedFile[] = [];
  for (const file of summary.files) {
    const plan = planFile(file, byFr, reviewedByAr, result, used);
    if (plan !== null) planned.push(plan);
  }
  if (!options.dryRun) {
    for (const { file, next } of planned) writeFileSync(file.file, next);
  }
  result.filesChanged = planned.length;
  result.usedEntries = used.size;
  result.unusedEntries = options.dictionary.length - used.size;
  return result;
}

// ---------------------------------------------------------------------------------------------
// Quality guards

export type Violation = {
  fr: string;
  rule: string;
  severity: "error" | "warning";
  message: string;
};

const ACRONYM = /(?<![\p{L}\p{N}])[A-Z]{2,}(?![\p{L}\p{N}])/gu;
const URL_PATTERN = /https?:\/\/[^\s)\]]+/g;
const NON_LATIN_DIGITS = /[٠-٩۰-۹]/;
const MAX_TEXT_LENGTH = 400;
const LATIN_ERROR_RATIO = 0.4;
const LATIN_WARNING_RATIO = 0.25;

function urlsOf(text: string): string[] {
  return (text.match(URL_PATTERN) ?? []).map((url) => url.replace(/[.,;:]+$/, ""));
}

function countOf(text: string, pattern: RegExp): number {
  return (text.match(pattern) ?? []).length;
}

export function checkEntry(entry: DictionaryEntry): Violation[] {
  const { fr, ar } = entry;
  const found: Violation[] = [];
  const add = (rule: string, message: string, severity: "error" | "warning" = "error") =>
    found.push({ fr, rule, severity, message });

  if (!ARABIC_LETTER.test(ar)) add("a", "ar has no Arabic-script letters");
  if (NON_LATIN_DIGITS.test(ar)) add("b", "ar uses Arabic-Indic digits: write Latin digits");
  const arDigitRuns = new Set(ar.match(/\d+/g) ?? []);
  for (const run of new Set(fr.match(/\d+/g) ?? [])) {
    if (!arDigitRuns.has(run)) add("b", `the number ${run} of fr is missing in ar`);
  }
  for (const acronym of new Set(fr.match(ACRONYM) ?? [])) {
    if (!ar.includes(acronym)) add("c", `the acronym ${acronym} of fr is missing in ar`);
  }
  for (const url of new Set(urlsOf(fr))) {
    if (!ar.includes(url)) add("c", `the URL ${url} of fr is missing in ar`);
  }
  if (ar.trim() === fr.trim()) add("d", "ar is identical to fr");
  if (countOf(fr, /\{/g) !== countOf(ar, /\{/g) || countOf(fr, /\}/g) !== countOf(ar, /\}/g)) {
    add("f", "ICU braces differ between fr and ar");
  }
  const withoutUrls = ar.replace(URL_PATTERN, "");
  const letters = countOf(withoutUrls, /\p{L}/gu);
  if (letters > 0) {
    const ratio = countOf(withoutUrls, /\p{Script=Latin}/gu) / letters;
    const percent = Math.round(ratio * 100);
    if (ratio > LATIN_ERROR_RATIO) add("g", `${percent}% of the letters of ar are Latin`);
    else if (ratio >= LATIN_WARNING_RATIO)
      add("g", `${percent}% of the letters of ar are Latin`, "warning");
  }
  if (ar !== ar.trim()) add("h", "ar has leading or trailing whitespace");
  if (ar.length > MAX_TEXT_LENGTH) {
    add("h", `ar is ${ar.length} characters (the data schema allows ${MAX_TEXT_LENGTH})`);
  }
  return found;
}

export function checkDictionary(entries: readonly DictionaryEntry[]): Violation[] {
  const violations: Violation[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.fr)) {
      violations.push({
        fr: entry.fr,
        rule: "unique",
        severity: "error",
        message: "duplicate fr",
      });
    }
    seen.add(entry.fr);
    violations.push(...checkEntry(entry));
  }
  return violations;
}

// ---------------------------------------------------------------------------------------------
// Merge

export type MergeResult = {
  entries: DictionaryEntry[];
  added: number;
  unchanged: number;
  conflicts: { fr: string; kept: string; offered: string }[];
  unknown: string[];
  rejected: { fr: string; reason: string }[];
};

const BatchRowSchema = z.object({ fr: z.string(), ar: z.string() });

export function parseBatchRows(json: unknown): { fr: string; ar: string }[] {
  const rows: unknown = Array.isArray(json)
    ? json
    : typeof json === "object" && json !== null && "entries" in json
      ? json.entries
      : null;
  const parsed = z.array(BatchRowSchema).safeParse(rows);
  if (!parsed.success) {
    throw new Error(
      `a batch file must be an array (or { entries: [...] }) of { fr, ar }: ${describeZodError(parsed.error)}`,
    );
  }
  return parsed.data;
}

export function mergeRows(
  dictionary: readonly DictionaryEntry[],
  rows: readonly { fr: string; ar: string }[],
  todo: ReadonlySet<string>,
): MergeResult {
  const merged = new Map(dictionary.map((entry) => [entry.fr, entry]));
  const result: MergeResult = {
    entries: [],
    added: 0,
    unchanged: 0,
    conflicts: [],
    unknown: [],
    rejected: [],
  };
  for (const row of rows) {
    const existing = merged.get(row.fr);
    if (existing !== undefined) {
      if (existing.ar === row.ar) result.unchanged += 1;
      else result.conflicts.push({ fr: row.fr, kept: existing.ar, offered: row.ar });
      continue;
    }
    if (!todo.has(row.fr)) {
      result.unknown.push(row.fr);
      continue;
    }
    const entry = DictionaryEntrySchema.safeParse({ fr: row.fr, ar: row.ar, status: "draft" });
    if (!entry.success) {
      result.rejected.push({ fr: row.fr, reason: describeZodError(entry.error) });
      continue;
    }
    merged.set(row.fr, entry.data);
    result.added += 1;
  }
  result.entries = [...merged.values()].sort(byFrOrder);
  return result;
}

// ---------------------------------------------------------------------------------------------
// Review sheet and mark-reviewed

type Usage = { total: number; byCollection: Map<string, number> };

export function usageOf(summary: ScanSummary): Map<string, Usage> {
  const usage = new Map<string, Usage>();
  for (const file of summary.files) {
    for (const node of file.nodes) {
      const row = usage.get(node.fr) ?? { total: 0, byCollection: new Map<string, number>() };
      row.total += 1;
      row.byCollection.set(file.collection, (row.byCollection.get(file.collection) ?? 0) + 1);
      usage.set(node.fr, row);
    }
  }
  return usage;
}

function primaryCollection(usage: Usage | undefined): string {
  if (usage === undefined) return "(unused)";
  return (
    [...usage.byCollection.entries()].sort(
      (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1),
    )[0]?.[0] ?? "(unused)"
  );
}

function cell(text: string): string {
  return text.replaceAll("|", "\\|").replace(/\s*\n\s*/g, " ");
}

function table(rows: readonly { uses: number; entry: DictionaryEntry }[]): string[] {
  return [
    "| uses | French | Arabic | status |",
    "| ---: | --- | --- | --- |",
    ...rows.map(
      ({ uses, entry }) => `| ${uses} | ${cell(entry.fr)} | ${cell(entry.ar)} | ${entry.status} |`,
    ),
  ];
}

export function reviewSheet(
  entries: readonly DictionaryEntry[],
  usage: ReadonlyMap<string, Usage>,
): string {
  const rowsOf = (list: readonly DictionaryEntry[]) =>
    list
      .map((entry) => ({ uses: usage.get(entry.fr)?.total ?? 0, entry }))
      .sort((a, b) => b.uses - a.uses || byFrOrder(a.entry, b.entry));
  const drafts = entries.filter((entry) => entry.status === "draft");
  const reviewed = entries.filter((entry) => entry.status === "reviewed");
  const groups = new Map<string, DictionaryEntry[]>();
  for (const entry of drafts) {
    const key = primaryCollection(usage.get(entry.fr));
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  const lines = [
    "# Arabic translations: review sheet",
    "",
    `Entries: ${entries.length} (draft ${drafts.length}, reviewed ${reviewed.length}).`,
    "Write the corrected Arabic in the dictionary (`scripts/import/translations/ar.json`), then mark entries reviewed with `pnpm data:translate-ar mark-reviewed`.",
    "",
  ];
  for (const [collection, list] of [...groups.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    lines.push(`## ${collection} (${list.length} draft)`, "", ...table(rowsOf(list)), "");
  }
  lines.push(`## Reviewed (${reviewed.length})`, "", ...table(rowsOf(reviewed)), "");
  return lines.join("\n");
}

export function markReviewed(
  entries: readonly DictionaryEntry[],
  selection: ReadonlySet<string> | "all",
): { entries: DictionaryEntry[]; changed: number; missing: string[] } {
  let changed = 0;
  const next = entries.map((entry) => {
    if (selection !== "all" && !selection.has(entry.fr)) return entry;
    if (entry.status === "reviewed") return entry;
    changed += 1;
    return { ...entry, status: "reviewed" as const };
  });
  const known = new Set(entries.map((entry) => entry.fr));
  const missing = selection === "all" ? [] : [...selection].filter((fr) => !known.has(fr));
  return { entries: next, changed, missing };
}
