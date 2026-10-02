// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { isRecord } from "@/lib/guards";
import { createLocalJsonStore } from "@/lib/local-store";
import { createFakeStorage } from "./profile/fake-storage";
import { forbidConsole } from "./profile/no-console";

forbidConsole();

type Box = { n: number };
const EMPTY: Box = { n: 0 };
const options = {
  key: "jisr.test",
  empty: EMPTY,
  parse: (raw: unknown): Box | null =>
    isRecord(raw) && typeof raw.n === "number" ? { n: raw.n } : null,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createLocalJsonStore", () => {
  it("serves an unhydrated server snapshot and never touches storage for it", () => {
    const getStorage = vi.fn(() => createFakeStorage());
    const store = createLocalJsonStore(getStorage, options);
    expect(store.getServerSnapshot()).toEqual({ status: "unhydrated" });
    expect(getStorage).not.toHaveBeenCalled();
  });

  it("reads the empty value when nothing is stored, with a stable snapshot", () => {
    const store = createLocalJsonStore(() => createFakeStorage(), options);
    const first = store.getSnapshot();
    expect(first).toEqual({ status: "ready", value: EMPTY, storageAvailable: true });
    expect(store.getSnapshot()).toBe(first);
  });

  it("reads a stored value", () => {
    const storage = createFakeStorage();
    storage.seed("jisr.test", JSON.stringify({ n: 4 }));
    const store = createLocalJsonStore(() => storage, options);
    expect(store.getSnapshot()).toMatchObject({ status: "ready", value: { n: 4 } });
  });

  it("update persists JSON, replaces the snapshot and notifies subscribers", () => {
    const storage = createFakeStorage();
    const store = createLocalJsonStore(() => storage, options);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    const before = store.getSnapshot();
    expect(store.update((box) => ({ n: box.n + 1 }))).toEqual({ ok: true, persisted: true });
    expect(storage.raw("jisr.test")).toBe(JSON.stringify({ n: 1 }));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).not.toBe(before);
    expect(store.getSnapshot()).toMatchObject({ value: { n: 1 } });
    unsubscribe();
  });

  it("removes stored JSON that is not valid and falls back to empty", () => {
    const storage = createFakeStorage();
    storage.seed("jisr.test", "{not json");
    const store = createLocalJsonStore(() => storage, options);
    expect(store.getSnapshot()).toMatchObject({ value: EMPTY });
    expect(storage.raw("jisr.test")).toBeNull();
    const stable = store.getSnapshot();
    expect(store.getSnapshot()).toBe(stable);
  });

  it("removes stored JSON the parser rejects", () => {
    const storage = createFakeStorage();
    storage.seed("jisr.test", JSON.stringify({ n: "x" }));
    const store = createLocalJsonStore(() => storage, options);
    expect(store.getSnapshot()).toMatchObject({ value: EMPTY });
    expect(storage.raw("jisr.test")).toBeNull();
  });

  it("refuses an update the parser rejects and leaves storage alone", () => {
    const storage = createFakeStorage();
    const strict = createLocalJsonStore(() => storage, {
      ...options,
      parse: (raw: unknown) =>
        isRecord(raw) && typeof raw.n === "number" && raw.n >= 0 ? { n: raw.n } : null,
    });
    expect(strict.update(() => ({ n: -1 }))).toEqual({ ok: false });
    expect(storage.raw("jisr.test")).toBeNull();
    expect(strict.getSnapshot()).toMatchObject({ value: EMPTY });
  });

  it("keeps the value in memory when the write fails", () => {
    const storage = createFakeStorage({ set: true });
    const store = createLocalJsonStore(() => storage, options);
    expect(store.update(() => ({ n: 2 }))).toEqual({ ok: true, persisted: false });
    expect(store.getSnapshot()).toEqual({
      status: "ready",
      value: { n: 2 },
      storageAvailable: false,
    });
  });

  it("works from memory when storage cannot be read", () => {
    const storage = createFakeStorage({ get: true, set: true });
    const store = createLocalJsonStore(() => storage, options);
    expect(store.getSnapshot()).toMatchObject({ value: EMPTY, storageAvailable: false });
    store.update(() => ({ n: 3 }));
    expect(store.getSnapshot()).toMatchObject({ value: { n: 3 }, storageAvailable: false });
  });

  it("re-reads on a storage event for its key and ignores other keys", () => {
    const storage = createFakeStorage();
    const store = createLocalJsonStore(() => storage, options);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    storage.seed("jisr.test", JSON.stringify({ n: 9 }));
    window.dispatchEvent(new StorageEvent("storage", { key: "jisr.other" }));
    expect(listener).not.toHaveBeenCalled();
    window.dispatchEvent(new StorageEvent("storage", { key: "jisr.test" }));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toMatchObject({ value: { n: 9 } });
    unsubscribe();
  });

  it("reload picks up an external removal and notifies", () => {
    const storage = createFakeStorage();
    const store = createLocalJsonStore(() => storage, options);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.update(() => ({ n: 5 }));
    listener.mockClear();
    storage.removeItem("jisr.test");
    store.reload();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toMatchObject({ value: EMPTY });
    unsubscribe();
  });
});
