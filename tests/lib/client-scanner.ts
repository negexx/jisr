import { readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

import { ROOT } from "./snapshot/fixture";

// Importing `zod` costs about 120 KB gzipped in any client chunk (ADR 0004 budget: 150 KB for the
// whole initial load), so client-reachable code validates by hand and Zod stays on the server, in
// scripts and in tests. `@/data-schema/*` builds Zod schemas at module load, so only type imports
// (erased at build time) and the modules listed here may cross into client code.
//
// Server Action modules (first statement `"use server"`) live in src/lib/server/ and may import Zod:
// Next replaces an import of one from client code with a reference to its endpoint, so the scanner
// neither treats them as client roots nor walks into them. `import "server-only"` is a different
// mechanism (it makes the build fail if client code reaches the module) and is not modelled here.
export const ZOD_FREE_DATA_SCHEMA = ["@/data-schema/dates", "@/data-schema/staleness"] as const;

export const SRC = path.join(ROOT, "src");
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
  path.join("lib", "analytics.ts"),
  path.join("lib", "auth", "consent.ts"),
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

// A directive is a string-literal statement in the prologue, before any other statement (comments
// are not statements). `"use server"` inside a function body is an inline Server Action: it makes
// that function a Server Function, not its module a server module.
function hasDirective(source: string, directive: string): boolean {
  for (const statement of parseSource(source).statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) {
      return false;
    }
    if (statement.expression.text === directive) return true;
  }
  return false;
}

export function hasUseClient(source: string): boolean {
  return hasDirective(source, "use client");
}

export function hasUseServer(source: string): boolean {
  return hasDirective(source, "use server");
}

export function isClientReachable(relativeToSrc: string, source: string): boolean {
  // First, before every directory and file list: a module marked "use server" is a Server Action
  // module wherever it sits (convention: src/lib/server/).
  if (hasUseServer(source)) return false;
  if (SERVER_ONLY_FILES.includes(relativeToSrc)) return false;
  if (hasUseClient(source)) return true;
  if (CLIENT_FILES.includes(relativeToSrc)) return true;
  return CLIENT_DIRECTORIES.some((dir) => relativeToSrc.startsWith(`${dir}${path.sep}`));
}

export type Reader = (file: string) => string | null;

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
// The walk stops at a "use server" module: Next compiles an import of one from client code into a
// reference to the server endpoint, so what that module imports never reaches the browser.
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
    if (file === undefined || source === null || hasUseServer(source)) continue;
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

export function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    // boundary.test.ts writes transient `__canary__` files into src/; a parallel worker can list one
    // and then find it deleted, so the synthetic canaries are never scanned (as boundary.test does).
    if (entry.name.startsWith("__canary__")) return [];
    return SOURCE_EXTENSION.test(entry.name) ? [full] : [];
  });
}
