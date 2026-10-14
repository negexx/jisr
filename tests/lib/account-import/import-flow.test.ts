// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ACCOUNT_PROFILE_KEY, ACCOUNT_SAVED_KEY } from "@/lib/account-cache";
import { readGuestData, withoutRenamedDuplicates } from "@/lib/account-import/guest-data";
import { runPostAuthSeam } from "@/lib/auth/post-auth";
import { AUTH_HINT_KEY, clearAccountLocalState, setSessionHint } from "@/lib/auth/session-hint";
import { PLAN_KEY } from "@/lib/plan/progress";
import { planStore } from "@/lib/plan/store";
import { DRAFT_KEY, PROFILE_KEY } from "@/lib/profile/storage";
import { SAVED_KEY, type SavedProgram } from "@/lib/saved/saved";
import { savedStore } from "@/lib/saved/store";
import type { GuestImportPayload, ImportMode, ImportResult } from "@/lib/server/import";

import { profile } from "../../fixtures/domain/builders";

// The client half of the guest import: what the post-auth step reads, sends and clears. The
// Server Action, the sync layer and the snapshot client are stood in for; the server half is
// tests/lib/server/import.test.ts.

const server = vi.hoisted(() => ({
  importGuestData:
    vi.fn<(payload: GuestImportPayload, mode: ImportMode) => Promise<ImportResult>>(),
  hydrateAccountData: vi.fn<() => Promise<void>>(),
  load: vi.fn<() => Promise<{ aliases?: Record<string, string> }>>(),
}));

vi.mock("@/lib/server/import", () => ({ importGuestData: server.importGuestData }));
vi.mock("@/lib/account-sync/client", () => ({ hydrateAccountData: server.hydrateAccountData }));
vi.mock("@/lib/snapshot/use-snapshot", () => ({
  getSnapshotClient: () => ({ load: server.load }),
}));

function item(slug: string): SavedProgram {
  return {
    slug,
    country: "FR",
    field: "computer-science",
    snapshotVersion: "0123456789ab",
    savedAt: "2026-10-02",
  };
}

const GUEST_PROFILE = profile();
const SAVED = { schemaVersion: 1, items: [item("xx-a"), item("xx-b")] };
const PLAN = { schemaVersion: 1, done: { "xx-a": ["visa"] } };
const ACCOUNT_CACHE = JSON.stringify({ schemaVersion: 1, items: [item("xx-server")] });

function seedGuest(): void {
  window.localStorage.setItem(PROFILE_KEY, JSON.stringify(GUEST_PROFILE));
  window.localStorage.setItem(SAVED_KEY, JSON.stringify(SAVED));
  window.localStorage.setItem(PLAN_KEY, JSON.stringify(PLAN));
  window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ schemaVersion: 1, step: 1 }));
}

function guestKeys(): Record<string, string | null> {
  return Object.fromEntries(
    [PROFILE_KEY, SAVED_KEY, PLAN_KEY, DRAFT_KEY].map((key) => [
      key,
      window.localStorage.getItem(key),
    ]),
  );
}

beforeEach(() => {
  window.localStorage.clear();
  server.importGuestData.mockReset();
  server.hydrateAccountData.mockReset();
  server.hydrateAccountData.mockResolvedValue(undefined);
  server.load.mockReset();
  server.load.mockResolvedValue({ aliases: {} });
});

afterEach(() => {
  window.localStorage.clear();
});

