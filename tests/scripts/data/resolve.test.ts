import { BuildError } from "@scripts/data/build-error";
import { canonicalJson } from "@scripts/data/canonical-json";
import { loadData } from "@scripts/data/load-data";
import { resolveCatalog, textKey } from "@scripts/data/resolve";
import type { Catalog } from "@scripts/data/validate";
import { validateData } from "@scripts/data/validate";
import { describe, expect, it } from "vitest";
import { addDays } from "@/data-schema/dates";
import { estimateCost } from "@/domain/costs";

const FIXTURES = "tests/fixtures/data";
const NOW = "2026-09-29";

function catalogOf(scenario: string): Catalog {
  const result = validateData(loadData(`${FIXTURES}/${scenario}`), { now: NOW });
  expect(result.errors).toEqual([]);
  return result.catalog;
}

function only<T>(items: readonly T[], index = 0): T {
  const item = items[index];
  if (item === undefined) throw new Error(`no item at ${index}`);
  return item;
}

describe("textKey", () => {
  it("joins collection, id and dotted path", () => {
    expect(textKey("programs", "xx-test-prog", "documents.0.name")).toBe(
      "programs/xx-test-prog#documents.0.name",
    );
  });
});

describe("resolveCatalog on valid-minimal", () => {
  const resolved = resolveCatalog(catalogOf("valid-minimal"));
  const program = only(resolved.programs).value;

  it("resolves a fact's source key to url and date and keeps its class", () => {
    expect(program.tuition).toEqual({
      value: { amountMinor: 100000, currency: "XTS", period: "year" },
      source_url: "https://example.org/xx-test-fees",
      info_kind: "official",
      last_verified_at: "2026-09-01",
      class: "volatile",
    });
    expect(program.durationYears.class).toBe("stable");
  });

  it("keeps rules in data order", () => {
    expect(program.requirements.rules.map((r) => r.id)).toEqual([
      "xx-test-rule-grade",
      "xx-test-rule-subject",
      "xx-test-rule-language",
      "xx-test-rule-manual",
    ]);
    expect(program.requirements.fact.class).toBe("stable");
    expect(only(program.requirements.rules).fact).toEqual({
      source_url: "https://example.org/xx-test",
      info_kind: "official",
      last_verified_at: "2026-09-01",
      class: "stable",
    });
  });

  it("turns rule notes, documents and summaries into text keys", () => {
    const manual = program.requirements.rules.find((r) => r.kind === "manual_check");
    expect(manual?.kind === "manual_check" ? manual.note : null).toBe(
      "programs/xx-test-prog#requirements.rules.xx-test-rule-manual.note",
    );
    expect(program.documents.value?.[0]?.name).toBe("programs/xx-test-prog#documents.0.name");
    expect(program.summary).toBe("programs/xx-test-prog#summary");
  });

  it("adds the texts to the record's bag", () => {
    const { texts } = only(resolved.programs);
    expect([...texts.keys()].sort()).toEqual([
      "programs/xx-test-prog#documents.0.name",
      "programs/xx-test-prog#requirements.rules.xx-test-rule-manual.note",
      "programs/xx-test-prog#summary",
    ]);
    expect(texts.get("programs/xx-test-prog#summary")?.fr.text).toBe("Programme test");
  });

  it("gives estimates a basis text key and leaves other facts without one", () => {
    const profile = only(resolved.costProfiles).value;
    expect(profile.lines.housing?.basis).toBe("cost-profiles/xx-test-costs-xb#lines.housing.basis");
    expect(profile.lines.housing?.class).toBe("stable");
    expect(profile.lines.application_visa?.class).toBe("volatile");
    expect(profile.lines.application_visa).not.toHaveProperty("basis");
    expect(profile.lines).not.toHaveProperty("food");
    expect(only(resolved.costProfiles).texts.size).toBe(1);
  });

  it("copies the institution type onto the program", () => {
    expect(program.institutionType).toBe("public");
  });

  it("gives route conditions a stable fact and text keys", () => {
    const route = only(resolved.routes);
    expect(only(route.value.conditions).fact.class).toBe("stable");
    expect(route.value.note).toBe("admission-routes/xx-test-route-xa-xb#note");
    expect(route.value.fact.class).toBe("stable");
    expect([...route.texts.keys()]).toEqual(["admission-routes/xx-test-route-xa-xb#note"]);
  });

  it("keys credential glosses and track glosses by index", () => {
    const credential = only(resolved.credentialTypes);
    expect(credential.value.gloss).toBe("credential-types/xx-test-cred#gloss");
    expect(only(credential.value.tracks).gloss).toBe(
      "credential-types/xx-test-cred#tracks.0.gloss",
    );
    expect(only(resolved.applicationChannels).value.summary).toBe(
      "application-channels/xx-test-channel#summary",
    );
  });

  it("keys scholarship texts", () => {
    const { value } = only(resolved.scholarships);
    expect(value.summary).toBe("scholarships/xx-test-schol#summary");
    expect(value.howToApply).toBe("scholarships/xx-test-schol#howToApply");
    expect(value.support.class).toBe("volatile");
    expect(value.deadline.class).toBe("volatile");
    expect(value.documents.class).toBe("stable");
  });

  it("carries no raw source key anywhere", () => {
    const values = Object.values(resolved).flatMap((items) => items.map((item) => item.value));
    expect(canonicalJson(values)).not.toMatch(/"source":/);
  });

  it("sorts top-level records by id", () => {
    expect(resolved.countries.map((c) => c.value.code)).toEqual(["XA", "XB", "XC"]);
    expect(resolved.gradingScales.map((s) => s.value.slug)).toEqual([
      "xx-test-scale-20",
      "xx-test-scale-5",
    ]);
  });

  it("copies grade conversions and record-level facts", () => {
    const conversion = only(resolved.gradeConversions).value;
    expect(conversion.conversion.method).toBe("modified_bavarian");
    expect(conversion.fact.last_verified_at).toBe("2026-09-01");
  });

  it("does not mutate the loaded records", () => {
    const catalog = catalogOf("valid-minimal");
    const before = canonicalJson(Object.fromEntries(catalog.programs));
    resolveCatalog(catalog);
    expect(canonicalJson(Object.fromEntries(catalog.programs))).toBe(before);
  });
});

