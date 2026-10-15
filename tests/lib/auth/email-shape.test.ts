import { describe, expect, it } from "vitest";

import { EMAIL_MAX_LENGTH } from "@/db/schema/app";
import { EMAIL_SHAPE_MAX_LENGTH, looksLikeEmail } from "@/lib/auth/email-shape";

describe("looksLikeEmail", () => {
  it("uses the database bound", () => {
    expect(EMAIL_SHAPE_MAX_LENGTH).toBe(EMAIL_MAX_LENGTH);
  });

  it.each([
    "name@example.com",
    "  Name@Example.COM ",
    "a.b+c@sub.example.ma",
  ])("accepts %j", (value) => {
    expect(looksLikeEmail(value)).toBe(true);
  });

  it.each([
    "",
    "   ",
    "name",
    "name@",
    "@example.com",
    "name@example",
    "name@@example.com",
    "na me@example.com",
    "name@example..com",
    `${"a".repeat(320)}@example.com`,
  ])("rejects %j", (value) => {
    expect(looksLikeEmail(value)).toBe(false);
  });
});
