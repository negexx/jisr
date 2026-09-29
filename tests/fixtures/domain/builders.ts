import type { IsoDate } from "@/data-schema/dates";
import { addDays } from "@/data-schema/dates";
import type { Profile } from "@/data-schema/profile";
import type { CostAmount, LivingCostCategory } from "@/data-schema/records/cost-profile";
import type {
  AdmissionRoute,
  ApplicationChannel,
  CostProfile,
  CredentialType,
  FactMeta,
  GradeConversion,
  GradingScale,
  Program,
  ResolvedFact,
  ResolvedRequirements,
  ResolvedRule,
  Scholarship,
} from "@/data-schema/resolved";

export const NOW: IsoDate = "2026-09-29";
export const FRESH: IsoDate = "2026-09-01";
export const STALE: IsoDate = addDays(NOW, -546);
export const daysAgo = (n: number): IsoDate => addDays(NOW, -n);

export function meta(o: Partial<FactMeta> = {}): FactMeta {
  return {
    source_url: "https://example.org/xx-test-source",
    info_kind: "official",
    last_verified_at: FRESH,
    class: "stable",
    ...o,
  };
}
export const staleMeta = (o: Partial<FactMeta> = {}): FactMeta =>
  meta({ last_verified_at: STALE, ...o });
export const estimateMeta = (o: Partial<FactMeta> = {}): FactMeta =>
  meta({ info_kind: "estimate", ...o });
export function fact<T>(value: T | null, o: Partial<FactMeta> = {}): ResolvedFact<T> {
  return { ...meta(o), value };
}

type RuleOf<K extends ResolvedRule["kind"]> = Extract<ResolvedRule, { kind: K }>;
export function rule<K extends ResolvedRule["kind"]>(
  kind: K,
  fields: Omit<RuleOf<K>, "kind" | "id" | "fact"> & { id?: string; fact?: FactMeta },
): RuleOf<K> {
  const { id = `xx-test-${kind.replaceAll("_", "-")}`, fact: f = meta(), ...rest } = fields;
  return { ...rest, kind, id, fact: f } as RuleOf<K>;
}

export const scale20: GradingScale = {
  slug: "xx-test-scale-20",
  country: "XA",
  min: 0,
  max: 20,
  pass: 10,
  direction: "higher_better",
  fact: meta(),
};
export const scale100: GradingScale = {
  slug: "xx-test-scale-100",
  country: null,
  min: 0,
  max: 100,
  pass: 50,
  direction: "higher_better",
  fact: meta(),
};
export const scaleLower: GradingScale = {
  slug: "xx-test-scale-lower",
  country: "XB",
  min: 1,
  max: 5,
  pass: 4,
  direction: "lower_better",
  fact: meta(),
};
export const conv20to100: GradeConversion = {
  slug: "xx-test-conv-20-100",
  from: "xx-test-scale-20",
  to: "xx-test-scale-100",
  conversion: {
    method: "linear",
    params: { fromMin: 0, fromMax: 20, toMin: 0, toMax: 100 },
  },
  fact: meta(),
};
export const conv20toLower: GradeConversion = {
  slug: "xx-test-conv-20-lower",
  from: "xx-test-scale-20",
  to: "xx-test-scale-lower",
  conversion: {
    method: "modified_bavarian",
    params: { nMax: 20, nMin: 10, truncateDecimals: 1 },
  },
  fact: meta(),
};

export function credentialType(o: Partial<CredentialType> = {}): CredentialType {
  return {
    slug: "xx-test-cred",
    country: "XA",
    name: "XX Test Credential",
    gloss: "credential-types/xx-test-cred#gloss",
    gradingScale: "xx-test-scale-20",
    tracks: [
      {
        slug: "xx-test-track-sci",
        name: "XX Sci",
        gloss: null,
        subjects: ["xx-test-math", "xx-test-physics"],
      },
      { slug: "xx-test-track-lit", name: "XX Lit", gloss: null, subjects: null },
    ],
    fact: meta(),
    ...o,
  };
}

