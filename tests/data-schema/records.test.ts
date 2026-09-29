import { describe, expect, it } from "vitest";

import type { CollectionName } from "@/data-schema/records/collections";
import { COLLECTIONS } from "@/data-schema/records/collections";

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

const VALID: [CollectionName, () => Obj][] = ENTRIES;

const INVALID: [string, CollectionName, () => Obj][] = [
  ["grading scale min > max", "grading-scales", () => gradingScale({ min: 20, max: 0 })],
  ["grading scale min == max", "grading-scales", () => gradingScale({ min: 5, max: 5, pass: 5 })],
  ["grading scale pass above max", "grading-scales", () => gradingScale({ pass: 21 })],
  ["grading scale pass below min", "grading-scales", () => gradingScale({ pass: -1 })],
  [
    "conversion linear without params",
    "grade-conversions",
    () => gradeConversion({ conversion: { method: "linear", params: {} } }),
  ],
  [
    "conversion unknown method",
    "grade-conversions",
    () => gradeConversion({ conversion: { method: "magic", params: {} } }),
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
  ],
  ["credential type empty tracks", "credential-types", () => credentialType({ tracks: [] })],
  [
    "credential type track name as LocalizedText",
    "credential-types",
    () => credentialType({ tracks: [{ slug: "xx-test-track", name: T("Track"), subjects: null }] }),
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
  ],
  ["channel kind email", "application-channels", () => applicationChannel({ kind: "email" })],
  [
    "channel missing accountRequired",
    "application-channels",
    () => omit(applicationChannel(), "accountRequired"),
  ],
  ["route level master", "admission-routes", () => admissionRoute({ level: "master" })],
  ["route outcome maybe", "admission-routes", () => admissionRoute({ outcome: "maybe" })],
  ["institution type mixed", "institutions", () => institution({ type: "mixed" })],
  [
    "program tuition period month",
    "programs",
    () => program({ tuition: F({ amountMinor: 1, currency: CURRENCY, period: "month" }) }),
  ],
  ["program missing tuition", "programs", () => omit(program(), "tuition")],
  ["program durationYears 0", "programs", () => program({ durationYears: F(0) })],
  ["program empty teachingLanguages", "programs", () => program({ teachingLanguages: F([]) })],
  [
    "program intake impossible date",
    "programs",
    () =>
      program({
        intakes: F([
          { startDate: "2027-02-30", applicationOpens: null, applicationDeadline: null },
        ]),
      }),
  ],
  [
    "program duplicate document slugs",
    "programs",
    () => program({ documents: F([document("xx-test-doc"), document("xx-test-doc")]) }),
  ],
  [
    "program estimate fact without basis",
    "programs",
    () => program({ durationYears: { ...F(3), info_kind: "estimate" } }),
  ],
  [
    "cost line per week",
    "cost-profiles",
    () => costProfile({ lines: { housing: F({ ...COST, per: "week" }) } }),
  ],
  [
    "cost line min > max",
    "cost-profiles",
    () => costProfile({ lines: { housing: F({ ...COST, min: 300, max: 200 }) } }),
  ],
  [
    "cost line estimate without basis",
    "cost-profiles",
    () => costProfile({ lines: { housing: { ...F(COST), info_kind: "estimate" } } }),
  ],
  [
    "cost lines.rent unknown category",
    "cost-profiles",
    () => costProfile({ lines: { rent: F(COST) } }),
  ],
  ["scholarship empty destinations", "scholarships", () => scholarship({ destinations: [] })],
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
  ],
  [
    "scholarship covers food",
    "scholarships",
    () => scholarship({ support: F({ amount: null, covers: ["food"] }) }),
  ],
  [
    "scholarship duplicate document slugs",
    "scholarships",
    () => scholarship({ documents: F([document("xx-test-doc"), document("xx-test-doc")]) }),
  ],
  ["country lowercase code", "countries", () => country({ code: "xa" })],
  ...ENTRIES.map(([name, build]): [string, CollectionName, () => Obj] => [
    `${name} with an extra key`,
    name,
    () => ({ ...build(), extra: true }),
  ]),
  ...WITH_SOURCES.map(([name, build]): [string, CollectionName, () => Obj] => [
    `${name} missing sources`,
    name,
    () => omit(build(), "sources"),
  ]),
];

describe("record schemas", () => {
  it("covers every collection with a builder", () => {
    expect(ENTRIES).toHaveLength(13);
    expect(WITH_SOURCES).toHaveLength(9);
  });

  it.each(VALID)("%s: accepts a minimal valid record", (collection, build) => {
    const result = COLLECTIONS[collection].schema.safeParse(build());
    expect(result.error?.issues ?? []).toEqual([]);
    expect(result.success).toBe(true);
  });

  it.each(INVALID)("rejects: %s", (_label, collection, build) => {
    expect(COLLECTIONS[collection].schema.safeParse(build()).success).toBe(false);
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

  it("adds the stable class to cost lines", () => {
    const parsed = COLLECTIONS["cost-profiles"].schema.parse(costProfile());
    expect(parsed.lines.housing?.class).toBe("stable");
  });

  it("adds the staleness class to scholarship facts", () => {
    const parsed = COLLECTIONS.scholarships.schema.parse(scholarship());
    expect(parsed.deadline.class).toBe("volatile");
    expect(parsed.support.class).toBe("volatile");
    expect(parsed.documents.class).toBe("stable");
  });
});
