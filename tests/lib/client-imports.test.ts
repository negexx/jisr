import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
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
];
const CLIENT_FILES = [
  path.join("lib", "format.ts"),
  path.join("lib", "clock.ts"),
  path.join("lib", "constants.ts"),
  path.join("lib", "guards.ts"),
  path.join("lib", "utils.ts"),
];
const SERVER_ONLY_FILES = [path.join("lib", "snapshot", "server.ts")];

type Import = { specifier: string; typeOnly: boolean };

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
}

function isTypeOnlyClause(explicitType: boolean, clause: string): boolean {
  if (explicitType) return true;
  const named = /^\{([^}]*)\}$/.exec(clause.trim());
  if (named?.[1] === undefined) return false;
  const entries = named[1]
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
  return entries.length > 0 && entries.every((entry) => /^type\s/.test(entry));
}

// Static `import`/`export ... from`, side-effect imports, dynamic `import()` and `require()`.
export function importsOf(source: string): Import[] {
  const code = stripComments(source);
  const found: Import[] = [];
  for (const match of code.matchAll(
    /\b(?:import|export)\s+(type\s+)?([\w*$\s{},]+?)\s*\bfrom\s*(["'`])([^"'`\n]+)\3/g,
  )) {
    found.push({
      specifier: match[4] ?? "",
      typeOnly: isTypeOnlyClause(match[1] !== undefined, match[2] ?? ""),
    });
  }
  for (const match of code.matchAll(/\bimport\s*(["'`])([^"'`\n]+)\1/g)) {
    found.push({ specifier: match[2] ?? "", typeOnly: false });
  }
  for (const match of code.matchAll(/\b(?:import|require)\s*\(\s*(["'`])([^"'`\n]+)\1/g)) {
    found.push({ specifier: match[2] ?? "", typeOnly: false });
  }
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

export function violationsIn(file: string, source: string): string[] {
  return importsOf(source).flatMap(({ specifier, typeOnly }) => {
    if (typeOnly) return [];
    const alias = withoutExtension(toAlias(file, specifier));
    if (isZod(alias)) return [specifier];
    if (isDataSchema(alias) && !(ZOD_FREE_DATA_SCHEMA as readonly string[]).includes(alias)) {
      return [specifier];
    }
    return [];
  });
}

export function hasUseClient(source: string): boolean {
  return /^\s*(["'])use client\1/.test(stripComments(source));
}

export function isClientReachable(relativeToSrc: string, source: string): boolean {
  if (SERVER_ONLY_FILES.includes(relativeToSrc)) return false;
  if (hasUseClient(source)) return true;
  if (CLIENT_FILES.includes(relativeToSrc)) return true;
  return CLIENT_DIRECTORIES.some((dir) => relativeToSrc.startsWith(`${dir}${path.sep}`));
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

  it("imports no zod and no Zod-building data-schema module at runtime", () => {
    const offenders = scanned.flatMap(({ file, source }) =>
      violationsIn(file, source).map((specifier) => `${path.relative(ROOT, file)} -> ${specifier}`),
    );
    expect(offenders, "client code must not reach zod (see the header of this test)").toEqual([]);
  });

  it("keeps the allowlisted data-schema modules themselves free of zod", () => {
    const seen = new Set<string>();
    const queue: string[] = ZOD_FREE_DATA_SCHEMA.map((alias) =>
      path.join(SRC, `${alias.slice(2)}.ts`),
    );
    while (queue.length > 0) {
      const file = queue.pop();
      if (file === undefined || seen.has(file)) continue;
      seen.add(file);
      for (const { specifier, typeOnly } of importsOf(readFileSync(file, "utf8"))) {
        if (typeOnly) continue;
        expect(isZod(specifier), `${path.relative(ROOT, file)} imports ${specifier}`).toBe(false);
        if (specifier.startsWith("."))
          queue.push(`${path.resolve(path.dirname(file), specifier)}.ts`);
        else expect(specifier.startsWith("@/"), `${file} -> ${specifier}`).toBe(false);
      }
    }
    expect(seen.size).toBeGreaterThanOrEqual(ZOD_FREE_DATA_SCHEMA.length);
  });
});
