import { describe, expect, it } from "vitest";

import { pickSample } from "../../../scripts/import/linkcheck";

describe("pickSample", () => {
  const items = Array.from({ length: 100 }, (_, i) => i);
  it("is deterministic for a seed, so a sample can be re-run", () => {
    expect(pickSample(items, 10, 1)).toEqual(pickSample(items, 10, 1));
    expect(pickSample(items, 10, 1)).not.toEqual(pickSample(items, 10, 2));
  });
  it("returns distinct items and never more than asked", () => {
    const sample = pickSample(items, 25, 7);
    expect(sample).toHaveLength(25);
    expect(new Set(sample).size).toBe(25);
    expect(pickSample(items, 500, 7)).toHaveLength(100);
  });
});
