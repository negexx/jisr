import { readFileSync } from "node:fs";
import path from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import {
  importsOf,
  type Reader,
  reachableViolations,
  SRC,
  sourceFiles,
  violationsIn,
  ZOD_FREE_DATA_SCHEMA,
} from "./client-scanner";
import { preview, seededRng } from "./differential";

// The client import scanner (client-scanner.ts) decides which modules a browser can reach and whether
// any of them loads Zod. It reads the TypeScript syntax tree. These tests run it against an
// independent reference, the TypeScript compiler itself, on every import form we know, on random
// files and graphs, and on the real source tree. Part of the differential suite (differential.test.ts
// holds the validators); `pnpm vitest run tests/lib/differential` runs both.

// The reference: what the compiler keeps of a module's imports. `transpileModule` erases type-only
// imports and imports none of whose bindings is used, and `preProcessFile` (a lexical scan of the
// emitted JavaScript, which has no types and no comments left) lists what is still loaded. It shares
// no code with the scanner, which reads the TypeScript syntax tree.
const COMPILER_OPTIONS: ts.CompilerOptions = {
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2022,
  jsx: ts.JsxEmit.Preserve,
  isolatedModules: true,
  removeComments: true,
};

function compiled(source: string, fileName: string): { loads: string[]; syntaxErrors: number } {
  const output = ts.transpileModule(source, {
    fileName,
    reportDiagnostics: true,
    compilerOptions: COMPILER_OPTIONS,
  });
  return {
    loads: ts
      .preProcessFile(output.outputText, true, true)
      .importedFiles.map((file) => file.fileName),
    syntaxErrors: output.diagnostics?.length ?? 0,
  };
}

const scannerLoads = (source: string): string[] =>
  importsOf(source)
    .filter(({ typeOnly }) => !typeOnly)
    .map(({ specifier }) => specifier);

const sorted = (values: readonly string[]) => [...values].sort();

// The policy restated with different code: where the specifier points, in `@/` form, and whether
// that module builds Zod schemas when it loads. `fromKey` is the importing file under src/.
function referenceForbidden(fromKey: string, specifier: string): boolean {
  const target = specifier.startsWith(".")
    ? `@/${path.posix.join(path.posix.dirname(fromKey), specifier)}`
    : specifier;
  const bare = target.replace(/\.(?:[cm]?js|jsx|tsx?)$/, "");
  if (bare === "zod" || bare.startsWith("zod/")) return true;
  if (bare !== "@/data-schema" && !bare.startsWith("@/data-schema/")) return false;
  return !(ZOD_FREE_DATA_SCHEMA as readonly string[]).includes(bare);
}

type Form = {
  name: string;
  // One statement (plus the use that keeps the compiler from erasing the import) for module `spec`.
  render: (spec: string, n: number) => string;
  // Whether the compiler keeps this as a load of `spec`.
  loads: boolean;
  // The scanner reports it though the compiler erases it: an import with nothing in it or nothing
  // used. Deliberately conservative, since the build tool is not the compiler that is tested here.
  conservative?: true;
};

