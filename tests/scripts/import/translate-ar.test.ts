import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parse } from "yaml";

import { parseArgs, writeTodoFiles } from "../../../scripts/import/translate-ar";
import {
  applyDictionary,
  buildTodo,
  checkDictionary,
  checkEntry,
  type DictionaryEntry,
  markReviewed,
  mergeRows,
  parseBatchRows,
  parseDictionary,
  readDictionary,
  reviewSheet,
  scanDataDir,
  usageOf,
  writeDictionary,
} from "../../../scripts/import/translate-ar-core";

const COUNTRY = `slug: XX
name:
  fr: { text: Allemagne, status: reviewed }
  en: { text: Germany, status: reviewed }
`;

const PROGRAM = `slug: p1
name:
  fr:
    text: "Passeport"
    status: draft
  en:
    text: Passport
    status: draft
documents:
  - slug: passport
    name:
      fr:
        text: Passeport
        status: draft
      en:
        text: Passport
        status: draft
  - slug: cv
    name:
      fr:
        text: Passeport
        status: reviewed
      ar:
        text: "جواز موجود"
        status: draft
  - slug: bare
    name:
      fr: { text: Sans anglais, status: draft }
note:
  fr:
    text: "Note: avec deux points"
    status: draft
items:
  - fr:
      text: Sequence
      status: draft
    en:
      text: Seq
      status: draft
  - fr:
      text: Seul
      status: draft
    other: 1
sources:
  main:
    url: https://example.org
    last_verified_at: 2026-10-01
`;

const entry = (
  fr: string,
  ar: string,
  status: "draft" | "reviewed" = "draft",
): DictionaryEntry => ({
  fr,
  ar,
  status,
});

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "translate-ar-"));
  mkdirSync(path.join(dir, "countries"));
  mkdirSync(path.join(dir, "programs"));
  writeFileSync(path.join(dir, "countries", "XX.yaml"), COUNTRY);
  writeFileSync(path.join(dir, "programs", "p1.yaml"), PROGRAM);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const read = (relative: string) => readFileSync(path.join(dir, relative), "utf8");

// `after` must be `before` with extra lines inserted and nothing else changed.
function addedLines(before: string, after: string): string[] {
  const beforeLines = before.split("\n");
  const added: string[] = [];
  let i = 0;
  for (const line of after.split("\n")) {
    if (line === beforeLines[i]) i++;
    else added.push(line);
  }
  expect(i).toBe(beforeLines.length);
  return added;
}

const dictionary = [
  entry("Allemagne", "ألمانيا"),
  entry("Passeport", "جواز السفر"),
  entry("Sans anglais", "بلا إنجليزية"),
  entry("Note: avec deux points", "ملاحظة: مع نقطتين"),
  entry("Sequence", "تسلسل"),
  entry("Seul", "وحيد", "reviewed"),
];

