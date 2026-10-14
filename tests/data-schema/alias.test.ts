import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { type AliasRow, aliasMapOf, checkAliases, type LiveId } from "@scripts/data/aliases";
import { loadData } from "@scripts/data/load-data";
import { runBuild } from "@scripts/data/run-build";
import { validateData } from "@scripts/data/validate";
import { describe, expect, it } from "vitest";

import { InstitutionRecordSchema } from "@/data-schema/records/institution";
import { ProgramRecordSchema } from "@/data-schema/records/program";

const NOW = "2026-09-30";
const FIXTURES = "tests/fixtures/data";

type Obj = Record<string, unknown>;

const SRC = { main: { url: "https://example.org/x", last_verified_at: "2026-09-01" } };
const T = (text: string) => ({ fr: { text, status: "draft" as const } });
const F = <V>(value: V) => ({ value, source: "main", info_kind: "official" as const });

const document = (slug: string): Obj => ({
  slug,
  name: T("Document"),
  translationRequired: null,
});
const program = (o: Obj = {}): Obj => ({
  slug: "xx-test-prog",
  institution: "xx-test-inst",
  country: "XB",
  city: "xx-test-city",
  field: "xx-test-field",
  level: "bachelor",
  name: "Test Program",
  summary: T("Summary"),
  officialUrl: "https://example.org/prog",
  durationYears: F(3),
  teachingLanguages: F(["xx"]),
  tuition: F({ amountMinor: 1000, currency: "XTS", period: "year" }),
  intakes: F([
    { startDate: "2027-09-01", applicationOpens: null, applicationDeadline: "2027-03-01" },
  ]),
  applicationChannel: F("xx-test-channel"),
  documents: F([document("xx-test-doc")]),
  requirements: { coverage: "partial", source: "main", info_kind: "official", rules: [] },
  scholarships: [],
  sources: SRC,
  ...o,
});
const institution = (o: Obj = {}): Obj => ({
  slug: "xx-test-inst",
  name: "Test Institution",
  country: "XB",
  city: { slug: "xx-test-city", name: "Test City" },
  type: "public",
  website: "https://example.org/inst",
  source: "main",
  info_kind: "official",
  sources: SRC,
  ...o,
});

describe("formerSlugs on program and institution records", () => {
  type Case = {
    name: string;
    kind: "program" | "institution";
    build: () => Obj;
    accepted: unknown;
  };

  const cases: Case[] = [
    {
      name: "a program without formerSlugs keeps the field absent",
      kind: "program",
      build: () => program(),
      accepted: undefined,
    },
    {
      name: "a program may declare an empty formerSlugs list",
      kind: "program",
      build: () => program({ formerSlugs: [] }),
      accepted: [],
    },
    {
      name: "a program may declare one former slug",
      kind: "program",
      build: () => program({ formerSlugs: ["xx-test-prog-old"] }),
      accepted: ["xx-test-prog-old"],
    },
    {
      name: "a program may declare several former slugs",
      kind: "program",
      build: () => program({ formerSlugs: ["xx-test-prog-a", "xx-test-prog-b"] }),
      accepted: ["xx-test-prog-a", "xx-test-prog-b"],
    },
    {
      name: "an institution may declare one former slug",
      kind: "institution",
      build: () => institution({ formerSlugs: ["xx-test-inst-old"] }),
      accepted: ["xx-test-inst-old"],
    },
    {
      name: "a program rejects formerSlugs as a string",
      kind: "program",
      build: () => program({ formerSlugs: "xx-test-prog-old" }),
      accepted: null,
    },
    {
      name: "a program rejects a formerSlugs entry that is not a slug",
      kind: "program",
      build: () => program({ formerSlugs: [1] }),
      accepted: null,
    },
    {
      name: "a program rejects a formerSlugs entry that is not kebab-case",
      kind: "program",
      build: () => program({ formerSlugs: ["xx-test-prog--old"] }),
      accepted: null,
    },
    {
      name: "a program rejects an uppercase formerSlugs entry",
      kind: "program",
      build: () => program({ formerSlugs: ["XX-Test-Prog-Old"] }),
      accepted: null,
    },
    {
      name: "an institution rejects a formerSlugs entry that is not kebab-case",
      kind: "institution",
      build: () => institution({ formerSlugs: ["old slug"] }),
      accepted: null,
    },
  ];

  it.each(cases)("$name", ({ kind, build, accepted }) => {
    const schema = kind === "program" ? ProgramRecordSchema : InstitutionRecordSchema;
    const result = schema.safeParse(build());
    if (accepted === null) {
      expect(result.success).toBe(false);
      return;
    }
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as { formerSlugs?: unknown }).formerSlugs).toEqual(accepted);
    }
  });

  it("keeps formerSlugs absent when the record does not declare it", () => {
    const parsed = ProgramRecordSchema.parse(program());
    expect(Object.hasOwn(parsed, "formerSlugs")).toBe(false);
  });
});

