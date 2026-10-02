import { describe, expect, it } from "vitest";

import {
  effectiveSelection,
  selectionBlock,
  toggleSelection,
} from "@/lib/journey/compare-selection";

const six = ["a", "b", "c", "d", "e", "f"];

describe("effectiveSelection", () => {
  it("defaults to the first four available", () => {
    expect(effectiveSelection(six, null)).toEqual(["a", "b", "c", "d"]);
    expect(effectiveSelection(["a", "b", "c"], null)).toEqual(["a", "b", "c"]);
    expect(effectiveSelection([], null)).toEqual([]);
  });

  it("keeps a valid pick, in available order, capped at four", () => {
    expect(effectiveSelection(six, ["d", "b"])).toEqual(["b", "d"]);
    expect(effectiveSelection(six, ["f", "e", "d", "c", "b"])).toEqual(["b", "c", "d", "e"]);
  });

  it("drops picks that are no longer available and tops up to two", () => {
    expect(effectiveSelection(["a", "b", "c"], ["a", "gone"])).toEqual(["a", "b"]);
    expect(effectiveSelection(["a", "b", "c"], ["gone", "alsogone"])).toEqual(["a", "b"]);
  });

  it("cannot reach two when fewer than two are available", () => {
    expect(effectiveSelection(["a"], ["a"])).toEqual(["a"]);
    expect(effectiveSelection(["a"], null)).toEqual(["a"]);
  });
});

describe("selectionBlock and toggleSelection", () => {
  it("blocks adding at four and removing at two", () => {
    expect(selectionBlock(["a", "b", "c", "d"], "e")).toBe("max");
    expect(selectionBlock(["a", "b", "c", "d"], "a")).toBeNull();
    expect(selectionBlock(["a", "b"], "a")).toBe("min");
    expect(selectionBlock(["a", "b"], "c")).toBeNull();
  });

  it("toggles in available order and leaves a blocked toggle unchanged", () => {
    expect(toggleSelection(["a", "c"], "b", six)).toEqual(["a", "b", "c"]);
    expect(toggleSelection(["a", "b", "c"], "b", six)).toEqual(["a", "c"]);
    expect(toggleSelection(["a", "b"], "a", six)).toEqual(["a", "b"]);
    expect(toggleSelection(["a", "b", "c", "d"], "e", six)).toEqual(["a", "b", "c", "d"]);
  });
});
