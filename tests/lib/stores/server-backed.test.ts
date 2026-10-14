import { describe, expect, it, vi } from "vitest";

import type { Profile } from "@/data-schema/profile";
import type { ChecklistStepId } from "@/domain/types";
import { type AccountSync, createAccountSync, type SyncActions } from "@/lib/account-sync/sync";
import { createLocalJsonStore, type LocalJsonStore } from "@/lib/local-store";
import { EMPTY_PROGRESS, type PlanProgress, parsePlanProgress } from "@/lib/plan/progress";
import {
  type AccountProfile,
  EMPTY_ACCOUNT_PROFILE,
  parseAccountProfile,
} from "@/lib/profile/account-profile";
import { EMPTY_SAVED, parseSaved, type SavedList, type SavedProgram } from "@/lib/saved/saved";
import type { AccountData, ActionResult, SaveProfileResult } from "@/lib/server/account-actions";

import { createFakeStorage, type FakeStorage } from "../profile/fake-storage";

// The signed-in store contract (todo 14), with the Server Actions mocked: every mutation shows at
// once, is sent in order, reconciles to what the server returns, and on failure rolls back only
// itself and raises a notice the UI renders.

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (e: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

// Lets every queued continuation run.
async function settle(): Promise<void> {
  for (let round = 0; round < 10; round += 1) await Promise.resolve();
}

function item(slug: string): SavedProgram {
  return {
    slug,
    country: "FR",
    field: "computer-science",
    snapshotVersion: "0123456789ab",
    savedAt: "2026-10-14",
  };
}

function list(...slugs: string[]): SavedList {
  return { schemaVersion: 1, items: slugs.map(item) };
}

function progress(done: Record<string, ChecklistStepId[]>): PlanProgress {
  return { schemaVersion: 1, done };
}

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
const OTHER_DEVICE: Profile = { ...PROFILE, destinations: ["NL"] };
const MINE: Profile = { ...PROFILE, destinations: ["IT"] };

type Calls = {
  [K in keyof SyncActions]: Array<{
    args: Parameters<SyncActions[K]>;
    reply: Deferred<Awaited<ReturnType<SyncActions[K]>>>;
  }>;
};

function setup(seed: { saved?: SavedList; plan?: PlanProgress; profile?: AccountProfile } = {}) {
  const storage: FakeStorage = createFakeStorage();
  if (seed.saved) storage.seed("jisr.account.saved", JSON.stringify(seed.saved));
  if (seed.plan) storage.seed("jisr.account.plan", JSON.stringify(seed.plan));
  if (seed.profile) storage.seed("jisr.account.profile", JSON.stringify(seed.profile));
  const stores = {
    saved: createLocalJsonStore(() => storage, {
      key: "jisr.account.saved",
      empty: EMPTY_SAVED,
      parse: parseSaved,
    }),
    plan: createLocalJsonStore(() => storage, {
      key: "jisr.account.plan",
      empty: EMPTY_PROGRESS,
      parse: parsePlanProgress,
    }),
    profile: createLocalJsonStore(() => storage, {
      key: "jisr.account.profile",
      empty: EMPTY_ACCOUNT_PROFILE,
      parse: parseAccountProfile,
    }),
  };
  const calls: Calls = {
    loadAccountData: [],
    saveProgram: [],
    unsaveProgram: [],
    setStepDone: [],
    forgetProgress: [],
    saveProfile: [],
  };
  function mock<K extends keyof SyncActions>(name: K) {
    return (...args: Parameters<SyncActions[K]>) => {
      const reply = deferred<Awaited<ReturnType<SyncActions[K]>>>();
      (calls[name] as Array<unknown>).push({ args, reply });
      return reply.promise;
    };
  }
  const actions = {
    loadAccountData: mock("loadAccountData"),
    saveProgram: mock("saveProgram"),
    unsaveProgram: mock("unsaveProgram"),
    setStepDone: mock("setStepDone"),
    forgetProgress: mock("forgetProgress"),
    saveProfile: mock("saveProfile"),
  } as SyncActions;
  const onSignedOut = vi.fn();
  const sync = createAccountSync({ actions, stores, isActive: () => true, onSignedOut });
  return { sync, stores, storage, calls, onSignedOut };
}

function value<T>(store: LocalJsonStore<T>): T {
  const state = store.getSnapshot();
  if (state.status !== "ready") throw new Error("store not ready");
  return state.value;
}

function slugs(store: LocalJsonStore<SavedList>): string[] {
  return value(store).items.map((saved) => saved.slug);
}

function call<K extends keyof SyncActions>(calls: Calls, name: K, index: number) {
  const found = calls[name][index];
  if (found === undefined) throw new Error(`no call ${index} to ${name}`);
  return found as Calls[K][number];
}

const savedReply = (...s: string[]): ActionResult<{ items: SavedProgram[] }> => ({
  ok: true,
  value: { items: s.map(item) },
});

describe("saved programmes, signed in", () => {
  it("shows a save before the action resolves, then reconciles to the server list", async () => {
    const { sync, stores, calls } = setup({ saved: list("xx-a") });
    expect(
      sync.toggleSaved(
        { slug: "xx-b", country: "FR", field: "computer-science" },
        "0123456789ab",
        "2026-10-14",
      ),
    ).toEqual({ ok: true, saved: true, persisted: true });
    expect(slugs(stores.saved)).toEqual(["xx-a", "xx-b"]);
    await settle();
    expect(call(calls, "saveProgram", 0).args).toEqual([item("xx-b")]);
    // The server also holds a programme another device saved.
    call(calls, "saveProgram", 0).reply.resolve(savedReply("xx-a", "xx-other", "xx-b"));
    await settle();
    expect(slugs(stores.saved)).toEqual(["xx-a", "xx-other", "xx-b"]);
    expect(sync.getStatus().notice).toBeNull();
  });

  it("rolls a refused save back to the pre-mutation snapshot and raises the notice", async () => {
    const { sync, stores, calls } = setup({ saved: list("xx-a") });
    const before = value(stores.saved);
    sync.saveProgram(item("xx-b"));
    await settle();
    call(calls, "saveProgram", 0).reply.resolve({ ok: false, error: "saved_limit" });
    await settle();
    expect(value(stores.saved)).toEqual(before);
    expect(sync.getStatus().notice).toMatchObject({ kind: "savedLimit" });
  });

  it("rolls back and raises the generic notice when the action itself fails", async () => {
    const { sync, stores, calls } = setup({ saved: list("xx-a") });
    const before = value(stores.saved);
    sync.saveProgram(item("xx-b"));
    await settle();
    call(calls, "saveProgram", 0).reply.reject(new Error("network"));
    await settle();
    expect(value(stores.saved)).toEqual(before);
    expect(sync.getStatus().notice).toMatchObject({ kind: "failed" });
  });

  it("sends overlapping ops in order and rolls back only the one that failed", async () => {
    const { sync, stores, calls } = setup({ saved: list("xx-a") });
    sync.saveProgram(item("xx-x"));
    sync.saveProgram(item("xx-y"));
    expect(slugs(stores.saved)).toEqual(["xx-a", "xx-x", "xx-y"]);
    await settle();
    // Y waits for X: one operation per store at a time, in the order they were made.
    expect(calls.saveProgram).toHaveLength(1);
    call(calls, "saveProgram", 0).reply.resolve({ ok: false, error: "invalid" });
    await settle();
    expect(slugs(stores.saved)).toEqual(["xx-a", "xx-y"]);
    expect(sync.getStatus().notice).toMatchObject({ kind: "failed" });
    expect(call(calls, "saveProgram", 1).args).toEqual([item("xx-y")]);
    call(calls, "saveProgram", 1).reply.resolve(savedReply("xx-a", "xx-y"));
    await settle();
    expect(slugs(stores.saved)).toEqual(["xx-a", "xx-y"]);
  });

  it("keeps a later op's optimistic effect while an earlier one reconciles", async () => {
    const { sync, stores, calls } = setup({ saved: list("xx-a") });
    sync.saveProgram(item("xx-x"));
    sync.unsaveProgram("xx-a");
    expect(slugs(stores.saved)).toEqual(["xx-x"]);
    await settle();
    call(calls, "saveProgram", 0).reply.resolve(savedReply("xx-a", "xx-x"));
    await settle();
    // The server list still has xx-a, but the pending unsave is applied on top of it.
    expect(slugs(stores.saved)).toEqual(["xx-x"]);
  });

  it("refuses a save over the cap without sending anything", () => {
    const full = list(...Array.from({ length: 12 }, (_, index) => `xx-${index}`));
    const { sync, calls } = setup({ saved: full });
    expect(
      sync.toggleSaved(
        { slug: "xx-new", country: "FR", field: "computer-science" },
        "0123456789ab",
        "2026-10-14",
      ),
    ).toEqual({ ok: false, reason: "full" });
    expect(calls.saveProgram).toHaveLength(0);
  });

  it("toggles a saved programme off, hides its ticks at once and forgets them on success", async () => {
    const { sync, stores, calls } = setup({
      saved: list("xx-a", "xx-b"),
      plan: progress({ "xx-a": ["visa"], "xx-b": ["visa"] }),
    });
    expect(
      sync.toggleSaved(
        { slug: "xx-a", country: "FR", field: "computer-science" },
        "0123456789ab",
        "2026-10-14",
      ),
    ).toEqual({ ok: true, saved: false, persisted: true });
    expect(slugs(stores.saved)).toEqual(["xx-b"]);
    expect(value(stores.plan).done).toEqual({ "xx-b": ["visa"] });
    await settle();
    call(calls, "unsaveProgram", 0).reply.resolve(savedReply("xx-b"));
    await settle();
    expect(value(stores.plan).done).toEqual({ "xx-b": ["visa"] });
    // The server's unsave deleted the ticks: no second request for them.
    expect(calls.forgetProgress).toHaveLength(0);
  });

  it("restores the programme and its ticks when an unsave fails", async () => {
    const { sync, stores, calls } = setup({
      saved: list("xx-a"),
      plan: progress({ "xx-a": ["visa"] }),
    });
    sync.unsaveProgram("xx-a");
    await settle();
    call(calls, "unsaveProgram", 0).reply.resolve({ ok: false, error: "consent_required" });
    await settle();
    expect(slugs(stores.saved)).toEqual(["xx-a"]);
    expect(value(stores.plan).done).toEqual({ "xx-a": ["visa"] });
    expect(sync.getStatus().notice).toMatchObject({ kind: "consentRequired" });
  });

  it("signs the device out and says so when the server no longer knows the session", async () => {
    const { sync, calls, onSignedOut } = setup();
    sync.saveProgram(item("xx-a"));
    await settle();
    call(calls, "saveProgram", 0).reply.resolve({ ok: false, error: "unauthenticated" });
    await settle();
    expect(onSignedOut).toHaveBeenCalledTimes(1);
    expect(sync.getStatus().notice).toMatchObject({ kind: "signedOut" });
  });
});

describe("plan progress, signed in", () => {
  it("shows a tick at once and reconciles the programme's steps to the server's", async () => {
    const { sync, stores, calls } = setup({ plan: progress({ "xx-a": ["documents"] }) });
    sync.setStepDone("xx-a", "visa", true);
    expect(value(stores.plan).done).toEqual({ "xx-a": ["documents", "visa"] });
    await settle();
    expect(call(calls, "setStepDone", 0).args).toEqual(["xx-a", "visa", true]);
    // Another device unticked documents meanwhile.
    call(calls, "setStepDone", 0).reply.resolve({ ok: true, value: { steps: ["visa"] } });
    await settle();
    expect(value(stores.plan).done).toEqual({ "xx-a": ["visa"] });
  });

  it("rolls back a tick refused at the plan cap with the cap notice, not a bad-input one", async () => {
    const { sync, stores, calls } = setup({ plan: progress({ "xx-a": ["documents"] }) });
    const before = value(stores.plan);
    sync.setStepDone("xx-new", "visa", true);
    await settle();
    call(calls, "setStepDone", 0).reply.resolve({ ok: false, error: "invalid" });
    await settle();
    expect(value(stores.plan)).toEqual(before);
    expect(sync.getStatus().notice).toMatchObject({ kind: "planLimit" });
  });

  it("forgets a programme's ticks through forgetProgress", async () => {
    const { sync, stores, calls } = setup({
      plan: progress({ "xx-a": ["visa"], "xx-b": ["visa"] }),
    });
    sync.forgetProgress("xx-a");
    expect(value(stores.plan).done).toEqual({ "xx-b": ["visa"] });
    await settle();
    call(calls, "forgetProgress", 0).reply.resolve({ ok: true, value: undefined });
    await settle();
    expect(value(stores.plan).done).toEqual({ "xx-b": ["visa"] });
  });
});

describe("profile, signed in", () => {
  const cached = (profile: Profile | null, revision: number): AccountProfile => ({
    schemaVersion: 1,
    profile,
    revision,
  });

  it("shows the saved profile at once and sends it against the cached revision", async () => {
    const { sync, stores, calls } = setup({ profile: cached(PROFILE, 3) });
    sync.saveProfile(MINE);
    expect(value(stores.profile)).toEqual(cached(MINE, 3));
    await settle();
    expect(call(calls, "saveProfile", 0).args).toEqual([MINE, 3]);
    call(calls, "saveProfile", 0).reply.resolve({ ok: true, value: { revision: 4 } });
    await settle();
    expect(value(stores.profile)).toEqual(cached(MINE, 4));
  });

  it("sends the next save against the revision the previous one returned", async () => {
    const { sync, calls } = setup({ profile: cached(PROFILE, 1) });
    sync.saveProfile(MINE);
    sync.saveProfile(OTHER_DEVICE);
    await settle();
    call(calls, "saveProfile", 0).reply.resolve({ ok: true, value: { revision: 2 } });
    await settle();
    expect(call(calls, "saveProfile", 1).args).toEqual([OTHER_DEVICE, 2]);
  });

  describe("a conflict", () => {
    async function conflicted() {
      const context = setup({ profile: cached(PROFILE, 1) });
      context.sync.saveProfile(MINE);
      await settle();
      const conflict: SaveProfileResult = {
        ok: false,
        error: "conflict",
        current: { profile: OTHER_DEVICE, revision: 2 },
      };
      call(context.calls, "saveProfile", 0).reply.resolve(conflict);
      await settle();
      return context;
    }

    it("keeps the student's values and offers the other device's version", async () => {
      const { sync, stores } = await conflicted();
      expect(value(stores.profile).profile).toEqual(MINE);
      expect(sync.getStatus().conflict).toEqual({ server: OTHER_DEVICE, revision: 2 });
      expect(sync.getStatus().notice).toBeNull();
    });

    it("adopts the other device's profile and revision on 'use the other version'", async () => {
      const { sync, stores, calls } = await conflicted();
      sync.resolveConflict("server");
      expect(value(stores.profile)).toEqual(cached(OTHER_DEVICE, 2));
      expect(sync.getStatus().conflict).toBeNull();
      await settle();
      expect(calls.saveProfile).toHaveLength(1);
    });

    it("resubmits the student's profile against the server revision on 'keep mine'", async () => {
      const { sync, stores, calls } = await conflicted();
      sync.resolveConflict("mine");
      expect(sync.getStatus().conflict).toBeNull();
      await settle();
      expect(call(calls, "saveProfile", 1).args).toEqual([MINE, 2]);
      call(calls, "saveProfile", 1).reply.resolve({ ok: true, value: { revision: 3 } });
      await settle();
      expect(value(stores.profile)).toEqual(cached(MINE, 3));
    });

    it("holds a later save instead of sending it over the other device's version", async () => {
      const { sync, stores, calls } = await conflicted();
      const LATER: Profile = { ...MINE, studyLanguages: ["en"] };
      sync.saveProfile(LATER);
      await settle();
      expect(calls.saveProfile).toHaveLength(1);
      expect(value(stores.profile).profile).toEqual(LATER);
      sync.resolveConflict("mine");
      await settle();
      expect(call(calls, "saveProfile", 1).args).toEqual([LATER, 2]);
    });
  });

  it("rolls back and reloads from the server when the save is refused as invalid", async () => {
    const { sync, stores, calls } = setup({ profile: cached(PROFILE, 5) });
    sync.saveProfile(MINE);
    await settle();
    call(calls, "saveProfile", 0).reply.resolve({ ok: false, error: "invalid" });
    await settle();
    expect(value(stores.profile)).toEqual(cached(PROFILE, 5));
    expect(sync.getStatus().notice).toMatchObject({ kind: "profileReloaded" });
    expect(calls.loadAccountData).toHaveLength(1);
    call(calls, "loadAccountData", 0).reply.resolve({
      ok: true,
      value: { profile: null, revision: 0, saved: [], plan: EMPTY_PROGRESS },
    });
    await settle();
    expect(value(stores.profile)).toEqual(cached(null, 0));
  });
});

describe("hydration", () => {
  const SERVER: AccountData = {
    profile: OTHER_DEVICE,
    revision: 7,
    saved: [item("xx-phone")],
    plan: progress({ "xx-phone": ["submit"] }),
  };

  it("replaces a stale cache with what another device left on the server", async () => {
    const { sync, stores, calls } = setup({
      saved: list("xx-stale"),
      plan: progress({ "xx-stale": ["visa"] }),
      profile: { schemaVersion: 1, profile: PROFILE, revision: 2 },
    });
    const done = sync.hydrate();
    await settle();
    call(calls, "loadAccountData", 0).reply.resolve({ ok: true, value: SERVER });
    await done;
    expect(slugs(stores.saved)).toEqual(["xx-phone"]);
    expect(value(stores.plan)).toEqual(SERVER.plan);
    expect(value(stores.profile)).toEqual({ schemaVersion: 1, profile: OTHER_DEVICE, revision: 7 });
  });

  it("waits for in-flight ops, and applies ops made meanwhile on top of the server state", async () => {
    const { sync, stores, calls } = setup({ saved: list("xx-a") });
    sync.saveProgram(item("xx-first"));
    const done = sync.hydrate();
    sync.saveProgram(item("xx-later"));
    await settle();
    expect(calls.loadAccountData).toHaveLength(0);
    call(calls, "saveProgram", 0).reply.resolve(savedReply("xx-a", "xx-first"));
    await settle();
    call(calls, "loadAccountData", 0).reply.resolve({
      ok: true,
      value: { ...SERVER, saved: [item("xx-a"), item("xx-first"), item("xx-phone")] },
    });
    await done;
    expect(slugs(stores.saved)).toEqual(["xx-a", "xx-first", "xx-phone", "xx-later"]);
    await settle();
    expect(call(calls, "saveProgram", 1).args).toEqual([item("xx-later")]);
  });

  it("shares one request between overlapping calls", async () => {
    const { sync, calls } = setup();
    const first = sync.hydrate();
    const second = sync.hydrate();
    expect(second).toBe(first);
    await settle();
    expect(calls.loadAccountData).toHaveLength(1);
  });

  it("rehydrate reads again after a hydration that was already running (the guest import)", async () => {
    const { sync, stores, calls } = setup();
    const early = sync.hydrate();
    const fresh = sync.rehydrate();
    await settle();
    expect(calls.loadAccountData).toHaveLength(1);
    call(calls, "loadAccountData", 0).reply.resolve({
      ok: true,
      value: { ...SERVER, saved: [] },
    });
    await early;
    await settle();
    expect(calls.loadAccountData).toHaveLength(2);
    call(calls, "loadAccountData", 1).reply.resolve({ ok: true, value: SERVER });
    await fresh;
    expect(slugs(stores.saved)).toEqual(["xx-phone"]);
  });

  it("rehydrate with nothing running sends one read", async () => {
    const { sync, calls } = setup();
    const fresh = sync.rehydrate();
    await settle();
    expect(calls.loadAccountData).toHaveLength(1);
    call(calls, "loadAccountData", 0).reply.resolve({ ok: true, value: SERVER });
    await fresh;
    expect(calls.loadAccountData).toHaveLength(1);
  });

  it("keeps the cache when the read fails, and signs out for an unknown session", async () => {
    const { sync, stores, calls, onSignedOut } = setup({ saved: list("xx-a") });
    const failed = sync.hydrate();
    await settle();
    call(calls, "loadAccountData", 0).reply.reject(new Error("offline"));
    await failed;
    expect(slugs(stores.saved)).toEqual(["xx-a"]);
    const refused = sync.hydrate();
    await settle();
    call(calls, "loadAccountData", 1).reply.resolve({ ok: false, error: "unauthenticated" });
    await refused;
    expect(onSignedOut).toHaveBeenCalledTimes(1);
  });

  it("keeps a held conflict and offers the newest server version", async () => {
    const { sync, stores, calls } = setup({
      profile: { schemaVersion: 1, profile: PROFILE, revision: 1 },
    });
    sync.saveProfile(MINE);
    await settle();
    call(calls, "saveProfile", 0).reply.resolve({
      ok: false,
      error: "conflict",
      current: { profile: PROFILE, revision: 2 },
    });
    await settle();
    const done = sync.hydrate();
    await settle();
    call(calls, "loadAccountData", 0).reply.resolve({ ok: true, value: SERVER });
    await done;
    expect(value(stores.profile).profile).toEqual(MINE);
    expect(sync.getStatus().conflict).toEqual({ server: OTHER_DEVICE, revision: 7 });
  });
});

describe("sign-out", () => {
  it("drops queued work and writes nothing to the cleared cache", async () => {
    const context = setup();
    let active = true;
    const sync: AccountSync = createAccountSync({
      actions: {
        ...Object.fromEntries(
          Object.keys(context.calls).map((name) => [name, () => new Promise(() => undefined)]),
        ),
        saveProgram: async () => savedReply("xx-a"),
      } as unknown as SyncActions,
      stores: context.stores,
      isActive: () => active,
      onSignedOut: () => undefined,
    });
    sync.saveProgram(item("xx-a"));
    active = false;
    context.storage.removeItem("jisr.account.saved");
    sync.reset();
    await settle();
    expect(context.storage.raw("jisr.account.saved")).toBeNull();
  });

  it("lets a dismissed notice go", async () => {
    const { sync, calls } = setup();
    sync.saveProgram(item("xx-a"));
    await settle();
    call(calls, "saveProgram", 0).reply.resolve({ ok: false, error: "rate_limited" });
    await settle();
    expect(sync.getStatus().notice).toMatchObject({ kind: "failed" });
    sync.dismissNotice();
    expect(sync.getStatus().notice).toBeNull();
  });
});
