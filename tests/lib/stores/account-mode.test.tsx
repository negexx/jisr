// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Profile } from "@/data-schema/profile";
import { ACCOUNT_PLAN_KEY, ACCOUNT_PROFILE_KEY, ACCOUNT_SAVED_KEY } from "@/lib/account-cache";
import { AUTH_HINT_KEY, clearAccountLocalState, setSessionHint } from "@/lib/auth/session-hint";
import { clearAllLocalData } from "@/lib/local-data";
import { PLAN_KEY } from "@/lib/plan/progress";
import { forgetProgress, planStore, setStepDone } from "@/lib/plan/store";
import { DRAFT_KEY, PROFILE_KEY } from "@/lib/profile/storage";
import { profileStore } from "@/lib/profile/store";
import { removeFromPlan } from "@/lib/saved/actions";
import { SAVED_KEY } from "@/lib/saved/saved";
import { savedStore } from "@/lib/saved/store";
import { useSaved } from "@/lib/saved/use-saved";

// The signed-in switch in the stores: with the `jisr.auth` hint they show the account cache
// (`jisr.account.*`, ruling P6) and hand mutations to the lazily loaded sync layer; the guest's
// own keys are neither read nor written. The sync layer itself is mocked here
// (tests/lib/stores/server-backed.test.ts covers it).

const sync = vi.hoisted(() => ({
  toggleSaved: vi.fn(() => ({ ok: true, saved: true, persisted: true })),
  unsaveProgram: vi.fn(),
  setStepDone: vi.fn(),
  forgetProgress: vi.fn(),
  saveProfile: vi.fn(),
}));

// Stands in for the lazy chunk; everything else in account-cache is the real module.
vi.mock("@/lib/account-cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/account-cache")>()),
  loadAccountSync: async () => ({ accountSync: sync }),
}));

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

const item = (slug: string) => ({
  slug,
  country: "FR",
  field: "computer-science",
  snapshotVersion: "0123456789ab",
  savedAt: "2026-10-14",
});

const GUEST_SAVED = JSON.stringify({ schemaVersion: 1, items: [item("xx-guest")] });
const GUEST_PLAN = JSON.stringify({ schemaVersion: 1, done: { "xx-guest": ["visa"] } });
const GUEST_PROFILE = JSON.stringify({ ...PROFILE, destinations: ["NL"] });

function seedGuest(): void {
  window.localStorage.setItem(SAVED_KEY, GUEST_SAVED);
  window.localStorage.setItem(PLAN_KEY, GUEST_PLAN);
  window.localStorage.setItem(PROFILE_KEY, GUEST_PROFILE);
}

function seedAccount(): void {
  window.localStorage.setItem(
    ACCOUNT_SAVED_KEY,
    JSON.stringify({ schemaVersion: 1, items: [item("xx-account")] }),
  );
  window.localStorage.setItem(
    ACCOUNT_PLAN_KEY,
    JSON.stringify({ schemaVersion: 1, done: { "xx-account": ["submit"] } }),
  );
  window.localStorage.setItem(
    ACCOUNT_PROFILE_KEY,
    JSON.stringify({ schemaVersion: 1, profile: PROFILE, revision: 3 }),
  );
}

function savedSlugs(): string[] {
  const state = savedStore.getSnapshot();
  return state.status === "ready" ? state.value.items.map((saved) => saved.slug) : [];
}

function guestBytes(): (string | null)[] {
  return [SAVED_KEY, PLAN_KEY, PROFILE_KEY].map((key) => window.localStorage.getItem(key));
}

// The sync layer is loaded asynchronously: let it resolve.
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  window.localStorage.clear();
  savedStore.reload();
  planStore.reload();
  for (const mock of Object.values(sync)) mock.mockClear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("without the sign-in hint", () => {
  it("serves and writes the guest keys and never creates an account key", () => {
    seedGuest();
    seedAccount();
    expect(savedSlugs()).toEqual(["xx-guest"]);
    setStepDone("xx-guest", "documents", true);
    expect(window.localStorage.getItem(PLAN_KEY)).toContain("documents");
    expect(sync.setStepDone).not.toHaveBeenCalled();
  });
});

describe("with the sign-in hint", () => {
  beforeEach(() => {
    seedGuest();
    seedAccount();
    setSessionHint();
  });

  it("shows the account cache, not the guest data", () => {
    expect(savedSlugs()).toEqual(["xx-account"]);
    const plan = planStore.getSnapshot();
    expect(plan.status === "ready" && plan.value.done).toEqual({ "xx-account": ["submit"] });
    expect(profileStore.getSnapshot()).toEqual({
      status: "ok",
      profile: PROFILE,
      storageAvailable: true,
    });
    expect(profileStore.getSnapshot()).toBe(profileStore.getSnapshot());
  });

  it("hands every mutation to the sync layer and leaves the guest keys byte-identical", async () => {
    const before = guestBytes();
    window.localStorage.setItem(DRAFT_KEY, "{}");
    setStepDone("xx-account", "visa", true);
    forgetProgress("xx-account");
    removeFromPlan("xx-account");
    expect(profileStore.save(PROFILE)).toEqual({ ok: true, persisted: true });
    expect(profileStore.save({ nationality: "nowhere" })).toEqual({ ok: false, reason: "invalid" });
    const { result } = renderHook(() => useSaved());
    await act(async () => {
      await result.current.toggle(
        { slug: "xx-new", country: "FR", field: "computer-science" },
        "0123456789ab",
      );
    });
    await flush();
    expect(sync.setStepDone).toHaveBeenCalledWith("xx-account", "visa", true);
    expect(sync.forgetProgress).toHaveBeenCalledWith("xx-account");
    expect(sync.unsaveProgram).toHaveBeenCalledWith("xx-account");
    expect(sync.saveProfile).toHaveBeenCalledTimes(1);
    expect(sync.saveProfile).toHaveBeenCalledWith(PROFILE);
    expect(sync.toggleSaved).toHaveBeenCalledTimes(1);
    expect(guestBytes()).toEqual(before);
    // The form's draft is done with once the save is accepted, as for a guest.
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("goes back to the untouched guest data when the device signs out", () => {
    const { result } = renderHook(() => useSaved());
    expect(result.current.items.map((saved) => saved.slug)).toEqual(["xx-account"]);
    act(() => {
      clearAccountLocalState();
    });
    expect(result.current.items.map((saved) => saved.slug)).toEqual(["xx-guest"]);
    expect(window.localStorage.getItem(ACCOUNT_SAVED_KEY)).toBeNull();
    expect(window.localStorage.getItem(SAVED_KEY)).toBe(GUEST_SAVED);
  });

  it("follows clear my data, which removes the hint without telling anyone", () => {
    const { result } = renderHook(() => useSaved());
    act(() => {
      clearAllLocalData();
    });
    expect(window.localStorage.getItem(AUTH_HINT_KEY)).toBeNull();
    expect(result.current.items).toEqual([]);
    expect(profileStore.getSnapshot()).toMatchObject({ status: "none" });
  });
});