type ProfileOverrides = Omit<Partial<Profile>, "credential"> & {
  credential?: Partial<Profile["credential"]>;
};
export function profile(o: ProfileOverrides = {}): Profile {
  const { credential, ...rest } = o;
  return {
    schemaVersion: 1,
    nationality: "XA",
    credential: {
      country: "XA",
      type: "xx-test-cred",
      track: "xx-test-track-sci",
      status: "obtained",
      overall: { scale: "xx-test-scale-20", value: 14 },
      subjects: [{ subject: "xx-test-math", grade: { scale: "xx-test-scale-20", value: 15 } }],
      ...credential,
    },
    priorHigherEducationYears: 0,
    languages: [{ language: "fr", level: "B2", certificate: "xx-test-cert-fr" }],
    fields: ["xx-test-field"],
    studyLanguages: ["fr"],
    destinations: [],
    budget: null,
    institutionType: "any",
    ...rest,
  };
}

export function requirements(o: Partial<ResolvedRequirements> = {}): ResolvedRequirements {
  return { coverage: "complete", fact: meta(), rules: [], ...o };
}

export function program(o: Partial<Program> = {}): Program {
  return {
    slug: "xx-test-prog",
    institution: "xx-test-inst",
    institutionType: "public",
    country: "XB",
    city: "xx-test-city",
    field: "xx-test-field",
    level: "bachelor",
    name: "XX Test Programme",
    summary: "programs/xx-test-prog#summary",
    officialUrl: "https://example.org/xx-test-prog",
    durationYears: fact(3),
    teachingLanguages: fact(["fr"]),
    tuition: fact(
      { amountMinor: 100000, currency: "XTS", period: "year" as const },
      { class: "volatile" },
    ),
    intakes: fact(
      [
        {
          startDate: "2027-09-01",
          applicationOpens: "2026-11-01",
          applicationDeadline: "2027-01-15",
        },
      ],
      { class: "volatile" },
    ),
    applicationChannel: fact("xx-test-channel"),
    documents: fact([
      {
        slug: "xx-test-doc",
        name: "programs/xx-test-prog#documents.0.name",
        translationRequired: true,
      },
    ]),
    requirements: requirements(),
    scholarships: [],
    ...o,
  };
}

export function route(o: Partial<AdmissionRoute> = {}): AdmissionRoute {
  return {
    slug: "xx-test-route",
    origin: "XA",
    credentialType: "xx-test-cred",
    destination: "XB",
    level: "bachelor",
    outcome: "direct",
    conditions: [],
    note: null,
    applicationChannels: ["xx-test-channel"],
    fact: meta(),
    ...o,
  };
}

export function channel(o: Partial<ApplicationChannel> = {}): ApplicationChannel {
  return {
    slug: "xx-test-channel",
    name: "XX Test Portal",
    country: "XB",
    kind: "national_portal",
    url: "https://example.org/xx-test-portal",
    accountRequired: true,
    summary: "application-channels/xx-test-channel#summary",
    fact: meta(),
    ...o,
  };
}

export function costLine(
  min: number,
  max: number,
  per: CostAmount["per"],
  o: Partial<FactMeta> & { currency?: string } = {},
): ResolvedFact<CostAmount> {
  const { currency = "XTS", ...m } = o;
  return fact({ min, max, currency, per }, m);
}
export function costProfile(
  slug: string,
  city: string | null,
  lines: Partial<Record<LivingCostCategory, ResolvedFact<CostAmount>>>,
  country = "XB",
): CostProfile {
  return { slug, country, city, lines };
}

export function scholarship(o: Partial<Scholarship> = {}): Scholarship {
  const slug = o.slug ?? "xx-test-sch-a";
  return {
    slug,
    name: "XX Test Scholarship",
    provider: "XX Test Provider",
    destinations: ["XB"],
    eligibleNationalities: [],
    fields: [],
    level: "bachelor",
    summary: `scholarships/${slug}#summary`,
    support: fact({ amount: null, covers: ["tuition" as const] }, { class: "volatile" }),
    deadline: fact("2027-03-01", { class: "volatile" }),
    requirements: requirements(),
    documents: fact([]),
    howToApply: `scholarships/${slug}#howToApply`,
    officialUrl: "https://example.org/xx-test-sch",
    ...o,
  };
}

export function reference() {
  return {
    credentialTypes: [credentialType()],
    gradingScales: [scale20, scale100, scaleLower],
    gradeConversions: [conv20to100, conv20toLower],
  };
}
export const refKey = (f: { record: string; path: string }) => `${f.record}#${f.path}`;
export function deepFreeze<T>(v: T): T {
  if (v && typeof v === "object") {
    for (const x of Object.values(v)) deepFreeze(x);
    Object.freeze(v);
  }
  return v;
}
