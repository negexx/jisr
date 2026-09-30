import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..");
const SCANNED_DIRECTORIES = ["src/components", "src/app"];

// Physical utilities do not mirror in Arabic: use the logical ones (`ms-`, `text-start`,
// `border-e`, `rounded-s`). Two shapes: prefixes that always carry a value (`ml-3`, `-mr-2`,
// `left-0`, `scroll-pl-4`), and whole tokens that are complete on their own or take a suffix
// (`text-left`, `border-r`, `border-l-2`, `rounded-r-lg`), matched at a class boundary so
// `rounded-lg` and `border-red-500` do not hit. Variants (`sm:`) and a leading `-` precede either.
const VALUED_PREFIX = /\b(?:ml|mr|pl|pr|left|right|scroll-m[lr]|scroll-p[lr])-/;
const WHOLE_TOKEN = /(?<![\w-])(?:text-(?:left|right)|(?:border|rounded)-[lr])(?![a-z0-9])/;
const PHYSICAL_DIRECTION_CLASS = new RegExp(`${VALUED_PREFIX.source}|${WHOLE_TOKEN.source}`);

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

  it.each([
    "ml-2",
    "-mr-3",
    "sm:pl-4",
    "pr-1",
    "left-0",
    "md:right-2",
    "scroll-ml-2",
    "scroll-pr-2",
    "text-left",
    "text-right",
    "border-l",
    "border-r",
    "border-l-2",
    "border-r-primary",
    "rounded-l",
    "rounded-r",
    "rounded-r-lg",
    "hover:text-left",
  ])("catches the physical utility %s on its own", (token) => {
    expect(PHYSICAL_DIRECTION_CLASS.test(`className="flex ${token} gap-2"`)).toBe(true);
    expect(PHYSICAL_DIRECTION_CLASS.test(`className="${token}"`)).toBe(true);
  });

  it.each([
    "ms-3",
    "me-3",
    "ps-2",
    "pe-2",
    "start-0",
    "end-0",
    "text-start",
    "text-end",
    "border-s",
    "border-e-2",
    "rounded-s",
    "rounded-e-lg",
    "rounded-lg",
    "border-red-500",
    "text-lg",
    "border",
  ])("lets the logical or unrelated class %s through", (token) => {
    expect(PHYSICAL_DIRECTION_CLASS.test(`className="flex ${token} gap-2"`)).toBe(false);
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
