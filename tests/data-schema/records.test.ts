import { describe, expect, it } from "vitest";

import type { CollectionName } from "@/data-schema/records/collections";
import { COLLECTIONS } from "@/data-schema/records/collections";
import {
  CostProfileRecordSchema,
  LIVING_COST_CATEGORIES,
} from "@/data-schema/records/cost-profile";
import { IntakeSchema } from "@/data-schema/records/program";

type Obj = Record<string, unknown>;

const SRC = { main: { url: "https://example.org/x", last_verified_at: "2026-09-01" } };
const T = (text: string) => ({ fr: { text, status: "draft" as const } });
const F = <V>(value: V) => ({ value, source: "main", info_kind: "official" as const });
const PROV = { source: "main", info_kind: "official" as const, sources: SRC };
const REQUIREMENTS = {
  coverage: "partial",
  source: "main",
  info_kind: "official",
  rules: [],
};
const COST = { min: 100, max: 200, currency: "XTS", per: "month" };
const CURRENCY = "XTS";

function omit(o: Obj, key: string): Obj {
  return Object.fromEntries(Object.entries(o).filter(([k]) => k !== key));
}

const country = (o: Obj = {}): Obj => ({ code: "XA", name: T("Xa"), currency: CURRENCY, ...o });
const field = (o: Obj = {}): Obj => ({ slug: "xx-test-field", name: T("Field"), ...o });
const subject = (o: Obj = {}): Obj => ({ slug: "xx-test-subject", name: T("Subject"), ...o });
const languageCertificate = (o: Obj = {}): Obj => ({
  slug: "xx-test-cert",
  name: "Test Certificate",
  language: "xx",
  url: "https://example.org/cert",
  ...o,
});
const gradingScale = (o: Obj = {}): Obj => ({
  slug: "xx-test-scale",
  country: "XA",
  min: 0,
  max: 20,
  pass: 10,
  direction: "higher_better",
  ...PROV,
  ...o,
});
const gradeConversion = (o: Obj = {}): Obj => ({
  slug: "xx-test-conv",
  from: "xx-test-scale",
  to: "xx-test-scale-b",
  conversion: { method: "identity", params: {} },
  ...PROV,
  ...o,
});
const credentialType = (o: Obj = {}): Obj => ({
  slug: "xx-test-cred",
  country: "XA",
  name: "Test Credential",
  gloss: T("Gloss"),
  gradingScale: "xx-test-scale",
  tracks: [{ slug: "xx-test-track", name: "Test Track", subjects: null }],
  ...PROV,
  ...o,
});
const applicationChannel = (o: Obj = {}): Obj => ({
  slug: "xx-test-channel",
  name: "Test Channel",
  country: "XB",
  kind: "national_portal",
  url: "https://example.org/apply",
  accountRequired: true,
  summary: T("Summary"),
  ...PROV,
  ...o,
});
const admissionRoute = (o: Obj = {}): Obj => ({
  slug: "xx-test-route",
  origin: "XA",
  credentialType: "xx-test-cred",
  destination: "XB",
  level: "bachelor",
  outcome: "direct",
  applicationChannels: ["xx-test-channel"],
  ...PROV,
  ...o,
});
const institution = (o: Obj = {}): Obj => ({
  slug: "xx-test-inst",
  name: "Test Institution",
  country: "XB",
  city: { slug: "xx-test-city", name: "Test City" },
  type: "public",
  website: "https://example.org/inst",
  ...PROV,
  ...o,
});
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
  tuition: F({ amountMinor: 1000, currency: CURRENCY, period: "year" }),
  intakes: F([
    { startDate: "2027-09-01", applicationOpens: null, applicationDeadline: "2027-03-01" },
  ]),
  applicationChannel: F("xx-test-channel"),
  documents: F([document("xx-test-doc")]),
  requirements: REQUIREMENTS,
  scholarships: [],
  sources: SRC,
  ...o,
});
const costProfile = (o: Obj = {}): Obj => ({
  slug: "xx-test-costs",
  country: "XB",
  city: null,
  lines: { housing: F(COST) },
  sources: SRC,
  ...o,
});
const scholarship = (o: Obj = {}): Obj => ({
  slug: "xx-test-schol",
  name: "Test Scholarship",
  provider: "Test Provider",
  destinations: ["XB"],
  eligibleNationalities: [],
  fields: [],
  level: "bachelor",
  summary: T("Summary"),
  support: F({
    amount: { min: 100, max: 200, currency: CURRENCY, per: "month" },
    covers: ["tuition"],
  }),
  deadline: F("2027-03-01"),
  requirements: REQUIREMENTS,
  documents: F([document("xx-test-doc")]),
  howToApply: T("Apply"),
  officialUrl: "https://example.org/schol",
  sources: SRC,
  ...o,
});

