import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ROOT = process.cwd();
const BIOME_BIN = path.join(ROOT, "node_modules", "@biomejs", "biome", "bin", "biome");
const CANARY_PREFIX = "__canary__";
const PURE_DATA_SCHEMA_MODULES = new Set(["@/data-schema/dates", "@/data-schema/staleness"]);
const CANARY_DIRS = ["src/domain", "src/lib", "src/data-schema"];

const STATIC_IMPORT_RE = /^\s*(?:import|export)\s+(type\s+)?[^;'"]*?\sfrom\s*["']([^"']+)["']/gm;
const SIDE_EFFECT_IMPORT_RE = /^\s*import\s*["']([^"']+)["']/gm;
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

interface LintResult {
  status: number | null;
  output: string;
}

let canaryCounter = 0;

// Canary files are transient: do not run `pnpm typecheck` or `next dev` concurrently with `pnpm test`.
// Biome 2.4.2 never prints diagnostics in --stdin-file-path mode, so the source is linted from a
// real transient file placed where the override globs match, and always removed afterwards.
function lintAs(virtualPath: string, source: string): LintResult {
  const dir = path.resolve(ROOT, path.dirname(virtualPath));
  const file = path.join(
    dir,
    `${CANARY_PREFIX}.${process.pid}.${canaryCounter++}${path.extname(virtualPath)}`,
  );
  const createdTop = mkdirSync(dir, { recursive: true });
  try {
    writeFileSync(file, source);
    const result = spawnSync(
      process.execPath,
      [BIOME_BIN, "lint", "--colors=off", "--max-diagnostics=50", file],
      { cwd: ROOT, encoding: "utf8" },
    );
    if (result.error) throw result.error;
    return {
      status: result.status,
      output: `${result.stdout}
${result.stderr}`,
    };
  } finally {
    if (existsSync(file)) unlinkSync(file);
    if (createdTop !== undefined) removeEmptyDirsUpTo(dir, path.resolve(createdTop));
  }
}

// A crash, config error or ignored file must never let a `.not.toContain(...)` control pass.
function lintFile(virtualPath: string, source: string): LintResult {
  const result = lintAs(virtualPath, source);
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`biome exited with status ${String(result.status)}:
${result.output}`);
  }
  if (!/Checked 1 file/.test(result.output)) {
    throw new Error(`biome did not process the canary file:
${result.output}`);
  }
  return result;
}

function removeEmptyDirsUpTo(from: string, top: string): void {
  let dir = from;
  while (existsSync(dir) && readdirSync(dir).length === 0) {
    rmdirSync(dir);
    if (dir === top) return;
    dir = path.dirname(dir);
  }
}

function sweepCanaries(): void {
  for (const rel of CANARY_DIRS) {
    const dir = path.join(ROOT, rel);
    if (!existsSync(dir)) continue;
    const stale = readdirSync(dir).filter((name) => name.startsWith(CANARY_PREFIX));
    for (const name of stale) unlinkSync(path.join(dir, name));
    if (stale.length > 0) removeEmptyDirsUpTo(dir, dir);
  }
}

function findDataSchemaValueImports(source: string): string[] {
  const hits: Array<{ index: number; specifier: string }> = [];
  for (const match of source.matchAll(STATIC_IMPORT_RE)) {
    if (match[1] !== undefined) continue;
    hits.push({ index: match.index, specifier: match[2] ?? "" });
  }
  for (const match of source.matchAll(SIDE_EFFECT_IMPORT_RE)) {
    hits.push({ index: match.index, specifier: match[1] ?? "" });
  }
  for (const match of source.matchAll(DYNAMIC_IMPORT_RE)) {
    hits.push({ index: match.index, specifier: match[1] ?? "" });
  }
  return hits
    .filter(({ specifier }) => specifier.startsWith("@/data-schema"))
    .filter(({ specifier }) => !PURE_DATA_SCHEMA_MODULES.has(specifier))
    .sort((a, b) => a.index - b.index)
    .map(({ specifier }) => specifier);
}

