import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = path.join(import.meta.dirname, "..", "..", "..");
const SRC = path.join(ROOT, "src");
const VIEW = path.join(SRC, "lib", "journey", "compare-view.ts");
const CLIENT = path.join(SRC, "components", "compare", "compare-client.tsx");

// The comparison view model carries the matching, cost, scholarship and reason code. The island loads
// it with a dynamic import(); a single static value import anywhere on the island's static graph would
// pull it into the /compare initial chunk and defer nothing.

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const full = path.join(directory, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

// Static import/export declarations that survive compilation (type-only ones are erased).
function staticValueImports(source: string): string[] {
  const file = ts.createSourceFile(
    "m.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const found: string[] = [];
  for (const node of file.statements) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const bindings = clause?.namedBindings;
      const erased =
        clause !== undefined &&
        (clause.isTypeOnly ||
          (clause.name === undefined &&
            bindings !== undefined &&
            ts.isNamedImports(bindings) &&
            bindings.elements.length > 0 &&
            bindings.elements.every((element) => element.isTypeOnly)));
      if (!erased) found.push(node.moduleSpecifier.text);
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const clause = node.exportClause;
      const erased =
        node.isTypeOnly ||
        (clause !== undefined &&
          ts.isNamedExports(clause) &&
          clause.elements.length > 0 &&
          clause.elements.every((element) => element.isTypeOnly));
      if (!erased) found.push(node.moduleSpecifier.text);
    }
  }
  return found;
}

function resolveLocal(from: string, specifier: string): string | null {
  const base = specifier.startsWith("@/")
    ? path.join(SRC, specifier.slice(2))
    : specifier.startsWith(".")
      ? path.resolve(path.dirname(from), specifier)
      : null;
  if (base === null) return null;
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ];
  return (
    candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) ?? null
  );
}

function isCompareView(file: string | null): boolean {
  return file !== null && path.resolve(file) === VIEW;
}

describe("the compare view model stays behind the dynamic import", () => {
  it("is imported statically by no component or page, except as a type", () => {
    const offenders = [
      ...sourceFiles(path.join(SRC, "components")),
      ...sourceFiles(path.join(SRC, "app")),
    ]
      .filter((file) =>
        staticValueImports(readFileSync(file, "utf8")).some((specifier) =>
          isCompareView(resolveLocal(file, specifier)),
        ),
      )
      .map((file) => path.relative(ROOT, file).split(path.sep).join("/"));
    expect(offenders).toEqual([]);
  });

  it("is not reachable from the island through static value imports", () => {
    const seen = new Set<string>([CLIENT]);
    const queue = [CLIENT];
    let reached = false;
    while (queue.length > 0) {
      const file = queue.shift();
      if (file === undefined) continue;
      for (const specifier of staticValueImports(readFileSync(file, "utf8"))) {
        const target = resolveLocal(file, specifier);
        if (target === null || seen.has(target)) continue;
        if (isCompareView(target)) reached = true;
        seen.add(target);
        queue.push(target);
      }
    }
    expect(reached).toBe(false);
    // Sanity: the walk really followed the island's own files.
    expect([...seen].some((file) => file.endsWith("compare-grid.tsx"))).toBe(true);
  });

  it("is still loaded by a dynamic import in the island", () => {
    expect(readFileSync(CLIENT, "utf8")).toMatch(/import\("@\/lib\/journey\/compare-view"\)/);
  });

  it("keeps COMPARE_ROWS available from compare-view (the T2 interface is unchanged)", async () => {
    const view = await import("@/lib/journey/compare-view");
    const rows = await import("@/lib/journey/compare-rows");
    expect(view.COMPARE_ROWS).toBe(rows.COMPARE_ROWS);
  });
});
