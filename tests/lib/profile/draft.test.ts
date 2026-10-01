import { describe, expect, it } from "vitest";

import { DraftSchema } from "@/data-schema/draft";
import {
  clearDraft,
  DRAFT_SCHEMA_VERSION,
  type ProfileDraft,
  readDraft,
  writeDraft,
} from "@/lib/profile/draft";
import { clearLocalData, DRAFT_KEY } from "@/lib/profile/storage";

import { createFakeStorage } from "./fake-storage";
import { forbidConsole } from "./no-console";

forbidConsole();

const draft: ProfileDraft = {
  schemaVersion: DRAFT_SCHEMA_VERSION,
  step: 1,
  nationality: "MA",
  credential: {
    country: "MA",
    type: "bac",
    overall: { scale: "ma-20", value: "14," },
    subjects: [{ subject: "math", grade: { scale: "ma-20", value: "15.5" } }],
  },
  languages: [{ language: "fr", level: "B2", certificate: null }],
};

describe("draft storage", () => {
  it("round-trips a draft", () => {
    const storage = createFakeStorage();
    expect(writeDraft(storage, draft)).toEqual({ ok: true });
    expect(readDraft(storage)).toEqual(draft);
  });

  it("preserves grade inputs exactly as typed", () => {
    const storage = createFakeStorage();
    writeDraft(storage, draft);
    expect(readDraft(storage)?.credential?.overall?.value).toBe("14,");
  });

  it("accepts a bare draft with only a step", () => {
    expect(DraftSchema.safeParse({ schemaVersion: 1, step: 0 }).success).toBe(true);
  });

  it("returns null when there is no draft", () => {
    expect(readDraft(createFakeStorage())).toBeNull();
  });

  it.each([
    ["corrupt JSON", "{oops"],
    ["a wrong shape", JSON.stringify({ hello: 1 })],
    ["an unknown key", JSON.stringify({ schemaVersion: 1, step: 0, secret: "x" })],
    ["another version", JSON.stringify({ schemaVersion: 2, step: 0 })],
  ])("drops %s and removes it", (_label, raw) => {
    const storage = createFakeStorage();
    storage.seed(DRAFT_KEY, raw);
    expect(readDraft(storage)).toBeNull();
    expect(storage.raw(DRAFT_KEY)).toBeNull();
  });

  it("refuses to write an invalid draft", () => {
    const storage = createFakeStorage();
    expect(writeDraft(storage, { step: -1 })).toEqual({ ok: false, reason: "invalid" });
    expect(storage.keys()).toEqual([]);
  });

  it("reports storage_unavailable when setItem throws", () => {
    expect(writeDraft(createFakeStorage({ set: true }), draft)).toEqual({
      ok: false,
      reason: "storage_unavailable",
    });
  });

  it("does not crash when getItem throws", () => {
    expect(readDraft(createFakeStorage({ get: true }))).toBeNull();
  });

  it("is removed by clearDraft and by clearLocalData", () => {
    const storage = createFakeStorage();
    writeDraft(storage, draft);
    clearDraft(storage);
    expect(storage.raw(DRAFT_KEY)).toBeNull();
    writeDraft(storage, draft);
    clearLocalData(storage);
    expect(storage.raw(DRAFT_KEY)).toBeNull();
  });

  it("tolerates a throwing removeItem", () => {
    expect(() => clearDraft(createFakeStorage({ remove: true }))).not.toThrow();
  });
});
