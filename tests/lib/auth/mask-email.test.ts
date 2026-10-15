import { describe, expect, it } from "vitest";

import { maskEmail } from "@/lib/auth/mask-email";

describe("maskEmail", () => {
  it.each([
    ["amina.b@example.com", "a***@example.com"],
    ["a@example.org", "a***@example.org"],
    ["Youssef+jisr@mail.example.ma", "Y***@mail.example.ma"],
  ])("keeps the first character and the domain of %s", (email, masked) => {
    expect(maskEmail(email)).toBe(masked);
  });

  it("never shows the rest of the local part", () => {
    expect(maskEmail("secretname@example.com")).not.toContain("ecretname");
  });

  it.each(["", "no-at-sign", "@example.com"])("hides an address it cannot split (%j)", (email) => {
    expect(maskEmail(email)).toBe("***");
  });
});
