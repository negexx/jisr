import { describe, expect, it } from "vitest";

import { parseGuideFrontmatter } from "@/lib/guides/frontmatter";

const VALID = {
  source_url: "https://www.campusfrance.org/fr/etudes-en-france",
  info_kind: "official",
  last_verified_at: "2026-10-11",
} as const;

describe("parseGuideFrontmatter", () => {
  it("accepts a valid frontmatter", () => {
    expect(parseGuideFrontmatter(VALID)).toEqual(VALID);
  });

  it("rejects a frontmatter missing a field", () => {
    expect(() =>
      parseGuideFrontmatter({
        source_url: VALID.source_url,
        last_verified_at: VALID.last_verified_at,
      }),
    ).toThrow();
  });

  it("rejects a non-https source_url", () => {
    expect(() =>
      parseGuideFrontmatter({ ...VALID, source_url: "http://example.org/rule" }),
    ).toThrow();
  });

  it("rejects a bad last_verified_at", () => {
    expect(() => parseGuideFrontmatter({ ...VALID, last_verified_at: "11/10/2026" })).toThrow();
  });
});
