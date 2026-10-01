import { describe, expect, it } from "vitest";

import { CHANNEL_SUMMARIES, programmeSummary } from "../../../scripts/import/summaries";

describe("summaries", () => {
  it("writes the same title and institution in all three locales, as drafts", () => {
    const s = programmeSummary("Informatik BSc", "THA", "Augsburg", "daad");
    expect(s.fr.text).toMatch(/^Informatik BSc, THA \(Augsburg\)\. Programme recensé/);
    expect(s.en.text).toBe(
      "Informatik BSc, THA (Augsburg). Programme listed in the DAAD international programmes database.",
    );
    expect(s.ar.text).toContain("Informatik BSc, THA (Augsburg).");
    expect(Object.values(s).every((v) => v.status === "draft")).toBe(true);
  });
  it("keeps every summary within the 400 character limit", () => {
    expect(programmeSummary("x".repeat(500), "I", "C", "rio").en.text).toHaveLength(400);
  });
  it("has en and ar for every channel", () => {
    for (const s of Object.values(CHANNEL_SUMMARIES)) {
      expect(s.en.text.length).toBeGreaterThan(10);
      expect(s.ar.text.length).toBeGreaterThan(10);
    }
  });
});
