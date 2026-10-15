import { describe, expect, it } from "vitest";

import { cooldownKey, normalizeEmail } from "@/lib/auth/normalize-email";

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail(" Ana@Example.COM ")).toBe("ana@example.com");
  });

  it("leaves a normalised address unchanged", () => {
    expect(normalizeEmail("ana@example.com")).toBe("ana@example.com");
  });
});

describe("cooldownKey", () => {
  it("normalises like normalizeEmail", () => {
    expect(cooldownKey(" Ana@Example.COM ")).toBe("ana@example.com");
  });

  it("drops a +tag from the local part, so tagged forms of one mailbox share a key", () => {
    expect(cooldownKey("a+1@x.org")).toBe("a@x.org");
    expect(cooldownKey("A+2@X.org")).toBe("a@x.org");
    expect(cooldownKey("a+one+two@x.org")).toBe("a@x.org");
  });

  it("keeps dots outside Gmail, where they may name different mailboxes", () => {
    expect(cooldownKey("a.b@example.com")).toBe("a.b@example.com");
  });

  it("drops dots and tags for Gmail and maps googlemail.com to gmail.com", () => {
    expect(cooldownKey("A.n.A+x@gmail.com")).toBe("ana@gmail.com");
    expect(cooldownKey("a.na@googlemail.com")).toBe("ana@gmail.com");
  });

  it("keeps a local part that would otherwise become empty", () => {
    expect(cooldownKey("+tag@x.org")).toBe("+tag@x.org");
    expect(cooldownKey("...@gmail.com")).toBe("...@gmail.com");
  });

  it("leaves a value without an @ as normalised", () => {
    expect(cooldownKey(" Not-An-Address ")).toBe("not-an-address");
  });
});
