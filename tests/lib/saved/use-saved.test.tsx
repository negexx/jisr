// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PLAN_KEY } from "@/lib/plan/progress";
import { SAVED_KEY } from "@/lib/saved/saved";

async function load() {
  vi.resetModules();
  const [saved, plan] = await Promise.all([
    import("@/lib/saved/use-saved"),
    import("@/lib/plan/store"),
  ]);
  return { useSaved: saved.useSaved, setStepDone: plan.setStepDone };
}

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const ref = { slug: "xx-a", country: "FR", field: "computer-science" };

describe("useSaved", () => {
  it("saves, persists, shares state between hooks and survives a reload", async () => {
    const { useSaved } = await load();
    const a = renderHook(() => useSaved());
    const b = renderHook(() => useSaved());
    expect(a.result.current.hydrated).toBe(true);
    expect(a.result.current.isSaved("xx-a")).toBe(false);
    act(() => {
      a.result.current.toggle(ref, "0123456789ab");
    });
    expect(a.result.current.isSaved("xx-a")).toBe(true);
    expect(b.result.current.items.map((i) => i.slug)).toEqual(["xx-a"]);
    expect(JSON.parse(window.localStorage.getItem(SAVED_KEY) ?? "null").items).toHaveLength(1);
    cleanup();
    const again = await load();
    const c = renderHook(() => again.useSaved());
    expect(c.result.current.isSaved("xx-a")).toBe(true);
  });

  it("forgets the ticked steps when the program is removed", async () => {
    const { useSaved, setStepDone } = await load();
    const { result } = renderHook(() => useSaved());
    act(() => {
      result.current.toggle(ref, "0123456789ab");
      setStepDone("xx-a", "visa", true);
    });
    expect(window.localStorage.getItem(PLAN_KEY)).toContain("xx-a");
    act(() => {
      result.current.remove("xx-a");
    });
    expect(result.current.isSaved("xx-a")).toBe(false);
    expect(window.localStorage.getItem(PLAN_KEY)).not.toContain("xx-a");
  });

  it("forgets the ticked steps when a toggle unsaves the program", async () => {
    const { useSaved, setStepDone } = await load();
    const { result } = renderHook(() => useSaved());
    act(() => {
      result.current.toggle(ref, "0123456789ab");
      setStepDone("xx-a", "visa", true);
    });
    expect(window.localStorage.getItem(PLAN_KEY)).toContain("xx-a");
    act(() => {
      result.current.toggle(ref, "0123456789ab");
    });
    expect(result.current.isSaved("xx-a")).toBe(false);
    expect(window.localStorage.getItem(PLAN_KEY)).not.toContain("xx-a");
  });
});
