import { gzipSize, sha256Hex, shortHash } from "@scripts/data/hash";
import { describe, expect, it } from "vitest";

describe("hash", () => {
  it("sha256Hex of the empty string", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("hashes strings as UTF-8 bytes", () => {
    expect(sha256Hex("جسر")).toBe(sha256Hex(new TextEncoder().encode("جسر")));
  });

  it("shortHash keeps the first 12 hex characters", () => {
    const hex = sha256Hex("x");
    expect(shortHash(hex)).toHaveLength(12);
    expect(hex.startsWith(shortHash(hex))).toBe(true);
  });

  it("gzipSize is a positive integer and deterministic", () => {
    const data = new TextEncoder().encode("jisr ".repeat(200));
    const size = gzipSize(data);
    expect(Number.isInteger(size)).toBe(true);
    expect(size).toBeGreaterThan(0);
    expect(gzipSize(data)).toBe(size);
    expect(size).toBeLessThan(data.length);
  });
});