describe("scan and export", () => {
  it("finds every LocalizedText node and the nodes lacking ar", () => {
    const summary = scanDataDir(dir);
    const nodes = summary.files.flatMap((f) => f.nodes);
    expect(nodes).toHaveLength(8);
    expect(nodes.filter((n) => n.ar === null)).toHaveLength(7);
    expect(summary.extraKeyNodes).toBe(1);
    expect(summary.frWithoutStatus).toBe(0);
  });

  it("lists unique French texts by uses then text, with collections and English", () => {
    const todo = buildTodo(scanDataDir(dir), []);
    expect(todo.missingNodes).toBe(7);
    expect(todo.entries[0]).toEqual({
      fr: "Passeport",
      en: "Passport",
      uses: 2,
      collections: ["programs"],
    });
    expect(todo.entries.map((e) => e.fr)).toEqual([
      "Passeport",
      "Allemagne",
      "Note: avec deux points",
      "Sans anglais",
      "Sequence",
      "Seul",
    ]);
    expect(todo.entries.find((e) => e.fr === "Allemagne")).toMatchObject({
      en: "Germany",
      collections: ["countries"],
    });
    expect(todo.entries.find((e) => e.fr === "Sans anglais")?.en).toBeNull();
  });

  it("excludes entries already in the dictionary", () => {
    const todo = buildTodo(scanDataDir(dir), [entry("Passeport", "جواز السفر")]);
    expect(todo.entries.map((e) => e.fr)).not.toContain("Passeport");
    expect(todo.excludedNodes).toBe(2);
  });

  it("writes batch files of at most 120 entries and removes stale ones", () => {
    const entries = Array.from({ length: 250 }, (_, index) => ({
      fr: `Texte ${index}`,
      en: null,
      uses: 1,
      collections: ["programs"],
    }));
    const out = path.join(dir, "out", "ar-todo.json");
    mkdirSync(path.dirname(out));
    writeFileSync(path.join(dir, "out", "ar-todo-batch-9.json"), "[]");
    const { batches, files } = writeTodoFiles(entries, out);
    expect(batches).toBe(3);
    expect(files.map((f) => path.basename(f))).toEqual([
      "ar-todo-batch-1.json",
      "ar-todo-batch-2.json",
      "ar-todo-batch-3.json",
    ]);
    const sizes = files.map((f) => (JSON.parse(readFileSync(f, "utf8")) as unknown[]).length);
    expect(sizes).toEqual([120, 120, 10]);
    expect(existsSync(path.join(dir, "out", "ar-todo-batch-9.json"))).toBe(false);
    expect(JSON.parse(readFileSync(out, "utf8"))).toHaveLength(250);
  });
});

describe("apply", () => {
  const run = (
    options: Partial<{ dryRun: boolean; onlyReviewed: boolean }> = {},
    dict = dictionary,
  ) =>
    applyDictionary(scanDataDir(dir), {
      dictionary: dict,
      dryRun: options.dryRun ?? false,
      onlyReviewed: options.onlyReviewed ?? false,
    });

  it("adds only lines, with the layout of the neighbouring block", () => {
    const beforeCountry = read("countries/XX.yaml");
    const beforeProgram = read("programs/p1.yaml");
    const result = run();
    expect(result.filled).toBe(7);
    expect(result.stillMissing).toBe(0);
    expect(result.usedEntries).toBe(6);

    expect(addedLines(beforeCountry, read("countries/XX.yaml"))).toEqual([
      '  ar: { text: "ألمانيا", status: draft }',
    ]);
    const added = addedLines(beforeProgram, read("programs/p1.yaml"));
    expect(added).toContain("  ar:");
    expect(added).toContain("    text: جواز السفر");
    expect(added).toContain("    status: draft");
    expect(added).toContain('      ar: { text: "بلا إنجليزية", status: draft }');
    expect(added).toContain('    text: "ملاحظة: مع نقطتين"');
    expect(added).toContain("    ar:");
    expect(added).toContain("      text: تسلسل");
    expect(added).toContain("      status: reviewed");
    expect(added.every((line) => line.trim() !== "")).toBe(true);
  });

  it("produces data that parses to the original plus the ar nodes", () => {
    run();
    const program = parse(read("programs/p1.yaml")) as {
      name: { ar: { text: string; status: string } };
      documents: { name: { ar: { text: string; status: string } } }[];
      note: { ar: { text: string } };
      items: { ar: { text: string; status: string } }[];
    };
    expect(program.name.ar).toEqual({ text: "جواز السفر", status: "draft" });
    expect(program.documents[0]?.name.ar.text).toBe("جواز السفر");
    expect(program.note.ar.text).toBe("ملاحظة: مع نقطتين");
    expect(program.items[1]?.ar).toEqual({ text: "وحيد", status: "reviewed" });
  });

  it("never touches an existing ar node and carries the entry status", () => {
    run();
    const program = parse(read("programs/p1.yaml")) as {
      documents: { name: { ar: { text: string; status: string } } }[];
    };
    expect(program.documents[1]?.name.ar).toEqual({ text: "جواز موجود", status: "draft" });
    expect(read("programs/p1.yaml")).toContain("جواز موجود");
  });

  it("is idempotent", () => {
    run();
    const first = [read("countries/XX.yaml"), read("programs/p1.yaml")];
    const second = run();
    expect(second.filled).toBe(0);
    expect(second.upgraded).toBe(0);
    expect(second.filesChanged).toBe(0);
    expect([read("countries/XX.yaml"), read("programs/p1.yaml")]).toEqual(first);
  });

  it("with --dry-run writes nothing and still reports the counts", () => {
    const before = [read("countries/XX.yaml"), read("programs/p1.yaml")];
    const result = run({ dryRun: true });
    expect(result.filled).toBe(7);
    expect(result.filledByCollection).toEqual({ countries: 1, programs: 6 });
    expect([read("countries/XX.yaml"), read("programs/p1.yaml")]).toEqual(before);
  });

  it("with --only-reviewed uses only reviewed entries", () => {
    const result = run({ onlyReviewed: true });
    expect(result.filled).toBe(1);
    expect(result.stillMissing).toBe(6);
    expect(result.unusedEntries).toBe(5);
    expect(read("countries/XX.yaml")).toBe(COUNTRY);
  });

  it("reports entries unused and nodes still missing", () => {
    const result = run({}, [entry("Allemagne", "ألمانيا"), entry("Inconnu", "مجهول")]);
    expect(result.filled).toBe(1);
    expect(result.usedEntries).toBe(1);
    expect(result.unusedEntries).toBe(1);
    expect(result.stillMissing).toBe(6);
  });

  it("upgrades a draft ar node whose text equals a reviewed entry, changing only the status", () => {
    const before = read("programs/p1.yaml");
    const result = run({}, [entry("Anything", "جواز موجود", "reviewed")]);
    expect(result.upgraded).toBe(1);
    expect(result.filled).toBe(0);
    const after = read("programs/p1.yaml");
    const beforeLines = before.split("\n");
    const afterLines = after.split("\n");
    expect(afterLines).toHaveLength(beforeLines.length);
    const changed = afterLines.filter((line, i) => line !== beforeLines[i]);
    expect(changed).toEqual(["        status: reviewed"]);
    expect(run({}, [entry("Anything", "جواز موجود", "reviewed")]).upgraded).toBe(0);
  });

  it("does not upgrade from a draft entry", () => {
    expect(run({}, [entry("Anything", "جواز موجود", "draft")]).upgraded).toBe(0);
  });
});

