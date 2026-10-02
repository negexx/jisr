import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import { ROOT } from "./snapshot/fixture";

// Importing `zod` costs about 120 KB gzipped in any client chunk (ADR 0004 budget: 150 KB for the
// whole initial load), so client-reachable code validates by hand and Zod stays on the server, in
// scripts and in tests. `@/data-schema/*` builds Zod schemas at module load, so only type imports
// (erased at build time) and the modules listed here may cross into client code.
const ZOD_FREE_DATA_SCHEMA = ["@/data-schema/dates", "@/data-schema/staleness"] as const;

const SRC = path.join(ROOT, "src");
const SOURCE_EXTENSION = /\.(?:[cm]?js|jsx|tsx?)$/;

const CLIENT_DIRECTORIES = [
  "components",
  "domain",
  path.join("lib", "profile"),
  path.join("lib", "snapshot"),
  path.join("lib", "journey"),
  path.join("lib", "i18n"),
  path.join("lib", "design"),
  path.join("lib", "saved"),
  path.join("lib", "plan"),
];
const CLIENT_FILES = [
  path.join("lib", "local-storage.ts"),
  path.join("lib", "local-store.ts"),
  path.join("lib", "local-data.ts"),
  path.join("lib", "format.ts"),
  path.join("lib", "clock.ts"),
  path.join("lib", "constants.ts"),
  path.join("lib", "guards.ts"),
  path.join("lib", "utils.ts"),
];
const SERVER_ONLY_FILES = [path.join("lib", "snapshot", "server.ts")];

type Import = { specifier: string; typeOnly: boolean };

function isModuleName(node: ts.Node | undefined): node is ts.StringLiteral {
  return node !== undefined && ts.isStringLiteral(node);
}

function allInlineType(elements: readonly { isTypeOnly: boolean }[]): boolean {
  return elements.length > 0 && elements.every((element) => element.isTypeOnly);
}

function isTypeOnlyImport(node: ts.ImportDeclaration): boolean {
  const clause = node.importClause;
  if (clause === undefined) return false;
  if (clause.isTypeOnly) return true;
  const bindings = clause.namedBindings;
  return (
    clause.name === undefined &&
    bindings !== undefined &&
    ts.isNamedImports(bindings) &&
    allInlineType(bindings.elements)
  );
}

function isTypeOnlyExport(node: ts.ExportDeclaration): boolean {
  const clause = node.exportClause;
  return (
    node.isTypeOnly ||
    (clause !== undefined && ts.isNamedExports(clause) && allInlineType(clause.elements))
  );
}

