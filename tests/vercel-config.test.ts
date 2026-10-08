import { readFileSync } from "node:fs";
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
});
