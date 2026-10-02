// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PLAN_KEY } from "@/lib/plan/progress";
import { SAVED_KEY } from "@/lib/saved/saved";

async function load() {
  vi.resetModules();
  const [saved, plan, remove] = await Promise.all([
    import("@/lib/saved/use-saved"),
    import("@/lib/plan/store"),
    import("@/lib/saved/actions"),
  ]);
  return {
    useSaved: saved.useSaved,
    setStepDone: plan.setStepDone,
    removeFromPlan: remove.removeFromPlan,
  };
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
    await act(async () => {
      await a.result.current.toggle(ref, "0123456789ab");
    });
    expect(a.result.current.isSaved("xx-a")).toBe(true);
    expect(b.result.current.items.map((i) => i.slug)).toEqual(["xx-a"]);
    expect(JSON.parse(window.localStorage.getItem(SAVED_KEY) ?? "null").items).toHaveLength(1);
    cleanup();
    const again = await load();
    const c = renderHook(() => again.useSaved());
    expect(c.result.current.isSaved("xx-a")).toBe(true);
  });

  it("forgets the ticked steps when a toggle unsaves the program", async () => {
    const { useSaved, setStepDone } = await load();
    const { result } = renderHook(() => useSaved());
    await act(async () => {
      await result.current.toggle(ref, "0123456789ab");
      setStepDone("xx-a", "visa", true);
    });
    expect(window.localStorage.getItem(PLAN_KEY)).toContain("xx-a");
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.toggle(ref, "0123456789ab");
    });
    expect(outcome).toEqual({ ok: true, saved: false, persisted: true });
    expect(result.current.isSaved("xx-a")).toBe(false);
    expect(window.localStorage.getItem(PLAN_KEY)).not.toContain("xx-a");
  });
});

describe("removeFromPlan", () => {
  it("removes the program and forgets its ticked steps", async () => {
    const { useSaved, setStepDone, removeFromPlan } = await load();
    const { result } = renderHook(() => useSaved());
    await act(async () => {
      await result.current.toggle(ref, "0123456789ab");
      setStepDone("xx-a", "visa", true);
    });
    expect(window.localStorage.getItem(PLAN_KEY)).toContain("xx-a");
    act(() => {
      removeFromPlan("xx-a");
    });
    expect(result.current.isSaved("xx-a")).toBe(false);
    expect(window.localStorage.getItem(PLAN_KEY)).not.toContain("xx-a");
  });
});

// The toggle code and the tick store behind it are loaded on the first click: a static import from
// the hook would put them in the chunk of every page with a Save button.
describe("the saved list hook loads the toggle code lazily", () => {
  it("has no runtime static import of the actions or the plan store", () => {
    const source = readFileSync("src/lib/saved/use-saved.ts", "utf8");
    const runtimeImports = source
      .split("\n")
      .filter((line) => line.startsWith("import ") && !line.startsWith("import type "));
    expect(runtimeImports.filter((line) => line.includes('"./actions"'))).toEqual([]);
    expect(runtimeImports.filter((line) => line.includes('"@/lib/plan/'))).toEqual([]);
  });
});
