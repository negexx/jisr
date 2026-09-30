import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { ROOT } from "./fixture";

const SRC = path.join(ROOT, "src");
const SERVER_MODULE = path.join(SRC, "lib", "snapshot", "server");

const SOURCE_EXTENSION = /\.(?:[cm]?js|jsx|tsx?)$/;

function isScannedSource(name: string): boolean {
  return SOURCE_EXTENSION.test(name);
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return isScannedSource(entry.name) ? [full] : [];
  });
}

function withoutExtension(file: string): string {
  return file.replace(SOURCE_EXTENSION, "");
}

function startsWithServerOnly(source: string): boolean {
  const firstStatement = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line !== "" && !line.startsWith("//"));
  return firstStatement === 'import "server-only";';
}

// Static `from`, side-effect `import`, dynamic `import()` and `require()`, with any quote style.
const SPECIFIER = /(?:from\s+|import\s*\(\s*|import\s+|require\s*\(\s*)(["'`])([^"'`]+)\1/g;

// True when `source` (living at `file`) imports src/lib/snapshot/server by alias or relative path.
function importsSnapshotServer(file: string, source: string): boolean {
  for (const match of source.matchAll(SPECIFIER)) {
    const specifier = match[2] ?? "";
    const resolved = specifier.startsWith("@/")
      ? path.join(SRC, specifier.slice(2))
      : specifier.startsWith(".")
        ? path.resolve(path.dirname(file), specifier)
        : null;
    if (resolved !== null && withoutExtension(resolved) === SERVER_MODULE) return true;
  }
  return false;
}

describe("server snapshot reader isolation", () => {
  it("detects alias, relative and dynamic imports of the server reader", () => {
    const client = path.join(SRC, "app", "[locale]", "x", "client.tsx");
    expect(importsSnapshotServer(client, 'import { a } from "@/lib/snapshot/server";')).toBe(true);
    expect(importsSnapshotServer(client, 'await import("@/lib/snapshot/server")')).toBe(true);
    const sibling = path.join(SRC, "lib", "snapshot", "use-snapshot.ts");
    expect(importsSnapshotServer(sibling, 'import { a } from "./server";')).toBe(true);
    expect(importsSnapshotServer(sibling, 'import { a } from "./client";')).toBe(false);
    expect(importsSnapshotServer(client, 'import { a } from "@/lib/snapshot/client";')).toBe(false);
  });

  it.each([
    ["template-literal dynamic import", "await import(`@/lib/snapshot/server`)"],
    ["require", 'const s = require("@/lib/snapshot/server");'],
    ["template-literal require", "const s = require(`../../lib/snapshot/server`);"],
    ["explicit .js extension", 'import { a } from "@/lib/snapshot/server.js";'],
    ["side-effect import", "import '@/lib/snapshot/server';"],
  ])("detects a %s", (_label, source) => {
    const client = path.join(SRC, "app", "[locale]", "client.tsx");
    expect(importsSnapshotServer(client, source)).toBe(true);
  });

  it.each([
    "client.ts",
    "client.tsx",
    "client.js",
    "client.jsx",
    "client.mjs",
    "client.cjs",
  ])("scans %s importers", (name) => {
    expect(isScannedSource(name)).toBe(true);
  });

  it("does not scan non-source files", () => {
    expect(isScannedSource("messages.json")).toBe(false);
    expect(isScannedSource("styles.css")).toBe(false);
  });

  it("is imported only by files that are themselves server-only", () => {
    const offenders = sourceFiles(SRC).filter((file) => {
      if (withoutExtension(path.resolve(file)) === SERVER_MODULE) return false;
      const source = readFileSync(file, "utf8");
      return importsSnapshotServer(file, source) && !startsWithServerOnly(source);
    });
    expect(
      offenders.map((file) => path.relative(ROOT, file)),
      'files importing @/lib/snapshot/server must start with import "server-only";',
    ).toEqual([]);
  });

  it("server.ts itself starts with the server-only marker", () => {
    expect(startsWithServerOnly(readFileSync(`${SERVER_MODULE}.ts`, "utf8"))).toBe(true);
  });
});