describe("runPostAuthSeam", () => {
  it("does nothing more for a device with no guest data", async () => {
    setSessionHint();
    expect(await runPostAuthSeam("fr")).toBe("done");
    expect(server.load).not.toHaveBeenCalled();
    expect(server.importGuestData).not.toHaveBeenCalled();
  });

  it("sends the guest data as the guest parsers read it, then clears exactly the claimed keys", async () => {
    seedGuest();
    setSessionHint();
    window.localStorage.setItem(ACCOUNT_SAVED_KEY, ACCOUNT_CACHE);
    server.importGuestData.mockResolvedValue({ ok: true, value: undefined });

    expect(await runPostAuthSeam("fr")).toBe("done");

    expect(server.importGuestData).toHaveBeenCalledExactlyOnceWith(
      { profile: GUEST_PROFILE, saved: SAVED.items, plan: PLAN.done },
      "auto",
    );
    expect(guestKeys()).toEqual({
      [PROFILE_KEY]: null,
      [SAVED_KEY]: null,
      [PLAN_KEY]: null,
      // The unfinished form is not part of an import, and stays the guest's.
      [DRAFT_KEY]: JSON.stringify({ schemaVersion: 1, step: 1 }),
    });
    expect(window.localStorage.getItem(AUTH_HINT_KEY)).toBe("true");
    expect(window.localStorage.getItem(ACCOUNT_SAVED_KEY)).toBe(ACCOUNT_CACHE);
    expect(server.hydrateAccountData).toHaveBeenCalledTimes(1);
  });

  it("leaves the guest stores empty once signed out after the import (the data now lives in the account)", async () => {
    seedGuest();
    setSessionHint();
    server.importGuestData.mockResolvedValue({ ok: true, value: undefined });
    await runPostAuthSeam("fr");
    clearAccountLocalState();
    const saved = savedStore.getSnapshot();
    expect(saved.status === "ready" && saved.value.items).toEqual([]);
    const plan = planStore.getSnapshot();
    expect(plan.status === "ready" && plan.value.done).toEqual({});
  });

  it("passes the student's replace choice through", async () => {
    seedGuest();
    server.importGuestData.mockResolvedValue({ ok: true, value: undefined });
    expect(await runPostAuthSeam("ar", "replace")).toBe("done");
    expect(server.importGuestData).toHaveBeenCalledWith(expect.anything(), "replace");
    expect(server.load).toHaveBeenCalledWith({ structural: [] }, "ar");
  });

  it("asks the student when the account already holds data, and keeps every guest key", async () => {
    seedGuest();
    setSessionHint();
    const before = guestKeys();
    server.importGuestData.mockResolvedValue({ ok: false, error: "has_server_data" });

    expect(await runPostAuthSeam("fr")).toBe("choose");
    expect(guestKeys()).toEqual(before);
    expect(server.hydrateAccountData).not.toHaveBeenCalled();
  });

  it("keeps the device's data through sign-out after 'keep', and offers it again at the next sign-in", async () => {
    seedGuest();
    setSessionHint();
    const before = guestKeys();
    server.importGuestData.mockResolvedValue({ ok: false, error: "has_server_data" });
    await runPostAuthSeam("fr");

    clearAccountLocalState();
    expect(guestKeys()).toEqual(before);
    const saved = savedStore.getSnapshot();
    expect(saved.status === "ready" && saved.value.items.map((entry) => entry.slug)).toEqual([
      "xx-a",
      "xx-b",
    ]);

    setSessionHint();
    expect(await runPostAuthSeam("fr")).toBe("choose");
    expect(server.importGuestData).toHaveBeenCalledTimes(2);
  });

  it.each<[string, () => void]>([
    [
      "the action refuses",
      () => server.importGuestData.mockResolvedValue({ ok: false, error: "unauthenticated" }),
    ],
    ["the action throws", () => server.importGuestData.mockRejectedValue(new Error("offline"))],
    ["the manifest does not load", () => server.load.mockRejectedValue(new Error("offline"))],
  ])("reports a failure and changes nothing when %s", async (_label, arrange) => {
    seedGuest();
    const before = guestKeys();
    arrange();
    expect(await runPostAuthSeam("fr")).toBe("failed");
    expect(guestKeys()).toEqual(before);
  });

  it("sends a programme saved under a former and a current slug once", async () => {
    window.localStorage.setItem(
      SAVED_KEY,
      JSON.stringify({ schemaVersion: 1, items: [item("xx-old"), item("xx-b"), item("xx-new")] }),
    );
    server.load.mockResolvedValue({ aliases: { "xx-old": "xx-new" } });
    server.importGuestData.mockResolvedValue({ ok: true, value: undefined });
    await runPostAuthSeam("fr");
    const [payload] = server.importGuestData.mock.calls[0] ?? [];
    expect(payload?.saved.map((entry) => entry.slug)).toEqual(["xx-old", "xx-b"]);
  });
});

describe("readGuestData", () => {
  it("leaves out what the account's input bounds would refuse, so the rest still imports", () => {
    const long = `xx-${"a".repeat(130)}`;
    window.localStorage.setItem(
      SAVED_KEY,
      JSON.stringify({
        schemaVersion: 1,
        items: [item(long), { ...item("xx-wide"), field: `f${"-x".repeat(40)}` }, item("xx-ok")],
      }),
    );
    window.localStorage.setItem(
      PLAN_KEY,
      JSON.stringify({ schemaVersion: 1, done: { [long]: ["visa"], "xx-ok": ["visa"] } }),
    );
    expect(readGuestData(window.localStorage)).toEqual({
      profile: null,
      saved: [item("xx-ok")],
      plan: { "xx-ok": ["visa"] },
    });
  });

  it("keeps entries exactly at the bounds", () => {
    const slug = `xx-${"a".repeat(117)}`;
    const field = `f${"a".repeat(63)}`;
    window.localStorage.setItem(
      SAVED_KEY,
      JSON.stringify({ schemaVersion: 1, items: [{ ...item(slug), field }] }),
    );
    expect(readGuestData(window.localStorage)?.saved).toEqual([{ ...item(slug), field }]);
  });

  it("ignores an unreadable profile and corrupt lists, and reports nothing to import", () => {
    window.localStorage.setItem(PROFILE_KEY, "{not json");
    window.localStorage.setItem(SAVED_KEY, JSON.stringify({ schemaVersion: 9, items: [] }));
    window.localStorage.setItem(PLAN_KEY, "[]");
    expect(readGuestData(window.localStorage)).toBeNull();
  });

  it("never reads the account cache", () => {
    window.localStorage.setItem(ACCOUNT_SAVED_KEY, ACCOUNT_CACHE);
    window.localStorage.setItem(
      ACCOUNT_PROFILE_KEY,
      JSON.stringify({ schemaVersion: 1, profile: GUEST_PROFILE, revision: 1 }),
    );
    expect(readGuestData(window.localStorage)).toBeNull();
  });

  it("returns null without storage", () => {
    expect(readGuestData(null)).toBeNull();
  });
});

describe("withoutRenamedDuplicates", () => {
  it("keeps the first saved entry of a renamed programme, through a chain of renames", () => {
    expect(
      withoutRenamedDuplicates([item("xx-new"), item("xx-a"), item("xx-old"), item("xx-older")], {
        aliases: { "xx-older": "xx-new", "xx-old": "xx-new" },
      }).map((entry) => entry.slug),
    ).toEqual(["xx-new", "xx-a"]);
  });

  it("changes nothing without an alias map", () => {
    expect(withoutRenamedDuplicates([item("xx-a"), item("xx-b")], {})).toHaveLength(2);
  });
});
