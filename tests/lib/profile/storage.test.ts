import { describe, expect, it } from "vitest";

import { MATCH_FILTERS_VERSION } from "@/lib/constants";
import { MATCH_FILTERS_KEY, readMatchFilters, writeMatchFilters } from "@/lib/matches/filter-store";
import { EMPTY_MATCH_FILTERS } from "@/lib/matches/filters";
import {
  applyMigrations,
  clearLocalData,
  DRAFT_KEY,
  KEY_PREFIX,
  migrateProfile,
  PROFILE_KEY,
  readProfile,
  writeProfile,
} from "@/lib/profile/storage";

import { profile } from "../../fixtures/domain/builders";
import { createFakeStorage } from "./fake-storage";
import { forbidConsole } from "./no-console";

forbidConsole();

const V1 = {
  schemaVersion: 1,
  nationality: "XA",
  credential: {
    country: "XA",
    type: "xx-test-cred",
    track: "xx-test-track-sci",
    status: "obtained",
    overall: { scale: "xx-test-scale-20", value: 14 },
    subjects: [{ subject: "xx-test-math", grade: { scale: "xx-test-scale-20", value: 15 } }],
  },
  priorHigherEducationYears: 0,
  languages: [{ language: "fr", level: "B2", certificate: "xx-test-cert-fr" }],
  fields: ["xx-test-field"],
  studyLanguages: ["fr"],
  destinations: ["XB"],
  budget: { amountMinor: 90_000, currency: "EUR", period: "month" },
  institutionType: "public",
};

describe("keys", () => {
  it("uses the jisr. namespace", () => {
    expect(PROFILE_KEY).toBe("jisr.profile");
    expect(DRAFT_KEY).toBe("jisr.profile-draft");
    expect(KEY_PREFIX).toBe("jisr.");
  });
});

describe("migrateProfile", () => {
  it("accepts a valid current-version profile", () => {
    const valid = profile();
    expect(migrateProfile(valid)).toEqual({ ok: true, profile: valid });
  });

  it.each([
    ["a higher version", { ...profile(), schemaVersion: 3 }],
    ["version zero", { ...profile(), schemaVersion: 0 }],
    ["a fractional version", { ...profile(), schemaVersion: 2.5 }],
  ])("reports %s as unsupported_version", (_label, raw) => {
    expect(migrateProfile(raw)).toEqual({ ok: false, reason: "unsupported_version" });
  });

  it.each([
    ["null", null],
    ["a string", "profile"],
    ["an array", []],
    ["an empty object", {}],
    ["a non-numeric version", { ...profile(), schemaVersion: "1" }],
    ["a wrong shape", { ...profile(), nationality: 12 }],
    ["an extra key", { ...profile(), extra: true }],
  ])("reports %s as invalid", (_label, raw) => {
    expect(migrateProfile(raw)).toEqual({ ok: false, reason: "invalid" });
  });

  it("carries no profile data in a failure", () => {
    const result = migrateProfile({ ...profile({ nationality: "ZZ" }), extra: 1 });
    expect(JSON.stringify(result)).not.toContain("ZZ");
  });
});

describe("applyMigrations", () => {
  it("returns the record a present step produced", () => {
    const { record } = applyMigrations(V1);
    expect(record.schemaVersion).toBe(2);
    expect(record).not.toHaveProperty("fields");
  });

  it("returns the in-progress record when a step is missing", () => {
    const raw = { schemaVersion: 0, nationality: "XA" };
    expect(applyMigrations(raw)).toEqual({ record: raw });
  });
});