describe("checkAliases", () => {
  type Case = {
    name: string;
    rows: AliasRow[];
    liveIds?: LiveId[];
    expected: Array<{ file: string; path: string; message: string }>;
  };

  const collision = (entry: string, liveFile: string) =>
    `alias collision: former slug "${entry}" is already a live slug (${liveFile})`;
  const duplicate = (entry: string, otherFile: string) =>
    `duplicate former slug "${entry}" (also in ${otherFile})`;
  const cycle = (chain: string) => `alias cycle: ${chain}`;

  const cases: Case[] = [
    {
      name: "accepts records without former slugs",
      rows: [
        { file: "programs/a.yaml", slug: "prog-a", formerSlugs: [] },
        { file: "programs/b.yaml", slug: "prog-b", formerSlugs: [] },
      ],
      expected: [],
    },
    {
      name: "accepts a former slug no record uses as a live slug",
      rows: [{ file: "programs/a.yaml", slug: "prog-a", formerSlugs: ["prog-old"] }],
      expected: [],
    },
    {
      name: "accepts distinct unused former slugs across programs and institutions",
      rows: [
        { file: "programs/a.yaml", slug: "prog-a", formerSlugs: ["prog-old-a"] },
        { file: "institutions/b.yaml", slug: "inst-b", formerSlugs: ["inst-old-b"] },
      ],
      expected: [],
    },
    {
      name: "rejects a former slug that is another record's live slug",
      rows: [
        { file: "programs/a.yaml", slug: "prog-a", formerSlugs: ["prog-old"] },
        { file: "programs/b.yaml", slug: "prog-old", formerSlugs: [] },
      ],
      expected: [
        {
          file: "programs/a.yaml",
          path: "formerSlugs.0",
          message: collision("prog-old", "programs/b.yaml"),
        },
      ],
    },
    {
      name: "rejects a record's own live slug among its former slugs",
      rows: [{ file: "programs/a.yaml", slug: "prog-a", formerSlugs: ["prog-a"] }],
      expected: [
        { file: "programs/a.yaml", path: "", message: cycle("prog-a -> prog-a") },
        {
          file: "programs/a.yaml",
          path: "formerSlugs.0",
          message: collision("prog-a", "programs/a.yaml"),
        },
      ],
    },
    {
      name: "rejects a former slug that equals a live id of another collection",
      rows: [{ file: "programs/a.yaml", slug: "prog-a", formerSlugs: ["xx-test-field"] }],
      liveIds: [{ id: "xx-test-field", file: "fields/xx-test-field.yaml" }],
      expected: [
        {
          file: "programs/a.yaml",
          path: "formerSlugs.0",
          message: collision("xx-test-field", "fields/xx-test-field.yaml"),
        },
      ],
    },
    {
      name: "rejects the same former slug on two records",
      rows: [
        { file: "programs/a.yaml", slug: "prog-a", formerSlugs: ["prog-old"] },
        { file: "institutions/b.yaml", slug: "inst-b", formerSlugs: ["prog-old"] },
      ],
      expected: [
        {
          file: "programs/a.yaml",
          path: "formerSlugs.0",
          message: duplicate("prog-old", "institutions/b.yaml"),
        },
      ],
    },
    {
      name: "rejects the same former slug twice on one record",
      rows: [{ file: "programs/a.yaml", slug: "prog-a", formerSlugs: ["prog-old", "prog-old"] }],
      expected: [
        {
          file: "programs/a.yaml",
          path: "formerSlugs.1",
          message: duplicate("prog-old", "programs/a.yaml"),
        },
      ],
    },
    {
      name: "rejects a mutual former-slug cycle and reports it once",
      rows: [
        { file: "programs/a.yaml", slug: "prog-a", formerSlugs: ["prog-b"] },
        { file: "programs/b.yaml", slug: "prog-b", formerSlugs: ["prog-a"] },
      ],
      expected: [
        { file: "programs/a.yaml", path: "", message: cycle("prog-a -> prog-b -> prog-a") },
        {
          file: "programs/a.yaml",
          path: "formerSlugs.0",
          message: collision("prog-b", "programs/b.yaml"),
        },
        {
          file: "programs/b.yaml",
          path: "formerSlugs.0",
          message: collision("prog-a", "programs/a.yaml"),
        },
      ],
    },
    {
      name: "reports a collision and a duplicate independently of each other",
      rows: [
        { file: "programs/a.yaml", slug: "prog-a", formerSlugs: ["prog-x"] },
        { file: "programs/b.yaml", slug: "prog-b", formerSlugs: ["prog-x"] },
      ],
      liveIds: [{ id: "prog-x", file: "programs/x.yaml" }],
      expected: [
        {
          file: "programs/a.yaml",
          path: "formerSlugs.0",
          message: collision("prog-x", "programs/x.yaml"),
        },
        {
          file: "programs/b.yaml",
          path: "formerSlugs.0",
          message: collision("prog-x", "programs/x.yaml"),
        },
        {
          file: "programs/b.yaml",
          path: "formerSlugs.0",
          message: duplicate("prog-x", "programs/a.yaml"),
        },
      ],
    },
  ];

  it.each(cases)("$name", ({ rows, liveIds, expected }) => {
    expect(checkAliases(rows, liveIds ?? [])).toEqual(expected);
  });
});