const FORMS: Form[] = [
  {
    name: "named import",
    loads: true,
    render: (s, n) => `import { v${n} } from "${s}";\nexport const u${n} = [v${n}];`,
  },
  {
    name: "default import",
    loads: true,
    render: (s, n) => `import d${n} from "${s}";\nexport const u${n} = [d${n}];`,
  },
  {
    name: "namespace import",
    loads: true,
    render: (s, n) => `import * as ns${n} from "${s}";\nexport const u${n} = [ns${n}];`,
  },
  { name: "side-effect import", loads: true, render: (s) => `import "${s}";` },
  {
    name: "default and named import",
    loads: true,
    render: (s, n) => `import d${n}, { v${n} } from "${s}";\nexport const u${n} = [d${n}, v${n}];`,
  },
  {
    name: "value beside an inline type",
    loads: true,
    render: (s, n) =>
      `import { type T${n}, v${n} } from "${s}";\nexport type U${n} = T${n};\nexport const u${n} = [v${n}];`,
  },
  {
    name: "default beside an inline type",
    loads: true,
    render: (s, n) =>
      `import d${n}, { type T${n} } from "${s}";\nexport type U${n} = T${n};\nexport const u${n} = [d${n}];`,
  },
  { name: "named re-export", loads: true, render: (s, n) => `export { v${n} } from "${s}";` },
  { name: "star re-export", loads: true, render: (s) => `export * from "${s}";` },
  { name: "namespace re-export", loads: true, render: (s, n) => `export * as ns${n} from "${s}";` },
  {
    name: "dynamic import",
    loads: true,
    render: (s, n) => `export const load${n} = () => import("${s}");`,
  },
  {
    name: "dynamic import of a template",
    loads: true,
    render: (s, n) => `export const load${n} = () => import(\`${s}\`);`,
  },
  {
    name: "require",
    loads: true,
    render: (s, n) => `const r${n} = require("${s}");\nexport { r${n} };`,
  },
  {
    name: "import equals require",
    loads: true,
    render: (s, n) => `import e${n} = require("${s}");\nexport { e${n} };`,
  },
  {
    name: "type import",
    loads: false,
    render: (s, n) => `import type { T${n} } from "${s}";\nexport type U${n} = T${n};`,
  },
  {
    name: "type default import",
    loads: false,
    render: (s, n) => `import type D${n} from "${s}";\nexport type U${n} = D${n};`,
  },
  {
    name: "type namespace import",
    loads: false,
    render: (s, n) => `import type * as N${n} from "${s}";\nexport type U${n} = N${n}.X;`,
  },
  {
    name: "inline type import",
    loads: false,
    render: (s, n) => `import { type T${n} } from "${s}";\nexport type U${n} = T${n};`,
  },
  {
    name: "two inline type imports",
    loads: false,
    render: (s, n) =>
      `import { type A${n}, type B${n} } from "${s}";\nexport type U${n} = [A${n}, B${n}];`,
  },
  { name: "type re-export", loads: false, render: (s, n) => `export type { T${n} } from "${s}";` },
  {
    name: "inline type re-export",
    loads: false,
    render: (s, n) => `export { type T${n} } from "${s}";`,
  },
  { name: "type star re-export", loads: false, render: (s) => `export type * from "${s}";` },
  {
    name: "type import equals require",
    loads: false,
    render: (s, n) => `import type e${n} = require("${s}");\nexport type U${n} = e${n};`,
  },
  {
    name: "import type in a type position",
    loads: false,
    render: (s, n) => `export type T${n} = import("${s}").A;`,
  },
  {
    name: "typeof import in a type position",
    loads: false,
    render: (s, n) => `export type T${n} = typeof import("${s}");`,
  },
  {
    name: "empty braces",
    loads: false,
    conservative: true,
    render: (s) => `import {} from "${s}";`,
  },
  {
    name: "named import that is never used",
    loads: false,
    conservative: true,
    render: (s, n) => `import { v${n} } from "${s}";`,
  },
];

const FORBIDDEN = [
  "zod",
  "zod/mini",
  "@/data-schema/profile",
  "../../data-schema/profile",
  "@/data-schema/records/program",
  "../../data-schema/snapshot.ts",
];
const ALLOWED = [
  "@/data-schema/dates",
  "../../data-schema/staleness",
  "react",
  "zodiac",
  "@/lib/constants",
  "./sibling",
  "node:path",
];
const SPECIFIERS = [...FORBIDDEN, ...ALLOWED];

const DECOYS = [
  "",
  '// import { z } from "zod";\n/* import "zod"; require("zod") */\n',
  "export const note = \"import { z } from 'zod'\";\nexport const tpl = `import(\"zod\") require('zod')`;\n",
  '"use client";\n',
  "'use server'\n",
];

const FILE_KEY = "lib/profile/example.ts";
const FILE = path.join(SRC, "lib", "profile", "example.ts");

// What the scanner should report for a file built from `parts`: the compiler's loads, plus the
// conservative forms the compiler erased.
function expectedLoads(source: string, parts: Array<{ form: Form; spec: string }>): string[] {
  const { loads, syntaxErrors } = compiled(source, FILE);
  expect(syntaxErrors, source).toBe(0);
  return [...loads, ...parts.filter(({ form }) => form.conservative).map(({ spec }) => spec)];
}

