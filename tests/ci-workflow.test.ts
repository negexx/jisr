import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Text-level on purpose: no YAML dependency. The file is regular enough (2-space indentation, one
// job per top-level key under `jobs:`) to slice by job.
const workflow = readFileSync(
  fileURLToPath(new URL("../.github/workflows/ci.yml", import.meta.url)),
  "utf8",
);

function jobBlock(name: string): string {
  const lines = workflow.split(/\r?\n/);
  const start = lines.indexOf(`  ${name}:`);
  if (start === -1) throw new Error(`job ${name} not found`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^ {2}[A-Za-z0-9_-]+:/.test(line));
  const body = end === -1 ? rest : rest.slice(0, end);
  // Comments written above the next job belong to that job.
  while (body.length > 0 && /^\s*(#.*)?$/.test(body[body.length - 1] ?? "")) body.pop();
  return [lines[start], ...body].join("\n");
}

function stepNames(block: string): string[] {
  return [...block.matchAll(/^ {6}- name: (.+)$/gm)].map((match) => match[1] ?? "");
}

function codeLines(text: string): string[] {
  return text.split(/\r?\n/).filter((line) => !line.trim().startsWith("#"));
}

describe("deploy job gating", () => {
  const deploy = jobBlock("deploy");

  it("needs both verify and e2e", () => {
    const needs = /^ {4}needs:\s*\[([^\]]*)\]\s*$/m.exec(deploy)?.[1];
    expect(needs).toBeDefined();
    const names = (needs ?? "").split(",").map((name) => name.trim());
    expect(names).toEqual(expect.arrayContaining(["verify", "e2e"]));
  });

  it("runs only for a push to main", () => {
    const condition = /^ {4}if:\s*(.+)$/m.exec(deploy)?.[1] ?? "";
    expect(condition).toContain("github.event_name == 'push'");
    expect(condition).toContain("github.ref == 'refs/heads/main'");
    expect(condition).not.toContain("||");
    expect(condition).not.toMatch(/always\(\)|failure\(\)|cancelled\(\)/);
  });

  it("serialises production deploys and never cancels one in progress", () => {
    expect(deploy).toMatch(/group: deploy-production/);
    expect(deploy).toMatch(/cancel-in-progress: false/);
  });

  it("is the only job that deploys", () => {
    expect(jobBlock("verify")).not.toMatch(/vercel/i);
    expect(jobBlock("e2e")).not.toMatch(/vercel/i);
  });
});

describe("workflow safety", () => {
  it("never uses pull_request_target", () => {
    expect(workflow).not.toContain("pull_request_target");
  });

  it("keeps the triggers and the read-only default permissions", () => {
    expect(workflow).toMatch(/^on:\n {2}pull_request:\n {2}push:\n {4}branches: \[main\]$/m);
    expect(workflow).toMatch(/^permissions:\n {2}contents: read$/m);
  });

  it("references secrets only as env values in the form secrets.NAME inside double braces", () => {
    const withSecrets = codeLines(workflow).filter((line) => line.includes("secrets."));
    expect(withSecrets.length).toBeGreaterThan(0);
    for (const line of withSecrets) {
      expect(line).toMatch(/^\s+[A-Z][A-Z_]*: \$\{\{ secrets\.[A-Z][A-Z_]* \}\}$/);
    }
  });

  it("never echoes a secret and never passes the token as an argument", () => {
    for (const line of codeLines(workflow)) {
      if (/\becho\b/.test(line)) {
        expect(line).not.toMatch(/secrets\.|VERCEL_TOKEN/);
        expect(line).not.toMatch(/\$\{?[A-Z_]*(TOKEN|SECRET)[A-Z_]*\}?/);
      }
      expect(line).not.toContain("--token");
    }
  });

  it("only hands the token to the steps that need it", () => {
    const deploy = jobBlock("deploy");
    const jobLevelEnv = /^ {4}env:\n((?: {6}.+\n)+)/m.exec(deploy)?.[1] ?? "";
    expect(jobLevelEnv).toContain("VERCEL_ORG_ID");
    expect(jobLevelEnv).not.toContain("VERCEL_TOKEN");
  });
});

describe("existing jobs keep their steps", () => {
  it("verify", () => {
    expect(stepNames(jobBlock("verify"))).toEqual([
      "Check out",
      "Set up pnpm",
      "Set up Node.js",
      "Install dependencies",
      "Typecheck",
      "Lint (includes the src/domain import boundary)",
      "Test",
      "Validate reference data",
      "Build",
      "Client JS size and Zod backstop",
    ]);
  });

  it("e2e", () => {
    expect(stepNames(jobBlock("e2e"))).toEqual([
      "Check out",
      "Set up pnpm",
      "Set up Node.js",
      "Install dependencies",
      "Install Chromium",
      "Run end-to-end specs",
      "Upload Playwright report",
      "Upload test results",
    ]);
  });

  it("still runs the same commands", () => {
    const verify = jobBlock("verify");
    for (const command of [
      "pnpm install --frozen-lockfile",
      "pnpm typecheck",
      "pnpm lint",
      "pnpm test",
      "pnpm data:check",
      "pnpm build",
      "pnpm perf:js",
    ]) {
      expect(verify).toContain(`run: ${command}`);
    }
    expect(jobBlock("e2e")).toContain("run: pnpm test:e2e");
  });
});