describe("v1 to v2 migration", () => {
  it("migrates a stored v1 record to v2, strips the five keys and keeps the rest", () => {
    const storage = createFakeStorage();
    storage.seed(PROFILE_KEY, JSON.stringify(V1));
    const stored = readProfile(storage);
    expect(stored.status).toBe("ok");
    if (stored.status !== "ok") return;
    expect(stored.profile.schemaVersion).toBe(2);
    expect(stored.profile).not.toHaveProperty("fields");
    expect(stored.profile).not.toHaveProperty("budget");
    expect(stored.profile.nationality).toBe("XA");
  });

  it("returns the removed preferences from migrateProfile", () => {
    const result = migrateProfile(V1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.schemaVersion).toBe(2);
    expect(result.legacyPreferences).toEqual({
      schemaVersion: MATCH_FILTERS_VERSION,
      fields: ["xx-test-field"],
      studyLanguages: ["fr"],
      destinations: ["XB"],
      institutionType: "public",
      budget: { amountMinor: 90_000, currency: "EUR", period: "month" },
    });
  });

  it("seeds jisr.matches-filters from the removed values", () => {
    const storage = createFakeStorage();
    storage.seed(PROFILE_KEY, JSON.stringify(V1));
    readProfile(storage);
    expect(readMatchFilters(storage)).toEqual({
      schemaVersion: MATCH_FILTERS_VERSION,
      fields: ["xx-test-field"],
      studyLanguages: ["fr"],
      destinations: ["XB"],
      institutionType: "public",
      budget: { amountMinor: 90_000, currency: "EUR", period: "month" },
    });
  });

  it("rewrites the v1 record as v2, so a later read carries no legacy preferences", () => {
    const storage = createFakeStorage();
    storage.seed(PROFILE_KEY, JSON.stringify(V1));
    readProfile(storage);
    const persisted = JSON.parse(storage.raw(PROFILE_KEY) ?? "null") as Record<string, unknown>;
    expect(persisted.schemaVersion).toBe(2);
    expect(persisted).not.toHaveProperty("fields");
    const second = readProfile(storage);
    expect(second.status).toBe("ok");
    expect(second.status === "ok" && second.legacyPreferences).toBeUndefined();
  });

  it("seeds once: emptying the filter store does not resurrect the legacy values", () => {
    const storage = createFakeStorage();
    storage.seed(PROFILE_KEY, JSON.stringify(V1));
    readProfile(storage);
    expect(readMatchFilters(storage).fields).toEqual(["xx-test-field"]);

    // The student clears the filters: an empty document, then a removed key.
    storage.setItem(MATCH_FILTERS_KEY, JSON.stringify(EMPTY_MATCH_FILTERS));
    readProfile(storage);
    expect(readMatchFilters(storage)).toEqual(EMPTY_MATCH_FILTERS);

    storage.removeItem(MATCH_FILTERS_KEY);
    readProfile(storage);
    expect(storage.raw(MATCH_FILTERS_KEY)).toBeNull();
  });

  it("does not overwrite an already-set filter store", () => {
    const storage = createFakeStorage();
    storage.seed(PROFILE_KEY, JSON.stringify(V1));
    writeMatchFilters(storage, {
      schemaVersion: MATCH_FILTERS_VERSION,
      fields: ["kept"],
      studyLanguages: [],
      destinations: [],
      institutionType: "any",
      budget: null,
    });
    readProfile(storage);
    expect(readMatchFilters(storage).fields).toEqual(["kept"]);
  });

  it("seeds nothing when the v1 preferences are all default", () => {
    const storage = createFakeStorage();
    storage.seed(
      PROFILE_KEY,
      JSON.stringify({
        ...V1,
        fields: [],
        studyLanguages: [],
        destinations: [],
        institutionType: "any",
        budget: null,
      }),
    );
    readProfile(storage);
    expect(storage.raw(MATCH_FILTERS_KEY)).toBeNull();
  });
});

