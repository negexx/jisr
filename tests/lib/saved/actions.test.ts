// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { MAX_SAVED_PROGRAMS } from "@/lib/constants";
import { createLocalJsonStore } from "@/lib/local-store";
import { toggleSaved } from "@/lib/saved/actions";
import { EMPTY_SAVED, isSavedSlug, parseSaved, SAVED_KEY } from "@/lib/saved/saved";

import { createFakeStorage } from "../profile/fake-storage";

const make = () => {
  const storage = createFakeStorage();
  const store = createLocalJsonStore(() => storage, {
    key: SAVED_KEY,
    empty: EMPTY_SAVED,
    parse: parseSaved,
  });
  return { storage, store };
};
const ref = (slug: string) => ({ slug, country: "FR", field: "computer-science" });
const list = (store: ReturnType<typeof make>["store"]) => {
  const s = store.getSnapshot();
  return s.status === "ready" ? s.value : EMPTY_SAVED;
};

describe("toggleSaved", () => {
  it("saves with the snapshot version and date, then unsaves and reports the removal", () => {
    const { store } = make();
    const onRemoved = vi.fn();
    expect(toggleSaved(store, ref("xx-a"), "0123456789ab", "2026-10-02", onRemoved)).toEqual({
      ok: true,
      saved: true,
      persisted: true,
    });
    expect(list(store).items).toEqual([
      { ...ref("xx-a"), snapshotVersion: "0123456789ab", savedAt: "2026-10-02" },
    ]);
    expect(onRemoved).not.toHaveBeenCalled();
    expect(toggleSaved(store, ref("xx-a"), "0123456789ab", "2026-10-02", onRemoved)).toEqual({
      ok: true,
      saved: false,
      persisted: true,
    });
    expect(isSavedSlug(list(store), "xx-a")).toBe(false);
    expect(onRemoved).toHaveBeenCalledWith("xx-a");
  });

  it("refuses a new program when the list is full but still unsaves an existing one", () => {
    const { store } = make();
    for (let i = 0; i < MAX_SAVED_PROGRAMS; i += 1) {
      toggleSaved(store, ref(`xx-p${i}`), "0123456789ab", "2026-10-02");
    }
    expect(toggleSaved(store, ref("xx-new"), "0123456789ab", "2026-10-02")).toEqual({
      ok: false,
      reason: "full",
    });
    expect(toggleSaved(store, ref("xx-p0"), "0123456789ab", "2026-10-02")).toMatchObject({
      ok: true,
      saved: false,
    });
  });

  it("reports saved: false when the reference is not acceptable", () => {
    const { store } = make();
    expect(
      toggleSaved(
        store,
        { slug: "Not A Slug", country: "FR", field: "x" },
        "0123456789ab",
        "2026-10-02",
      ),
    ).toMatchObject({ ok: true, saved: false });
  });
});