describe("the import scanner against the TypeScript compiler", () => {
  it("agrees with the compiler about every import form, for every kind of specifier", () => {
    const problems: string[] = [];
    for (const form of FORMS) {
      for (const spec of SPECIFIERS) {
        const source = form.render(spec, 1);
        const compilerLoads = compiled(source, FILE);
        // The table is itself checked against the compiler, so a form that no longer parses (and so
        // loads nothing in both) cannot make the comparison pass.
        if (compilerLoads.syntaxErrors > 0) problems.push(`${form.name} does not parse: ${source}`);
        if (compilerLoads.loads.length !== (form.loads ? 1 : 0))
          problems.push(`the compiler ${form.loads ? "dropped" : "kept"} ${form.name}: ${source}`);
        const expected = expectedLoads(source, [{ form, spec }]);
        if (JSON.stringify(sorted(scannerLoads(source))) !== JSON.stringify(sorted(expected))) {
          problems.push(
            `${form.name} from ${spec}: scanner ${preview(scannerLoads(source))}, expected ${preview(expected)}`,
          );
        }
        const forbidden = expected.filter((loaded) => referenceForbidden(FILE_KEY, loaded));
        if (
          JSON.stringify(sorted(violationsIn(FILE, source))) !== JSON.stringify(sorted(forbidden))
        ) {
          problems.push(
            `${form.name} from ${spec}: violations ${preview(violationsIn(FILE, source))}, expected ${preview(forbidden)}`,
          );
        }
      }
    }
    expect(problems).toEqual([]);
  }, 30_000);

  it("agrees with the compiler when decoys surround the imports and every form sits in one file", () => {
    const problems: string[] = [];
    for (const decoy of DECOYS) {
      for (const spec of SPECIFIERS) {
        const parts = FORMS.map((form) => ({ form, spec }));
        const source = decoy + parts.map(({ form }, n) => form.render(spec, n)).join("\n");
        const expected = expectedLoads(source, parts);
        if (JSON.stringify(sorted(scannerLoads(source))) !== JSON.stringify(sorted(expected))) {
          problems.push(
            `${preview(decoy)} with ${spec}: scanner ${scannerLoads(source).length} loads, expected ${expected.length}`,
          );
        }
        const forbidden = expected.filter((loaded) => referenceForbidden(FILE_KEY, loaded));
        if (
          JSON.stringify(sorted(violationsIn(FILE, source))) !== JSON.stringify(sorted(forbidden))
        ) {
          problems.push(`${preview(decoy)} with ${spec}: violations differ`);
        }
      }
    }
    expect(problems).toEqual([]);
  }, 30_000);

  it("agrees with the compiler on 600 random files that mix forms, specifiers and decoys", () => {
    const rng = seededRng(20261021);
    const problems: string[] = [];
    let flagged = 0;
    for (let index = 0; index < 600; index += 1) {
      const parts = Array.from({ length: 1 + Math.floor(rng() * 7) }, () => ({
        form: FORMS[Math.floor(rng() * FORMS.length)] as Form,
        spec: SPECIFIERS[Math.floor(rng() * SPECIFIERS.length)] as string,
      }));
      const decoy = DECOYS[Math.floor(rng() * DECOYS.length)] as string;
      const source = decoy + parts.map(({ form, spec }, n) => form.render(spec, n)).join("\n");
      const expected = expectedLoads(source, parts);
      const forbidden = expected.filter((loaded) => referenceForbidden(FILE_KEY, loaded));
      if (forbidden.length > 0) flagged += 1;
      if (
        JSON.stringify(sorted(violationsIn(FILE, source))) !== JSON.stringify(sorted(forbidden))
      ) {
        problems.push(
          `violations ${preview(violationsIn(FILE, source))}, expected ${preview(forbidden)} for:\n${source}`,
        );
      }
    }
    expect(problems).toEqual([]);
    expect(flagged).toBeGreaterThan(200);
  }, 30_000);

  it("agrees with the compiler on every source file under src/ and scripts/", () => {
    const roots = [SRC, path.join(SRC, "..", "scripts")];
    const files = roots
      .flatMap((root) => sourceFiles(root))
      .filter((file) => !file.endsWith(".d.ts"));
    const problems: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const scanner = new Set(scannerLoads(source));
      const compiler = new Set(compiled(source, file).loads);
      const onlyScanner = [...scanner].filter((specifier) => !compiler.has(specifier));
      const onlyCompiler = [...compiler].filter((specifier) => !scanner.has(specifier));
      if (onlyScanner.length > 0 || onlyCompiler.length > 0) {
        problems.push(
          `${path.relative(SRC, file)}: only the scanner ${preview(onlyScanner)}, only the compiler ${preview(onlyCompiler)}`,
        );
      }
    }
    expect(problems).toEqual([]);
    expect(files.length).toBeGreaterThan(300);
  }, 60_000);
});

// Random module graphs with cycles and every kind of edge. The reference walks the same graph with a
// depth-first search over what the compiler keeps, and knows each file's directive from how the file
// was built (not by reading it).
type Module = { key: string; directive: "client" | "server" | null; source: string };

const MODULE_KEYS = [
  "components/w0.tsx",
  "components/w1.tsx",
  "lib/saved/s0.ts",
  "lib/plan/p0.ts",
  "lib/m0.ts",
  "lib/m1.ts",
  "lib/m2.ts",
  "lib/sub/m3.ts",
  "lib/server/a0.ts",
  "lib/server/a1.ts",
  "app/x/c0.tsx",
];

