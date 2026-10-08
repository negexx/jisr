// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PlanClient } from "@/components/plan/plan-client";
import { profileStore } from "@/lib/profile/store";
import { savedStore } from "@/lib/saved/store";
import { E2E_NOW } from "../../fixtures/e2e/profiles";
import { forbidConsole } from "../../lib/profile/no-console";
import {
  catalogs,
  PlanProviders,
  PROGRAMS,
  planEntries,
  renderPlan,
  requireProgram,
  seedProfile,
  seedSaved,
  withFixtureClient,
} from "./helpers";

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
  savedStore.reload();
  track.mockClear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("My plan analytics", () => {
  it("counts plan-opened once when the plan has a saved program", async () => {
    seedProfile();
    seedSaved(PROGRAMS.ok);
    renderPlan("en", fixture.client());
    const { programs } = await planEntries(fixture.client(), "en", [PROGRAMS.ok]);
    await screen.findByRole("heading", { level: 2, name: requireProgram(programs).name });
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("plan-opened");
  });

  it("does not count it when nothing is saved", async () => {
    seedProfile();
    renderPlan("en", fixture.client());
    await screen.findByRole("heading", { level: 2, name: catalogs.en.plan.empty.title });
    expect(track).not.toHaveBeenCalled();
  });

  it("does not count it before the saved list is read from the device", () => {
    seedProfile();
    seedSaved(PROGRAMS.ok);
    renderToString(
      <PlanProviders locale="en">
        <PlanClient locale="en" client={fixture.client()} />
      </PlanProviders>,
    );
    expect(track).not.toHaveBeenCalled();
  });
});
