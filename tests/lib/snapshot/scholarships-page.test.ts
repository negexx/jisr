import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadProgramPageData, loadScholarshipsPageData } from "@/lib/snapshot/server";

import { E2E_SCHOLARSHIP_SLUGS, E2E_SLUGS } from "../../fixtures/e2e/profiles";
import { buildSnapshot, E2E_DATA_DIR, EMPTY_DATA_DIR, removeTempDirs } from "./fixture";

let base = "";
let empty = "";

beforeAll(() => {
  base = buildSnapshot(E2E_DATA_DIR);
  empty = buildSnapshot(EMPTY_DATA_DIR);
}, 180_000);
afterAll(removeTempDirs);

describe("loadScholarshipsPageData", () => {
  it("lists the fixture scholarships once each, by country then slug", async () => {
    const data = await loadScholarshipsPageData("fr", base);
    const slugs = data.sections.flatMap((s) => s.entries.map((e) => e.scholarship.slug));
    expect(slugs).toEqual([
      E2E_SCHOLARSHIP_SLUGS.open,
      E2E_SCHOLARSHIP_SLUGS.xaOnly,
      E2E_SCHOLARSHIP_SLUGS.xzOnly,
    ]);
    expect(data.sections.map((s) => s.country)).toEqual(["XB"]);
  });

  it("resolves the summary through the text lookup and the country name through core", async () => {
    const data = await loadScholarshipsPageData("fr", base);
    const open = data.sections[0]?.entries.find(
      (e) => e.scholarship.slug === E2E_SCHOLARSHIP_SLUGS.open,
    );
    expect(data.text(open?.scholarship.summary ?? "")?.text).toBe("Bourse test ouverte a tous");
    const country = data.core.countries.find((c) => c.code === "XB");
    expect(data.text(country?.name ?? "")?.text).toBeTruthy();
  });

  it("counts the same programmes as the programme pages list the scholarship for", async () => {
    const data = await loadScholarshipsPageData("fr", base);
    for (const entry of data.sections.flatMap((s) => s.entries)) {
      let onPages = 0;
      for (const slug of Object.values(E2E_SLUGS)) {
        const page = await loadProgramPageData(slug, "fr", base);
        if (page?.scholarships.some((s) => s.slug === entry.scholarship.slug)) onPages += 1;
      }
      expect(entry.scope, entry.scholarship.slug).toEqual({ kind: "country", count: onPages });
    }
  });

  it("returns no section for a snapshot without scholarships", async () => {
    const data = await loadScholarshipsPageData("fr", empty);
    expect(data.sections).toEqual([]);
  });
});