describe("apply on a copy of the real data", () => {
  it("adds only lines and keeps every file parseable", { timeout: 120_000 }, () => {
    const copy = path.join(dir, "real");
    cpSync("data", copy, { recursive: true });
    const before = scanDataDir(copy);
    const todo = buildTodo(before, []);
    const dict = todo.entries.map((e, index) => entry(e.fr, `ترجمة ${index}`));
    const snapshots = new Map(before.files.map((f) => [f.file, f.raw]));
    const result = applyDictionary(before, {
      dictionary: dict,
      dryRun: false,
      onlyReviewed: false,
    });
    expect(result.filled).toBe(todo.missingNodes);
    expect(result.stillMissing).toBe(0);
    for (const [file, raw] of snapshots) {
      const after = readFileSync(file, "utf8");
      if (after !== raw) addedLines(raw, after);
    }
    const again = scanDataDir(copy);
    expect(buildTodo(again, []).missingNodes).toBe(0);
  });
});

describe("check", () => {
  const good = entry(
    "Le TCF (niveau B2) coûte 120 EUR, voir https://example.org/tcf.",
    "يبلغ سعر TCF (المستوى B2) مبلغ 120 EUR، انظر https://example.org/tcf.",
  );
  const rules = (e: DictionaryEntry) =>
    checkEntry(e)
      .filter((v) => v.severity === "error")
      .map((v) => v.rule);

  it("passes a good entry", () => {
    expect(checkEntry(good)).toEqual([]);
  });

  it("rule a: ar needs Arabic letters", () => {
    expect(rules(entry("Texte", "Text"))).toContain("a");
    expect(() => parseDictionary({ entries: [{ fr: "Texte", ar: "Text" }] })).toThrow(/Arabic/);
  });

  it("rule b: digits stay Latin and are kept", () => {
    expect(rules(entry("120 EUR par an", "١٢٠ EUR في السنة"))).toContain("b");
    expect(rules(entry("120 EUR par an", "مئة EUR في السنة"))).toContain("b");
    expect(rules(entry("120 EUR par an", "120 EUR في السنة"))).toEqual([]);
  });

  it("rule c: acronyms and URLs stay unchanged", () => {
    expect(rules(entry("Le TCF suffit", "الاختبار يكفي"))).toContain("c");
    expect(rules(entry("Voir https://example.org/a", "انظر الصفحة"))).toContain("c");
    expect(rules(entry("Le TCF suffit", "يكفي اختبار TCF للقبول"))).toEqual([]);
  });

  it("rule d: ar differs from fr", () => {
    expect(rules(entry("ABC 123", "ABC 123"))).toContain("d");
  });

  it("rule f: ICU braces are kept", () => {
    expect(rules(entry("Bonjour {name}", "مرحبا"))).toContain("f");
    expect(rules(entry("Bonjour {name}", "مرحبا بكم في الموقع الرسمي {name}"))).toEqual([]);
  });

  it("rule g: too much Latin is an error, some Latin a warning", () => {
    expect(rules(entry("Une phrase en français", "une phrase en francais مرحبا"))).toContain("g");
    const warning = checkEntry(entry("Un texte", "مرحبا بكم في الموقع الرسمي university"));
    expect(warning.map((v) => [v.rule, v.severity])).toEqual([["g", "warning"]]);
    expect(rules(entry("Un texte", "مرحبا بكم في الموقع الرسمي university"))).toEqual([]);
  });

  it("flags duplicates and whitespace", () => {
    const violations = checkDictionary([entry("A", " ألف"), entry("A", "ألف")]);
    expect(violations.map((v) => v.rule)).toEqual(expect.arrayContaining(["h", "unique"]));
  });

  it("the dictionary schema rejects duplicates and unknown keys", () => {
    expect(() =>
      parseDictionary({
        entries: [
          { fr: "A", ar: "ألف" },
          { fr: "A", ar: "باء" },
        ],
      }),
    ).toThrow(/duplicate/);
    expect(() => parseDictionary({ entries: [{ fr: "A", ar: "ألف", extra: 1 }] })).toThrow();
    expect(parseDictionary({ entries: [{ fr: "A", ar: "ألف" }] })[0]?.status).toBe("draft");
  });
});

