import { afterEach, describe, expect, it, vi } from "vitest";

import { todayIso } from "@/lib/clock";

describe("todayIso", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ["2026-09-30T12:00:00Z", "2026-09-30"],
    ["2026-09-30T23:59:59Z", "2026-09-30"],
    ["2026-10-01T00:00:00Z", "2026-10-01"],
    ["2024-02-29T23:59:59Z", "2024-02-29"],
    ["2024-03-01T00:00:00Z", "2024-03-01"],
    ["2024-12-31T23:59:59Z", "2024-12-31"],
    ["2025-01-01T00:00:00Z", "2025-01-01"],
    ["2026-01-05T08:00:00Z", "2026-01-05"],
  ])("reads %s as the UTC day %s", (instant, expected) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(instant));
    expect(todayIso()).toBe(expected);
  });

  it("uses the UTC day even when the instant is written with another offset", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T23:30:00-05:00"));
    expect(todayIso()).toBe("2026-10-01");
  });
});
