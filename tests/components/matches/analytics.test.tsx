// @vitest-environment jsdom
import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PROFILE_KEY } from "@/lib/profile/storage";
import { profileStore } from "@/lib/profile/store";
import type { SnapshotBundle, SnapshotClient } from "@/lib/snapshot/client";
import { SnapshotError } from "@/lib/snapshot/errors";
import { shardsForMatches } from "@/lib/snapshot/plan";
import { E2E_NOW, E2E_PROFILE } from "../../fixtures/e2e/profiles";
import { forbidConsole } from "../../lib/profile/no-console";
import { bundleClient, catalogs, renderMatches, withFixtureClient } from "./helpers";

forbidConsole();

const { track } = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ track }));

const fixture = withFixtureClient();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${E2E_NOW}T10:00:00Z`));
});

afterEach(() => {
  cleanup();
  profileStore.clear();
  window.localStorage.clear();
  track.mockClear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function loadedBundle(): Promise<SnapshotBundle> {
  return fixture.client().load((manifest) => shardsForMatches(E2E_PROFILE, manifest), "en");
}

describe("My Matches analytics", () => {
  it("counts matches-viewed once when the results are shown", async () => {
    profileStore.save(E2E_PROFILE);
    renderMatches("en", fixture.client());
    await waitFor(() => expect(screen.getAllByRole("article").length).toBeGreaterThan(0));
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("matches-viewed");
  });

  it("does not count it while the results are loading", async () => {
    profileStore.save(E2E_PROFILE);
    renderMatches("en", { load: () => new Promise(() => undefined) });
    await screen.findByRole("status");
    expect(track).not.toHaveBeenCalled();
  });

  it("does not count it when the snapshot fails", async () => {
    profileStore.save(E2E_PROFILE);
    const load = vi.fn<SnapshotClient["load"]>().mockRejectedValue(new SnapshotError("network"));
    renderMatches("en", { load });
    await screen.findByRole("alert");
    expect(track).not.toHaveBeenCalled();
  });

  it("does not count it without a profile", async () => {
    renderMatches("en", fixture.client());
    await screen.findByRole("heading", { name: catalogs.en.matches.states.none.title });
    expect(track).not.toHaveBeenCalled();
  });

  it("does not count it for a reset profile", async () => {
    window.localStorage.setItem(PROFILE_KEY, "{not json");
    renderMatches("en", fixture.client());
    await screen.findByText(catalogs.en.matches.states.reset.notice);
    expect(track).not.toHaveBeenCalled();
  });

  it("does not count it when no programs are published", async () => {
    profileStore.save(E2E_PROFILE);
    const bundle = await loadedBundle();
    renderMatches("en", bundleClient({ ...bundle, programs: [], hasPrograms: false }));
    await screen.findByRole("heading", { name: catalogs.en.matches.states.noPrograms.title });
    expect(track).not.toHaveBeenCalled();
  });

  it("does not count it when the chosen fields have no programs", async () => {
    profileStore.save(E2E_PROFILE);
    const bundle = await loadedBundle();
    renderMatches("en", bundleClient({ ...bundle, programs: [], hasPrograms: true }));
    await screen.findByRole("heading", {
      name: catalogs.en.matches.states.noProgramsForFields.title,
    });
    expect(track).not.toHaveBeenCalled();
  });
});
