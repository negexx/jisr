// T1b audit — finding reproduction (READ-ONLY: no src/ fixes).
// F1: readMatchFilters falls back to the module's shared, mutable EMPTY_MATCH_FILTERS object.
import { describe, expect, it } from "vitest";

import { EMPTY_MATCH_FILTERS } from "@/lib/matches/filters";
import { readMatchFilters } from "@/lib/matches/filter-store";
import { createFakeStorage } from "../lib/profile/fake-storage";

describe("F1 — readMatchFilters returns the shared mutable EMPTY_MATCH_FILTERS constant", () => {
  it("a mutation through one read is visible in a later read and in the module constant", () => {
    const storage = createFakeStorage();

    const first = readMatchFilters(storage);
    expect(first).toBe(EMPTY_MATCH_FILTERS); // the same object, not a copy
    first.fields.push("xx-test-field"); // any caller that mutates the returned value...

    const second = readMatchFilters(storage);
    // ...corrupts this later, independent read: an "empty" read now carries a field.
    expect(second.fields).toEqual([]); // RED: [ 'xx-test-field' ]
  });
});