const BUILDERS: Record<CollectionName, () => Obj> = {
  countries: country,
  fields: field,
  subjects: subject,
  "language-certificates": languageCertificate,
  "grading-scales": gradingScale,
  "grade-conversions": gradeConversion,
  "credential-types": credentialType,
  "application-channels": applicationChannel,
  "admission-routes": admissionRoute,
  institutions: institution,
  programs: program,
  "cost-profiles": costProfile,
  scholarships: scholarship,
};
const ENTRIES = Object.entries(BUILDERS) as [CollectionName, () => Obj][];
const WITH_SOURCES = ENTRIES.filter(([, build]) => "sources" in build());
const WITH_RECORD_PROVENANCE = ENTRIES.filter(([, build]) => "info_kind" in build());

const VALID: [CollectionName, () => Obj][] = ENTRIES;

// Dotted issue path the schema must report (a failing row must fail for the reason it names).
type Expect = { path: string; code?: string };
const E = (path: string, code?: string): Expect => (code === undefined ? { path } : { path, code });

const condition = (id: string): Obj => ({
  id,
  kind: "prior_study_years_min",
  source: "main",
  info_kind: "official",
  years: 1,
});

const INVALID: [string, CollectionName, () => Obj, Expect][] = [
  [
    "route duplicate condition ids",
    "admission-routes",
    () => admissionRoute({ conditions: [condition("xx-test-cond"), condition("xx-test-cond")] }),
    E("conditions", "custom"),
  ],
  ["grading scale min > max", "grading-scales", () => gradingScale({ min: 20, max: 0 }), E("min")],
  [
    "grading scale min == max",
    "grading-scales",
    () => gradingScale({ min: 5, max: 5, pass: 5 }),
    E("min"),
  ],
  ["grading scale pass above max", "grading-scales", () => gradingScale({ pass: 21 }), E("pass")],
  ["grading scale pass below min", "grading-scales", () => gradingScale({ pass: -1 }), E("pass")],
  [
    "conversion linear without params",
    "grade-conversions",
    () => gradeConversion({ conversion: { method: "linear", params: {} } }),
    E("conversion.params.fromMin", "invalid_type"),
  ],
  [
    "conversion unknown method",
    "grade-conversions",
    () => gradeConversion({ conversion: { method: "magic", params: {} } }),
    E("conversion.method", "invalid_union"),
  ],
  [
    "conversion modified_bavarian negative truncateDecimals",
    "grade-conversions",
    () =>
      gradeConversion({
        conversion: {
          method: "modified_bavarian",
          params: { nMax: 1, nMin: 4, truncateDecimals: -1 },
        },
      }),
    E("conversion.params.truncateDecimals"),
  ],
  [
    "conversion linear fromMin == fromMax",
    "grade-conversions",
    () =>
      gradeConversion({
        conversion: {
          method: "linear",
          params: { fromMin: 5, fromMax: 5, toMin: 0, toMax: 1 },
        },
      }),
    E("conversion.params", "custom"),
  ],
  [
    "conversion modified_bavarian nMax == nMin",
    "grade-conversions",
    () =>
      gradeConversion({
        conversion: {
          method: "modified_bavarian",
          params: { nMax: 2, nMin: 2, truncateDecimals: null },
        },
      }),
    E("conversion.params", "custom"),
  ],
  [
    "credential type empty tracks",
    "credential-types",
    () => credentialType({ tracks: [] }),
    E("tracks"),
  ],
  [
    "credential type track name as LocalizedText",
    "credential-types",
    () => credentialType({ tracks: [{ slug: "xx-test-track", name: T("Track"), subjects: null }] }),
    E("tracks.0.name", "invalid_type"),
  ],
  [
    "credential type duplicate track slugs",
    "credential-types",
    () =>
      credentialType({
        tracks: [
          { slug: "xx-test-track", name: "A", subjects: null },
          { slug: "xx-test-track", name: "B", subjects: ["xx-test-subject"] },
        ],
      }),
    E("tracks", "custom"),
  ],
  [
    "channel kind email",
    "application-channels",
    () => applicationChannel({ kind: "email" }),
    E("kind"),
  ],
  [
    "channel missing accountRequired",
    "application-channels",
    () => omit(applicationChannel(), "accountRequired"),
    E("accountRequired", "invalid_type"),
  ],
  ["route level master", "admission-routes", () => admissionRoute({ level: "master" }), E("level")],
  [
    "route outcome maybe",
    "admission-routes",
    () => admissionRoute({ outcome: "maybe" }),
    E("outcome"),
  ],
  ["institution type mixed", "institutions", () => institution({ type: "mixed" }), E("type")],
  [
    "program tuition period month",
    "programs",
    () => program({ tuition: F({ amountMinor: 1, currency: CURRENCY, period: "month" }) }),
    E("tuition.value.period"),
  ],
  [
    "program tuition max below min",
    "programs",
    () =>
      program({
        tuition: F({ amountMinor: 2000, maxAmountMinor: 1000, currency: CURRENCY, period: "year" }),
      }),
    E("tuition.value.maxAmountMinor"),
  ],
  [
    "program tuition basis without a maximum",
    "programs",
    () =>
      program({
        tuition: F({
          amountMinor: 1000,
          currency: CURRENCY,
          period: "year",
          basis: "income_based",
        }),
      }),
    E("tuition.value.basis"),
  ],
  [
    "program tuition unknown basis",
    "programs",
    () =>
      program({
        tuition: F({
          amountMinor: 1000,
          maxAmountMinor: 2000,
          currency: CURRENCY,
          period: "year",
          basis: "per_credit",
        }),
      }),
    E("tuition.value.basis"),
  ],
  [
    "program tuition negative maximum",
    "programs",
    () =>
      program({
        tuition: F({ amountMinor: 1000, maxAmountMinor: -1, currency: CURRENCY, period: "year" }),
      }),
    E("tuition.value.maxAmountMinor"),
  ],
  [
    "program missing tuition",
    "programs",
    () => omit(program(), "tuition"),
    E("tuition", "invalid_type"),
  ],
  [
    "program durationYears 0",
    "programs",
    () => program({ durationYears: F(0) }),
    E("durationYears.value"),
  ],
  [
    "program empty teachingLanguages",
    "programs",
    () => program({ teachingLanguages: F([]) }),
    E("teachingLanguages.value"),
  ],
  [
    "program intake impossible date",
    "programs",
    () =>
      program({
        intakes: F([
          { startDate: "2027-02-30", applicationOpens: null, applicationDeadline: null },
        ]),
      }),
    E("intakes.value.0.startDate"),
  ],
  [
    "program duplicate document slugs",
    "programs",
    () => program({ documents: F([document("xx-test-doc"), document("xx-test-doc")]) }),
    E("documents.value", "custom"),
  ],
  [
    "program estimate fact without basis",
    "programs",
    () => program({ durationYears: { ...F(3), info_kind: "estimate" } }),
    E("durationYears.basis", "custom"),
  ],
  [
    "cost line per week",
    "cost-profiles",
    () => costProfile({ lines: { housing: F({ ...COST, per: "week" }) } }),
    E("lines.housing.value.per"),
  ],
  [
    "cost line min > max",
    "cost-profiles",
    () => costProfile({ lines: { housing: F({ ...COST, min: 300, max: 200 }) } }),
    E("lines.housing.value", "custom"),
  ],
  [
    "cost line estimate without basis",
    "cost-profiles",
    () => costProfile({ lines: { housing: { ...F(COST), info_kind: "estimate" } } }),
    E("lines.housing.basis", "custom"),
  ],
  [
    "cost lines.rent unknown category",
    "cost-profiles",
    () => costProfile({ lines: { rent: F(COST) } }),
    E("lines", "unrecognized_keys"),
  ],
  [
    "scholarship empty destinations",
    "scholarships",
    () => scholarship({ destinations: [] }),
    E("destinations"),
  ],
  [
    "scholarship support amount per decade",
    "scholarships",
    () =>
      scholarship({
        support: F({
          amount: { min: 1, max: 2, currency: CURRENCY, per: "decade" },
          covers: [],
        }),
      }),
    E("support.value.amount.per"),
  ],
  [
    "scholarship support amount min > max",
    "scholarships",
    () =>
      scholarship({
        support: F({
          amount: { min: 500, max: 100, currency: CURRENCY, per: "month" },
          covers: [],
        }),
      }),
    E("support.value.amount", "custom"),
  ],
  [
    "scholarship covers food",
    "scholarships",
    () => scholarship({ support: F({ amount: null, covers: ["food"] }) }),
    E("support.value.covers.0"),
  ],
  [
    "scholarship duplicate document slugs",
    "scholarships",
    () => scholarship({ documents: F([document("xx-test-doc"), document("xx-test-doc")]) }),
    E("documents.value", "custom"),
  ],
  ["country lowercase code", "countries", () => country({ code: "xa" }), E("code")],
  ...ENTRIES.map(([name, build]): [string, CollectionName, () => Obj, Expect] => [
    `${name} with an extra key`,
    name,
    () => ({ ...build(), extra: true }),
    E("", "unrecognized_keys"),
  ]),
  ...WITH_SOURCES.map(([name, build]): [string, CollectionName, () => Obj, Expect] => [
    `${name} missing sources`,
    name,
    () => omit(build(), "sources"),
    E("sources", "invalid_type"),
  ]),
  ...WITH_RECORD_PROVENANCE.flatMap(([name, build]) =>
    (["source", "info_kind"] as const).map((key): [string, CollectionName, () => Obj, Expect] => [
      `${name} missing ${key}`,
      name,
      () => omit(build(), key),
      E(key, key === "source" ? "invalid_type" : "invalid_value"),
    ]),
  ),
];

