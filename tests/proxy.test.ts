import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Next reads `config.matcher` statically, so it must stay an inline literal in src/proxy.ts. Importing
// that file here would pull in next-intl/middleware, so the literal is extracted from the source instead.
function readProxyMatcher(): string {
  const source = readFileSync(fileURLToPath(new URL("../src/proxy.ts", import.meta.url)), "utf8");
  const literal = /matcher:\s*\[\s*("(?:[^"\\]|\\.)*")\s*\]/.exec(source)?.[1];
  if (literal === undefined) throw new Error("matcher literal not found in src/proxy.ts");
  const parsed: unknown = JSON.parse(literal);
  if (typeof parsed !== "string") throw new Error("matcher literal is not a string");
  return parsed;
}

const matcher = new RegExp(`^${readProxyMatcher()}$`);

describe("proxy matcher", () => {
  it.each([
    "/",
    "/fr",
    "/ar",
    "/en/x",
    "/programs",
    "/fr/programs",
  ])("runs the proxy on %s", (path) => {
    expect(matcher.test(path)).toBe(true);
  });

  it.each([
    "/api/x",
    "/_next/static/a.js",
    "/_vercel/x",
    "/snapshots/manifest.json",
    "/favicon.ico",
    "/robots.txt",
  ])("skips the proxy on %s", (path) => {
    expect(matcher.test(path)).toBe(false);
  });
});
