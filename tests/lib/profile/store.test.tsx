// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeDraft } from "@/lib/profile/draft";
import { DRAFT_KEY, PROFILE_KEY } from "@/lib/profile/storage";
import { createProfileStore, type ProfileState } from "@/lib/profile/store";

import { profile } from "../../fixtures/domain/builders";
import { createFakeStorage } from "./fake-storage";
import { forbidConsole } from "./no-console";

forbidConsole();

function fireStorageEvent(key: string | null): void {
  window.dispatchEvent(new StorageEvent("storage", { key }));
}

async function loadHookModules() {
  vi.resetModules();
  const [{ useProfile }, { profileStore }] = await Promise.all([
    import("@/lib/profile/use-profile"),
    import("@/lib/profile/store"),
  ]);
  return { useProfile, profileStore };
}

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("createProfileStore", () => {
  it("serves an unhydrated server snapshot that never touches storage", () => {
    const getStorage = vi.fn(() => createFakeStorage());
    const store = createProfileStore(getStorage);
    expect(store.getServerSnapshot()).toEqual({ status: "unhydrated" });
    expect(store.getServerSnapshot()).toBe(store.getServerSnapshot());
    expect(getStorage).not.toHaveBeenCalled();
  });

  it("reads none, then a stored profile", () => {
    const storage = createFakeStorage();
    const store = createProfileStore(() => storage);
    const unsubscribe = store.subscribe(() => {});
    expect(store.getSnapshot()).toEqual({ status: "none", storageAvailable: true });
    storage.seed(PROFILE_KEY, JSON.stringify(profile()));
    fireStorageEvent(PROFILE_KEY);
    expect(store.getSnapshot()).toEqual({
      status: "ok",
      profile: profile(),
      storageAvailable: true,
    });
    unsubscribe();
  });

  it("returns a referentially stable snapshot while nothing changes", () => {
    const storage = createFakeStorage();
    storage.seed(PROFILE_KEY, JSON.stringify(profile()));
    const store = createProfileStore(() => storage);
    const first = store.getSnapshot();
    expect(store.getSnapshot()).toBe(first);
    const unsubscribe = store.subscribe(() => {});
    fireStorageEvent(PROFILE_KEY);
    expect(store.getSnapshot()).toBe(first);
    unsubscribe();
  });

  it("save validates, writes, clears the draft and notifies", () => {
    const storage = createFakeStorage();
    writeDraft(storage, { schemaVersion: 1, step: 2 });
    const store = createProfileStore(() => storage);
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.save(profile())).toEqual({ ok: true, persisted: true });
    expect(listener).toHaveBeenCalled();
    expect(store.getSnapshot()).toEqual({
      status: "ok",
      profile: profile(),
      storageAvailable: true,
    });
    expect(storage.raw(DRAFT_KEY)).toBeNull();
    expect(storage.keys()).toEqual([PROFILE_KEY]);
  });

  it("save refuses an invalid profile and keeps the draft", () => {
    const storage = createFakeStorage();
    writeDraft(storage, { schemaVersion: 1, step: 2 });
    const store = createProfileStore(() => storage);
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.save({ ...profile(), nationality: "nope" })).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(listener).not.toHaveBeenCalled();
    expect(storage.raw(DRAFT_KEY)).not.toBeNull();
    expect(storage.raw(PROFILE_KEY)).toBeNull();
  });

  it("stops notifying after unsubscribe", () => {
    const store = createProfileStore(() => createFakeStorage());
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.save(profile());
    fireStorageEvent(PROFILE_KEY);
    expect(listener).not.toHaveBeenCalled();
  });

  describe("cross-tab sync", () => {
    it("re-reads and notifies on a change to the profile key", () => {
      const storage = createFakeStorage();
      const store = createProfileStore(() => storage);
      store.getSnapshot();
      const listener = vi.fn();
      const unsubscribe = store.subscribe(listener);
      storage.seed(PROFILE_KEY, JSON.stringify(profile()));
      fireStorageEvent(PROFILE_KEY);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(store.getSnapshot().status).toBe("ok");
      unsubscribe();
    });

    it("ignores the draft key: the draft is not part of the profile state", () => {
      const store = createProfileStore(() => createFakeStorage());
      const listener = vi.fn();
      const unsubscribe = store.subscribe(listener);
      fireStorageEvent(DRAFT_KEY);
      expect(listener).not.toHaveBeenCalled();
      unsubscribe();
    });

    it("ignores events from a storage area other than the one in use", () => {
      const store = createProfileStore(() => window.localStorage);
      store.getSnapshot();
      const listener = vi.fn();
      const unsubscribe = store.subscribe(listener);
      window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile()));
      window.dispatchEvent(
        new StorageEvent("storage", { key: PROFILE_KEY, storageArea: window.sessionStorage }),
      );
      expect(listener).not.toHaveBeenCalled();
      expect(store.getSnapshot().status).toBe("none");
      window.dispatchEvent(
        new StorageEvent("storage", { key: PROFILE_KEY, storageArea: window.localStorage }),
      );
      expect(listener).toHaveBeenCalledTimes(1);
      expect(store.getSnapshot().status).toBe("ok");
      unsubscribe();
    });

    it("re-reads when another tab cleared all storage", () => {
      const storage = createFakeStorage();
      storage.seed(PROFILE_KEY, JSON.stringify(profile()));
      const store = createProfileStore(() => storage);
      expect(store.getSnapshot().status).toBe("ok");
      const unsubscribe = store.subscribe(() => {});
      storage.removeItem(PROFILE_KEY);
      fireStorageEvent(null);
      expect(store.getSnapshot().status).toBe("none");
      unsubscribe();
    });

    it("ignores unrelated keys", () => {
      const store = createProfileStore(() => createFakeStorage());
      const listener = vi.fn();
      const unsubscribe = store.subscribe(listener);
      fireStorageEvent("other.key");
      fireStorageEvent("jisr.saved-programs");
      expect(listener).not.toHaveBeenCalled();
      unsubscribe();
    });
  });

  describe("without subscribers", () => {
    function cachedStore() {
      const storage = createFakeStorage();
      storage.seed(PROFILE_KEY, JSON.stringify(profile()));
      const store = createProfileStore(() => storage);
      expect(store.getSnapshot().status).toBe("ok");
      const unsubscribe = store.subscribe(() => {});
      unsubscribe();
      return { storage, store };
    }

    it("re-reads storage when a subscriber comes back after another tab replaced the profile", () => {
      const { storage, store } = cachedStore();
      const other = profile({ nationality: "XB" });
      storage.seed(PROFILE_KEY, JSON.stringify(other));
      fireStorageEvent(PROFILE_KEY);
      const unsubscribe = store.subscribe(() => {});
      expect(store.getSnapshot()).toEqual({ status: "ok", profile: other, storageAvailable: true });
      unsubscribe();
    });

    it("re-reads storage when a subscriber comes back after another tab cleared the profile", () => {
      const { storage, store } = cachedStore();
      storage.removeItem(PROFILE_KEY);
      fireStorageEvent(null);
      const unsubscribe = store.subscribe(() => {});
      expect(store.getSnapshot()).toEqual({ status: "none", storageAvailable: true });
      unsubscribe();
    });

    it("keeps the same snapshot object when nothing changed while away", () => {
      const { store } = cachedStore();
      const before = store.getSnapshot();
      const unsubscribe = store.subscribe(() => {});
      expect(store.getSnapshot()).toBe(before);
      unsubscribe();
    });

    it("keeps an unsaved in-memory profile when a subscriber comes back", () => {
      const storage = createFakeStorage({ set: true });
      const store = createProfileStore(() => storage);
      store.save(profile());
      const unsubscribe = store.subscribe(() => {});
      expect(store.getSnapshot()).toMatchObject({ status: "ok", storageAvailable: false });
      unsubscribe();
    });
  });

  describe("storage event listener lifecycle", () => {
    it("adds one listener for the first subscriber and removes it with the last", () => {
      const add = vi.spyOn(window, "addEventListener");
      const remove = vi.spyOn(window, "removeEventListener");
      const storageCalls = (spy: typeof add) =>
        spy.mock.calls.filter(([type]) => type === "storage").length;
      const store = createProfileStore(() => createFakeStorage());

      const first = store.subscribe(() => {});
      const second = store.subscribe(() => {});
      expect(storageCalls(add)).toBe(1);

      first();
      expect(storageCalls(remove)).toBe(0);
      second();
      expect(storageCalls(remove)).toBe(1);

      const third = store.subscribe(() => {});
      expect(storageCalls(add)).toBe(2);
      third();
      expect(storageCalls(remove)).toBe(2);
    });

    it("notifies each listener once per event even with two subscribers", () => {
      const store = createProfileStore(() => createFakeStorage());
      const a = vi.fn();
      const b = vi.fn();
      const unsubscribeA = store.subscribe(a);
      const unsubscribeB = store.subscribe(b);
      fireStorageEvent(PROFILE_KEY);
      expect(a).toHaveBeenCalledTimes(1);
      expect(b).toHaveBeenCalledTimes(1);
      unsubscribeA();
      unsubscribeB();
    });
  });

  describe("reset outcome", () => {
    function corruptStore() {
      const storage = createFakeStorage();
      storage.seed(PROFILE_KEY, "{corrupt");
      return { storage, store: createProfileStore(() => storage) };
    }

    it("reports reset, removes the bad key and keeps the outcome in memory", () => {
      const { storage, store } = corruptStore();
      const first = store.getSnapshot();
      expect(first).toEqual({ status: "reset", reason: "invalid", storageAvailable: true });
      expect(storage.raw(PROFILE_KEY)).toBeNull();
      expect(store.getSnapshot()).toBe(first);
      const unsubscribe = store.subscribe(() => {});
      fireStorageEvent(PROFILE_KEY);
      expect(store.getSnapshot().status).toBe("reset");
      unsubscribe();
    });

    it("reports an unsupported version", () => {
      const storage = createFakeStorage();
      storage.seed(PROFILE_KEY, JSON.stringify({ ...profile(), schemaVersion: 9 }));
      const store = createProfileStore(() => storage);
      expect(store.getSnapshot()).toEqual({
        status: "reset",
        reason: "unsupported_version",
        storageAvailable: true,
      });
    });

    it("is cleared by dismissReset", () => {
      const { store } = corruptStore();
      store.getSnapshot();
      const listener = vi.fn();
      store.subscribe(listener);
      store.dismissReset();
      expect(listener).toHaveBeenCalled();
      expect(store.getSnapshot()).toEqual({ status: "none", storageAvailable: true });
    });

    it("is cleared by save", () => {
      const { store } = corruptStore();
      store.getSnapshot();
      store.save(profile());
      expect(store.getSnapshot().status).toBe("ok");
    });

    it("carries no profile data", () => {
      const storage = createFakeStorage();
      storage.seed(PROFILE_KEY, JSON.stringify({ ...profile({ nationality: "ZZ" }), extra: 1 }));
      const store = createProfileStore(() => storage);
      expect(JSON.stringify(store.getSnapshot())).not.toContain("ZZ");
    });

    it("does nothing when dismissing without a reset", () => {
      const store = createProfileStore(() => createFakeStorage());
      const before = store.getSnapshot();
      store.dismissReset();
      expect(store.getSnapshot()).toBe(before);
    });
  });

  describe("clear", () => {
    it("wipes every jisr.* key, the memory copy and notifies", () => {
      const storage = createFakeStorage();
      storage.seed("other.key", "keep");
      const store = createProfileStore(() => storage);
      store.save(profile());
      writeDraft(storage, { schemaVersion: 1, step: 1 });
      const listener = vi.fn();
      store.subscribe(listener);
      store.clear();
      expect(listener).toHaveBeenCalled();
      expect(storage.keys()).toEqual(["other.key"]);
      expect(store.getSnapshot()).toEqual({ status: "none", storageAvailable: true });
    });

    it("also drops a reset outcome", () => {
      const storage = createFakeStorage();
      storage.seed(PROFILE_KEY, "{corrupt");
      const store = createProfileStore(() => storage);
      store.getSnapshot();
      store.clear();
      expect(store.getSnapshot().status).toBe("none");
    });
  });

  describe("storage unavailable", () => {
    it("falls back to memory when there is no storage", () => {
      const store = createProfileStore(() => null);
      expect(store.getSnapshot()).toEqual({ status: "none", storageAvailable: false });
      expect(store.save(profile())).toEqual({ ok: true, persisted: false });
      expect(store.getSnapshot()).toEqual({
        status: "ok",
        profile: profile(),
        storageAvailable: false,
      });
      store.clear();
      expect(store.getSnapshot()).toEqual({ status: "none", storageAvailable: false });
    });

    it("falls back to memory when reading throws", () => {
      const store = createProfileStore(() => createFakeStorage({ get: true, set: true }));
      expect(store.getSnapshot()).toEqual({ status: "none", storageAvailable: false });
      expect(store.save(profile())).toEqual({ ok: true, persisted: false });
      expect(store.getSnapshot()).toEqual({
        status: "ok",
        profile: profile(),
        storageAvailable: false,
      });
    });

    it("keeps the profile in memory when only writing fails", () => {
      const storage = createFakeStorage({ set: true });
      const store = createProfileStore(() => storage);
      expect(store.save(profile())).toEqual({ ok: true, persisted: false });
      expect(store.getSnapshot()).toEqual({
        status: "ok",
        profile: profile(),
        storageAvailable: false,
      });
    });

    it("removes an older stored profile the student just replaced", () => {
      const storage = createFakeStorage({ set: true });
      storage.seed(PROFILE_KEY, JSON.stringify(profile({ nationality: "XB" })));
      const store = createProfileStore(() => storage);
      expect(store.getSnapshot()).toMatchObject({ status: "ok", storageAvailable: true });
      expect(store.save(profile())).toEqual({ ok: true, persisted: false });
      expect(store.getSnapshot()).toEqual({
        status: "ok",
        profile: profile(),
        storageAvailable: false,
      });
      expect(storage.raw(PROFILE_KEY)).toBeNull();
    });

    it("keeps a persisted profile when only reading throws", () => {
      const storage = createFakeStorage({ get: true });
      const store = createProfileStore(() => storage);
      expect(store.save(profile())).toEqual({ ok: true, persisted: true });
      expect(store.getSnapshot()).toEqual({
        status: "ok",
        profile: profile(),
        storageAvailable: false,
      });
      expect(storage.raw(PROFILE_KEY)).not.toBeNull();
    });

    it("recovers persistence once writing works again", () => {
      const storage = createFakeStorage({ set: true });
      const store = createProfileStore(() => storage);
      store.save(profile());
      storage.failures.set = false;
      expect(store.save(profile())).toEqual({ ok: true, persisted: true });
      expect(store.getSnapshot()).toMatchObject({ status: "ok", storageAvailable: true });
    });

    it("survives a getStorage that throws", () => {
      const store = createProfileStore(() => {
        throw new Error("denied");
      });
      expect(store.getSnapshot()).toEqual({ status: "none", storageAvailable: false });
    });
  });
});