describe("record schemas", () => {
  it("covers every collection with a builder", () => {
    expect(ENTRIES).toHaveLength(13);
    expect(WITH_SOURCES).toHaveLength(9);
    expect(WITH_RECORD_PROVENANCE).toHaveLength(6);
  });

  it.each(VALID)("%s: accepts a minimal valid record", (collection, build) => {
    const result = COLLECTIONS[collection].schema.safeParse(build());
    expect(result.error?.issues ?? []).toEqual([]);
    expect(result.success).toBe(true);
  });

  it.each(INVALID)("rejects: %s", (_label, collection, build, expected) => {
    const result = COLLECTIONS[collection].schema.safeParse(build());
    expect(result.success).toBe(false);
    const issues = result.error?.issues ?? [];
    const matched = issues.some(
      (issue) =>
        issue.path.join(".") === expected.path &&
        (expected.code === undefined || issue.code === expected.code),
    );
    expect(matched, JSON.stringify(issues.map((i) => [i.path.join("."), i.code]))).toBe(true);
  });

  it("accepts an institution whose type and website the registers do not state (unknown, not guessed)", () => {
    const { schema } = COLLECTIONS.institutions;
    expect(schema.safeParse(institution({ type: null, website: null })).success).toBe(true);
    expect(schema.safeParse(institution({ type: null })).success).toBe(true);
    expect(schema.safeParse(institution({ website: "http://insecure.example" })).success).toBe(
      false,
    );
    expect(schema.safeParse(institution({ type: "mixed" })).success).toBe(false);
  });

  it("accepts a route whose conditions have distinct ids", () => {
    const record = admissionRoute({ conditions: [condition("xx-test-a"), condition("xx-test-b")] });
    expect(COLLECTIONS["admission-routes"].schema.safeParse(record).success).toBe(true);
  });

  it("accepts a linear conversion and a modified_bavarian conversion", () => {
    const linear = gradeConversion({
      conversion: {
        method: "linear",
        params: { fromMin: 0, fromMax: 20, toMin: 0, toMax: 4 },
      },
    });
    const bavarian = gradeConversion({
      conversion: {
        method: "modified_bavarian",
        params: { nMax: 1, nMin: 4, truncateDecimals: null },
      },
    });
    const { schema } = COLLECTIONS["grade-conversions"];
    expect(schema.safeParse(linear).success).toBe(true);
    expect(schema.safeParse(bavarian).success).toBe(true);
  });

  it("accepts a scholarship support amount with equal bounds", () => {
    const record = scholarship({
      support: F({
        amount: { min: 100, max: 100, currency: CURRENCY, per: "month" },
        covers: [],
      }),
    });
    expect(COLLECTIONS.scholarships.schema.safeParse(record).success).toBe(true);
  });

  it("accepts an official tuition range, with or without a basis, and a flat fee unchanged", () => {
    const { schema } = COLLECTIONS.programs;
    const flat = { amountMinor: 1000, currency: CURRENCY, period: "year" };
    expect(schema.safeParse(program({ tuition: F(flat) })).success).toBe(true);
    expect(
      schema.safeParse(program({ tuition: F({ ...flat, maxAmountMinor: 3000 }) })).success,
    ).toBe(true);
    expect(
      schema.safeParse(
        program({ tuition: F({ ...flat, maxAmountMinor: 3000, basis: "income_based" }) }),
      ).success,
    ).toBe(true);
    // equal bounds and a zero minimum are legal ranges
    expect(
      schema.safeParse(program({ tuition: F({ ...flat, maxAmountMinor: 1000 }) })).success,
    ).toBe(true);
    expect(
      schema.safeParse(program({ tuition: F({ ...flat, amountMinor: 0, maxAmountMinor: 200000 }) }))
        .success,
    ).toBe(true);
  });

  it("accepts a scholarship with an institutions list, an empty one, or none", () => {
    const { schema } = COLLECTIONS.scholarships;
    expect(schema.safeParse(scholarship({ institutions: ["xx-test-inst"] })).success).toBe(true);
    expect(schema.safeParse(scholarship({ institutions: [] })).success).toBe(true);
    expect(schema.safeParse(scholarship()).success).toBe(true);
  });

  it("rejects a scholarship institution that is not a slug", () => {
    const { schema } = COLLECTIONS.scholarships;
    const result = schema.safeParse(scholarship({ institutions: ["Not A Slug"] }));
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path.join("."))).toContain("institutions.0");
  });

  it("keeps cost profile line keys equal to LIVING_COST_CATEGORIES", () => {
    const lineKeys = Object.keys(CostProfileRecordSchema.shape.lines.shape);
    expect([...lineKeys].sort()).toEqual([...LIVING_COST_CATEGORIES].sort());
  });
});

