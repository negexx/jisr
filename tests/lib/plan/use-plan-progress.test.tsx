// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PLAN_KEY } from "@/lib/plan/progress";

async function load() {
  vi.resetModules();
  return import("@/lib/plan/use-plan-progress");
}

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("usePlanProgress", () => {
  it("starts empty, ticks a step, persists it and survives a fresh module (reload)", async () => {
    const { usePlanProgress } = await load();
    const { result } = renderHook(() => usePlanProgress());
    expect(result.current.hydrated).toBe(true);
    expect(result.current.doneSteps("xx-prog")).toEqual([]);
    act(() => result.current.setDone("xx-prog", "documents", true));
    expect(result.current.doneSteps("xx-prog")).toEqual(["documents"]);
    expect(JSON.parse(window.localStorage.getItem(PLAN_KEY) ?? "null")).toEqual({
      schemaVersion: 1,
      done: { "xx-prog": ["documents"] },
    });
    cleanup();
    const again = await load();
    const second = renderHook(() => again.usePlanProgress());
    expect(second.result.current.doneSteps("xx-prog")).toEqual(["documents"]);
  });
});
