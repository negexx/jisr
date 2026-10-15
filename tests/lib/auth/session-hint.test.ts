// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ACCOUNT_CACHE_PREFIX,
  AUTH_HINT_KEY,
  clearAccountLocalState,
  readSessionHint,
  setSessionHint,
  subscribeSessionHint,
} from "@/lib/auth/session-hint";
import { PLAN_KEY } from "@/lib/plan/progress";
import { PROFILE_KEY } from "@/lib/profile/storage";
import { SAVED_KEY } from "@/lib/saved/saved";

beforeEach(() => window.localStorage.clear());
afterEach(() => window.localStorage.clear());

describe("session hint keys", () => {
  it("keeps the hint and the account cache out of the guest keys", () => {
    expect(AUTH_HINT_KEY).toBe("jisr.auth");
    expect(ACCOUNT_CACHE_PREFIX).toBe("jisr.account.");
    for (const guest of [PROFILE_KEY, SAVED_KEY, PLAN_KEY]) {
      expect(guest.startsWith(ACCOUNT_CACHE_PREFIX)).toBe(false);
      expect(guest).not.toBe(AUTH_HINT_KEY);
    }
  });
});

describe("session hint", () => {
  it("is absent for a guest and present once set", () => {
    expect(readSessionHint()).toBe(false);
    setSessionHint();
    expect(readSessionHint()).toBe(true);
    expect(window.localStorage.getItem("jisr.auth")).toBe("true");
  });

  it("is only the exact stored token", () => {
    window.localStorage.setItem(AUTH_HINT_KEY, "1");
    expect(readSessionHint()).toBe(false);
  });

  it("reads as absent when storage is blocked", () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => undefined,
      key: () => null,
      length: 0,
    };
    expect(readSessionHint(blocked)).toBe(false);
    expect(() => setSessionHint(blocked)).not.toThrow();
  });
});

describe("clearAccountLocalState", () => {
  it("removes the hint and every account-cache key and nothing else (B5)", () => {
    setSessionHint();
    window.localStorage.setItem(`${ACCOUNT_CACHE_PREFIX}saved`, "[]");
    window.localStorage.setItem(`${ACCOUNT_CACHE_PREFIX}profile`, "{}");
    window.localStorage.setItem(PROFILE_KEY, '{"guest":"profile"}');
    window.localStorage.setItem(SAVED_KEY, '{"guest":"saved"}');
    window.localStorage.setItem(PLAN_KEY, '{"guest":"plan"}');
    window.localStorage.setItem("jisr.accountant", "not a cache key");
    window.localStorage.setItem("other.key", "x");

    clearAccountLocalState();

    expect(window.localStorage.getItem(AUTH_HINT_KEY)).toBeNull();
    expect(window.localStorage.getItem(`${ACCOUNT_CACHE_PREFIX}saved`)).toBeNull();
    expect(window.localStorage.getItem(`${ACCOUNT_CACHE_PREFIX}profile`)).toBeNull();
    expect(window.localStorage.getItem(PROFILE_KEY)).toBe('{"guest":"profile"}');
    expect(window.localStorage.getItem(SAVED_KEY)).toBe('{"guest":"saved"}');
    expect(window.localStorage.getItem(PLAN_KEY)).toBe('{"guest":"plan"}');
    expect(window.localStorage.getItem("jisr.accountant")).toBe("not a cache key");
    expect(window.localStorage.getItem("other.key")).toBe("x");
  });
});

describe("subscribeSessionHint", () => {
  it("notifies on a same-tab change and on another tab's storage event, until unsubscribed", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSessionHint(listener);
    setSessionHint();
    expect(listener).toHaveBeenCalledTimes(1);
    clearAccountLocalState();
    expect(listener).toHaveBeenCalledTimes(2);
    window.dispatchEvent(new StorageEvent("storage", { key: AUTH_HINT_KEY }));
    expect(listener).toHaveBeenCalledTimes(3);
    window.dispatchEvent(new StorageEvent("storage", { key: PROFILE_KEY }));
    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribe();
    setSessionHint();
    expect(listener).toHaveBeenCalledTimes(3);
  });
});
