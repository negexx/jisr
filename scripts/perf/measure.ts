import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

// Measures what a modern browser downloads as JavaScript on first load of a prerendered page:
// every same-origin `<script src>` in the built HTML except the `noModule` polyfill chunk, gzipped
// at level 6 (what a CDN typically serves). Next 16 no longer prints First Load JS itself.
// Only `<script src>` tags are counted, the same method T1 and T8 used: `<link rel="preload">`
// hints and chunks fetched after hydration (lazy imports, RSC payloads) are not, so a lazily loaded
// chunk does not show up here. findZodMarkers is the backstop for that blind spot.
const STATIC_PREFIX = "/_next/";

export type ScriptSize = { src: string; gzipBytes: number };
export type RouteSize = {
  route: string;
  scripts: ScriptSize[];
  totalGzipBytes: number;
  noModuleGzipBytes: number;
};

function scriptTags(html: string): Array<{ src: string; noModule: boolean }> {
  const tags: Array<{ src: string; noModule: boolean }> = [];
  for (const match of html.matchAll(/<script\b([^>]*)>/gi)) {
    const attributes = match[1] ?? "";
    const src = /\bsrc\s*=\s*"([^"]*)"/i.exec(attributes)?.[1];
    if (src === undefined || !src.startsWith("/") || src.startsWith("//")) continue;
    tags.push({ src: src.split("?")[0] ?? src, noModule: /\bnomodule\b/i.test(attributes) });
  }
  return tags;
}

function uniquePaths(tags: ReadonlyArray<{ src: string }>): string[] {
  return [...new Set(tags.map((tag) => tag.src))];
}

export function initialScriptPaths(html: string): string[] {
  return uniquePaths(scriptTags(html).filter((tag) => !tag.noModule));
}

export function noModuleScriptPaths(html: string): string[] {
  return uniquePaths(scriptTags(html).filter((tag) => tag.noModule));
}

function gzipSize(file: string): number {
  return gzipSync(readFileSync(file), { level: 6 }).length;
}

function chunkFile(buildDir: string, src: string): string {
  if (!src.startsWith(STATIC_PREFIX)) throw new Error(`unexpected script location ${src}`);
  const root = path.resolve(buildDir);
  const file = path.resolve(root, src.slice(STATIC_PREFIX.length));
  if (!file.startsWith(`${root}${path.sep}static${path.sep}`)) {
    throw new Error(`script path leaves the static directory: ${src}`);
  }
  if (!existsSync(file)) throw new Error(`script not found in the build output: ${src}`);
  return file;
}

export function measureRoute(buildDir: string, route: string): RouteSize {
  const page = path.join(buildDir, "server", "app", `${route.replace(/^\//, "")}.html`);
  if (!existsSync(page)) throw new Error(`no prerendered page for ${route} (${page})`);
  const html = readFileSync(page, "utf8");
  const legacy = noModuleScriptPaths(html);
  const scripts = initialScriptPaths(html).map((src) => ({
    src,
    gzipBytes: gzipSize(chunkFile(buildDir, src)),
  }));
  return {
    route,
    scripts,
    totalGzipBytes: scripts.reduce((sum, script) => sum + script.gzipBytes, 0),
    noModuleGzipBytes: legacy.reduce((sum, src) => sum + gzipSize(chunkFile(buildDir, src)), 0),
  };
}

function htmlFiles(dir: string, prefix: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith("_")) return [];
    if (entry.isDirectory())
      return htmlFiles(path.join(dir, entry.name), `${prefix}/${entry.name}`);
    return entry.name.endsWith(".html")
      ? [`${prefix}/${entry.name.slice(0, -".html".length)}`]
      : [];
  });
}

export function discoverRoutes(buildDir: string): string[] {
  const appDir = path.join(buildDir, "server", "app");
  if (!existsSync(appDir)) throw new Error(`no build output at ${appDir}: run pnpm build first`);
  return htmlFiles(appDir, "").sort();
}

function kilobytes(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function formatReport(sizes: readonly RouteSize[]): string {
  const width = Math.max(5, ...sizes.map((size) => size.route.length));
  const lines = sizes.map((size) => {
    const count = `${size.scripts.length} script${size.scripts.length === 1 ? "" : "s"}`;
    const legacy =
      size.noModuleGzipBytes > 0 ? `, +${kilobytes(size.noModuleGzipBytes)} noModule` : "";
    return `${size.route.padEnd(width)}  ${kilobytes(size.totalGzipBytes).padStart(10)}  (${count}${legacy})`;
  });
  return ["initial JS, gzip level 6, noModule excluded", ...lines].join("\n");
}

// Zod costs about 120 KB gzipped and must never reach the browser (see tests/lib/client-imports
// .test.ts). Lazy chunks are invisible to measureRoute, so scan every client chunk for the library's
// class names instead of trusting the import guard alone.
const ZOD_MARKERS = ["ZodError", "_zod"] as const;

function chunkFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return chunkFiles(full);
    return entry.name.endsWith(".js") ? [full] : [];
  });
}

export function findZodMarkers(buildDir: string): string[] {
  const staticDir = path.join(buildDir, "static");
  if (!existsSync(staticDir)) return [];
  return chunkFiles(staticDir)
    .filter((file) => {
      const source = readFileSync(file, "utf8");
      return ZOD_MARKERS.some((marker) => source.includes(marker));
    })
    .map((file) => path.relative(buildDir, file).split(path.sep).join("/"))
    .sort();
}
