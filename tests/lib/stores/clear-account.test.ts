// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ACCOUNT_DRAFT_KEY, ACCOUNT_PLAN_KEY, ACCOUNT_SAVED_KEY } from "@/lib/account-cache";
import { AUTH_HINT_KEY, setSessionHint } from "@/lib/auth/session-hint";
import { PLAN_KEY } from "@/lib/plan/progress";
import { DRAFT_KEY, PROFILE_KEY } from "@/lib/profile/storage";
import { SAVED_KEY } from "@/lib/saved/saved";
import { savedStore } from "@/lib/saved/store";

// Clear my data while signed in, on the device side: the account action is stood in for, the
// stores and keys are real.

const actions = vi.hoisted(() => ({ clearAccountData: vi.fn(), saveProgram: vi.fn() }));
vi.mock("@/lib/server/account-actions", () => ({
  clearAccountData: actions.clearAccountData,
  loadAccountData: vi.fn(),
  saveProgram: actions.saveProgram,
  unsaveProgram: vi.fn(),
  setStepDone: vi.fn(),
  forgetProgress: vi.fn(),
  saveProfile: vi.fn(),
}));
vi.mock("@/lib/auth/client", () => ({ authClient: { getSession: vi.fn() } }));

const SAVED = JSON.stringify({
  schemaVersion: 1,
  items: [
    {
      slug: "xx-a",
      country: "FR",
      field: "computer-science",
      snapshotVersion: "0123456789ab",
      savedAt: "2026-10-02",
    },
  ],
});
const PLAN = JSON.stringify({ schemaVersion: 1, done: { "xx-a": ["visa"] } });

function seed(): void {
  setSessionHint();
  for (const key of [SAVED_KEY, ACCOUNT_SAVED_KEY]) window.localStorage.setItem(key, SAVED);
  for (const key of [PLAN_KEY, ACCOUNT_PLAN_KEY]) window.localStorage.setItem(key, PLAN);
  for (const key of [PROFILE_KEY, DRAFT_KEY, ACCOUNT_DRAFT_KEY]) {
    window.localStorage.setItem(key, "{}");
  }
  window.localStorage.setItem("unrelated", "keep");
}

function keys(): string[] {
  return Object.keys(window.localStorage).sort();
}

beforeEach(() => {
  window.localStorage.clear();
  actions.clearAccountData.mockReset();
  actions.saveProgram.mockReset();
});
afterEach(() => window.localStorage.clear());

describe("clearAccountEverywhere", () => {
  it("after the server cleared: removes the guest data and the account cache, keeps the hint", async () => {
    seed();
    actions.clearAccountData.mockResolvedValue({ ok: true, value: undefined });
    const { clearAccountEverywhere } = await import("@/lib/account-sync/client");
    expect(await clearAccountEverywhere()).toBe("cleared");
    expect(keys()).toEqual([AUTH_HINT_KEY, "unrelated"].sort());
    const saved = savedStore.getSnapshot();
    expect(saved.status === "ready" && saved.value.items).toEqual([]);
  });

  it.each<[string, () => void]>([
    [
      "refuses",
      () => actions.clearAccountData.mockResolvedValue({ ok: false, error: "consent_required" }),
    ],
    ["throws", () => actions.clearAccountData.mockRejectedValue(new Error("offline"))],
  ])("removes nothing when the server %s", async (_label, arrange) => {
    seed();
    const before = keys();
    arrange();
    const { clearAccountEverywhere } = await import("@/lib/account-sync/client");
    expect(await clearAccountEverywhere()).toBe("failed");
    expect(keys()).toEqual(before);
  });

  it("signs the device out, keeping the guest's data, when the session is gone", async () => {
    seed();
    actions.clearAccountData.mockResolvedValue({ ok: false, error: "unauthenticated" });
    const { clearAccountEverywhere } = await import("@/lib/account-sync/client");
    expect(await clearAccountEverywhere()).toBe("signed_out");
    expect(keys()).toEqual([DRAFT_KEY, PLAN_KEY, PROFILE_KEY, SAVED_KEY, "unrelated"].sort());
  });

  it("waits for a save still on its way before clearing, so it cannot bring a row back", async () => {
    seed();
    let answerSave: (value: unknown) => void = () => undefined;
    actions.saveProgram.mockReturnValue(
      new Promise((resolve) => {
        answerSave = resolve;
      }),
    );
    actions.clearAccountData.mockResolvedValue({ ok: true, value: undefined });
    const { accountSync, clearAccountEverywhere } = await import("@/lib/account-sync/client");
    accountSync.saveProgram({
      slug: "xx-late",
      country: "FR",
      field: "computer-science",
      snapshotVersion: "0123456789ab",
      savedAt: "2026-10-02",
    });
    const clearing = clearAccountEverywhere();
    for (let round = 0; round < 10; round += 1) await Promise.resolve();
    expect(actions.saveProgram).toHaveBeenCalledTimes(1);
    expect(actions.clearAccountData).not.toHaveBeenCalled();

    answerSave({ ok: true, value: { items: [] } });
    expect(await clearing).toBe("cleared");
    expect(actions.clearAccountData).toHaveBeenCalledTimes(1);
    expect(actions.saveProgram.mock.invocationCallOrder[0]).toBeLessThan(
      actions.clearAccountData.mock.invocationCallOrder[0] ?? 0,
    );
  });
});
