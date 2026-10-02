// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SAVED_KEY } from "@/lib/saved/saved";

async function load() {
  vi.resetModules();
  const [count, saved] = await Promise.all([
    import("@/lib/saved/use-saved-count"),
    import("@/lib/saved/use-saved"),
  ]);
  return { useSavedCount: count.useSavedCount, useSaved: saved.useSaved };
}

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const ref = { slug: "xx-a", country: "FR", field: "computer-science" };

describe("useSavedCount", () => {
  it("is 0 with nothing saved", async () => {
    const { useSavedCount } = await load();
    expect(renderHook(() => useSavedCount()).result.current).toBe(0);
  });

  it("counts what the device already holds", async () => {
    const items = ["xx-a", "xx-b"].map((slug) => ({
      slug,
      country: "FR",
      field: "computer-science",
      snapshotVersion: "0123456789ab",
      savedAt: "2026-01-01",
    }));
    window.localStorage.setItem(SAVED_KEY, JSON.stringify({ schemaVersion: 1, items }));
    const { useSavedCount } = await load();
    expect(renderHook(() => useSavedCount()).result.current).toBe(2);
  });

  it("follows a save and an unsave made through the other hook", async () => {
    const { useSavedCount, useSaved } = await load();
    const count = renderHook(() => useSavedCount());
    const saved = renderHook(() => useSaved());
    await act(async () => {
      await saved.result.current.toggle(ref, "0123456789ab");
    });
    expect(count.result.current).toBe(1);
    await act(async () => {
      await saved.result.current.toggle(ref, "0123456789ab");
    });
    expect(count.result.current).toBe(0);
  });
});
