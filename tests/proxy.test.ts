import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { routing } from "@/i18n/routing";

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

const matcherSource = readProxyMatcher();
const matcher = new RegExp(`^${matcherSource}$`);

describe("proxy matcher", () => {
  it.each([
    "/",
    "/programs",
    "/profile",
    "/france",
    "/arabic",
    "/enx/y",
  ])("runs the proxy on %s", (path) => {
    expect(matcher.test(path)).toBe(true);
  });

  it.each([
    "/api/x",
    "/api/auth",
    "/api/auth/callback/google",
    "/_next/static/a.js",
    "/_vercel/x",
    "/snapshots/manifest.json",
    "/favicon.ico",
    "/robots.txt",
    "/fr",
    "/en",
    "/ar",
    "/fr/matches",
    "/ar/programs/some-slug",
    "/en/scholarships",
  ])("skips the proxy on %s", (path) => {
    expect(matcher.test(path)).toBe(false);
  });

  it("lists exactly the routing locales in its skip alternation", () => {
    const alternation = /\(\?:([a-z|]+)\)\(\?:\/\|\$\)/.exec(matcherSource)?.[1];
    expect(alternation?.split("|")).toEqual([...routing.locales]);
  });
});