describe("readProfile", () => {
  it("returns none when nothing is stored", () => {
    expect(readProfile(createFakeStorage())).toEqual({ status: "none" });
  });

  it("returns a valid stored profile", () => {
    const storage = createFakeStorage();
    storage.seed(PROFILE_KEY, JSON.stringify(profile()));
    expect(readProfile(storage)).toEqual({ status: "ok", profile: profile() });
    expect(storage.raw(PROFILE_KEY)).not.toBeNull();
  });

  it("resets and removes corrupt JSON", () => {
    const storage = createFakeStorage();
    storage.seed(PROFILE_KEY, "{not json");
    expect(readProfile(storage)).toEqual({ status: "reset", reason: "invalid" });
    expect(storage.raw(PROFILE_KEY)).toBeNull();
  });

  it("resets and removes JSON of the wrong shape", () => {
    const storage = createFakeStorage();
    storage.seed(PROFILE_KEY, JSON.stringify({ hello: "world" }));
    expect(readProfile(storage)).toEqual({ status: "reset", reason: "invalid" });
    expect(storage.raw(PROFILE_KEY)).toBeNull();
  });

  it("resets and removes an unsupported schema version", () => {
    const storage = createFakeStorage();
    storage.seed(PROFILE_KEY, JSON.stringify({ ...profile(), schemaVersion: 3 }));
    expect(readProfile(storage)).toEqual({ status: "reset", reason: "unsupported_version" });
    expect(storage.raw(PROFILE_KEY)).toBeNull();
  });

  it("does not crash when getItem throws", () => {
    expect(readProfile(createFakeStorage({ get: true }))).toEqual({ status: "none" });
  });

  it("still reports the reset when removing the bad key throws", () => {
    const storage = createFakeStorage({ remove: true });
    storage.seed(PROFILE_KEY, "garbage");
    expect(readProfile(storage)).toEqual({ status: "reset", reason: "invalid" });
  });
});

describe("writeProfile", () => {
  it("writes a valid profile and reads it back", () => {
    const storage = createFakeStorage();
    expect(writeProfile(storage, profile())).toEqual({ ok: true });
    expect(readProfile(storage)).toEqual({ status: "ok", profile: profile() });
  });

  it("refuses an invalid profile and writes nothing", () => {
    const storage = createFakeStorage();
    expect(writeProfile(storage, { ...profile(), nationality: "morocco" })).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(storage.keys()).toEqual([]);
  });

  it("does not overwrite a stored profile with an invalid one", () => {
    const storage = createFakeStorage();
    writeProfile(storage, profile());
    writeProfile(storage, { nope: true });
    expect(readProfile(storage)).toEqual({ status: "ok", profile: profile() });
  });

  it("reports storage_unavailable when setItem throws", () => {
    expect(writeProfile(createFakeStorage({ set: true }), profile())).toEqual({
      ok: false,
      reason: "storage_unavailable",
    });
  });
});

describe("clearLocalData", () => {
  it("removes every jisr.* key and nothing else", () => {
    const storage = createFakeStorage();
    storage.seed("other.key", "keep");
    storage.seed("jisr.x", "1");
    storage.seed(PROFILE_KEY, "2");
    storage.seed(DRAFT_KEY, "3");
    storage.seed("jisr.saved-programs", "4");
    storage.seed("notjisr.y", "keep");
    clearLocalData(storage);
    expect(storage.keys().sort()).toEqual(["notjisr.y", "other.key"]);
  });

  it("keeps the sign-in hint, which only sign-in, sign-out and account deletion manage, and removes the account cache", () => {
    const storage = createFakeStorage();
    storage.seed("jisr.auth", "true");
    storage.seed("jisr.account.saved", "1");
    storage.seed(PROFILE_KEY, "2");
    clearLocalData(storage);
    expect(storage.keys()).toEqual(["jisr.auth"]);
  });

  it("survives a storage whose removeItem throws", () => {
    const storage = createFakeStorage({ remove: true });
    storage.seed(PROFILE_KEY, "2");
    expect(() => clearLocalData(storage)).not.toThrow();
  });

  it("survives a storage whose key() throws", () => {
    const storage = createFakeStorage({ key: true });
    storage.seed(PROFILE_KEY, "2");
    expect(() => clearLocalData(storage)).not.toThrow();
  });
});
