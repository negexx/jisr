import { loadData } from "@scripts/data/load-data";
import { resolveCatalog } from "@scripts/data/resolve";
import { buildShards } from "@scripts/data/shard";
import { validateData } from "@scripts/data/validate";
import { describe, expect, it } from "vitest";
import type {
  CoreShard,
  ProgramsShard,
  ScholarshipsShard,
  TextShard,
} from "@/data-schema/snapshot";

const FIXTURES = "tests/fixtures/data";

function shardsOf(scenario: string) {
  const { catalog, errors } = validateData(loadData(`${FIXTURES}/${scenario}`), {
    now: "2026-09-29",
  });
  expect(errors).toEqual([]);
  return buildShards(resolveCatalog(catalog));
}

function shardNamed(shards: ReturnType<typeof shardsOf>, name: string) {
  const found = shards.find((s) => s.name === name);
  if (found === undefined) throw new Error(`no shard ${name}`);
  return found.shard;
}

describe("buildShards on valid-minimal", () => {
  const shards = shardsOf("valid-minimal");
  const withText = [
    "core",
    "costs.XB",
    "programs.XB.xx-test-field",
    "routes.XA",
    "scholarships.XB",
    "scholarships.XC",
  ];

  it("emits exactly the expected shard names, sorted", () => {
    const names = shards.map((s) => s.name);
    expect(names).toEqual(
      [
        ...withText,
        "institutions.XB",
        ...["ar", "en", "fr"].flatMap((locale) => withText.map((s) => `text.${locale}.${s}`)),
      ].sort(),
    );
  });

  it("names each shard after its kind", () => {
    for (const { name, shard } of shards) {
      expect(name === shard.kind || name.startsWith(`${shard.kind}.`)).toBe(true);
    }
  });

  it("duplicates a multi-destination scholarship into each destination", () => {
    for (const destination of ["XB", "XC"]) {
      const shard = shardNamed(shards, `scholarships.${destination}`) as ScholarshipsShard;
      expect(shard.destination).toBe(destination);
      expect(shard.scholarships.map((s) => s.slug)).toEqual(["xx-test-schol"]);
    }
  });

  it("puts the scholarship's texts in the text shard of each destination", () => {
    for (const destination of ["XB", "XC"]) {
      const text = shardNamed(shards, `text.fr.scholarships.${destination}`) as TextShard;
      expect(Object.keys(text.entries)).toContain("scholarships/xx-test-schol#howToApply");
      expect(text.locale).toBe("fr");
      expect(text.shard).toBe(`scholarships.${destination}`);
    }
  });

  it("puts country names, glosses and channel summaries in the core text shard", () => {
    const text = shardNamed(shards, "text.en.core") as TextShard;
    expect(Object.keys(text.entries).sort()).toEqual([
      "application-channels/xx-test-channel#summary",
      "countries/XA#name",
      "countries/XB#name",
      "countries/XC#name",
      "credential-types/xx-test-cred#gloss",
      "credential-types/xx-test-cred#tracks.0.gloss",
      "fields/xx-test-field#name",
      "subjects/xx-test-subject-math#name",
    ]);
    expect(text.entries["countries/XA#name"]).toEqual({
      text: "Test country A",
      status: "draft",
      fallback: false,
    });
    expect(text.entries["countries/XC#name"]?.fallback).toBe(true);
  });

  it("holds vocabulary, scales and channels in core", () => {
    const core = shardNamed(shards, "core") as CoreShard;
    expect(core.countries.map((c) => c.code)).toEqual(["XA", "XB", "XC"]);
    expect(core.gradingScales).toHaveLength(2);
    expect(core.gradeConversions).toHaveLength(1);
    expect(core.credentialTypes).toHaveLength(1);
    expect(core.applicationChannels).toHaveLength(1);
    expect(core.languageCertificates).toHaveLength(1);
  });

  it("shards programs by destination and field", () => {
    const shard = shardNamed(shards, "programs.XB.xx-test-field") as ProgramsShard;
    expect(shard).toMatchObject({ kind: "programs", destination: "XB", field: "xx-test-field" });
    expect(shard.programs.map((p) => p.slug)).toEqual(["xx-test-prog"]);
  });

  it("emits no text shard for a structural shard without text", () => {
    expect(
      shards.some((s) => s.name.startsWith("text.") && s.name.endsWith("institutions.XB")),
    ).toBe(false);
  });
});

describe("buildShards on an empty catalog", () => {
  it("emits only core, with empty arrays", () => {
    const shards = shardsOf("empty");
    expect(shards.map((s) => s.name)).toEqual(["core"]);
    expect(shards[0]?.shard).toEqual({
      kind: "core",
      countries: [],
      fields: [],
      subjects: [],
      languageCertificates: [],
      gradingScales: [],
      gradeConversions: [],
      credentialTypes: [],
      applicationChannels: [],
    });
  });
});
