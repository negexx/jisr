import { describe, expect, it } from "vitest";

import { resolveProgramSlug } from "@/lib/snapshot/resolve-program-slug";

const ALIASES = {
  "old-name": "new-name",
  "older-name": "new-name",
  constructor: "renamed-constructor",
} as const;

describe("resolveProgramSlug", () => {
  it.each([
    ["a former slug", "old-name", "new-name"],
    ["a second former slug of the same programme", "older-name", "new-name"],
    ["a live slug", "new-name", "new-name"],
    ["a slug that is neither live nor aliased", "never-existed", "never-existed"],
    ["an Object.prototype name that is not an alias", "toString", "toString"],
    ["an own key that shadows an Object.prototype name", "constructor", "renamed-constructor"],
  ])("maps %s", (_name, slug, expected) => {
    expect(resolveProgramSlug(slug, { aliases: ALIASES })).toBe(expected);
  });

  it("leaves every slug unchanged when the manifest has no alias map", () => {
    expect(resolveProgramSlug("old-name", {})).toBe("old-name");
    expect(resolveProgramSlug("old-name", { aliases: {} })).toBe("old-name");
  });

  it("follows an un-flattened chain to its final slug", () => {
    const chain = { a: "b", b: "c", c: "d" };
    expect(resolveProgramSlug("a", { aliases: chain })).toBe("d");
    expect(resolveProgramSlug("b", { aliases: chain })).toBe("d");
  });

  it("returns the slug unchanged when the map loops, instead of looping forever", () => {
    expect(resolveProgramSlug("a", { aliases: { a: "b", b: "a" } })).toBe("a");
    expect(resolveProgramSlug("a", { aliases: { a: "a" } })).toBe("a");
    expect(resolveProgramSlug("x", { aliases: { x: "a", a: "b", b: "a" } })).toBe("x");
  });
});
