import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDigest } from "@/lib/snapshot/client";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createDigest", () => {
  it("returns lowercase hex SHA-256 via crypto.subtle", async () => {
    const digest = createDigest();
    expect(digest).not.toBeNull();
    const bytes = new TextEncoder().encode("jisr snapshot");
    const expected = createHash("sha256").update(bytes).digest("hex");
    expect(await digest?.(bytes.buffer)).toBe(expected);
  });

  it("returns null and warns once, with no data, when crypto.subtle is missing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(createDigest({})).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    const args = warn.mock.calls[0] ?? [];
    expect(args).toHaveLength(1);
    expect(typeof args[0]).toBe("string");
  });
});
