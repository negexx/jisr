// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import type { Profile } from "@/data-schema/profile";
import { createAccountSync, type SyncActions } from "@/lib/account-sync/sync";
import { createLocalJsonStore } from "@/lib/local-store";
import { EMPTY_PROGRESS, parsePlanProgress } from "@/lib/plan/progress";
import { EMPTY_ACCOUNT_PROFILE, parseAccountProfile } from "@/lib/profile/account-profile";
import { EMPTY_SAVED, parseSaved, type SavedProgram } from "@/lib/saved/saved";

import { createFakeStorage, type FakeStorage } from "../profile/fake-storage";

// Two tabs of the same account share the cache keys. A write by one reaches the other's store as
// a `storage` event; the other tab's sync must take it as its confirmed state instead of writing
// its own older copy back over it on its next change.

const KEYS = {
  saved: "jisr.account.saved",
  plan: "jisr.account.plan",
  profile: "jisr.account.profile",
};

const PROFILE: Profile = {
  schemaVersion: 1,
  nationality: "MA",
  credential: {
    country: "MA",
    type: "bac",
    track: "sciences-maths-a",
    status: "expected",
    overall: { scale: "ma-20", value: 13.37 },
    subjects: [{ subject: "mathematics", grade: { scale: "ma-20", value: 17 } }],
  },
  priorHigherEducationYears: 0,
  languages: [{ language: "fr", level: "B2", certificate: null }],
  fields: ["computer-science"],
  studyLanguages: ["fr", "en"],
  destinations: ["FR", "DE"],
  budget: { amountMinor: 900_00, currency: "EUR", period: "month" },
  institutionType: "any",
};

function item(slug: string): SavedProgram {
  return {
    slug,
    country: "FR",
    field: "computer-science",
    snapshotVersion: "0123456789ab",
    savedAt: "2026-10-14",
  };
}

async function settle(): Promise<void> {
  for (let round = 0; round < 10; round += 1) await Promise.resolve();
}

// A server that applies each operation for real, so both tabs talk to one account.
function server() {
  let saved: SavedProgram[] = [];
  let done: Record<string, string[]> = {};
  let profile: Profile | null = null;
  let revision = 0;
  const profileCalls: Array<[Profile, number]> = [];
  const actions = {
    loadAccountData: async () => ({
      ok: true,
      value: { profile, revision, saved, plan: { schemaVersion: 1, done } },
    }),
    saveProgram: async (next: SavedProgram) => {
      if (!saved.some((s) => s.slug === next.slug)) saved = [...saved, next];
      return { ok: true, value: { items: saved } };
    },
    unsaveProgram: async (slug: string) => {
      saved = saved.filter((s) => s.slug !== slug);
      return { ok: true, value: { items: saved } };
    },
    setStepDone: async (slug: string, step: string, on: boolean) => {
      const steps = new Set(done[slug] ?? []);
      if (on) steps.add(step);
      else steps.delete(step);
      done = { ...done, [slug]: [...steps] };
      return { ok: true, value: { steps: [...steps] } };
    },
    forgetProgress: async () => ({ ok: true, value: undefined }),
    saveProfile: async (next: Profile, expected: number) => {
      profileCalls.push([next, expected]);
      if (expected !== revision) {
        return { ok: false, error: "conflict", current: { profile, revision } };
      }
      profile = next;
      revision += 1;
      return { ok: true, value: { revision } };
    },
  } as unknown as SyncActions;
  return { actions, profileCalls };
}

function tab(storage: FakeStorage, actions: SyncActions) {
  const stores = {
    saved: createLocalJsonStore(() => storage, {
      key: KEYS.saved,
      empty: EMPTY_SAVED,
      parse: parseSaved,
    }),
    plan: createLocalJsonStore(() => storage, {
      key: KEYS.plan,
      empty: EMPTY_PROGRESS,
      parse: parsePlanProgress,
    }),
    profile: createLocalJsonStore(() => storage, {
      key: KEYS.profile,
      empty: EMPTY_ACCOUNT_PROFILE,
      parse: parseAccountProfile,
    }),
  };
  const sync = createAccountSync({
    actions,
    stores,
    isActive: () => true,
    onSignedOut: () => undefined,
  });
  return { sync, stores };
}

// What the browser does in every other tab after one tab writes a key.
function broadcast(key: string): void {
  window.dispatchEvent(new StorageEvent("storage", { key }));
}

function value<T>(store: { getSnapshot: () => { status: string; value?: T } }): T {
  const state = store.getSnapshot();
  if (state.value === undefined) throw new Error("not ready");
  return state.value;
}

describe("two tabs of one account", () => {
  it("does not write a saved programme from the other tab out of the shared cache", async () => {
    const storage = createFakeStorage();
    const { actions } = server();
    const a = tab(storage, actions);
    const b = tab(storage, actions);
    b.sync.saveProgram(item("xx-from-b"));
    await settle();
    broadcast(KEYS.saved);
    a.sync.saveProgram(item("xx-from-a"));
    expect(value<{ items: SavedProgram[] }>(a.stores.saved).items.map((s) => s.slug)).toEqual([
      "xx-from-b",
      "xx-from-a",
    ]);
    await settle();
    expect(JSON.parse(storage.raw(KEYS.saved) ?? "{}").items).toHaveLength(2);
  });

  it("keeps ticks the other tab made on another programme", async () => {
    const storage = createFakeStorage();
    const { actions } = server();
    const a = tab(storage, actions);
    const b = tab(storage, actions);
    b.sync.setStepDone("xx-b", "visa", true);
    await settle();
    broadcast(KEYS.plan);
    a.sync.setStepDone("xx-a", "submit", true);
    await settle();
    expect(value<{ done: Record<string, string[]> }>(a.stores.plan).done).toEqual({
      "xx-b": ["visa"],
      "xx-a": ["submit"],
    });
  });

  it("sends a profile save against the revision the other tab reached, without a conflict", async () => {
    const storage = createFakeStorage();
    const { actions, profileCalls } = server();
    const a = tab(storage, actions);
    const b = tab(storage, actions);
    b.sync.saveProfile(PROFILE);
    await settle();
    broadcast(KEYS.profile);
    const MINE: Profile = { ...PROFILE, destinations: ["IT"] };
    a.sync.saveProfile(MINE);
    await settle();
    expect(profileCalls.at(-1)).toEqual([MINE, 1]);
    expect(a.sync.getStatus().conflict).toBeNull();
    expect(value<{ revision: number }>(a.stores.profile).revision).toBe(2);
  });

  it("asks the server when the other tab writes while this tab has a change in flight", async () => {
    const storage = createFakeStorage();
    const { actions } = server();
    let loads = 0;
    const counted = {
      ...actions,
      loadAccountData: () => {
        loads += 1;
        return actions.loadAccountData();
      },
    };
    const a = tab(storage, counted);
    const b = tab(storage, counted);
    a.sync.saveProgram(item("xx-from-a"));
    b.sync.saveProgram(item("xx-from-b"));
    broadcast(KEYS.saved);
    await settle();
    await settle();
    expect(loads).toBeGreaterThan(0);
    expect(
      value<{ items: SavedProgram[] }>(a.stores.saved)
        .items.map((s) => s.slug)
        .sort(),
    ).toEqual(["xx-from-a", "xx-from-b"]);
  });
});
