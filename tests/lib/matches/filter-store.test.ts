import { describe, expect, it } from "vitest";

import type { MatchFilters } from "@/data-schema/match-filters";
import {
  MATCH_FILTERS_KEY,
  readMatchFilters,
  seedFiltersFromLegacy,
  writeMatchFilters,
} from "@/lib/matches/filter-store";
import { EMPTY_MATCH_FILTERS } from "@/lib/matches/filters";

import { createFakeStorage } from "../profile/fake-storage";
import { forbidConsole } from "../profile/no-console";

forbidConsole();

const CHOSEN: MatchFilters = {
  schemaVersion: 1,
  fields: ["xx-test-field-cs"],
  studyLanguages: ["en"],
  destinations: ["DE"],
  institutionType: "public",
  budget: { amountMinor: 120_000, currency: "EUR", period: "year" },
};

const OTHER: MatchFilters = {
  schemaVersion: 1,
  fields: ["xx-test-field-eng"],
  studyLanguages: ["fr"],
  destinations: ["FR"],
  institutionType: "private",
  budget: null,
};

describe("MATCH_FILTERS_KEY", () => {
  it("keeps the jisr. namespace", () => {
    expect(MATCH_FILTERS_KEY).toBe("jisr.matches-filters");
  });
});

describe("readMatchFilters", () => {
  it("returns the empty filters when nothing is stored", () => {
    expect(readMatchFilters(createFakeStorage())).toEqual(EMPTY_MATCH_FILTERS);
  });

  it("returns the empty filters for corrupt JSON without throwing", () => {
    const storage = createFakeStorage();
    storage.seed(MATCH_FILTERS_KEY, "{not json");
    expect(readMatchFilters(storage)).toEqual(EMPTY_MATCH_FILTERS);
  });

  it("returns the empty filters for JSON of the wrong shape", () => {
    const storage = createFakeStorage();
    storage.seed(MATCH_FILTERS_KEY, JSON.stringify({ hello: "world" }));
    expect(readMatchFilters(storage)).toEqual(EMPTY_MATCH_FILTERS);
  });

  it("round-trips a written filters value", () => {
    const storage = createFakeStorage();
    writeMatchFilters(storage, CHOSEN);
    expect(readMatchFilters(storage)).toEqual(CHOSEN);
  });

  it("does not crash when getItem throws", () => {
    expect(readMatchFilters(createFakeStorage({ get: true }))).toEqual(EMPTY_MATCH_FILTERS);
  });

  it("hands out a fresh object, never the shared EMPTY_MATCH_FILTERS constant (audit T1b-F1)", () => {
    const storage = createFakeStorage();
    const first = readMatchFilters(storage);
    expect(first).not.toBe(EMPTY_MATCH_FILTERS);
    expect(first).toEqual(EMPTY_MATCH_FILTERS);
    first.fields.push("xx-test-field" as never);
    expect(readMatchFilters(storage)).toEqual(EMPTY_MATCH_FILTERS);
  });
});

describe("writeMatchFilters", () => {
  it("writes a valid filters value", () => {
    const storage = createFakeStorage();
    writeMatchFilters(storage, CHOSEN);
    expect(storage.raw(MATCH_FILTERS_KEY)).toBe(JSON.stringify(CHOSEN));
  });

  it("refuses an invalid filters value and writes nothing", () => {
    const storage = createFakeStorage();
    writeMatchFilters(storage, { ...CHOSEN, fields: ["Computer Science"] });
    expect(storage.keys()).toEqual([]);
  });

  it("does not overwrite a stored value with an invalid one", () => {
    const storage = createFakeStorage();
    writeMatchFilters(storage, CHOSEN);
    writeMatchFilters(storage, { nope: true });
    expect(readMatchFilters(storage)).toEqual(CHOSEN);
  });

  it("survives a storage whose setItem throws", () => {
    const storage = createFakeStorage({ set: true });
    expect(() => writeMatchFilters(storage, CHOSEN)).not.toThrow();
  });
});

describe("seedFiltersFromLegacy", () => {
  it("writes the legacy filters when the key is absent and returns true", () => {
    const storage = createFakeStorage();
    expect(seedFiltersFromLegacy(storage, CHOSEN)).toBe(true);
    expect(readMatchFilters(storage)).toEqual(CHOSEN);
  });

  it("is a no-op when any filter is already set and returns false", () => {
    const storage = createFakeStorage();
    writeMatchFilters(storage, CHOSEN);
    expect(seedFiltersFromLegacy(storage, OTHER)).toBe(false);
    expect(readMatchFilters(storage)).toEqual(CHOSEN);
  });

  it("writes when the stored filters are empty and returns true", () => {
    const storage = createFakeStorage();
    writeMatchFilters(storage, EMPTY_MATCH_FILTERS);
    expect(seedFiltersFromLegacy(storage, CHOSEN)).toBe(true);
    expect(readMatchFilters(storage)).toEqual(CHOSEN);
  });

  it("is a no-op on an empty legacy value and returns false", () => {
    const storage = createFakeStorage();
    expect(seedFiltersFromLegacy(storage, EMPTY_MATCH_FILTERS)).toBe(false);
    expect(storage.keys()).toEqual([]);
  });

  it("returns false when the write is blocked and nothing is stored", () => {
    const storage = createFakeStorage({ set: true });
    expect(seedFiltersFromLegacy(storage, CHOSEN)).toBe(false);
    expect(readMatchFilters(storage)).toEqual(EMPTY_MATCH_FILTERS);
    expect(storage.keys()).toEqual([]);
  });

  it("returns false and does not throw when storage is fully blocked", () => {
    const storage = createFakeStorage({ get: true, set: true });
    expect(() => seedFiltersFromLegacy(storage, CHOSEN)).not.toThrow();
    expect(seedFiltersFromLegacy(storage, CHOSEN)).toBe(false);
  });
});
