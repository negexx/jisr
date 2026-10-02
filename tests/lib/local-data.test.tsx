// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PLAN_KEY } from "@/lib/plan/progress";
import { PROFILE_KEY, writeProfile } from "@/lib/profile/storage";
import { SAVED_KEY } from "@/lib/saved/saved";

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
    // The toggle is async (it loads the actions on the first click): await it, or the save lands
    // after the assertions and the test would pass without a saved list to clear.
    await act(async () => {
      await saved.result.current.toggle(
        { slug: "xx-a", country: "FR", field: "computer-science" },
        "0123456789ab",
      );
      progress.result.current.setDone("xx-a", "visa", true);
    });
    expect(saved.result.current.items.map((item) => item.slug)).toEqual(["xx-a"]);
    expect(JSON.parse(window.localStorage.getItem(SAVED_KEY) ?? "null").items).toHaveLength(1);
    expect(window.localStorage.getItem(PLAN_KEY)).toContain("xx-a");
    expect(progress.result.current.doneSteps("xx-a")).toEqual(["visa"]);
    window.localStorage.setItem("unrelated", "keep");
    act(() => clearAllLocalData());
    expect(window.localStorage.getItem(PROFILE_KEY)).toBeNull();
    expect(saved.result.current.items).toEqual([]);
    expect(progress.result.current.doneSteps("xx-a")).toEqual([]);
    expect(window.localStorage.getItem("unrelated")).toBe("keep");
    expect(Object.keys(window.localStorage).filter((k) => k.startsWith("jisr."))).toEqual([]);
  });
});
