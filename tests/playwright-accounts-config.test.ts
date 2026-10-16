import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

async function loadConfig() {
  vi.resetModules();
  return (await import("../playwright.accounts.config")).default;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("playwright.accounts.config.ts", () => {
  it("writes its CI html report to its own folder, so it never overwrites the guest report", async () => {
    vi.stubEnv("CI", "1");
    const config = await loadConfig();
    expect(config.reporter).toEqual([
      ["list"],
      ["html", { open: "never", outputFolder: "playwright-report-accounts" }],
    ]);
  });

  it.each(["1", ""])("never retries, so a flaky account step fails the run (CI=%j)", async (ci) => {
    vi.stubEnv("CI", ci);
    expect((await loadConfig()).retries).toBe(0);
  });

  it("is ignored by git and uploaded by the e2e job", () => {
    expect(readFileSync(".gitignore", "utf8").split(/\r?\n/)).toContain(
      "playwright-report-accounts/",
    );
    const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
    expect(workflow).toContain("playwright-report-accounts/");
  });
});
