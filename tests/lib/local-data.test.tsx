// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PROFILE_KEY, writeProfile } from "@/lib/profile/storage";

import { profile } from "../fixtures/domain/builders";

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("clearAllLocalData", () => {
  it("empties the profile, the saved list and the plan progress, and the hooks notice at once", async () => {
    vi.resetModules();
    expect(writeProfile(window.localStorage, profile())).toEqual({ ok: true });
    expect(window.localStorage.getItem(PROFILE_KEY)).not.toBeNull();
    const [{ useSaved }, { usePlanProgress }, { clearAllLocalData }] = await Promise.all([
      import("@/lib/saved/use-saved"),
      import("@/lib/plan/use-plan-progress"),
      import("@/lib/local-data"),
    ]);
    const saved = renderHook(() => useSaved());
    const progress = renderHook(() => usePlanProgress());
    act(() => {
      saved.result.current.toggle(
        { slug: "xx-a", country: "FR", field: "computer-science" },
        "0123456789ab",
      );
      progress.result.current.setDone("xx-a", "visa", true);
    });
    window.localStorage.setItem("unrelated", "keep");
    act(() => clearAllLocalData());
    expect(window.localStorage.getItem(PROFILE_KEY)).toBeNull();
    expect(saved.result.current.items).toEqual([]);
    expect(progress.result.current.doneSteps("xx-a")).toEqual([]);
    expect(window.localStorage.getItem("unrelated")).toBe("keep");
    expect(Object.keys(window.localStorage).filter((k) => k.startsWith("jisr."))).toEqual([]);
  });
});
