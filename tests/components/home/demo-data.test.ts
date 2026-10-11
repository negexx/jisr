import { loadData } from "@scripts/data/load-data";
import { resolveCatalog } from "@scripts/data/resolve";
import { validateData } from "@scripts/data/validate";
import { describe, expect, it } from "vitest";

import {
  DEMO_CORE,
  DEMO_COUNTRIES,
  DEMO_INSTITUTIONS,
  DEMO_PROGRAMS,
  DEMO_ROUTES,
} from "@/components/home/demo-data";

// The demo fixture is generated from the real records, so this test re-reads data/ through the
// same pipeline and fails whenever data/ and the committed fixture drift apart.
const DATA_DIR = "data";
const NOW = "2026-10-11";
const DEMO_SLUGS = [
  "de-technische-hochschule-aschaffenburg-hrk333-software-design-internat-daad9225",
  "de-friedrich-alexander-universitat-erlangen-hrk70-artificial-intelligence-daad9594",
  "fr-aix-marseille-universite-site-de-marseil-0134316w-licence-sciences-pour-lingenieur-39236",
] as const;

const resolved = resolveCatalog(validateData(loadData(DATA_DIR), { now: NOW }).catalog);

function realProgram(slug: string) {
  const found = resolved.programs.find((entry) => entry.value.slug === slug);
  if (found === undefined) throw new Error(`data/ has no program "${slug}"`);
  return found.value;
}

function demoProgram(slug: string) {
  const found = DEMO_PROGRAMS.find((program) => program.slug === slug);
  if (found === undefined) throw new Error(`demo fixture has no program "${slug}"`);
  return found;
}

describe("demo fixture is extracted from the shipped data/", () => {
  it("ships exactly the three chosen programmes", () => {
    expect(DEMO_PROGRAMS.map((program) => program.slug).sort()).toEqual([...DEMO_SLUGS].sort());
  });

  it.each(DEMO_SLUGS)("copies every fact of %s verbatim from data/", (slug) => {
    const demo = demoProgram(slug);
    const real = realProgram(slug);

    expect(demo.name).toBe(real.name);
    expect(demo.institution).toBe(real.institution);
    expect(demo.city).toBe(real.city);
    expect(demo.field).toBe(real.field);
    expect(demo.level).toBe(real.level);
    expect(demo.country).toBe(real.country);
    expect(demo.officialUrl).toBe(real.officialUrl);
    expect(demo.teachingLanguages).toEqual(real.teachingLanguages);
    expect(demo.tuition).toEqual(real.tuition);
    expect(demo.durationYears).toEqual(real.durationYears);
    expect(demo.intakes).toEqual(real.intakes);
    expect(demo.documents).toEqual(real.documents);
    expect(demo.requirements.rules).toEqual(real.requirements.rules);
    expect(demo.requirements.fact).toEqual(real.requirements.fact);
  });

  it("overrides only requirements.coverage, the documented illustrative flag", () => {
    for (const slug of DEMO_SLUGS) {
      expect(realProgram(slug).requirements.coverage).toBe("partial");
      expect(demoProgram(slug).requirements.coverage).toBe("complete");
    }
  });

  it("supplies a direct, condition-free route covering every demo programme", () => {
    for (const program of DEMO_PROGRAMS) {
      const route = DEMO_ROUTES.find(
        (candidate) =>
          candidate.origin === "MA" &&
          candidate.credentialType === "ma-bac" &&
          candidate.destination === program.country &&
          candidate.level === "bachelor",
      );
      expect(route, `no demo route covers ${program.slug}`).toBeDefined();
      expect(route?.outcome).toBe("direct");
      expect(route?.conditions).toEqual([]);
    }
    expect(DEMO_ROUTES.every((route) => route.outcome === "direct")).toBe(true);
    expect(DEMO_ROUTES.every((route) => route.conditions.length === 0)).toBe(true);
  });

  it("reuses the real ma-bac-to-de source but marks the curated route as guidance", () => {
    const real = resolved.routes.find((entry) => entry.value.slug === "ma-bac-to-de")?.value;
    expect(real).toBeDefined();
    const demo = DEMO_ROUTES.find((route) => route.slug === "demo-ma-bac-to-de");
    expect(demo).toBeDefined();
    expect(demo?.fact.source_url).toBe(real?.fact.source_url);
    expect(demo?.fact.last_verified_at).toBe(real?.fact.last_verified_at);
    expect(demo?.fact.info_kind).toBe("guidance");
  });

  it("reuses the real, already-direct ma-bac-to-fr route verbatim", () => {
    const real = resolved.routes.find((entry) => entry.value.slug === "ma-bac-to-fr")?.value;
    expect(real?.outcome).toBe("direct");
    expect(real?.conditions).toEqual([]);
    expect(DEMO_ROUTES.find((route) => route.slug === "ma-bac-to-fr")).toEqual(real);
  });

  it("carries the core reference the matching reads", () => {
    expect(DEMO_CORE.credentialTypes.map((credential) => credential.slug)).toContain("ma-bac");
    expect(DEMO_CORE.gradingScales.map((scale) => scale.slug)).toContain("ma-bac-scale");
    expect(Array.isArray(DEMO_CORE.gradeConversions)).toBe(true);
  });

  it("carries the demo programmes' institutions verbatim", () => {
    for (const program of DEMO_PROGRAMS) {
      const demo = DEMO_INSTITUTIONS.find((entry) => entry.slug === program.institution);
      const real = resolved.institutions.find(
        (entry) => entry.value.slug === program.institution,
      )?.value;
      expect(demo).toEqual(real);
    }
  });

  it("carries the demo programmes' countries verbatim", () => {
    for (const program of DEMO_PROGRAMS) {
      const demo = DEMO_COUNTRIES.find((entry) => entry.code === program.country);
      const real = resolved.countries.find((entry) => entry.value.code === program.country)?.value;
      expect(demo).toEqual(real);
    }
  });
});
