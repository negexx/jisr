import { readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function readRepoFile(relative: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), "utf8");
}

const vercelConfig: unknown = JSON.parse(readRepoFile("vercel.json"));
const packageJson: unknown = JSON.parse(readRepoFile("package.json"));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function configRecord(): Record<string, unknown> {
  if (!isRecord(vercelConfig)) throw new Error("vercel.json is not an object");
  return vercelConfig;
}

describe("vercel.json", () => {
  it("pins the Frankfurt region", () => {
    expect(configRecord().regions).toEqual(["fra1"]);
  });

  it("builds with pnpm build and installs from the lockfile", () => {
    expect(configRecord().buildCommand).toBe("pnpm build");
    expect(configRecord().installCommand).toBe("pnpm install --frozen-lockfile");
    expect(configRecord().framework).toBe("nextjs");
  });

  it("leaves production deploys to CI and keeps preview deployments on", () => {
    const git = configRecord().git;
    if (!isRecord(git)) throw new Error("vercel.json has no git block");
    expect(isRecord(git.deploymentEnabled) ? git.deploymentEnabled.main : undefined).toBe(false);
    expect(git.deploymentEnabled).not.toBe(false);
    expect(configRecord()).not.toHaveProperty("deploymentEnabled");
  });

  it("keeps headers and rewrites in next.config.ts only", () => {
    expect(configRecord()).not.toHaveProperty("headers");
    expect(configRecord()).not.toHaveProperty("rewrites");
    expect(configRecord()).not.toHaveProperty("redirects");
  });
});

describe("package.json engines", () => {
  it("requires Node 24 or later, which Vercel reads for the runtime", () => {
    const engines = isRecord(packageJson) ? packageJson.engines : undefined;
    expect(isRecord(engines) ? engines.node : undefined).toBe(">=24");
  });
});

describe(".vercelignore", () => {
  const entries = readRepoFile(".vercelignore")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));

  it("excludes the heavy directories a build never reads", () => {
    for (const path of [
      "data-staging/",
      "docs/",
      "tests/",
      ".claude/",
      "node_modules/",
      ".next/",
    ]) {
      expect(entries).toContain(path);
    }
  });

  it("does not exclude anything the build needs", () => {
    const needed = [
      "data",
      "public",
      "scripts",
      "src",
      "messages",
      "content",
      "package.json",
      "pnpm-lock.yaml",
    ];
    for (const entry of entries) {
      const name = entry.replace(/^\//, "").replace(/\/$/, "");
      expect(needed).not.toContain(name);
    }
  });

  it("keeps the ignored directories out of Next's output-file tracing", () => {
    // Next's tracer pulls test-only fixtures into the route handlers' functions even though nothing
    // imports them; `.vercelignore` then refuses to upload them and the prebuilt deploy fails
    // (`ENOENT: readlink`). next.config.ts excludes tests/ from the traces.
    const nextConfig = readRepoFile("next.config.ts");
    expect(nextConfig).toMatch(/outputFileTracingExcludes\s*:/);
    expect(nextConfig).toContain('"tests/**"');
  });
});

describe("build-included code and .vercelignore", () => {
  const repoRoot = fileURLToPath(new URL("../", import.meta.url));
  const ignoredFolders = readRepoFile(".vercelignore")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.endsWith("/") && !line.startsWith("#"))
    .map((line) => line.replace(/^\//, "").replace(/\/$/, ""));
  const aliases: Record<string, string> = {
    "@/": "src/",
    "@scripts/": "scripts/",
    "@content/": "content/",
  };
  const importPattern = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["']([^"']+)["']/g;

  function isInsideIgnoredFolder(repoRelativePath: string): boolean {
    return ignoredFolders.some(
      (folder) => repoRelativePath === folder || repoRelativePath.startsWith(`${folder}/`),
    );
  }

  // Declaration files are skipped: next-env.d.ts points at .next/, which the build itself generates.
  function typeScriptFilesOutsideIgnoredFolders(directory = ""): string[] {
    const found: string[] = [];
    for (const entry of readdirSync(join(repoRoot, directory), { withFileTypes: true })) {
      const relative = directory === "" ? entry.name : `${directory}/${entry.name}`;
      if (entry.name.startsWith(".") || isInsideIgnoredFolder(relative)) continue;
      if (entry.isDirectory()) {
        if (relative !== "public/snapshots")
          found.push(...typeScriptFilesOutsideIgnoredFolders(relative));
      } else if (/\.(?:ts|tsx|mts)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
        found.push(relative);
      }
    }
    return found;
  }

  function resolveImport(importer: string, specifier: string): string | null {
    for (const [prefix, target] of Object.entries(aliases)) {
      if (specifier.startsWith(prefix)) return `${target}${specifier.slice(prefix.length)}`;
    }
    if (!specifier.startsWith(".")) return null;
    return posix.normalize(posix.join(posix.dirname(importer), specifier));
  }

  it("type-checks every TypeScript file, so the include set covers the whole repository", () => {
    const tsconfig: unknown = JSON.parse(readRepoFile("tsconfig.json"));
    const include = isRecord(tsconfig) ? tsconfig.include : undefined;
    expect(include).toContain("**/*.ts");
    expect(include).toContain("**/*.tsx");
  });

  it("finds ignored folders to guard", () => {
    expect(ignoredFolders).toContain("tests");
  });

  it("never imports a file that Vercel ignores", () => {
    const offenders: string[] = [];
    for (const file of typeScriptFilesOutsideIgnoredFolders()) {
      const source = readFileSync(join(repoRoot, file), "utf8");
      for (const match of source.matchAll(importPattern)) {
        const resolved = resolveImport(file, match[1] ?? "");
        if (resolved !== null && isInsideIgnoredFolder(resolved)) {
          offenders.push(`${file} imports ${match[1]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
