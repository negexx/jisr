import { describe, expect, it } from "vitest";

import { normalizeEmail } from "@/lib/auth/normalize-email";

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail(" Ana@Example.COM ")).toBe("ana@example.com");
  });

  it("leaves a normalised address unchanged", () => {
    expect(normalizeEmail("ana@example.com")).toBe("ana@example.com");
  });
});
