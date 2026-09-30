import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..");
const SCANNED_DIRECTORIES = ["src/components", "src/app"];

// Physical utilities (`ml-`, `text-left`, `border-r`, ...) do not mirror in Arabic: use the logical
// ones (`ms-`, `text-start`, `border-e`). A leading `-` (negative margin) and variants are matched too.
const PHYSICAL_DIRECTION_CLASS =
  /\b(ml|mr|pl|pr|left|right|text-left|text-right|border-l|border-r|rounded-l|rounded-r)-/;

// shadcn primitives keep their vendored classes only where Tailwind has no logical form; each entry
// says why. Anything else under ui/ must be logical too.
const ALLOWED: Readonly<Record<string, string>> = {};

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith(".tsx") ? [path] : [];
  });
}

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const files = SCANNED_DIRECTORIES.flatMap((directory) => sourceFiles(join(ROOT, directory)));

describe("components and pages use logical direction utilities only", () => {
  it("scans a meaningful number of files", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("flags a physical utility in a synthetic source (the scan can fail)", () => {
    expect(PHYSICAL_DIRECTION_CLASS.test('className="flex ml-2"')).toBe(true);
    expect(PHYSICAL_DIRECTION_CLASS.test('className="sm:-mr-3 text-left"')).toBe(true);
    expect(PHYSICAL_DIRECTION_CLASS.test('className="ms-2 text-start border-s"')).toBe(false);
  });

  it.each(
    files.map((file) => ({ file, path: relative(ROOT, file).split(sep).join("/") })),
  )("$path has no physical-direction class", ({ file, path }) => {
    if (path in ALLOWED) return;
    const source = withoutComments(readFileSync(file, "utf8"));
    const offenders = source
      .split("\n")
      .map((line, index) => ({ line: index + 1, text: line.trim() }))
      .filter(({ text }) => PHYSICAL_DIRECTION_CLASS.test(text));
    expect(offenders).toEqual([]);
  });
});
