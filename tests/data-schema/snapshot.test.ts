import { describe, expect, it } from "vitest";

import { LOCALES } from "@/data-schema/primitives";
import type { Program } from "@/data-schema/resolved";
import { ManifestSchema, SHARD_GZIP_BUDGET_BYTES, shardNames } from "@/data-schema/snapshot";
import { routing } from "@/i18n/routing";

describe("locale parity", () => {
  it("LOCALES equals the next-intl routing locales", () => {
    expect([...LOCALES]).toEqual([...routing.locales]);
  });
});

describe("shardNames", () => {
  it.each([
    [shardNames.core(), "core"],
    [shardNames.routes("XA"), "routes.XA"],
    [shardNames.institutions("XB"), "institutions.XB"],
    [shardNames.costs("XB"), "costs.XB"],
    [shardNames.programs("XB", "xx-test-field"), "programs.XB.xx-test-field"],
    [shardNames.scholarships("XB"), "scholarships.XB"],
    [shardNames.text("ar", "core"), "text.ar.core"],
  ])("%s", (actual, expected) => {
    expect(actual).toBe(expected);
  });
});

const SHARD = {
  file: "s/core.0123456789ab.json",
  sha256: "a".repeat(64),
  bytes: 10,
  gzipBytes: 8,
};
const MANIFEST = {
  formatVersion: 1,
  snapshotVersion: "0123456789ab",
  generatedAt: "2026-09-29T10:00:00.000Z",
  locales: ["fr", "en", "ar"],
  shards: { core: SHARD },
};

describe("ManifestSchema", () => {
  it.each([
    ["valid", MANIFEST, true],
    ["formatVersion 2", { ...MANIFEST, formatVersion: 2 }, false],
    ["short snapshotVersion", { ...MANIFEST, snapshotVersion: "abc" }, false],
    ["no locales", { ...MANIFEST, locales: [] }, false],
    ["bad file name", { ...MANIFEST, shards: { core: { ...SHARD, file: "core.json" } } }, false],
    [
      "uppercase hash",
      { ...MANIFEST, shards: { core: { ...SHARD, sha256: "A".repeat(64) } } },
      false,
    ],
    ["zero bytes", { ...MANIFEST, shards: { core: { ...SHARD, bytes: 0 } } }, false],
    ["extra key", { ...MANIFEST, extra: 1 }, false],
  ])("%s", (_label, input, ok) => {
    expect(ManifestSchema.safeParse(input).success).toBe(ok);
  });

  it("budget is 300 KiB", () => {
    expect(SHARD_GZIP_BUDGET_BYTES).toBe(307200);
  });
});

// Compile-only: never called. `pnpm typecheck` fails if resolved.ts drifts from the contract.
export function assertProgramShape(): Program {
  const fact = {
    source_url: "https://example.test/xx-test",
    info_kind: "official",
    last_verified_at: "2026-09-29",
    class: "stable",
  } as const;
  const p: Program = {
    slug: "xx-test-prog",
    institution: "xx-test-inst",
    institutionType: "public",
    country: "XB",
    city: "xx-test-city",
    field: "xx-test-field",
    level: "bachelor",
    name: "Test programme",
    summary: "programs/xx-test-prog#summary",
    officialUrl: "https://example.test/xx-test",
    durationYears: { ...fact, value: 3 },
    teachingLanguages: { ...fact, value: ["fr"] },
    tuition: {
      ...fact,
      class: "volatile",
      value: { amountMinor: 0, currency: "EUR", period: "year" },
    },
    intakes: {
      ...fact,
      class: "volatile",
      value: [{ startDate: null, applicationOpens: null, applicationDeadline: "2027-01-15" }],
    },
    applicationChannel: { ...fact, value: "xx-test-channel" },
    documents: {
      ...fact,
      value: [
        {
          slug: "xx-test-doc",
          name: "programs/xx-test-prog#documents.0.name",
          translationRequired: null,
        },
      ],
    },
    requirements: {
      coverage: "complete",
      fact,
      rules: [
        {
          id: "r-math",
          kind: "manual_check",
          note: "programs/xx-test-prog#requirements.rules.r-math.note",
          fact,
        },
      ],
    },
    scholarships: ["xx-test-schol"],
  };
  return p;
}
