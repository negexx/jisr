import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import { authCallbackUrls } from "@/lib/auth/callback-urls";
import { LOCALES } from "@/lib/constants";

// Every redirect-based sign-in must finish on /<locale>/welcome?return=…, the one place that sets the
// session hint (a bare /fr/plan target would leave it unset and the device would stay a guest).
// The URLs come from one builder; this test finds every sign-in call in src/ and checks it uses it.

const SRC = join(process.cwd(), "src");
const BUILDER = join(SRC, "lib", "auth", "callback-urls.ts");

// Calls that start a sign-in whose result is a redirect back to this site.
const SIGN_IN_CALL = /\b(?:signIn\s*\.\s*(?:social|magicLink|oauth2|email)|signInMagicLink)\s*\(/g;
// An object key, not the parameter name email.ts reads back out of a link.
const CALLBACK_KEY = /\b(?:callbackURL|newUserCallbackURL|errorCallbackURL)\s*:/;
const LANDING_TARGET = /^\/(fr|en|ar)\/welcome\?return=%2F(?:fr|en|ar)(?:%2F[A-Za-z0-9._~%-]+)*$/;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

function argumentsOf(source: string, openParen: number): string {
  let depth = 0;
  for (let index = openParen; index < source.length; index += 1) {
    if (source[index] === "(") depth += 1;
    if (source[index] === ")") {
      depth -= 1;
      if (depth === 0) return source.slice(openParen + 1, index);
    }
  }
  throw new Error("unbalanced parentheses");
}

type CallSite = { file: string; args: string };

function signInCallSites(): CallSite[] {
  return sourceFiles(SRC)
    .filter((file) => file !== BUILDER)
    .flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return [...source.matchAll(SIGN_IN_CALL)].map((match) => ({
        file: relative(process.cwd(), file).replaceAll("\\", "/"),
        args: argumentsOf(source, (match.index ?? 0) + match[0].length - 1),
      }));
    });
}

describe("the landing predicate", () => {
  it.each(LOCALES)("accepts what the builder produces for %s", (locale) => {
    const urls = authCallbackUrls(locale, `/${locale}/plan`);
    for (const url of Object.values(urls)) expect(url).toMatch(LANDING_TARGET);
    expect(Object.keys(urls).sort()).toEqual([
      "callbackURL",
      "errorCallbackURL",
      "newUserCallbackURL",
    ]);
  });

  it.each([
    "/fr/plan",
    "/ar",
    "/fr/welcome",
    "/fr/sign-in?return=%2Ffr",
    "https://x.example/fr/welcome?return=%2Ffr",
  ])("rejects a bare target %s", (target) => {
    expect(target).not.toMatch(LANDING_TARGET);
  });
});

describe("sign-in call sites", () => {
  const sites = signInCallSites();

  it("finds the Google button and the magic-link action, and no other sign-in call", () => {
    expect(sites.map((site) => site.file).sort()).toEqual([
      "src/components/auth/sign-in-form.tsx",
      "src/lib/server/signup.ts",
    ]);
  });

  it.each(sites)("$file takes all three callback URLs from authCallbackUrls", ({ args }) => {
    expect(args).toMatch(/\.\.\.authCallbackUrls\(/);
    expect(args).not.toMatch(CALLBACK_KEY);
  });

  it("has no hand-written callback URL anywhere else in src", () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => file !== BUILDER)
      .filter((file) => CALLBACK_KEY.test(readFileSync(file, "utf8").replace(/\/\/.*$/gm, "")))
      .map((file) => relative(process.cwd(), file).replaceAll("\\", "/"));
    expect(offenders).toEqual([]);
  });

  it("imports the builder in every file that calls sign-in", () => {
    for (const { file } of sites) {
      expect(readFileSync(join(process.cwd(), file), "utf8")).toMatch(
        /import \{[^}]*\bauthCallbackUrls\b[^}]*\} from "@\/lib\/auth\/callback-urls"/,
      );
    }
  });
});
