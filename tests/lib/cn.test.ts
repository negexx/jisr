import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { cn as fullCn, twMerge } from "cn";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";
import { seededRng } from "./differential";

// The oracle is the full runtime engine (`twMerge`/`cn` from the package root, byte-identical to
// clsx + tailwind-merge). `cn` under test is the app's own: the build-time compiled, subsetted tables.

const SRC_DIR = join(process.cwd(), "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

function stringLiteralsIn(path: string): string[] {
  const source = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) found.push(node.text);
    else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      found.push(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

const literals = [
  ...new Set(
    sourceFiles(SRC_DIR)
      .flatMap(stringLiteralsIn)
      .filter((text) => text.trim() !== ""),
  ),
].sort();
const tokens = [...new Set(literals.flatMap((text) => text.split(/\s+/).filter(Boolean)))].sort();

// Conflicts only happen between classes that share a utility family, so bucket by the variant
// chain plus the first dash segment and test every ordered pair inside a bucket.
function bucketKey(token: string): string {
  const utility = token.slice(token.lastIndexOf(":") + 1).replace(/^!|!$|^-/g, "");
  return `${token.slice(0, token.length - utility.length)}${utility.split("-")[0]}`;
}

function buckets(): string[][] {
  const byKey = new Map<string, string[]>();
  for (const token of tokens) {
    const key = bucketKey(token);
    byKey.set(key, [...(byKey.get(key) ?? []), token]);
  }
  return [...byKey.values()].filter((group) => group.length > 1);
}

function expectSame(...inputs: string[]): void {
  const actual = cn(...inputs);
  const expected = twMerge(...inputs);
  if (actual !== expected) {
    throw new Error(
      `cn diverges from tailwind-merge for ${JSON.stringify(inputs)}\n  cn:  ${actual}\n  twMerge: ${expected}`,
    );
  }
}

describe("cn (compiled tables) matches tailwind-merge", () => {
  it("resolves representative overrides like shared shadcn components do", () => {
    const rows: string[][] = [
      ["h-12 gap-2 px-5", "h-9"],
      ["h-12", "h-9 px-4"],
      ["px-5 py-2", "px-3.5"],
      ["px-3.5", "px-5"],
      ["ps-4 pe-4", "pe-5"],
      ["ms-3 md:ms-0", "ms-6"],
      ["ms-6", "md:ms-0"],
      ["text-base font-medium", "text-sm"],
      ["text-sm", "text-lg"],
      ["text-sm text-foreground", "text-primary"],
      ["text-primary-foreground", "text-lg"],
      ["bg-primary text-primary-foreground", "bg-secondary text-secondary-foreground"],
      ["bg-muted", "bg-background"],
      ["bg-clip-padding bg-primary", "bg-secondary"],
      ["hover:bg-muted", "hover:bg-primary"],
      ["hover:bg-muted hover:text-foreground", "hover:bg-secondary"],
      ["aria-expanded:bg-muted", "aria-expanded:bg-secondary"],
      ["aria-invalid:ring-destructive aria-invalid:border-destructive", "aria-invalid:ring-3"],
      ["data-[icon=inline-start]:ps-4", "data-[icon=inline-start]:ps-3"],
      ["has-data-[icon=inline-end]:pe-4", "has-data-[icon=inline-end]:pe-5"],
      ["in-data-[slot=button-group]:rounded-lg", "in-data-[slot=button-group]:rounded-md"],
      ["rtl:rotate-180", "rtl:rotate-0"],
      ["rtl:rotate-180 rotate-90", "rotate-45"],
      ["rounded-lg", "rounded-md"],
      ["rounded-[min(var(--radius-md),10px)]", "rounded-lg"],
      ["size-12", "size-9"],
      ["size-12 h-9", "size-6"],
      ["[&_svg:not([class*='size-'])]:size-4", "[&_svg:not([class*='size-'])]:size-3"],
      ["border border-transparent", "border-input"],
      ["border-destructive/30", "border-input"],
      ["text-start", "text-center"],
      ["text-balance text-start", "text-end"],
      ["px-4 px-2 pe-1", "px-6"],
      ["", "h-9"],
      ["h-9", ""],
    ];
    for (const row of rows) expectSame(...row);
  });

  it("joins conditional inputs like clsx", () => {
    const inputs = [
      "px-2",
      undefined,
      null,
      false,
      0,
      ["h-9", ["h-12"]],
      { "bg-primary": true, "bg-secondary": false },
      "px-4",
    ] as const;
    expect(cn(...inputs)).toBe(fullCn(...inputs));
    expect(cn(...inputs)).toBe("h-12 bg-primary px-4");
  });

  it("scans a non-trivial amount of source", () => {
    expect(literals.length).toBeGreaterThan(200);
    expect(buckets().length).toBeGreaterThan(20);
  });

  it("agrees on every className literal found under src/", () => {
    for (const literal of literals) expectSame(literal);
  });

  it("agrees on every ordered pair of classes that share a utility family", () => {
    let pairs = 0;
    for (const group of buckets()) {
      for (const first of group) {
        for (const second of group) {
          expectSame(first, second);
          pairs += 1;
        }
      }
    }
    expect(pairs).toBeGreaterThan(500);
  });

  it("agrees on seeded overrides of one literal by another and by class triples", () => {
    const rng = seededRng(20260930);
    const pick = <T>(items: readonly T[]): T => items[Math.floor(rng() * items.length)] as T;
    for (let run = 0; run < 4000; run += 1) {
      expectSame(pick(literals), pick(literals));
      expectSame(pick(tokens), pick(tokens), pick(tokens));
    }
    const bucketed = buckets();
    for (let run = 0; run < 4000; run += 1) {
      const group = pick(bucketed);
      expectSame(pick(literals), pick(group), pick(group));
    }
  });
});
