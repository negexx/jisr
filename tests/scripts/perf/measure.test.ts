import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import {
  discoverRoutes,
  formatReport,
  initialScriptPaths,
  measureRoute,
} from "@scripts/perf/measure";
import { afterEach, describe, expect, it } from "vitest";

const HTML = [
  "<!DOCTYPE html><html><head>",
  '<script src="/_next/static/chunks/a.js" async=""></script>',
  '<script src="/_next/static/chunks/b.js?dpl=abc" async></script>',
  '<script src="/_next/static/chunks/legacy.js" noModule=""></script>',
  '<script src="/_next/static/chunks/legacy2.js" nomodule></script>',
  '<script src="https://cdn.example/x.js" async=""></script>',
  '<script id="_R_" src="/_next/static/chunks/boot.js" async=""></script>',
  "<script>self.__next_f=[]</script>",
  '<script src="/_next/static/chunks/a.js" async=""></script>',
  '</head><body>text mentioning <script src="/x.js"> is not markup</body></html>',
].join("\n");

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fakeBuild(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "jisr-perf-"));
  dirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(dir, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  return dir;
}

describe("initialScriptPaths", () => {
  it("keeps same-origin scripts once, drops noModule, inline and external scripts, strips queries", () => {
    expect(initialScriptPaths(HTML.slice(0, HTML.indexOf("</head>")))).toEqual([
      "/_next/static/chunks/a.js",
      "/_next/static/chunks/b.js",
      "/_next/static/chunks/boot.js",
    ]);
  });
});

describe("measureRoute", () => {
  it("sums the gzip size of each initial script and reports what it excluded", () => {
    const a = "console.log('a');".repeat(200);
    const b = "console.log('b');".repeat(300);
    const legacy = "console.log('legacy');".repeat(400);
    const dir = fakeBuild({
      "server/app/fr.html":
        '<script src="/_next/static/chunks/a.js" async=""></script>' +
        '<script src="/_next/static/chunks/b.js" async=""></script>' +
        '<script src="/_next/static/chunks/legacy.js" noModule=""></script>',
      "static/chunks/a.js": a,
      "static/chunks/b.js": b,
      "static/chunks/legacy.js": legacy,
    });
    const size = measureRoute(dir, "/fr");
    const expected = gzipSync(a, { level: 6 }).length + gzipSync(b, { level: 6 }).length;
    expect(size.totalGzipBytes).toBe(expected);
    expect(size.scripts.map((script) => script.src)).toEqual([
      "/_next/static/chunks/a.js",
      "/_next/static/chunks/b.js",
    ]);
    expect(size.noModuleGzipBytes).toBe(gzipSync(legacy, { level: 6 }).length);
  });

  it("finds nested routes and fails clearly on a missing page or chunk", () => {
    const dir = fakeBuild({
      "server/app/fr/profile.html": '<script src="/_next/static/chunks/a.js"></script>',
      "static/chunks/a.js": "x",
    });
    expect(measureRoute(dir, "/fr/profile").scripts).toHaveLength(1);
    expect(() => measureRoute(dir, "/fr")).toThrow(/fr/);
    const broken = fakeBuild({
      "server/app/fr.html": '<script src="/_next/static/chunks/gone.js"></script>',
    });
    expect(() => measureRoute(broken, "/fr")).toThrow(/gone\.js/);
  });

  it("does not follow a script path out of the static directory", () => {
    const dir = fakeBuild({
      "server/app/fr.html": '<script src="/_next/static/../../secret.js"></script>',
      "secret.js": "x",
    });
    expect(() => measureRoute(dir, "/fr")).toThrow();
  });
});

describe("discoverRoutes", () => {
  it("lists prerendered pages, skipping Next internals", () => {
    const dir = fakeBuild({
      "server/app/fr.html": "",
      "server/app/ar.html": "",
      "server/app/fr/profile.html": "",
      "server/app/_not-found.html": "",
      "server/app/_global-error.html": "",
      "server/app/fr.rsc": "",
    });
    expect(discoverRoutes(dir)).toEqual(["/ar", "/fr", "/fr/profile"]);
  });
});

describe("formatReport", () => {
  it("prints one line per route in KB and the script count", () => {
    const report = formatReport([
      {
        route: "/fr",
        scripts: [{ src: "/a.js", gzipBytes: 1024 }],
        totalGzipBytes: 153_600,
        noModuleGzipBytes: 2048,
      },
    ]);
    expect(report).toContain("/fr");
    expect(report).toContain("150.0 KB");
    expect(report).toContain("1 script");
  });
});