describe("merge, review and mark-reviewed", () => {
  const todo = new Set(["Allemagne", "Passeport"]);

  it("adds as draft, reports conflicts and unknown texts, keeps the order", () => {
    const existing = [entry("Passeport", "جواز السفر", "reviewed")];
    const result = mergeRows(
      existing,
      [
        { fr: "Passeport", ar: "جواز آخر" },
        { fr: "Allemagne", ar: "ألمانيا" },
        { fr: "Pas dans la liste", ar: "ليس في القائمة" },
        { fr: "Passeport", ar: "جواز السفر" },
      ],
      todo,
    );
    expect(result.added).toBe(1);
    expect(result.unchanged).toBe(1);
    expect(result.conflicts).toEqual([
      { fr: "Passeport", kept: "جواز السفر", offered: "جواز آخر" },
    ]);
    expect(result.unknown).toEqual(["Pas dans la liste"]);
    expect(result.entries.map((e) => [e.fr, e.status])).toEqual([
      ["Allemagne", "draft"],
      ["Passeport", "reviewed"],
    ]);
  });

  it("rejects a row without Arabic letters", () => {
    const result = mergeRows([], [{ fr: "Allemagne", ar: "Germany" }], todo);
    expect(result.added).toBe(0);
    expect(result.rejected).toHaveLength(1);
  });

  it("accepts a bare array or { entries } as a batch file", () => {
    expect(parseBatchRows([{ fr: "a", ar: "b" }])).toHaveLength(1);
    expect(parseBatchRows({ entries: [{ fr: "a", ar: "b" }] })).toHaveLength(1);
    expect(() => parseBatchRows({ nope: 1 })).toThrow();
  });

  it("writes the dictionary sorted with 2-space JSON and a trailing newline", () => {
    const file = path.join(dir, "ar.json");
    writeDictionary(file, [entry("b", "باء"), entry("a", "ألف")]);
    const text = readFileSync(file, "utf8");
    expect(text.endsWith("}\n")).toBe(true);
    expect(text).toContain('\n  "entries": [\n    {\n      "fr": "a",');
    expect(readDictionary(file).map((e) => e.fr)).toEqual(["a", "b"]);
    expect(readDictionary(path.join(dir, "missing.json"))).toEqual([]);
  });

  it("writes a review sheet grouped by collection with reviewed entries last", () => {
    const sheet = reviewSheet(
      [
        entry("Allemagne", "ألمانيا"),
        entry("Passeport", "جواز | السفر"),
        entry("Seul", "وحيد", "reviewed"),
        entry("Inutilisé", "غير مستعمل"),
      ],
      usageOf(scanDataDir(dir)),
    );
    expect(sheet).toContain("Entries: 4 (draft 3, reviewed 1)");
    const countries = sheet.indexOf("## countries (1 draft)");
    const programs = sheet.indexOf("## programs (1 draft)");
    const unused = sheet.indexOf("## (unused) (1 draft)");
    const reviewed = sheet.indexOf("## Reviewed (1)");
    expect(countries).toBeGreaterThan(-1);
    expect(programs).toBeGreaterThan(countries);
    expect(unused).toBeGreaterThan(-1);
    expect(reviewed).toBeGreaterThan(Math.max(countries, programs, unused));
    expect(sheet).toContain("| 3 | Passeport | جواز \\| السفر | draft |");
  });

  it("marks selected entries or all reviewed", () => {
    const entries = [entry("a", "ألف"), entry("b", "باء")];
    const some = markReviewed(entries, new Set(["a", "zzz"]));
    expect(some.changed).toBe(1);
    expect(some.missing).toEqual(["zzz"]);
    expect(some.entries.map((e) => e.status)).toEqual(["reviewed", "draft"]);
    const all = markReviewed(entries, "all");
    expect(all.entries.every((e) => e.status === "reviewed")).toBe(true);
  });
});

