// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { JOURNEY_EVENTS } from "@/lib/analytics";

async function freshTrack() {
  vi.resetModules();
  return (await import("@/lib/analytics")).track;
}

beforeEach(() => {
  delete window.__jisrAnalytics;
  delete window.__jisrEvents;
  delete window.goatcounter;
});

afterEach(() => {
  delete window.__jisrAnalytics;
  delete window.__jisrEvents;
  delete window.goatcounter;
});

describe("track", () => {
  it("does nothing and queues nothing when analytics is not enabled", async () => {
    const count = vi.fn();
    window.goatcounter = { count };
    const track = await freshTrack();
    track("matches-viewed");
    expect(count).not.toHaveBeenCalled();
    expect(window.__jisrEvents).toBeUndefined();
  });

  it("sends exactly the event name as an event, once per page load", async () => {
    const count = vi.fn();
    window.__jisrAnalytics = true;
    window.goatcounter = { count };
    const track = await freshTrack();
    track("matches-viewed");
    track("matches-viewed");
    expect(count).toHaveBeenCalledTimes(1);
    expect(count).toHaveBeenCalledWith({ path: "matches-viewed", event: true });
  });

  it("counts different events separately", async () => {
    const count = vi.fn();
    window.__jisrAnalytics = true;
    window.goatcounter = { count };
    const track = await freshTrack();
    track("profile-started");
    track("plan-opened");
    expect(count).toHaveBeenCalledTimes(2);
  });

  it("queues the event for the loader while count.js has not loaded", async () => {
    window.__jisrAnalytics = true;
    window.goatcounter = {};
    const track = await freshTrack();
    track("program-saved");
    track("program-saved");
    expect(window.__jisrEvents).toEqual(["program-saved"]);
  });

  it("queues the event when there is no goatcounter object at all", async () => {
    window.__jisrAnalytics = true;
    const track = await freshTrack();
    track("profile-completed");
    expect(window.__jisrEvents).toEqual(["profile-completed"]);
  });
});

describe("JOURNEY_EVENTS", () => {
  // A regression guard: adding an event is a privacy decision (ADR 0004 §2), so it must be deliberate.
  it("is the closed list from ADR 0004", () => {
    expect([...JOURNEY_EVENTS]).toEqual([
      "profile-started",
      "profile-completed",
      "matches-viewed",
      "program-saved",
      "plan-opened",
    ]);
  });

  it("names carry no digit and no profile vocabulary", () => {
    for (const name of JOURNEY_EVENTS) {
      expect(name).not.toMatch(/\d/);
      expect(name).not.toMatch(/grade|nationality|country|field|budget|language/);
    }
  });
});
