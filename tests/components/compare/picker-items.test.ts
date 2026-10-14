import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { pickerItems } from "@/components/compare/picker-items";
import type { SnapshotBundle } from "@/lib/snapshot/client";

import { E2E_PROFILE, E2E_SLUGS } from "../../fixtures/e2e/profiles";
import { loadMatchesBundle } from "../../lib/journey/bundle";
import { buildSnapshot, E2E_DATA_DIR, removeTempDirs } from "../../lib/snapshot/fixture";

let bundle: SnapshotBundle;

beforeAll(async () => {
  bundle = await loadMatchesBundle(buildSnapshot(E2E_DATA_DIR), E2E_PROFILE, "fr");
}, 180_000);

afterAll(removeTempDirs);

describe("pickerItems", () => {
  it("shows a saved former slug as the programme it was renamed to, under the saved slug", () => {
    const [former, current] = pickerItems(bundle, ["xx-test-prog-old-ok", E2E_SLUGS.ok]);
    expect(former).toMatchObject({ kind: "program", slug: "xx-test-prog-old-ok" });
    expect(former).toEqual({ ...current, slug: "xx-test-prog-old-ok" });
  });

  it("still shows a slug that is neither live nor aliased as no longer in our data", () => {
    expect(pickerItems(bundle, ["xx-test-prog-never-existed"])).toEqual([
      { kind: "missing", slug: "xx-test-prog-never-existed" },
    ]);
  });
});