describe("arguments", () => {
  it("parses the command, options and positional files", () => {
    const args = parseArgs(["merge", "a.json", "b.json", "--data-dir", "x", "--dry-run"]);
    expect(args.command).toBe("merge");
    expect(args.positional).toEqual(["a.json", "b.json"]);
    expect(args.dataDir).toBe("x");
    expect(args.dryRun).toBe(true);
    expect(() => parseArgs(["export", "--out"])).toThrow();
    expect(() => parseArgs(["export", "--nope"])).toThrow();
  });
});

describe("export on the real data", () => {
  // The real data was fully translated on 2026-10-09 (the dictionary is applied), so how many nodes
  // are still missing depends on the data of the day: new records bring new texts and
  // `pnpm data:translate-ar export` lists them. The test therefore checks the exporter's internal
  // consistency on whatever the data holds, and that it writes only to the temp out dir.
  it("exports the texts still missing and writes only to the temp out dir", () => {
    const before = readdirSync("data").sort();
    const todo = buildTodo(scanDataDir("data"), []);
    const uses = todo.entries.reduce((sum, entry) => sum + entry.uses, 0);
    expect(uses).toBe(todo.missingNodes);
    expect(todo.entries.length).toBeLessThanOrEqual(todo.missingNodes);
    const out = path.join(dir, "real-out", "ar-todo.json");
    const { batches } = writeTodoFiles(todo.entries, out);
    expect(batches).toBe(Math.ceil(todo.entries.length / 120));
    expect(readdirSync("data").sort()).toEqual(before);
    expect(readdirSync(path.dirname(out))).toHaveLength(batches + 1);
  });
});
