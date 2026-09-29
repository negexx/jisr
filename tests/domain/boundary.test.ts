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

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const BIOME_BIN = path.join(ROOT, "node_modules", "@biomejs", "biome", "bin", "biome");
const CANARY_PREFIX = "__canary__";
const PURE_DATA_SCHEMA_MODULES = new Set(["@/data-schema/dates", "@/data-schema/staleness"]);
const IMPORT_RE = /^\s*(?:import|export)\s+(type\s+)?[^;]*?\sfrom\s+["']([^"']+)["']/gm;

let canaryCounter = 0;

// Biome 2.4.2 never prints diagnostics in --stdin-file-path mode, so the source is linted from a
// real transient file placed where the override globs match, and always removed afterwards.
function lintAs(virtualPath: string, source: string): string {
  const dir = path.join(ROOT, path.dirname(virtualPath));
  const file = path.join(
    dir,
    `${CANARY_PREFIX}.${process.pid}.${canaryCounter++}${path.extname(virtualPath)}`,
  );
  const createdDir = mkdirSync(dir, { recursive: true });
  try {
    writeFileSync(file, source);
    const result = spawnSync(
      process.execPath,
      [BIOME_BIN, "lint", "--colors=off", "--max-diagnostics=50", file],
      { cwd: ROOT, encoding: "utf8" },
    );
    if (result.error) throw result.error;
    return `${result.stdout}\n${result.stderr}`;
  } finally {
    if (existsSync(file)) unlinkSync(file);
    if (createdDir !== undefined) removeIfEmpty(createdDir);
  }
}

function removeIfEmpty(dir: string): void {
  if (readdirSync(dir).length === 0) rmdirSync(dir);
}

function findDataSchemaValueImports(source: string): string[] {
  const hits: string[] = [];
  for (const match of source.matchAll(IMPORT_RE)) {
    const typeKeyword = match[1];
    const specifier = match[2];
    if (specifier === undefined || !specifier.startsWith("@/data-schema")) continue;
    if (typeKeyword !== undefined || PURE_DATA_SCHEMA_MODULES.has(specifier)) continue;
    hits.push(specifier);
  }
  return hits;
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
  ["next/link", 'import Link from "next/link";\nexport const x = Link;\n'],
  ["next/navigation", importSource("next/navigation", "redirect")],
  [
    "next/dist/client/link (multi-segment)",
    'import Link from "next/dist/client/link";\nexport const x = Link;\n',
  ],
  ["next-intl/server", importSource("next-intl/server", "getTranslations")],
  ["zod", importSource("zod", "z")],
  ["bare fs", importSource("fs", "readFileSync")],
  ["fs/promises", importSource("fs/promises", "readFile")],
  ["bare path", importSource("path", "join")],
  ["bare os", importSource("os", "tmpdir")],
  ["bare child_process", importSource("child_process", "spawn")],
  ["bare http", importSource("http", "request")],
  ["bare https", importSource("https", "request")],
  ["bare net", importSource("net", "connect")],
  ["node:fs", importSource("node:fs", "readFileSync")],
  ["node:fs/promises (multi-segment)", importSource("node:fs/promises", "readFile")],
  ["@/db", importSource("@/db", "db")],
  ["@/db/schema/users", importSource("@/db/schema/users", "users")],
  ["@/lib/utils", importSource("@/lib/utils", "cn")],
  ["@/lib/auth/server (multi-segment)", importSource("@/lib/auth/server", "auth")],
  ["@/components/ui/button", importSource("@/components/ui/button", "Button")],
  ["@/i18n/routing", importSource("@/i18n/routing", "routing")],
  ["@scripts/data/check", importSource("@scripts/data/check", "check")],
  ["../ escape", importSource("../lib/utils", "y2")],
  ["../../ escape", importSource("../../lib/utils", "y2")],
];

describe("domain import boundary (Biome override canary)", { timeout: 60_000 }, () => {
  it.each(FORBIDDEN_IN_DOMAIN)("rejects %s imports inside src/domain", (_label, source) => {
    expect(lintAs("src/domain/canary.ts", source)).toContain("noRestrictedImports");
  });

  it("rejects the Date global inside src/domain", () => {
    expect(lintAs("src/domain/canary.ts", "export const t = new Date();\n")).toContain(
      "noRestrictedGlobals",
    );
  });

  it("allows type imports from data-schema and value imports from the pure date modules", () => {
    const source = [
      'import type { Profile } from "@/data-schema/profile";',
      'import { addDays } from "@/data-schema/dates";',
      'import { freshnessOf } from "@/data-schema/staleness";',
      "export const f = (p: Profile) => [p, addDays, freshnessOf];",
      "",
    ].join("\n");
    expect(lintAs("src/domain/canary.ts", source)).not.toContain("noRestrictedImports");
  });

  it("does not apply the domain ban outside src/domain", () => {
    expect(
      lintAs("src/lib/canary.ts", 'import { z } from "zod";\nexport const x = z;\n'),
    ).not.toContain("noRestrictedImports");
  });

  it("does not apply the Date ban to other data-schema modules", () => {
    expect(lintAs("src/data-schema/canary.ts", "export const t = new Date();\n")).not.toContain(
      "noRestrictedGlobals",
    );
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

describe("domain runtime imports from data-schema", () => {
  it("flags a value import from a schema module", () => {
    expect(
      findDataSchemaValueImports('import { ProfileSchema } from "@/data-schema/profile";'),
    ).toEqual(["@/data-schema/profile"]);
  });

  it("accepts type imports and the pure date modules", () => {
    const source =
      'import type { Profile } from "@/data-schema/profile";\nimport { addDays } from "@/data-schema/dates";\n';
    expect(findDataSchemaValueImports(source)).toEqual([]);
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