describe("record outputs", () => {
  it("defaults route conditions to an empty array", () => {
    const parsed = COLLECTIONS["admission-routes"].schema.parse(admissionRoute());
    expect(parsed.conditions).toEqual([]);
  });

  it("adds the staleness class to program facts", () => {
    const parsed = COLLECTIONS.programs.schema.parse(program());
    expect(parsed.tuition.class).toBe("volatile");
    expect(parsed.intakes.class).toBe("volatile");
    expect(parsed.durationYears.class).toBe("stable");
    expect(parsed.documents.class).toBe("stable");
  });

  it("ages rent, food and transport lines on the stable clock", () => {
    const parsed = COLLECTIONS["cost-profiles"].schema.parse(
      costProfile({ lines: { housing: F(COST), food: F(COST), transport: F(COST) } }),
    );
    expect(parsed.lines.housing?.class).toBe("stable");
    expect(parsed.lines.food?.class).toBe("stable");
    expect(parsed.lines.transport?.class).toBe("stable");
  });

  it("ages fee lines (insurance, visa, setup) on the volatile clock", () => {
    const parsed = COLLECTIONS["cost-profiles"].schema.parse(
      costProfile({
        lines: { insurance: F(COST), application_visa: F(COST), setup: F(COST) },
      }),
    );
    expect(parsed.lines.insurance?.class).toBe("volatile");
    expect(parsed.lines.application_visa?.class).toBe("volatile");
    expect(parsed.lines.setup?.class).toBe("volatile");
  });

  it("still rejects a fee line that is an estimate without a basis", () => {
    const result = COLLECTIONS["cost-profiles"].schema.safeParse(
      costProfile({ lines: { application_visa: { ...F(COST), info_kind: "estimate" } } }),
    );
    expect(result.success).toBe(false);
  });

  it("adds the staleness class to scholarship facts", () => {
    const parsed = COLLECTIONS.scholarships.schema.parse(scholarship());
    expect(parsed.deadline.class).toBe("volatile");
    expect(parsed.support.class).toBe("volatile");
    expect(parsed.documents.class).toBe("stable");
  });
});