describe("privacy", () => {
  it("leaves only jisr.* keys after save and never touches other keys", async () => {
    window.localStorage.setItem("other.key", "keep");
    const { profileStore } = await loadHookModules();
    profileStore.save(profile());
    writeDraft(window.localStorage, { schemaVersion: 1, step: 1 });
    const keys = Object.keys(window.localStorage).filter((key) => key !== "other.key");
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((key) => key.startsWith("jisr."))).toBe(true);
    expect(window.localStorage.getItem("other.key")).toBe("keep");
  });

  it("puts nothing in the URL", async () => {
    const before = window.location.href;
    const { profileStore } = await loadHookModules();
    profileStore.save(profile());
    expect(window.location.href).toBe(before);
  });

  it("does not log on any failure path", () => {
    const store = createProfileStore(() =>
      createFakeStorage({ get: true, set: true, remove: true }),
    );
    store.getSnapshot();
    store.save(profile());
    store.save({ bad: true });
    store.clear();
    store.dismissReset();
    createProfileStore(() => null).save(profile());
  });
});

describe("useProfile", () => {
  it("renders unhydrated on the server and on the first client render, then reflects storage", async () => {
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile()));
    const { useProfile } = await loadHookModules();
    const renders: ProfileState["status"][] = [];
    function Probe() {
      const { state } = useProfile();
      renders.push(state.status);
      return <output>{state.status}</output>;
    }

    const html = renderToString(<Probe />);
    expect(html).toContain("unhydrated");
    expect(renders).toEqual(["unhydrated"]);

    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);
    const recoverable = vi.fn();
    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(container, <Probe />, { onRecoverableError: recoverable });
    });

    expect(renders[1]).toBe("unhydrated");
    expect(renders.at(-1)).toBe("ok");
    expect(container.textContent).toBe("ok");
    expect(recoverable).not.toHaveBeenCalled();
    await act(async () => root?.unmount());
    container.remove();
  });

  it("reflects storage after mount", async () => {
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile()));
    const { useProfile } = await loadHookModules();
    const { result } = renderHook(() => useProfile());
    expect(result.current.state).toEqual({
      status: "ok",
      profile: profile(),
      storageAvailable: true,
    });
  });

  it("updates subscribers on save and on clear", async () => {
    const { useProfile } = await loadHookModules();
    const { result } = renderHook(() => useProfile());
    expect(result.current.state.status).toBe("none");
    act(() => {
      expect(result.current.save(profile())).toEqual({ ok: true, persisted: true });
    });
    expect(result.current.state.status).toBe("ok");
    expect(window.localStorage.getItem(PROFILE_KEY)).not.toBeNull();
    act(() => result.current.clear());
    expect(result.current.state.status).toBe("none");
    expect(window.localStorage.getItem(PROFILE_KEY)).toBeNull();
  });

  it("follows a storage event from another tab", async () => {
    const { useProfile } = await loadHookModules();
    const { result } = renderHook(() => useProfile());
    expect(result.current.state.status).toBe("none");
    act(() => {
      window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile()));
      fireStorageEvent(PROFILE_KEY);
    });
    expect(result.current.state.status).toBe("ok");
    act(() => {
      window.localStorage.removeItem(PROFILE_KEY);
      fireStorageEvent(PROFILE_KEY);
    });
    expect(result.current.state.status).toBe("none");
  });

  it("keeps a reset visible until dismissed", async () => {
    window.localStorage.setItem(PROFILE_KEY, "{corrupt");
    const { useProfile } = await loadHookModules();
    const { result, rerender } = renderHook(() => useProfile());
    expect(result.current.state).toMatchObject({ status: "reset", reason: "invalid" });
    rerender();
    expect(result.current.state.status).toBe("reset");
    act(() => result.current.dismissReset());
    expect(result.current.state.status).toBe("none");
  });

  it("works in memory when storage throws", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const { useProfile } = await loadHookModules();
    const { result } = renderHook(() => useProfile());
    expect(result.current.state).toEqual({ status: "none", storageAvailable: false });
    act(() => {
      expect(result.current.save(profile())).toEqual({ ok: true, persisted: false });
    });
    expect(result.current.state).toEqual({
      status: "ok",
      profile: profile(),
      storageAvailable: false,
    });
  });
});