describe("aliasMapOf", () => {
  it("returns an empty map when no record declares former slugs", () => {
    expect(
      aliasMapOf([
        { file: "programs/a.yaml", slug: "prog-a", formerSlugs: [] },
        { file: "programs/b.yaml", slug: "prog-b", formerSlugs: [] },
      ]),
    ).toEqual({});
  });

  it("maps each former slug to its record's current slug", () => {
    expect(
      aliasMapOf([
        { file: "programs/a.yaml", slug: "prog-new", formerSlugs: ["prog-old"] },
        { file: "institutions/b.yaml", slug: "inst-new", formerSlugs: ["inst-old"] },
      ]),
    ).toEqual({ "prog-old": "prog-new", "inst-old": "inst-new" });
  });

  it("flattens a chain so a former slug pointing at a renamed target resolves to the final slug", () => {
    expect(
      aliasMapOf([
        { file: "programs/b.yaml", slug: "prog-mid", formerSlugs: ["prog-old"] },
        { file: "programs/c.yaml", slug: "prog-new", formerSlugs: ["prog-mid"] },
      ]),
    ).toEqual({ "prog-old": "prog-new", "prog-mid": "prog-new" });
  });
});

describe("data:check alias rules on fixtures", () => {
  const validate = (dir: string) => validateData(loadData(`${FIXTURES}/${dir}`), { now: NOW });

  it("keeps the e2e fixture green", () => {
    const result = validate("e2e-journey");
    expect(result.errors).toEqual([]);
  });

  it("fails the alias-collision fixture with the alias collision error", () => {
    const result = validate("invalid-alias-collision");
    const messages = result.errors.map((e) => e.message);
    expect(messages).toContain(
      'alias collision: former slug "xx-test-inst-b" is already a live slug (institutions/xx-test-inst-b.yaml)',
    );
  });

  it("fails the alias-cycle fixture with the alias cycle error", () => {
    const result = validate("invalid-alias-cycle");
    const messages = result.errors.map((e) => e.message);
    expect(messages).toContain("alias cycle: xx-test-inst-c -> xx-test-inst-d -> xx-test-inst-c");
    expect(messages.some((m) => m.startsWith("alias collision"))).toBe(true);
  });

  it("builds the fixture program's former slug into the manifest alias map", () => {
    const outDir = mkdtempSync(path.join(os.tmpdir(), "jisr-alias-"));
    try {
      const manifest = runBuild({
        dataDir: `${FIXTURES}/e2e-journey`,
        outDir,
        generatedAt: "2026-09-30T10:00:00.000Z",
        now: NOW,
      });
      expect(manifest.aliases).toEqual({ "xx-test-prog-old-ok": "xx-test-prog-ok" });
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});
