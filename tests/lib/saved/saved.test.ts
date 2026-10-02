import { describe, expect, it } from "vitest";

import { MAX_SAVED_PROGRAMS } from "@/lib/constants";
import {
  addSaved,
  EMPTY_SAVED,
  isSavedSlug,
  parseSaved,
  removeSaved,
  type SavedProgram,
} from "@/lib/saved/saved";

const item = (slug: string): SavedProgram => ({
  slug,
  country: "FR",
  field: "computer-science",
  snapshotVersion: "0123456789ab",
  savedAt: "2026-10-02",
});

describe("parseSaved", () => {
  it("accepts the empty list and a normal one", () => {
    expect(parseSaved({ schemaVersion: 1, items: [] })).toEqual(EMPTY_SAVED);
    expect(parseSaved({ schemaVersion: 1, items: [item("xx-a"), item("xx-b")] })).toEqual({
      schemaVersion: 1,
      items: [item("xx-a"), item("xx-b")],
    });
  });

  it("rejects a wrong shape or version", () => {
    for (const bad of [
      null,
      [],
      3,
      { schemaVersion: 2, items: [] },
      { schemaVersion: 1 },
      { schemaVersion: 1, items: {} },
      { schemaVersion: 1, items: [], x: 1 },
    ]) {
      expect(parseSaved(bad)).toBeNull();
    }
  });

  it("drops invalid and duplicate items and caps the list", () => {
    const many = Array.from({ length: MAX_SAVED_PROGRAMS + 3 }, (_, i) => item(`xx-p${i}`));
    expect(
      parseSaved({
        schemaVersion: 1,
        items: [
          item("xx-a"),
          item("xx-a"),
          { ...item("xx-b"), savedAt: "2026-02-30" },
          { ...item("xx-c"), country: "fr" },
          { ...item("xx-d"), snapshotVersion: "short" },
          { ...item("xx-e"), extra: 1 },
          "nope",
        ],
      }),
    ).toEqual({ schemaVersion: 1, items: [item("xx-a")] });
    expect(parseSaved({ schemaVersion: 1, items: many })?.items).toHaveLength(MAX_SAVED_PROGRAMS);
  });
});

describe("parseSaved on hostile input", () => {
  it("never throws, whatever the shape", () => {
    for (const bad of [undefined, 1, true, {}, { schemaVersion: 1, items: [null, [], 3] }]) {
      expect(() => parseSaved(bad)).not.toThrow();
    }
  });

  it("rejects an otherwise valid item that carries an own __proto__ key, without polluting Object.prototype", () => {
    const valid = item("xx-proto");
    const raw = JSON.parse(
      `{"schemaVersion":1,"items":[${JSON.stringify(valid).slice(0, -1)},"__proto__":{"polluted":true}},${JSON.stringify(item("xx-ok"))}]}`,
    );
    // JSON.parse makes __proto__ an own property here, which the extra-key rule must reject.
    expect(Object.hasOwn(raw.items[0], "__proto__")).toBe(true);
    expect(parseSaved(raw)).toEqual({ schemaVersion: 1, items: [item("xx-ok")] });
    expect(Object.hasOwn(Object.prototype, "polluted")).toBe(false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("pure operations", () => {
  it("adds, ignores a duplicate, refuses when full and removes", () => {
    const one = addSaved(EMPTY_SAVED, item("xx-a"));
    expect(one?.items.map((i) => i.slug)).toEqual(["xx-a"]);
    expect(addSaved(one ?? EMPTY_SAVED, item("xx-a"))).toEqual(one);
    const full = {
      schemaVersion: 1 as const,
      items: Array.from({ length: MAX_SAVED_PROGRAMS }, (_, i) => item(`xx-p${i}`)),
    };
    expect(addSaved(full, item("xx-new"))).toBeNull();
    expect(isSavedSlug(full, "xx-p3")).toBe(true);
    expect(removeSaved(full, "xx-p3").items).toHaveLength(MAX_SAVED_PROGRAMS - 1);
  });
});