describe("resolveCatalog edge cases", () => {
  it("uses null for a route without a note and a track without a gloss", () => {
    const catalog = catalogOf("valid-minimal");
    const route = only([...catalog["admission-routes"].values()]).record;
    const credential = only([...catalog["credential-types"].values()]).record;
    const track = only(credential.tracks);
    catalog["admission-routes"].set(route.slug, {
      file: "x",
      record: { ...route, note: undefined },
    });
    catalog["credential-types"].set(credential.slug, {
      file: "x",
      record: { ...credential, tracks: [{ ...track, gloss: undefined }] },
    });
    const resolved = resolveCatalog(catalog);
    expect(only(resolved.routes).value.note).toBeNull();
    expect(only(only(resolved.credentialTypes).value.tracks).gloss).toBeNull();
  });

  it("throws BuildError naming the key when two texts collide on a TextKey", () => {
    const catalog = catalogOf("valid-minimal");
    const route = only([...catalog["admission-routes"].values()]).record;
    const manualCheck = (text: string) => ({
      id: "xx-test-cond-dup",
      kind: "manual_check" as const,
      source: "main",
      info_kind: "official" as const,
      note: { fr: { text, status: "draft" as const } },
    });
    // Schema validation rejects duplicate ids; the resolver must still not overwrite silently.
    catalog["admission-routes"].set(route.slug, {
      file: "x",
      record: { ...route, conditions: [manualCheck("Un"), manualCheck("Un")] },
    });
    expect(() => resolveCatalog(catalog)).toThrow(BuildError);
    expect(() => resolveCatalog(catalog)).toThrow(
      "duplicate text key admission-routes/xx-test-route-xa-xb#conditions.xx-test-cond-dup.note",
    );
  });

  it("keeps provenance and basis text for null-valued facts and emits no document keys", () => {
    const catalog = catalogOf("valid-minimal");
    const program = only([...catalog.programs.values()]).record;
    const basis = { fr: { text: "Non publie", status: "draft" as const } };
    catalog.programs.set(program.slug, {
      file: "x",
      record: {
        ...program,
        documents: { ...program.documents, value: null, basis },
        tuition: { ...program.tuition, value: null, info_kind: "estimate", basis },
      },
    });
    const resolved = only(resolveCatalog(catalog).programs);
    expect(resolved.value.documents).toEqual({
      value: null,
      source_url: "https://example.org/xx-test",
      info_kind: "official",
      last_verified_at: "2026-09-01",
      class: "stable",
      basis: "programs/xx-test-prog#documents.basis",
    });
    expect(resolved.value.tuition).toEqual({
      value: null,
      source_url: "https://example.org/xx-test-fees",
      info_kind: "estimate",
      last_verified_at: "2026-09-01",
      class: "volatile",
      basis: "programs/xx-test-prog#tuition.basis",
    });
    const keys = [...resolved.texts.keys()];
    expect(keys).toContain("programs/xx-test-prog#documents.basis");
    expect(keys).toContain("programs/xx-test-prog#tuition.basis");
    expect(keys.some((key) => /#documents\.\d+\.name$/.test(key))).toBe(false);
  });

  it("throws BuildError when a program's institution is missing", () => {
    const catalog = catalogOf("valid-minimal");
    catalog.institutions.clear();
    expect(() => resolveCatalog(catalog)).toThrow(BuildError);
  });

  it("resolves an empty catalog to empty arrays", () => {
    const resolved = resolveCatalog(catalogOf("empty"));
    expect(Object.values(resolved).every((items) => items.length === 0)).toBe(true);
  });
});

describe("cost line freshness on resolved data", () => {
  it("ages a visa fee line while a housing line of the same age is still fresh", () => {
    const resolved = resolveCatalog(catalogOf("valid-minimal"));
    const now = addDays("2026-09-01", 130);
    const estimate = estimateCost({
      program: only(resolved.programs).value,
      costProfiles: resolved.costProfiles.map((r) => r.value),
      budget: null,
      now,
    });
    const freshnessOf = (category: string) =>
      estimate.lines.find((l) => l.category === category)?.fact?.freshness;
    expect(freshnessOf("application_visa")).toBe("aging");
    expect(freshnessOf("housing")).toBe("fresh");
  });
});