const LOCAL_FORMS = FORMS.filter((form) => form.loads || !form.conservative);
const DECOY_LINES = [
  '// "use server"\n',
  'export const decoy = "use server";\n',
  '/* "use client" */\n',
  "",
];

function specifierTo(from: string, to: string, rng: () => number): string {
  const bare = to.replace(/\.tsx?$/, "");
  if (rng() < 0.5) return `@/${bare}`;
  const relative = path.posix.relative(path.posix.dirname(from), bare);
  return relative.startsWith(".") ? relative : `./${relative}`;
}

function randomGraph(rng: () => number): Module[] {
  const count = 3 + Math.floor(rng() * (MODULE_KEYS.length - 3));
  const keys = [...MODULE_KEYS].sort(() => rng() - 0.5).slice(0, count);
  return keys.map((key) => {
    const roll = rng();
    const directive = roll < 0.2 ? "server" : roll < 0.4 ? "client" : null;
    const prologue = directive === null ? "" : `"use ${directive}";\n`;
    const decoy = DECOY_LINES[Math.floor(rng() * DECOY_LINES.length)] as string;
    const statements = Array.from({ length: Math.floor(rng() * 5) }, (_, n) => {
      const form = LOCAL_FORMS[Math.floor(rng() * LOCAL_FORMS.length)] as Form;
      const target =
        rng() < 0.3
          ? (SPECIFIERS[Math.floor(rng() * SPECIFIERS.length)] as string)
          : specifierTo(key, keys[Math.floor(rng() * keys.length)] as string, rng);
      return form.render(target, n);
    });
    // A directive only counts in the prologue, so the decoy goes after it.
    return { key, directive, source: `${prologue}${decoy}${statements.join("\n")}\n` };
  });
}

// The scanner names the chain that led to an offender; the reference names the offender only.
function offenderOf(line: string): string {
  const arrow = line.lastIndexOf(" -> ");
  return arrow === -1 ? line : line.slice(arrow + 4);
}

function referenceOffenders(modules: readonly Module[], roots: readonly string[]): string[] {
  const byKey = new Map(modules.map((module) => [module.key, module]));
  const resolve = (from: string, specifier: string): string | null => {
    const base = specifier.startsWith("@/")
      ? specifier.slice(2)
      : specifier.startsWith(".")
        ? path.posix.join(path.posix.dirname(from), specifier)
        : null;
    if (base === null) return null;
    return (
      [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find((candidate) =>
        byKey.has(candidate),
      ) ?? null
    );
  };
  const seen = new Set<string>();
  const offenders: string[] = [];
  const visit = (key: string): void => {
    const module = byKey.get(key);
    if (module === undefined || seen.has(key)) return;
    seen.add(key);
    // The walk stops at a Server Action module: the build replaces an import of one with a reference.
    if (module.directive === "server") return;
    for (const specifier of compiled(module.source, path.join(SRC, ...key.split("/"))).loads) {
      if (referenceForbidden(key, specifier)) offenders.push(`src/${key} imports ${specifier}`);
      else {
        const target = resolve(key, specifier);
        if (target !== null) visit(target);
      }
    }
  };
  for (const root of roots) visit(root);
  return offenders.sort();
}

describe("the transitive walk against a depth-first reference", () => {
  it("reports the same offenders on 400 random module graphs", () => {
    const rng = seededRng(20261022);
    const problems: string[] = [];
    let withOffenders = 0;
    let stoppedAtServer = 0;
    for (let index = 0; index < 400; index += 1) {
      const modules = randomGraph(rng);
      const files = new Map(
        modules.map((module) => [path.join(SRC, ...module.key.split("/")), module.source]),
      );
      const read: Reader = (file) => files.get(file) ?? null;
      const roots = modules.filter(() => rng() < 0.4).map((module) => module.key);
      if (roots.length === 0) roots.push(modules[0]?.key ?? "");
      const scanner = reachableViolations(
        roots.map((key) => path.join(SRC, ...key.split("/"))),
        read,
      )
        .map(offenderOf)
        .sort();
      const expected = referenceOffenders(modules, roots);
      if (expected.length > 0) withOffenders += 1;
      if (modules.some((module) => module.directive === "server")) stoppedAtServer += 1;
      if (JSON.stringify(scanner) !== JSON.stringify(expected)) {
        problems.push(
          `scanner ${preview(scanner)}, expected ${preview(expected)} for roots ${roots.join(", ")}:\n${modules.map((m) => `--- ${m.key}\n${m.source}`).join("\n")}`,
        );
      }
    }
    expect(problems).toEqual([]);
    expect(withOffenders).toBeGreaterThan(100);
    expect(stoppedAtServer).toBeGreaterThan(100);
  }, 30_000);
});
