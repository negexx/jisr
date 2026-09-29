import { describe, expect, it } from "vitest";

import {
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
    ["a higher version", { ...profile(), schemaVersion: 2 }],
    ["version zero", { ...profile(), schemaVersion: 0 }],
    ["a fractional version", { ...profile(), schemaVersion: 1.5 }],
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
    storage.seed(PROFILE_KEY, JSON.stringify({ ...profile(), schemaVersion: 2 }));
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
