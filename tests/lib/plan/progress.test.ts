import { describe, expect, it } from "vitest";

import {
  doneSteps,
  EMPTY_PROGRESS,
  parsePlanProgress,
  withoutProgram,
  withStepDone,
} from "@/lib/plan/progress";

describe("parsePlanProgress", () => {
  it("accepts the empty record and a normal one", () => {
    expect(parsePlanProgress({ schemaVersion: 1, done: {} })).toEqual(EMPTY_PROGRESS);
    expect(
      parsePlanProgress({ schemaVersion: 1, done: { "xx-prog": ["visa", "documents"] } }),
    ).toEqual({ schemaVersion: 1, done: { "xx-prog": ["documents", "visa"] } });
  });

  it("rejects anything that is not the expected shape", () => {
    for (const bad of [
      null,
      [],
      "x",
      { schemaVersion: 2, done: {} },
      { schemaVersion: 1 },
      { schemaVersion: 1, done: [] },
      { schemaVersion: 1, done: {}, extra: true },
    ]) {
      expect(parsePlanProgress(bad)).toBeNull();
    }
  });

  it("drops unknown step ids, duplicates, bad slugs and empty lists", () => {
    expect(
      parsePlanProgress({
        schemaVersion: 1,
        done: {
          "xx-prog": ["visa", "visa", "nope", 3],
          "Bad Slug": ["visa"],
          "xx-empty": [],
          "xx-notlist": "visa",
        },
      }),
    ).toEqual({ schemaVersion: 1, done: { "xx-prog": ["visa"] } });
  });

  it("never throws on arbitrary input", () => {
    const samples: unknown[] = [
      undefined,
      1,
      true,
      {},
      { schemaVersion: 1, done: { __proto__: ["visa"] } },
    ];
    for (const sample of samples) expect(() => parsePlanProgress(sample)).not.toThrow();
  });
});

describe("pure operations", () => {
  it("reads a slug named like an Object property without inheriting", () => {
    expect(doneSteps(EMPTY_PROGRESS, "constructor")).toEqual([]);
  });

  it("ticks and unticks a step, keeping steps in checklist order", () => {
    let progress = withStepDone(EMPTY_PROGRESS, "xx-prog", "visa", true);
    progress = withStepDone(progress, "xx-prog", "documents", true);
    expect(doneSteps(progress, "xx-prog")).toEqual(["documents", "visa"]);
    progress = withStepDone(progress, "xx-prog", "visa", false);
    expect(doneSteps(progress, "xx-prog")).toEqual(["documents"]);
    progress = withStepDone(progress, "xx-prog", "documents", false);
    expect(progress).toEqual(EMPTY_PROGRESS);
  });

  it("forgets one program only", () => {
    let progress = withStepDone(EMPTY_PROGRESS, "xx-a", "visa", true);
    progress = withStepDone(progress, "xx-b", "visa", true);
    expect(withoutProgram(progress, "xx-a")).toEqual({
      schemaVersion: 1,
      done: { "xx-b": ["visa"] },
    });
  });
});
