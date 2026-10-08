import { afterEach, describe, expect, it, vi } from "vitest";

describe("next.config build gate", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("fails to load when a deployment variable is malformed", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "nope");
    vi.resetModules();
    await expect(import("../next.config")).rejects.toThrow(/NEXT_PUBLIC_SITE_URL/);
  });
});
