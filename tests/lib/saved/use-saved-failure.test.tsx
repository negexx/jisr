// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PLAN_KEY } from "@/lib/plan/progress";
import { SAVED_KEY } from "@/lib/saved/saved";
import { useSaved } from "@/lib/saved/use-saved";

// The toggle code imports the tick store and is loaded on the first click. Here that load fails.
vi.mock("@/lib/plan/store", () => {
  throw new Error("chunk failed to load");
});

const ref = { slug: "xx-a", country: "FR", field: "computer-science" };
const PLAN = JSON.stringify({ schemaVersion: 1, done: { "xx-a": ["visa"] } });

beforeEach(() => {
  window.localStorage.setItem(
    SAVED_KEY,
    JSON.stringify({
      schemaVersion: 1,
      items: [{ ...ref, snapshotVersion: "0123456789ab", savedAt: "2026-01-01" }],
    }),
  );
  window.localStorage.setItem(PLAN_KEY, PLAN);
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("useSaved when the plan code cannot be loaded", () => {
  it("rejects the unsave and leaves the program saved with its ticks", async () => {
    const { result } = renderHook(() => useSaved());
    expect(result.current.isSaved("xx-a")).toBe(true);
    let failure: unknown;
    await act(async () => {
      failure = await result.current.toggle(ref, "0123456789ab").catch((error: unknown) => error);
    });
    expect(failure).toBeInstanceOf(Error);
    expect(result.current.isSaved("xx-a")).toBe(true);
    expect(JSON.parse(window.localStorage.getItem(SAVED_KEY) ?? "null").items).toHaveLength(1);
    expect(window.localStorage.getItem(PLAN_KEY)).toBe(PLAN);
  });

  it("rejects a save too, and writes nothing", async () => {
    const { result } = renderHook(() => useSaved());
    let failure: unknown;
    await act(async () => {
      failure = await result.current
        .toggle({ slug: "xx-b", country: "FR", field: "computer-science" }, "0123456789ab")
        .catch((error: unknown) => error);
    });
    expect(failure).toBeInstanceOf(Error);
    expect(result.current.isSaved("xx-b")).toBe(false);
    expect(JSON.parse(window.localStorage.getItem(SAVED_KEY) ?? "null").items).toHaveLength(1);
  });
});
