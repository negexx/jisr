import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// The signup Server Action marks a signup with AsyncLocalStorage (src/lib/auth/signup-intent.ts,
// node:async_hooks), and the auth hooks read that mark on the same request. Both only work on the
// Node.js runtime: an edge segment would make every signup a plain sign-in, with no pending row.
const EDGE = /\bruntime\s*[:=]\s*["'](?:experimental-)?edge["']/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|js|mjs)$/.test(name) ? [path] : [];
  });
}

describe("the signup action stays on the Node.js runtime", () => {
  it("the edge check recognises an edge segment declaration", () => {
    expect(EDGE.test('export const runtime = "edge";')).toBe(true);
    expect(EDGE.test("export const config = { runtime: 'experimental-edge' };")).toBe(true);
    expect(EDGE.test('export const runtime = "nodejs";')).toBe(false);
  });

  it("no route segment, page or layout under src/app declares the edge runtime", () => {
    const offenders = sourceFiles("src/app").filter((file) =>
      EDGE.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it.each([
    "src/lib/server/signup.ts",
    "src/lib/auth/signup-intent.ts",
    "src/lib/auth/server.ts",
    "next.config.ts",
  ])("%s declares no edge runtime", (file) => {
    expect(readFileSync(file, "utf8")).not.toMatch(EDGE);
  });

  it("the signup intent is built on node:async_hooks, and the action names that dependency", () => {
    expect(readFileSync("src/lib/auth/signup-intent.ts", "utf8")).toContain(
      'from "node:async_hooks"',
    );
    expect(readFileSync("src/lib/server/signup.ts", "utf8")).toMatch(/Node\.js runtime/);
  });
});