describe("intake recurringDeadline", () => {
  const base = { startDate: null, applicationOpens: null, applicationDeadline: null };
  it("accepts a month and day, and still accepts the three-date form without it", () => {
    expect(
      IntakeSchema.safeParse({ ...base, recurringDeadline: { month: 7, day: 15 } }).success,
    ).toBe(true);
    expect(IntakeSchema.safeParse(base).success).toBe(true);
  });
  it.each([
    [{ month: 2, day: 30 }],
    [{ month: 13, day: 1 }],
    [{ month: 4, day: 31 }],
    [{ month: 0, day: 5 }],
    [{ month: 7, day: 15, year: 2026 }],
  ])("rejects %j", (recurringDeadline) => {
    expect(IntakeSchema.safeParse({ ...base, recurringDeadline }).success).toBe(false);
  });
  it("accepts 29 February (it exists in some years)", () => {
    expect(
      IntakeSchema.safeParse({ ...base, recurringDeadline: { month: 2, day: 29 } }).success,
    ).toBe(true);
  });
  it("rejects an intake that has both a dated and a recurring deadline", () => {
    expect(
      IntakeSchema.safeParse({
        ...base,
        applicationDeadline: "2027-07-15",
        recurringDeadline: { month: 7, day: 15 },
      }).success,
    ).toBe(false);
  });
});

describe("scholarship recurringDeadline", () => {
  const { schema } = COLLECTIONS.scholarships;
  const recurring = F({ month: 7, day: 15 });

  it("accepts a yearless deadline as a volatile fact when there is no dated one", () => {
    const parsed = schema.parse(scholarship({ deadline: F(null), recurringDeadline: recurring }));
    expect(parsed.recurringDeadline?.value).toEqual({ month: 7, day: 15 });
    expect(parsed.recurringDeadline?.class).toBe("volatile");
  });

  it("still accepts a record without the field", () => {
    expect(schema.safeParse(scholarship()).success).toBe(true);
  });

  it("rejects a record that has both a dated and a recurring deadline", () => {
    expect(schema.safeParse(scholarship({ recurringDeadline: recurring })).success).toBe(false);
  });

  it.each([
    [{ month: 2, day: 30 }],
    [{ month: 13, day: 1 }],
    [{ month: 4, day: 31 }],
    [{ month: 0, day: 5 }],
    [{ month: 7, day: 15, year: 2026 }],
  ])("rejects %j", (value) => {
    expect(
      schema.safeParse(scholarship({ deadline: F(null), recurringDeadline: F(value) })).success,
    ).toBe(false);
  });
});