function parseSource(source: string): ts.SourceFile {
  return ts.createSourceFile("module.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

// Static `import`/`export ... from`, `import x = require()`, dynamic `import()` and `require()`,
// found on the TypeScript AST so comments and strings cannot hide or fake an import. A dynamic
// import whose argument is not a literal cannot be resolved here and is not reported.
export function importsOf(source: string): Import[] {
  const found: Import[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && isModuleName(node.moduleSpecifier)) {
      found.push({ specifier: node.moduleSpecifier.text, typeOnly: isTypeOnlyImport(node) });
    } else if (ts.isExportDeclaration(node) && isModuleName(node.moduleSpecifier)) {
      found.push({ specifier: node.moduleSpecifier.text, typeOnly: isTypeOnlyExport(node) });
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      isModuleName(node.moduleReference.expression)
    ) {
      found.push({ specifier: node.moduleReference.expression.text, typeOnly: node.isTypeOnly });
    } else if (ts.isCallExpression(node)) {
      const [argument] = node.arguments;
      const loads =
        node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require");
      if (loads && argument !== undefined && ts.isStringLiteralLike(argument)) {
        found.push({ specifier: argument.text, typeOnly: false });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(parseSource(source));
  return found;
}

function toAlias(file: string, specifier: string): string {
  if (!specifier.startsWith(".")) return specifier;
  const resolved = path.resolve(path.dirname(file), specifier);
  const relative = path.relative(SRC, resolved);
  return relative.startsWith("..") ? specifier : `@/${relative.split(path.sep).join("/")}`;
}

function isZod(specifier: string): boolean {
  return specifier === "zod" || specifier.startsWith("zod/");
}

function isDataSchema(alias: string): boolean {
  return alias === "@/data-schema" || alias.startsWith("@/data-schema/");
}

function withoutExtension(alias: string): string {
  return alias.replace(SOURCE_EXTENSION, "");
}

function isForbidden(file: string, specifier: string): boolean {
  const alias = withoutExtension(toAlias(file, specifier));
  if (isZod(alias)) return true;
  return isDataSchema(alias) && !(ZOD_FREE_DATA_SCHEMA as readonly string[]).includes(alias);
}

export function violationsIn(file: string, source: string): string[] {
  return importsOf(source).flatMap(({ specifier, typeOnly }) =>
    !typeOnly && isForbidden(file, specifier) ? [specifier] : [],
  );
}

export function hasUseClient(source: string): boolean {
  for (const statement of parseSource(source).statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) {
      return false;
    }
    if (statement.expression.text === "use client") return true;
  }
  return false;
}

export function isClientReachable(relativeToSrc: string, source: string): boolean {
  if (SERVER_ONLY_FILES.includes(relativeToSrc)) return false;
  if (hasUseClient(source)) return true;
  if (CLIENT_FILES.includes(relativeToSrc)) return true;
  return CLIENT_DIRECTORIES.some((dir) => relativeToSrc.startsWith(`${dir}${path.sep}`));
}

type Reader = (file: string) => string | null;

const RESOLUTION_SUFFIXES = ["", ".ts", ".tsx", `${path.sep}index.ts`, `${path.sep}index.tsx`];

// A local module a specifier points at (relative or `@/`), or null for packages and missing files.
function resolveLocal(from: string, specifier: string, read: Reader): string | null {
  const base = specifier.startsWith("@/")
    ? path.join(SRC, specifier.slice(2))
    : specifier.startsWith(".")
      ? path.resolve(path.dirname(from), specifier)
      : null;
  if (base === null) return null;
  const stripped = withoutExtension(base);
  for (const candidate of [base, ...RESOLUTION_SUFFIXES.map((suffix) => `${stripped}${suffix}`)]) {
    if (SOURCE_EXTENSION.test(candidate) && read(candidate) !== null) return candidate;
  }
  return null;
}

// Walks the runtime import graph from `roots`. Type-only imports are erased at build time and are
// not followed; a dynamic import() is followed because its chunk still ships to the browser.
// Every reachable module is checked, and a forbidden import is reported with the chain that led to it.
export function reachableViolations(roots: readonly string[], read: Reader): string[] {
  const parent = new Map<string, string | null>();
  const queue: string[] = [];
  for (const root of roots) {
    parent.set(root, null);
    queue.push(root);
  }
  const offenders: string[] = [];
  const chain = (file: string): string => {
    const names: string[] = [];
    for (
      let at: string | null | undefined = file;
      at !== null && at !== undefined;
      at = parent.get(at)
    ) {
      names.unshift(path.relative(ROOT, at).split(path.sep).join("/"));
    }
    return names.join(" -> ");
  };
  while (queue.length > 0) {
    const file = queue.shift();
    const source = file === undefined ? null : read(file);
    if (file === undefined || source === null) continue;
    for (const { specifier, typeOnly } of importsOf(source)) {
      if (typeOnly) continue;
      if (isForbidden(file, specifier)) {
        offenders.push(`${chain(file)} imports ${specifier}`);
        continue;
      }
      const target = resolveLocal(file, specifier, read);
      if (target !== null && !parent.has(target)) {
        parent.set(target, file);
        queue.push(target);
      }
    }
  }
  return offenders;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return SOURCE_EXTENSION.test(entry.name) ? [full] : [];
  });
}

const FILE = path.join(SRC, "lib", "profile", "example.ts");

describe("client import scanner", () => {
  it.each([
    ["a named zod import", 'import { z } from "zod";'],
    ["a namespace zod import", 'import * as z from "zod";'],
    ["a zod subpath import", 'import { z } from "zod/mini";'],
    ["a side-effect zod import", 'import "zod";'],
    ["a dynamic zod import", 'const { z } = await import("zod");'],
    ["a template-literal dynamic import", "await import(`zod`)"],
    ["a zod require", 'const { z } = require("zod");'],
    ["a zod re-export", 'export { z } from "zod";'],
    ["a zod star re-export", 'export * from "zod";'],
    ["a single-quoted zod import", "import { z } from 'zod'"],
    [
      "a zod import after a string holding a comment opener",
      'const a = "/*";\nimport { z } from "zod";\nconst b = "*/";',
    ],
    [
      "a zod import after a string holding a line comment",
      'const a = "//"; import { z } from "zod";',
    ],
    ["a runtime data-schema import", 'import { ProfileSchema } from "@/data-schema/profile";'],
    [
      "a mixed value and type data-schema import",
      'import { type Profile, ProfileSchema } from "@/data-schema/profile";',
    ],
    [
      "a default plus type data-schema import",
      'import Schemas, { type Profile } from "@/data-schema/profile";',
    ],
    ["a namespace data-schema import", 'import * as profile from "@/data-schema/profile";'],
    ["an empty-braces data-schema import", 'import {} from "@/data-schema/profile";'],
    ["a data-schema re-export", 'export { ProfileSchema } from "@/data-schema/profile";'],
    ["a data-schema star re-export", 'export * from "@/data-schema/snapshot";'],
    ["a dynamic data-schema import", 'await import("@/data-schema/primitives")'],
    ["a data-schema require", 'require("@/data-schema/primitives")'],
    ["a side-effect data-schema import", 'import "@/data-schema/primitives";'],
    ["a runtime import from primitives", 'import { LOCALES } from "@/data-schema/primitives";'],
    ["a runtime import from snapshot", 'import { shardNames } from "@/data-schema/snapshot";'],
    ["a relative data-schema import", 'import { ProfileSchema } from "../../data-schema/profile";'],
    [
      "a data-schema records import",
      'import { ProgramSchema } from "@/data-schema/records/program";',
    ],
    ["a data-schema import with an extension", 'import { x } from "@/data-schema/profile.ts";'],
    [
      "a multi-line data-schema import",
      'import {\n  type Profile,\n  ProfileSchema,\n} from "@/data-schema/profile";',
    ],
  ])("flags %s", (_label, source) => {
    expect(violationsIn(FILE, source)).not.toEqual([]);
  });

  it.each([
    ["a type import", 'import type { Profile } from "@/data-schema/profile";'],
    [
      "inline type specifiers",
      'import { type Profile, type GradeValue } from "@/data-schema/profile";',
    ],
    ["a type re-export", 'export type { Profile } from "@/data-schema/profile";'],
    ["a type import from zod", 'import type { z } from "zod";'],
    ["a type import from primitives", 'import type { Locale } from "@/data-schema/primitives";'],
    ["a multi-line type import", 'import type {\n  A,\n  B,\n} from "@/data-schema/resolved";'],
    [
      "a multi-line inline-type import",
      'import {\n  type A,\n  type B,\n} from "@/data-schema/resolved";',
    ],
    [
      "the zod-free dates module",
      'import { compareIso, type IsoDate } from "@/data-schema/dates";',
    ],
    ["the zod-free staleness module", 'import { freshnessOf } from "@/data-schema/staleness";'],
    ["a relative dates import", 'import { isValidIsoDate } from "../../data-schema/dates";'],
    ["an unrelated package", 'import { useMemo } from "react";'],
    ["a local zod-free module", 'import { LOCALES } from "@/lib/constants";'],
    ["a commented-out zod import", '// import { z } from "zod";\nexport const a = 1;'],
    ["a block-commented zod import", '/* import { z } from "zod"; */\nexport const a = 1;'],
    ["zod named in a string", 'export const note = "we do not import zod here";'],
    ["a module whose name starts with zod", 'import { a } from "zodiac";'],
  ])("allows %s", (_label, source) => {
    expect(violationsIn(FILE, source)).toEqual([]);
  });

  it("resolves relative imports before judging them", () => {
    const elsewhere = path.join(SRC, "components", "x.tsx");
    expect(violationsIn(elsewhere, 'import { S } from "../data-schema/profile";')).toEqual([
      "../data-schema/profile",
    ]);
    expect(violationsIn(elsewhere, 'import { S } from "./data-schema/profile";')).toEqual([]);
  });

  it("treats a use-client directive, and only the server reader exception, as client-reachable", () => {
    expect(hasUseClient('"use client";\n\nimport x from "y";')).toBe(true);
    expect(hasUseClient("'use client'\nexport const a = 1;")).toBe(true);
    expect(hasUseClient('// "use client"\nexport const a = 1;')).toBe(false);
    expect(hasUseClient('import x from "y";\n"use client";')).toBe(false);
    expect(isClientReachable(path.join("app", "x", "widget.tsx"), '"use client";')).toBe(true);
    expect(isClientReachable(path.join("app", "x", "page.tsx"), "export const a = 1;")).toBe(false);
    expect(isClientReachable(path.join("lib", "snapshot", "client.ts"), "")).toBe(true);
    expect(isClientReachable(path.join("lib", "snapshot", "server.ts"), "")).toBe(false);
    expect(isClientReachable(path.join("lib", "format.ts"), "")).toBe(true);
    expect(isClientReachable(path.join("data-schema", "profile.ts"), "")).toBe(false);
  });

  it("finds the use-client directive even when a later string holds a comment opener", () => {
    expect(hasUseClient('"use client";\nconst a = "/*";')).toBe(true);
    expect(hasUseClient('const a = "use client";')).toBe(false);
  });
});

describe("client-reachable modules stay Zod-free", () => {
  const scanned = sourceFiles(SRC)
    .map((file) => ({ file, source: readFileSync(file, "utf8") }))
    .filter(({ file, source }) => isClientReachable(path.relative(SRC, file), source));

  it("scans the modules that matter", () => {
    const names = scanned.map(({ file }) => path.relative(SRC, file).split(path.sep).join("/"));
    expect(names).toEqual(
      expect.arrayContaining([
        "lib/profile/store.ts",
        "lib/profile/storage.ts",
        "lib/profile/draft.ts",
        "lib/profile/use-profile.ts",
        "lib/snapshot/client.ts",
        "lib/snapshot/manifest.ts",
        "lib/snapshot/use-snapshot.ts",
        "lib/journey/matches-view.ts",
        "lib/format.ts",
        "domain/match.ts",
      ]),
    );
    expect(names).not.toContain("lib/snapshot/server.ts");
    expect(names.length).toBeGreaterThan(30);
  });

  const diskReader: Reader = (file) => {
    try {
      return readFileSync(file, "utf8");
    } catch {
      return null;
    }
  };

  it("reaches no zod and no Zod-building data-schema module at runtime, transitively", () => {
    const offenders = reachableViolations(
      scanned.map(({ file }) => file),
      diskReader,
    );
    expect(offenders, "client code must not reach zod (see the header of this test)").toEqual([]);
  });

  it("walks through the allowlisted data-schema modules and finds them zod-free", () => {
    const roots = ZOD_FREE_DATA_SCHEMA.map((alias) => path.join(SRC, `${alias.slice(2)}.ts`));
    expect(reachableViolations(roots, diskReader)).toEqual([]);
  });
});

describe("transitive import walk", () => {
  const at = (...segments: string[]) => path.join(SRC, ...segments);
  const files = (entries: Record<string, string>): Reader => {
    const byPath = new Map(Object.entries(entries).map(([name, source]) => [at(name), source]));
    return (file) => byPath.get(file) ?? null;
  };

  it("flags zod reached through a relative chain and names the chain", () => {
    const read = files({
      "lib/a.ts": 'import { b } from "./b";',
      "lib/b.ts": 'import { c } from "./sub/c";',
      "lib/sub/c.ts": 'import { z } from "zod";',
    });
    expect(reachableViolations([at("lib/a.ts")], read)).toEqual([
      "src/lib/a.ts -> src/lib/b.ts -> src/lib/sub/c.ts imports zod",
    ]);
  });

  it("follows alias imports, index files, tsx files and dynamic imports", () => {
    const read = files({
      "lib/a.ts": 'import { b } from "@/lib/b";\nconst c = () => import("./c");',
      "lib/b/index.ts": 'import { S } from "@/data-schema/profile";',
      "lib/c.tsx": 'import { z } from "zod/mini";',
    });
    expect(reachableViolations([at("lib/a.ts")], read)).toEqual([
      "src/lib/a.ts -> src/lib/b/index.ts imports @/data-schema/profile",
      "src/lib/a.ts -> src/lib/c.tsx imports zod/mini",
    ]);
  });

  it("does not follow type-only imports, which are erased at build time", () => {
    const read = files({
      "lib/a.ts": 'import type { B } from "./b";\nimport { type C } from "./c";',
      "lib/b.ts": 'import { z } from "zod";',
      "lib/c.ts": 'import { z } from "zod";',
    });
    expect(reachableViolations([at("lib/a.ts")], read)).toEqual([]);
  });

  it("follows the allowlisted data-schema modules and terminates on cycles", () => {
    const read = files({
      "lib/a.ts": 'import { compareIso } from "@/data-schema/dates";\nimport "./b";',
      "lib/b.ts": 'import "./a";',
      "data-schema/dates.ts": 'import { z } from "zod";',
    });
    expect(reachableViolations([at("lib/a.ts")], read)).toEqual([
      "src/lib/a.ts -> src/data-schema/dates.ts imports zod",
    ]);
  });

  it("ignores packages and files it cannot read", () => {
    const read = files({ "lib/a.ts": 'import { x } from "react";\nimport "./missing";' });
    expect(reachableViolations([at("lib/a.ts")], read)).toEqual([]);
  });
});