function domainSourceFiles(): string[] {
  const dir = path.join(ROOT, "src", "domain");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"))
    .filter((file) => !path.basename(file).startsWith(CANARY_PREFIX))
    .map((file) => path.join(dir, file));
}

function importSource(specifier: string, binding = "x"): string {
  return `import { ${binding} } from "${specifier}";\nexport const y = ${binding};\n`;
}

const FORBIDDEN_IN_DOMAIN: ReadonlyArray<readonly [string, string]> = [
  ["react", importSource("react", "useState")],
  ["react (type import)", 'import type { ReactNode } from "react";\nexport type T = ReactNode;\n'],
  ["react-dom", importSource("react-dom", "createPortal")],
  ["next/link", 'import Link from "next/link";\nexport const x = Link;\n'],
  ["next/navigation", importSource("next/navigation", "redirect")],
  [
    "next/dist/client/link (multi-segment)",
    'import Link from "next/dist/client/link";\nexport const x = Link;\n',
  ],
  ["next-intl/server", importSource("next-intl/server", "getTranslations")],
  ["zod", importSource("zod", "z")],
  ["yaml", importSource("yaml", "parse")],
  ["bare fs", importSource("fs", "readFileSync")],
  ["fs/promises", importSource("fs/promises", "readFile")],
  ["bare path", importSource("path", "join")],
  ["bare os", importSource("os", "tmpdir")],
  ["bare child_process", importSource("child_process", "spawn")],
  ["bare http", importSource("http", "request")],
  ["bare https", importSource("https", "request")],
  ["bare net", importSource("net", "connect")],
  ["bare dns", importSource("dns", "lookup")],
  ["bare tls", importSource("tls", "connect")],
  ["bare dgram", importSource("dgram", "createSocket")],
  ["bare worker_threads", importSource("worker_threads", "Worker")],
  ["node:fs", importSource("node:fs", "readFileSync")],
  ["node:fs/promises (multi-segment)", importSource("node:fs/promises", "readFile")],
  ["@/db", importSource("@/db", "db")],
  ["@/db/schema/users", importSource("@/db/schema/users", "users")],
  ["@/lib/utils", importSource("@/lib/utils", "cn")],
  ["@/lib/auth/server (multi-segment)", importSource("@/lib/auth/server", "auth")],
  ["@/components/ui/button", importSource("@/components/ui/button", "Button")],
  ["@/app/page", importSource("@/app/page", "Page")],
  ["@/i18n/routing", importSource("@/i18n/routing", "routing")],
  ["bare @scripts", importSource("@scripts", "check")],
  ["@scripts/data/check", importSource("@scripts/data/check", "check")],
  ["../ escape", importSource("../lib/utils", "y2")],
  ["../../ escape", importSource("../../lib/utils", "y2")],
];

const ALLOWED_IN_DOMAIN_SOURCE = [
  'import type { Profile } from "@/data-schema/profile";',
  'import { addDays } from "@/data-schema/dates";',
  'import { freshnessOf } from "@/data-schema/staleness";',
  "export const f = (p: Profile) => [p, addDays, freshnessOf];",
  "",
].join("\n");

describe("domain import boundary (Biome override canary)", { timeout: 60_000 }, () => {
  beforeAll(sweepCanaries);
  afterAll(sweepCanaries);

  it.each(FORBIDDEN_IN_DOMAIN)("rejects %s imports inside src/domain", (_label, source) => {
    const { status, output } = lintFile("src/domain/canary.ts", source);
    expect(status).toBe(1);
    expect(output).toContain("noRestrictedImports");
  });

  it("rejects the Date global inside src/domain", () => {
    const { status, output } = lintFile("src/domain/canary.ts", "export const t = new Date();\n");
    expect(status).toBe(1);
    expect(output).toContain("noRestrictedGlobals");
  });

  it("allows type imports from data-schema and value imports from the pure date modules", () => {
    const { status, output } = lintFile("src/domain/canary.ts", ALLOWED_IN_DOMAIN_SOURCE);
    expect(status).toBe(0);
    expect(output).not.toContain("noRestrictedImports");
  });

  it("does not apply the domain ban outside src/domain", () => {
    const { status, output } = lintFile(
      "src/lib/canary.ts",
      'import { z } from "zod";\nexport const x = z;\n',
    );
    expect(status).toBe(0);
    expect(output).not.toContain("noRestrictedImports");
  });

  it("does not apply the Date ban to other data-schema modules", () => {
    const { status, output } = lintFile(
      "src/data-schema/canary.ts",
      "export const t = new Date();\n",
    );
    expect(status).toBe(0);
    expect(output).not.toContain("noRestrictedGlobals");
  });
});

describe("pure data-schema date modules keep the domain override", () => {
  // The real dates.ts / staleness.ts must not be overwritten by a test, so the Date ban on them is
  // asserted against biome.json: the override must target both files and deny the Date global.
  const biomeConfig: unknown = JSON.parse(readFileSync(path.join(ROOT, "biome.json"), "utf8"));

  function domainOverride(): Record<string, unknown> {
    const overrides = (biomeConfig as { overrides?: Array<Record<string, unknown>> }).overrides;
    const found = overrides?.find(
      (o) => Array.isArray(o.includes) && o.includes.includes("src/domain/**"),
    );
    if (found === undefined) throw new Error("biome.json has no src/domain/** override");
    return found;
  }

  it("includes both pure modules alongside src/domain/**", () => {
    expect(domainOverride().includes).toEqual(
      expect.arrayContaining([
        "src/domain/**",
        "src/data-schema/dates.ts",
        "src/data-schema/staleness.ts",
      ]),
    );
  });

  it("denies the Date global in that override", () => {
    const linter = domainOverride().linter as {
      rules: {
        style: { noRestrictedGlobals: { options: { deniedGlobals: Record<string, string> } } };
      };
    };
    expect(Object.keys(linter.rules.style.noRestrictedGlobals.options.deniedGlobals)).toContain(
      "Date",
    );
  });
});

const SCAN_CASES: ReadonlyArray<readonly [string, string, string[]]> = [
  [
    "named value import",
    'import { ProfileSchema } from "@/data-schema/profile";',
    ["@/data-schema/profile"],
  ],
  [
    "multi-line named import",
    'import {\n  ProfileSchema,\n  RouteSchema,\n} from "@/data-schema/profile";',
    ["@/data-schema/profile"],
  ],
  ["export * from", 'export * from "@/data-schema/profile";', ["@/data-schema/profile"]],
  [
    "export { X } from",
    'export { ProfileSchema } from "@/data-schema/profile";',
    ["@/data-schema/profile"],
  ],
  [
    "default + inline type",
    'import schema, { type Profile } from "@/data-schema/profile";',
    ["@/data-schema/profile"],
  ],
  ["side-effect import", 'import "@/data-schema/profile";', ["@/data-schema/profile"]],
  [
    "dynamic import",
    'const m = await import("@/data-schema/profile");\nexport const x = m;',
    ["@/data-schema/profile"],
  ],
  ["import type (allowed)", 'import type { Profile } from "@/data-schema/profile";', []],
  ["export type { X } from (allowed)", 'export type { Profile } from "@/data-schema/profile";', []],
  ["pure dates value import (allowed)", 'import { addDays } from "@/data-schema/dates";', []],
  [
    "pure staleness value import (allowed)",
    'import { freshnessOf } from "@/data-schema/staleness";',
    [],
  ],
  [
    "several forms keep source order",
    'import "@/data-schema/a";\nimport type { T } from "@/data-schema/b";\nexport * from "@/data-schema/c";\n',
    ["@/data-schema/a", "@/data-schema/c"],
  ],
];

describe("domain runtime imports from data-schema", () => {
  it.each(SCAN_CASES)("scan: %s", (_label, source, expected) => {
    expect(findDataSchemaValueImports(source)).toEqual(expected);
  });

  it("finds no value imports from non-pure data-schema modules in src/domain", () => {
    const offenders = domainSourceFiles().flatMap((file) =>
      findDataSchemaValueImports(readFileSync(file, "utf8")).map(
        (spec) => `${path.relative(ROOT, file)} -> ${spec}`,
      ),
    );
    expect(offenders).toEqual([]);
  });
});
