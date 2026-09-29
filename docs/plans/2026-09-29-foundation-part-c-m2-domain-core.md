# Jisr Foundation, Part C: Milestone 2 (domain core), T12–T19 (incl. T16A filter)

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`. Each task stands on its own. An implementer sees only its task, plus "Global Constraints" and the "Shared type contract" from Part A (`C:\Users\dagda\Downloads\nex\UniWay\docs\plans\2026-09-29-foundation-part-a-contract-m0.md`). Use TDD throughout: write the test, run it and see it FAIL, write the minimal code, run it and see it PASS, then commit.

## Goal
Build a pure, table-tested `src/domain/*` that implements Part A §11 exactly: facts/freshness, CEFR, grade conversion, the rule engine, route resolution plus matching, intakes, scholarships, costs and the checklist. T19 adds an end-to-end test that runs the Part B pipeline.

## Context I checked
- Part A (all 1825 lines): §1–§12 contract, §11 normative semantics, M0 T1–T5 format, Risks (Part A already flags the "expected" status, missing-certificate ⚠️, `track_not_accepted` reuse, short-circuit, and the month multiplier, now 10 per the 2026-09-29 decision).
- `C:\Users\dagda\Downloads\nex\UniWay\.claude\rules\matching-domain.md`: its cost shape `{min,max,currency,breakdown}` differs from the contract's `CostEstimate`. T19 updates it.
- `C:\Users\dagda\Downloads\nex\UniWay\.claude\docs\decisions\0004-operations-privacy-data-freshness.md` §4: the thresholds, and "stale → ⚠️, reason 'source not re-verified recently'" (= `stale_source`).
- `C:\Users\dagda\Downloads\nex\UniWay\.claude\docs\architecture.md`: the domain module row agrees with the contract.

## Part C conventions (restated in every task where relevant)
- **FactRef identity.** `record` = `"<collection>/<id>"`, `path` = dotted path within the record. **Record-level provenance** (`GradingScale.fact`, `GradeConversion.fact`, `CredentialType.fact`, `AdmissionRoute.fact`, `ApplicationChannel.fact`) uses `path: ""` (see Amendment A1).
  - Rule facts: `record = ctx.record`, `path = \`${ctx.pathPrefix}.${rule.id}\``.
  - Program rules use `record "programs/<slug>"` and `pathPrefix "requirements.rules"`.
  - Route conditions use `record "admission-routes/<slug>"` and `pathPrefix "conditions"`.
  - The requirements fact is `programs/<slug>#requirements`.
  - Program facts use their key: `tuition`, `intakes`, `documents`, `applicationChannel`.
  - Cost lines use `cost-profiles/<slug>#lines.<category>`.
  - Scholarship deadlines use `scholarships/<slug>#deadline`.
- **Reason.facts order:** rule fact, then target grading scale (whenever the rule's scale exists in reference data), then the conversion (only if one was used), then the credential type (only when `subject_taken` fails from the curriculum).
- **Downgrade precedence:** evaluate raw → apply the `expected`-status rule (pass/fail → unknown `missing_student_value`) → apply the downgrade only if the outcome is still pass/fail. The downgrade code is `stale_source` if any relied fact has freshness `stale`, else `non_official_source` if any has `info_kind !== "official"`.
- **Short-circuit** (route `foundation` / `not_eligible`): `reasons` contains **only** the route reason. No conditions, no rules, no coverage (see Inconsistency I1).
- **Test clock:** `NOW = "2026-09-29"`. Default facts are verified `"2026-09-01"` (28 days old, fresh for both classes). `STALE = addDays(NOW, -546)` is stale for both classes.
- **Synthetic codes:** countries `XA` (origin) and `XB` (destination), both ISO user-assigned; currencies `XTS` (the ISO 4217 testing code) and `XXX`. All slugs are `xx-test-*`.

---

### Task 12: Domain types, facts, CEFR, test builders

**Files:**
- Create: `src/domain/types.ts`, `src/domain/facts.ts`, `src/domain/cefr.ts`, `tests/fixtures/domain/builders.ts`, `tests/domain/facts.test.ts`, `tests/domain/cefr.test.ts`

**Interfaces:**
- Consumes (Part B, per contract): `@/data-schema/dates` (`IsoDate`, `addDays`), `@/data-schema/staleness` (`freshnessOf`, `Freshness`, `StalenessClass`), types from `@/data-schema/{primitives,profile,resolved,snapshot,records/*}`.
- Produces:
  - `types.ts`: every type in contract §11 `types.ts` verbatim, plus `CHECKLIST_STEP_IDS`.
  - `facts.ts`: `toFactRef`, `isDecisive`, plus an additive helper `downgrade(outcome, code, facts): {outcome, code}`.
  - `cefr.ts`: `CEFR_ORDER`, `cefrAtLeast`.
  - `builders.ts`: the test builders used by T13–T18.

- [ ] **Step 1: Write `tests/fixtures/domain/builders.ts`** (test helper, no test of its own)

```ts
import type { IsoDate } from "@/data-schema/dates";
import { addDays } from "@/data-schema/dates";
import type { Profile } from "@/data-schema/profile";
import type { CostAmount, LivingCostCategory } from "@/data-schema/records/cost-profile";
import type {
  AdmissionRoute, ApplicationChannel, CostProfile, CredentialType, FactMeta, GradeConversion, GradingScale,
  Program, ResolvedFact, ResolvedRequirements, ResolvedRule, Scholarship,
} from "@/data-schema/resolved";
import type { RuleContext } from "@/domain/rules";

export const NOW: IsoDate = "2026-09-29";
export const FRESH: IsoDate = "2026-09-01";
export const STALE: IsoDate = addDays(NOW, -546);
export const daysAgo = (n: number): IsoDate => addDays(NOW, -n);

export function meta(o: Partial<FactMeta> = {}): FactMeta {
  return { source_url: "https://example.org/xx-test-source", info_kind: "official", last_verified_at: FRESH, class: "stable", ...o };
}
export const staleMeta = (o: Partial<FactMeta> = {}): FactMeta => meta({ last_verified_at: STALE, ...o });
export const estimateMeta = (o: Partial<FactMeta> = {}): FactMeta => meta({ info_kind: "estimate", ...o });
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

export const scale20: GradingScale = { slug: "xx-test-scale-20", country: "XA", min: 0, max: 20, pass: 10, direction: "higher_better", fact: meta() };
export const scale100: GradingScale = { slug: "xx-test-scale-100", country: null, min: 0, max: 100, pass: 50, direction: "higher_better", fact: meta() };
export const scaleLower: GradingScale = { slug: "xx-test-scale-lower", country: "XB", min: 1, max: 5, pass: 4, direction: "lower_better", fact: meta() };
export const conv20to100: GradeConversion = { slug: "xx-test-conv-20-100", from: "xx-test-scale-20", to: "xx-test-scale-100",
  conversion: { method: "linear", params: { fromMin: 0, fromMax: 20, toMin: 0, toMax: 100 } }, fact: meta() };
export const conv20toLower: GradeConversion = { slug: "xx-test-conv-20-lower", from: "xx-test-scale-20", to: "xx-test-scale-lower",
  conversion: { method: "modified_bavarian", params: { nMax: 20, nMin: 10, truncateDecimals: 1 } }, fact: meta() };

export function credentialType(o: Partial<CredentialType> = {}): CredentialType {
  return { slug: "xx-test-cred", country: "XA", name: "XX Test Credential", gloss: "credential-types/xx-test-cred#gloss",
    gradingScale: "xx-test-scale-20",
    tracks: [
      { slug: "xx-test-track-sci", name: "XX Sci", gloss: null, subjects: ["xx-test-math", "xx-test-physics"] },
      { slug: "xx-test-track-lit", name: "XX Lit", gloss: null, subjects: null },
    ], fact: meta(), ...o };
}

type ProfileOverrides = Omit<Partial<Profile>, "credential"> & { credential?: Partial<Profile["credential"]> };
export function profile(o: ProfileOverrides = {}): Profile {
  const { credential, ...rest } = o;
  return {
    schemaVersion: 1, nationality: "XA",
    credential: { country: "XA", type: "xx-test-cred", track: "xx-test-track-sci", status: "obtained",
      overall: { scale: "xx-test-scale-20", value: 14 },
      subjects: [{ subject: "xx-test-math", grade: { scale: "xx-test-scale-20", value: 15 } }], ...credential },
    priorHigherEducationYears: 0,
    languages: [{ language: "fr", level: "B2", certificate: "xx-test-cert-fr" }],
    fields: ["xx-test-field"], studyLanguages: ["fr"], destinations: [], budget: null, institutionType: "any",
    ...rest,
  };
}

export function requirements(o: Partial<ResolvedRequirements> = {}): ResolvedRequirements {
  return { coverage: "complete", fact: meta(), rules: [], ...o };
}

export function program(o: Partial<Program> = {}): Program {
  return {
    slug: "xx-test-prog", institution: "xx-test-inst", institutionType: "public", country: "XB", city: "xx-test-city",
    field: "xx-test-field", level: "bachelor", name: "XX Test Programme", summary: "programs/xx-test-prog#summary",
    officialUrl: "https://example.org/xx-test-prog",
    durationYears: fact(3), teachingLanguages: fact(["fr"]),
    tuition: fact({ amountMinor: 100000, currency: "XTS", period: "year" as const }, { class: "volatile" }),
    intakes: fact([{ startDate: "2027-09-01", applicationOpens: "2026-11-01", applicationDeadline: "2027-01-15" }], { class: "volatile" }),
    applicationChannel: fact("xx-test-channel"),
    documents: fact([{ slug: "xx-test-doc", name: "programs/xx-test-prog#documents.0.name", translationRequired: true }]),
    requirements: requirements(), scholarships: [], ...o,
  };
}

export function route(o: Partial<AdmissionRoute> = {}): AdmissionRoute {
  return { slug: "xx-test-route", origin: "XA", credentialType: "xx-test-cred", destination: "XB", level: "bachelor",
    outcome: "direct", conditions: [], note: null, applicationChannels: ["xx-test-channel"], fact: meta(), ...o };
}

export function channel(o: Partial<ApplicationChannel> = {}): ApplicationChannel {
  return { slug: "xx-test-channel", name: "XX Test Portal", country: "XB", kind: "national_portal",
    url: "https://example.org/xx-test-portal", accountRequired: true,
    summary: "application-channels/xx-test-channel#summary", fact: meta(), ...o };
}

export function costLine(min: number, max: number, per: CostAmount["per"], o: Partial<FactMeta> & { currency?: string } = {}):
  ResolvedFact<CostAmount> {
  const { currency = "XTS", ...m } = o;
  return fact({ min, max, currency, per }, m);
}
export function costProfile(slug: string, city: string | null,
  lines: Partial<Record<LivingCostCategory, ResolvedFact<CostAmount>>>, country = "XB"): CostProfile {
  return { slug, country, city, lines };
}

export function scholarship(o: Partial<Scholarship> = {}): Scholarship {
  const slug = o.slug ?? "xx-test-sch-a";
  return { slug, name: "XX Test Scholarship", provider: "XX Test Provider", destinations: ["XB"], eligibleNationalities: [],
    fields: [], level: "bachelor", summary: `scholarships/${slug}#summary`,
    support: fact({ amount: null, covers: ["tuition" as const] }, { class: "volatile" }),
    deadline: fact("2027-03-01", { class: "volatile" }), requirements: requirements(), documents: fact([]),
    howToApply: `scholarships/${slug}#howToApply`, officialUrl: "https://example.org/xx-test-sch", ...o };
}

export function reference() {
  return { credentialTypes: [credentialType()], gradingScales: [scale20, scale100, scaleLower],
    gradeConversions: [conv20to100, conv20toLower] };
}
export function ctx(o: Partial<RuleContext> = {}): RuleContext {
  return { profile: profile(), ...reference(), record: "programs/xx-test-prog", pathPrefix: "requirements.rules", now: NOW, ...o };
}
export const refKey = (f: { record: string; path: string }) => `${f.record}#${f.path}`;
export function deepFreeze<T>(v: T): T {
  if (v && typeof v === "object") { for (const x of Object.values(v)) deepFreeze(x); Object.freeze(v); }
  return v;
}
```
`builders.ts` imports `RuleContext` from `@/domain/rules`, which T14 creates. For that reason `ctx()` and its import are **added in T14 Step 1**. In T12, omit the `RuleContext` import and `ctx()`.

- [ ] **Step 2: Write the failing tests**

`tests/domain/facts.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import type { StalenessClass } from "@/data-schema/staleness";
import type { Freshness } from "@/data-schema/staleness";
import { isDecisive, toFactRef, downgrade } from "@/domain/facts";
import { daysAgo, meta, NOW } from "../fixtures/domain/builders";

const ROWS: Array<[StalenessClass, number, Freshness]> = [
  ["volatile", 0, "fresh"], ["volatile", 119, "fresh"], ["volatile", 120, "aging"], ["volatile", 121, "aging"],
  ["volatile", 269, "aging"], ["volatile", 270, "stale"], ["volatile", 271, "stale"],
  ["volatile", 544, "stale"], ["volatile", 545, "stale"], ["volatile", 546, "stale"],
  ["stable", 119, "fresh"], ["stable", 120, "fresh"], ["stable", 121, "fresh"],
  ["stable", 269, "fresh"], ["stable", 270, "aging"], ["stable", 271, "aging"],
  ["stable", 544, "aging"], ["stable", 545, "stale"], ["stable", 546, "stale"],
  ["stable", -5, "fresh"],
];

describe("toFactRef", () => {
  it.each(ROWS)("%s fact verified %i days ago is %s", (cls, age, expected) => {
    const m = meta({ class: cls, last_verified_at: daysAgo(age) });
    expect(toFactRef("programs/xx-test-prog", "tuition", m, NOW)).toEqual({
      record: "programs/xx-test-prog", path: "tuition", source_url: m.source_url,
      last_verified_at: m.last_verified_at, info_kind: "official", class: cls, freshness: expected,
    });
  });
  it("does not copy basis", () => {
    expect(toFactRef("r/x", "p", meta({ basis: "k" }), NOW)).not.toHaveProperty("basis");
  });
});

describe("isDecisive", () => {
  const cases: Array<[string, Parameters<typeof meta>[0], boolean]> = [
    ["official fresh", {}, true],
    ["official aging (stable 270)", { last_verified_at: daysAgo(270) }, true],
    ["official stable 544", { last_verified_at: daysAgo(544) }, true],
    ["official stable 545 (stale)", { last_verified_at: daysAgo(545) }, false],
    ["official volatile 269", { class: "volatile", last_verified_at: daysAgo(269) }, true],
    ["official volatile 270 (stale)", { class: "volatile", last_verified_at: daysAgo(270) }, false],
    ["estimate fresh", { info_kind: "estimate" }, false],
    ["guidance fresh", { info_kind: "guidance" }, false],
    ["estimate stale", { info_kind: "estimate", last_verified_at: daysAgo(600) }, false],
  ];
  it.each(cases)("%s → %s", (_n, o, expected) => expect(isDecisive(meta(o), NOW)).toBe(expected));
});

describe("downgrade", () => {
  const f = (freshness: Freshness, info: "official" | "estimate") =>
    ({ ...toFactRef("r/x", "p", meta({ info_kind: info }), NOW), freshness });
  it.each([
    ["pass all decisive", "pass", "ok", [f("fresh", "official")], "pass", "ok"],
    ["fail aging official stays", "fail", "below_threshold", [f("aging", "official")], "fail", "below_threshold"],
    ["pass with stale", "pass", "ok", [f("fresh", "official"), f("stale", "official")], "unknown", "stale_source"],
    ["fail with estimate", "fail", "below_threshold", [f("fresh", "estimate")], "unknown", "non_official_source"],
    ["stale beats non-official", "pass", "ok", [f("fresh", "estimate"), f("stale", "official")], "unknown", "stale_source"],
    ["unknown keeps own code", "unknown", "threshold_unpublished", [f("stale", "estimate")], "unknown", "threshold_unpublished"],
  ] as const)("%s", (_n, outcome, code, facts, eo, ec) =>
    expect(downgrade(outcome, code, facts)).toEqual({ outcome: eo, code: ec }));
});
```
`tests/domain/cefr.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { CEFR_ORDER, cefrAtLeast } from "@/domain/cefr";

describe("cefr", () => {
  it("orders A1..C2", () => expect(CEFR_ORDER).toEqual(["A1", "A2", "B1", "B2", "C1", "C2"]));
  it.each([
    ["B2", "B2", true], ["C1", "B2", true], ["B1", "B2", false], ["A1", "A1", true], ["C2", "A1", true], ["A2", "C2", false],
  ] as const)("%s at least %s → %s", (level, min, expected) => expect(cefrAtLeast(level, min)).toBe(expected));
});
```

- [ ] **Step 3: Run and expect FAIL**
```bash
cd /c/Users/dagda/Downloads/nex/UniWay && pnpm test tests/domain/facts.test.ts tests/domain/cefr.test.ts
```
Expected: `Failed to resolve import "@/domain/facts"` (and the same for `cefr`), with 2 failed files.

- [ ] **Step 4: Implement**
- `types.ts`: copy the contract §11 `types.ts` block verbatim, including `CHECKLIST_STEP_IDS` (`as const`). Use type-only imports.
- `facts.ts`:
  - `toFactRef` returns `{record, path, source_url, last_verified_at, info_kind, class, freshness: freshnessOf(meta.class, meta.last_verified_at, now)}` and never copies `basis`.
  - `isDecisive` = `meta.info_kind === "official" && freshnessOf(...) !== "stale"`.
  - `downgrade(outcome: RuleOutcome, code: ReasonCode, facts: readonly FactRef[])`: if `outcome === "unknown"`, return it unchanged. Else if some `f.freshness === "stale"`, return `{unknown, stale_source}`. Else if some `f.info_kind !== "official"`, return `{unknown, non_official_source}`. Else return the input unchanged.
- `cefr.ts`: `CEFR_ORDER = ["A1","A2","B1","B2","C1","C2"] as const satisfies readonly Cefr[]`. `cefrAtLeast` compares `indexOf`.

- [ ] **Step 5: Run and expect PASS**, then `pnpm typecheck && pnpm lint`. Expected: all green, and `boundary.test.ts` still passes.

- [ ] **Step 6: Commit**
```bash
git add src/domain tests/domain tests/fixtures/domain
git commit -F- <<'EOF'
feat: add domain types, fact freshness refs, CEFR order and test builders

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 13: `grades.ts` convertGrade

**Files:** Create `src/domain/grades.ts`, `tests/domain/grades.test.ts`

**Interfaces:**
- Consumes: `GradeValue` and `GradeConversion` (types).
- Produces: `convertGrade(grade, toScale, conversions): GradeConversionResult` and the `GradeConversionResult` type (contract §11).

**Rules:**
- If `grade.scale === toScale`, return `{kind:"same_scale", value: grade}`.
- Otherwise use the **first** conversion (array order) with `from === grade.scale && to === toScale`. There is no chaining: A→B→C is `no_conversion`.
- `identity` keeps the value. `linear` computes `toMin + (v − fromMin)·(toMax − toMin)/(fromMax − fromMin)`.
- `modified_bavarian` computes `x = 1 + 3·(nMax − v)/(nMax − nMin)`. When `truncateDecimals = d` is non-null, apply `f = 10^d; x = Math.trunc(Number((x*f).toFixed(9))) / f`. The `toFixed(9)` guard absorbs binary float error. Truncate, never round.
- A zero denominator or a non-finite result returns `no_conversion` (see Amendment A5).
- The result is `{kind:"converted", value:{scale: toScale, value: x}, via: conversion}`.

- [ ] **Step 1: Failing test** `tests/domain/grades.test.ts`
```ts
import { describe, expect, it } from "vitest";
import type { GradeConversion } from "@/data-schema/resolved";
import { convertGrade } from "@/domain/grades";
import { conv20to100, conv20toLower, meta } from "../fixtures/domain/builders";

const bav = (nMax: number, nMin: number, truncateDecimals: number | null): GradeConversion => ({
  slug: "xx-test-conv-bav", from: "xx-test-scale-src", to: "xx-test-scale-dst",
  conversion: { method: "modified_bavarian", params: { nMax, nMin, truncateDecimals } }, fact: meta() });
const lin = (fromMin: number, fromMax: number, toMin: number, toMax: number): GradeConversion => ({
  slug: "xx-test-conv-lin", from: "xx-test-scale-src", to: "xx-test-scale-dst",
  conversion: { method: "linear", params: { fromMin, fromMax, toMin, toMax } }, fact: meta() });
const src = (value: number) => ({ scale: "xx-test-scale-src", value });

describe("convertGrade", () => {
  it("same scale → same_scale, no conversion needed", () =>
    expect(convertGrade({ scale: "xx-test-scale-20", value: 14 }, "xx-test-scale-20", [])).toEqual(
      { kind: "same_scale", value: { scale: "xx-test-scale-20", value: 14 } }));

  it.each([
    // [label, conversion, input, expected]  (all synthetic; hand-computed)
    ["linear 0-20→0-100, 14 → 70", lin(0, 20, 0, 100), 14, 70],
    ["linear 10-20→1-5, 15 → 3", lin(10, 20, 1, 5), 15, 3],
    ["linear inverted 10-20→5-1, 15 → 3", lin(10, 20, 5, 1), 15, 3],
    ["linear inverted 10-20→5-1, 20 → 1", lin(10, 20, 5, 1), 20, 1],
    ["bavarian 20/10 d=1, 14 → 1+3·6/10 = 2.8", bav(20, 10, 1), 14, 2.8],
    ["bavarian 20/10 d=1, 17 → 1.9", bav(20, 10, 1), 17, 1.9],
    ["bavarian 20/10 d=1, 13 → 3.1", bav(20, 10, 1), 13, 3.1],
    ["bavarian 20/10 d=1, 15.5 → 2.35 truncated to 2.3 (never 2.4)", bav(20, 10, 1), 15.5, 2.3],
    ["bavarian 20/10 d=1, 12.25 → 3.325 truncated to 3.3", bav(20, 10, 1), 12.25, 3.3],
    ["bavarian 20/10 d=1, 20 → 1", bav(20, 10, 1), 20, 1],
    ["bavarian 20/10 d=1, 10 → 4", bav(20, 10, 1), 10, 4],
    ["bavarian 300/0 d=2, 287 → 1.13 (float guard; naive trunc can give 1.12)", bav(300, 0, 2), 287, 1.13],
  ])("%s", (_l, conv, input, expected) => {
    const r = convertGrade(src(input), "xx-test-scale-dst", [conv]);
    expect(r.kind).toBe("converted");
    if (r.kind !== "converted") return;
    expect(r.value.scale).toBe("xx-test-scale-dst");
    expect(r.value.value).toBeCloseTo(expected, 10);
    expect(r.via).toBe(conv);
  });

  it("bavarian without truncation keeps decimals: 12.25 → 3.325", () => {
    const r = convertGrade(src(12.25), "xx-test-scale-dst", [bav(20, 10, null)]);
    expect(r.kind === "converted" && r.value.value).toBeCloseTo(3.325, 10);
  });
  it("identity keeps value", () => {
    const id: GradeConversion = { ...lin(0, 1, 0, 1), conversion: { method: "identity", params: {} } };
    expect(convertGrade(src(7), "xx-test-scale-dst", [id])).toMatchObject({ kind: "converted", value: { value: 7 } });
  });
  it.each([
    ["no matching conversion", [conv20to100], "xx-test-scale-src", "xx-test-scale-dst"],
    ["reverse direction only", [conv20to100], "xx-test-scale-100", "xx-test-scale-20"],
    ["no chaining 20→100 + 100→lower", [conv20to100, { ...conv20toLower, from: "xx-test-scale-100" }], "xx-test-scale-20", "xx-test-scale-lower"],
    ["degenerate linear fromMin==fromMax", [lin(5, 5, 0, 1)], "xx-test-scale-src", "xx-test-scale-dst"],
    ["degenerate bavarian nMax==nMin", [bav(10, 10, 1)], "xx-test-scale-src", "xx-test-scale-dst"],
  ] as const)("%s → no_conversion", (_l, convs, from, to) =>
    expect(convertGrade({ scale: from, value: 12 }, to, convs)).toEqual({ kind: "no_conversion" }));
  it("uses first matching conversion in array order", () => {
    const a = lin(0, 20, 0, 100); const b = { ...lin(0, 20, 0, 10), slug: "xx-test-conv-lin-b" };
    const r = convertGrade(src(10), "xx-test-scale-dst", [a, b]);
    expect(r.kind === "converted" && r.via.slug).toBe("xx-test-conv-lin");
  });
});
```
Hand checks:
- 15.5: `3·4.5/10 = 1.35`, so x = 2.35 (float ≈ 2.3500000000000001), and truncating to 1 decimal gives 2.3.
- 12.25: `3·7.75/10 = 2.325`, so x ≈ 3.325; `x·10` ≈ 33.2499999…; `toFixed(9)` gives `"33.250000000"`; trunc gives 33, so the result is 3.3.
- 287 with nMax 300: `3·13/300 = 0.13`, so x ≈ 1.13; `x·100` is either 112.99999999999999 or 113.00000000000001; the guard makes both 113.

- [ ] **Step 2: Run and expect FAIL**: `pnpm test tests/domain/grades.test.ts` fails with `Failed to resolve import "@/domain/grades"`.
- [ ] **Step 3: Implement** per the rules above, using a `switch (conv.conversion.method)` with exhaustive `never` handling.
- [ ] **Step 4: Run and expect PASS**, then `pnpm typecheck && pnpm lint`.
- [ ] **Step 5: Commit** with message `feat: add direct grade conversion (identity, linear, modified Bavarian)` and the trailer.

---

### Task 14: `rules.ts` evaluateRules

**Files:** Create `src/domain/rules.ts`, `tests/domain/rules.test.ts`. Modify `tests/fixtures/domain/builders.ts` to add `import type { RuleContext } from "@/domain/rules"` and the `ctx()` builder from T12 Step 1.

**Interfaces:**
- Consumes: `toFactRef` and `downgrade` (`./facts`), `cefrAtLeast` (`./cefr`), `convertGrade` (`./grades`), and the types.
- Produces: `RuleContext`, `evaluateRules(rules, ctx): Reason[]`, one Reason per rule in input order. `ruleId = rule.id`. Callers remap route conditions.

**Algorithm per rule.**
- Setup: `ruleRef = toFactRef(ctx.record, \`${ctx.pathPrefix}.${rule.id}\`, rule.fact, ctx.now)`. Build a raw `{outcome, code, relied: FactRef[], student?, studentConverted?, required?, note?}`, then finish:
  1. `expected` handling (grade kinds only): pass/fail → unknown `missing_student_value`.
  2. `downgrade`.
  3. Return `{ruleId, kind, outcome, code, …defined optionals, facts: relied}`.
  Omit optional keys when undefined.
- `credential_type_in`: student = `credential.type`, required = `types`. Pass `ok`, or fail `track_not_accepted`. relied = [rule].
- `credential_track_in`: the same with `track` / `tracks`.
- `overall_grade_min` / `subject_grade_min`:
  - `scale = gradingScales.find(slug === rule.scale)`. relied = [rule] plus scale fact (path `""`) if found.
  - Student grade: `overall`, or `subjects.find(s => s.subject === rule.subject)?.grade`. Missing → unknown `missing_student_value`.
  - Else `threshold === null` → unknown `threshold_unpublished`.
  - Else scale not found, or `convertGrade(...)` gives `no_conversion` → unknown `no_scale_conversion`.
  - Else, if converted, add the conversion fact to relied and set `studentConverted`. Compare `higher_better ? v >= t : v <= t`: pass `ok`, fail `below_threshold`. student = the grade (GradeValue), required = threshold.
  - Then the `expected` rule.
- `subject_taken`:
  - `taken = credential.subjects.map(s => s.subject)`. `sat(list) = mode === "all" ? subjects.every(∈list) : subjects.some(∈list)`.
  - `sat(taken)` → pass `ok`.
  - Else, if `track = credentialTypes.find(slug === credential.type)?.tracks.find(slug === credential.track)` has non-null `subjects` and `!sat(track.subjects)` → fail `track_not_accepted`, relied = [rule, credentialType fact].
  - Else unknown `missing_student_value`.
  - student = taken, required = subjects.
- `language_proficiency`: `entry = languages.find(language === rule.language)`.
  - No entry, or level `"unknown"` → unknown `missing_student_value`.
  - `minCefr === null` → unknown `threshold_unpublished`.
  - `!cefrAtLeast` → fail `below_threshold`.
  - `certificateRequired === true`: pass if `cert !== null && (acceptedTests.length === 0 || acceptedTests.includes(cert))`, else unknown `missing_student_value`.
  - `certificateRequired === null` → unknown `threshold_unpublished`.
  - `false` → pass `ok`.
  - student = level (omitted if there is no entry), required = minCefr (omitted if null).
- `prior_study_years_min`: pass if `priorHigherEducationYears >= years`, else fail `below_threshold`. student/required are the numbers.
- `manual_check`: unknown `manual_check`, `note = rule.note`.

- [ ] **Step 1: Failing test** `tests/domain/rules.test.ts`
```ts
import { describe, expect, it } from "vitest";
import type { ResolvedRule } from "@/data-schema/resolved";
import type { RuleContext } from "@/domain/rules";
import { evaluateRules } from "@/domain/rules";
import {
  conv20toLower, credentialType, ctx, estimateMeta, meta, profile, refKey, rule, scale20, staleMeta,
} from "../fixtures/domain/builders";

const P = "programs/xx-test-prog#requirements.rules.";
const one = (r: ResolvedRule, c: Partial<RuleContext> = {}) => {
  const out = evaluateRules([r], ctx(c));
  expect(out).toHaveLength(1);
  const [reason] = out;
  if (!reason) throw new Error("no reason");
  return reason;
};
type Row = [string, ResolvedRule, Partial<RuleContext>, string, string, string[]];
const check = (rows: Row[]) => it.each(rows)("%s", (_n, r, c, outcome, code, facts) => {
  const reason = one(r, c);
  expect({ outcome: reason.outcome, code: reason.code, facts: reason.facts.map(refKey) }).toEqual({ outcome, code, facts });
  expect(reason.ruleId).toBe(r.id); expect(reason.kind).toBe(r.kind);
});

const g = (id: string, threshold: number | null, scale = "xx-test-scale-20", m = meta()) =>
  rule("overall_grade_min", { id, scale, threshold, fact: m });
const S20 = "grading-scales/xx-test-scale-20#";
const S100 = "grading-scales/xx-test-scale-100#";
const SL = "grading-scales/xx-test-scale-lower#";
const C100 = "grade-conversions/xx-test-conv-20-100#";
const CL = "grade-conversions/xx-test-conv-20-lower#";
const withOverall = (value: number | null) =>
  ({ profile: profile({ credential: { overall: value === null ? null : { scale: "xx-test-scale-20", value } } }) });

describe("evaluateRules: order and shape", () => {
  it("returns [] for no rules", () => expect(evaluateRules([], ctx())).toEqual([]));
  it("one reason per rule, same order", () => {
    const rs = [g("r-b", 12), rule("prior_study_years_min", { id: "r-a", years: 1 })];
    expect(evaluateRules(rs, ctx()).map((r) => r.ruleId)).toEqual(["r-b", "r-a"]);
  });
  it("uses record + pathPrefix for the rule FactRef", () => {
    const r = one(g("r-x", 12), { record: "admission-routes/xx-test-route", pathPrefix: "conditions" });
    expect(r.facts.map(refKey)[0]).toBe("admission-routes/xx-test-route#conditions.r-x");
  });
});

describe("credential_type_in / credential_track_in", () => check([
  ["type accepted", rule("credential_type_in", { id: "t", types: ["xx-test-cred"] }), {}, "pass", "ok", [`${P}t`]],
  ["type rejected", rule("credential_type_in", { id: "t", types: ["xx-test-other"] }), {}, "fail", "track_not_accepted", [`${P}t`]],
  ["type rejected but stale", rule("credential_type_in", { id: "t", types: ["xx-test-other"], fact: staleMeta() }), {}, "unknown", "stale_source", [`${P}t`]],
  ["track accepted", rule("credential_track_in", { id: "k", tracks: ["xx-test-track-sci"] }), {}, "pass", "ok", [`${P}k`]],
  ["track rejected", rule("credential_track_in", { id: "k", tracks: ["xx-test-track-lit"] }), {}, "fail", "track_not_accepted", [`${P}k`]],
  ["track accepted but guidance", rule("credential_track_in", { id: "k", tracks: ["xx-test-track-sci"], fact: meta({ info_kind: "guidance" }) }), {}, "unknown", "non_official_source", [`${P}k`]],
]));

describe("overall_grade_min", () => check([
  ["same scale pass 14>=12", g("r", 12), {}, "pass", "ok", [`${P}r`, S20]],
  ["same scale equal 12>=12", g("r", 12), withOverall(12), "pass", "ok", [`${P}r`, S20]],
  ["same scale fail 11<12", g("r", 12), withOverall(11), "fail", "below_threshold", [`${P}r`, S20]],
  ["missing overall", g("r", 12), withOverall(null), "unknown", "missing_student_value", [`${P}r`, S20]],
  ["threshold unpublished", g("r", null), {}, "unknown", "threshold_unpublished", [`${P}r`, S20]],
  ["missing beats unpublished", g("r", null), withOverall(null), "unknown", "missing_student_value", [`${P}r`, S20]],
  ["unknown rule scale", g("r", 12, "xx-test-scale-missing"), {}, "unknown", "no_scale_conversion", [`${P}r`]],
  ["no conversion 20→100 absent", g("r", 65, "xx-test-scale-100"), { gradeConversions: [] }, "unknown", "no_scale_conversion", [`${P}r`, S100]],
  ["linear 14→70 >= 65", g("r", 65, "xx-test-scale-100"), {}, "pass", "ok", [`${P}r`, S100, C100]],
  ["linear 14→70 < 75", g("r", 75, "xx-test-scale-100"), {}, "fail", "below_threshold", [`${P}r`, S100, C100]],
  ["lower_better 14→2.8 > 2.5 fails", g("r", 2.5, "xx-test-scale-lower"), {}, "fail", "below_threshold", [`${P}r`, SL, CL]],
  ["lower_better 16→2.2 <= 2.5 passes", g("r", 2.5, "xx-test-scale-lower"), withOverall(16), "pass", "ok", [`${P}r`, SL, CL]],
  ["truncation 15.5→2.3 <= 2.3 passes", g("r", 2.3, "xx-test-scale-lower"), withOverall(15.5), "pass", "ok", [`${P}r`, SL, CL]],
  ["expected status turns pass into unknown", g("r", 12), { profile: profile({ credential: { status: "expected" } }) }, "unknown", "missing_student_value", [`${P}r`, S20]],
  ["expected status turns fail into unknown", g("r", 12), { profile: profile({ credential: { status: "expected", overall: { scale: "xx-test-scale-20", value: 9 } } }) }, "unknown", "missing_student_value", [`${P}r`, S20]],
  ["stale rule fact pass", g("r", 12, "xx-test-scale-20", staleMeta()), {}, "unknown", "stale_source", [`${P}r`, S20]],
  ["estimate rule fact fail", g("r", 12, "xx-test-scale-20", estimateMeta()), withOverall(9), "unknown", "non_official_source", [`${P}r`, S20]],
  ["stale scale fact", g("r", 12), { gradingScales: [{ ...scale20, fact: staleMeta() }] }, "unknown", "stale_source", [`${P}r`, S20]],
  ["guidance conversion fact", g("r", 2.5, "xx-test-scale-lower"), withOverall(16), "pass", "ok", [`${P}r`, SL, CL]],
  ["guidance conversion fact downgrades", g("r", 2.5, "xx-test-scale-lower"), { ...withOverall(16), gradeConversions: [{ ...conv20toLower, fact: meta({ info_kind: "guidance" }) }] }, "unknown", "non_official_source", [`${P}r`, SL, CL]],
  ["stale + estimate → stale_source", g("r", 12, "xx-test-scale-20", staleMeta({ info_kind: "estimate" })), {}, "unknown", "stale_source", [`${P}r`, S20]],
  ["estimate + unpublished keeps own code", g("r", null, "xx-test-scale-20", estimateMeta()), {}, "unknown", "threshold_unpublished", [`${P}r`, S20]],
]));

describe("overall_grade_min values", () => {
  it("reports student, converted and required", () => {
    expect(one(g("r", 65, "xx-test-scale-100"))).toMatchObject({
      student: { scale: "xx-test-scale-20", value: 14 }, studentConverted: { scale: "xx-test-scale-100", value: 70 }, required: 65 });
  });
  it("omits student when missing", () => expect(one(g("r", 12), withOverall(null))).not.toHaveProperty("student"));
});

const sg = (id: string, subject: string, threshold: number | null) =>
  rule("subject_grade_min", { id, subject, scale: "xx-test-scale-20", threshold });
describe("subject_grade_min", () => check([
  ["math 15>=12", sg("s", "xx-test-math", 12), {}, "pass", "ok", [`${P}s`, S20]],
  ["math 15<16", sg("s", "xx-test-math", 16), {}, "fail", "below_threshold", [`${P}s`, S20]],
  ["no chemistry entry", sg("s", "xx-test-chem", 12), {}, "unknown", "missing_student_value", [`${P}s`, S20]],
  ["unpublished", sg("s", "xx-test-math", null), {}, "unknown", "threshold_unpublished", [`${P}s`, S20]],
]));

const CT = "credential-types/xx-test-cred#";
const st = (id: string, subjects: string[], mode: "all" | "any", m = meta()) => rule("subject_taken", { id, subjects, mode, fact: m });
describe("subject_taken", () => check([
  ["all [math] taken", st("t", ["xx-test-math"], "all"), {}, "pass", "ok", [`${P}t`]],
  ["any [math, chem]", st("t", ["xx-test-math", "xx-test-chem"], "any"), {}, "pass", "ok", [`${P}t`]],
  ["all [math, physics]: not listed but curriculum has it", st("t", ["xx-test-math", "xx-test-physics"], "all"), {}, "unknown", "missing_student_value", [`${P}t`]],
  ["all [chem]: curriculum lacks it", st("t", ["xx-test-chem"], "all"), {}, "fail", "track_not_accepted", [`${P}t`, CT]],
  ["any [chem, bio]: curriculum lacks both", st("t", ["xx-test-chem", "xx-test-bio"], "any"), {}, "fail", "track_not_accepted", [`${P}t`, CT]],
  ["track with null curriculum", st("t", ["xx-test-chem"], "all"), { profile: profile({ credential: { track: "xx-test-track-lit", subjects: [] } }) }, "unknown", "missing_student_value", [`${P}t`]],
  ["unknown credential type", st("t", ["xx-test-chem"], "all"), { profile: profile({ credential: { type: "xx-test-other" } }) }, "unknown", "missing_student_value", [`${P}t`]],
  ["curriculum fail but credential type stale", st("t", ["xx-test-chem"], "all"), { credentialTypes: [credentialType({ fact: staleMeta() })] }, "unknown", "stale_source", [`${P}t`, CT]],
  ["curriculum fail but rule estimate", st("t", ["xx-test-chem"], "all", estimateMeta()), {}, "unknown", "non_official_source", [`${P}t`, CT]],
]));

const lp = (o: { minCefr?: "B1" | "B2" | "C1" | null; certificateRequired?: boolean | null; acceptedTests?: string[]; language?: string; fact?: ReturnType<typeof meta> }) =>
  rule("language_proficiency", { id: "l", language: o.language ?? "fr", minCefr: o.minCefr === undefined ? "B2" : o.minCefr,
    certificateRequired: o.certificateRequired === undefined ? false : o.certificateRequired, acceptedTests: o.acceptedTests ?? [], ...(o.fact ? { fact: o.fact } : {}) });
const langs = (level: "B2" | "unknown", certificate: string | null) => ({ profile: profile({ languages: [{ language: "fr", level, certificate }] }) });
describe("language_proficiency", () => check([
  ["no entry for de", lp({ language: "de" }), {}, "unknown", "missing_student_value", [`${P}l`]],
  ["level unknown", lp({}), langs("unknown", null), "unknown", "missing_student_value", [`${P}l`]],
  ["level unknown beats unpublished", lp({ minCefr: null }), langs("unknown", null), "unknown", "missing_student_value", [`${P}l`]],
  ["minCefr unpublished", lp({ minCefr: null }), {}, "unknown", "threshold_unpublished", [`${P}l`]],
  ["B2 < C1", lp({ minCefr: "C1" }), {}, "fail", "below_threshold", [`${P}l`]],
  ["B2 >= B1, no cert required", lp({ minCefr: "B1" }), {}, "pass", "ok", [`${P}l`]],
  ["cert required, held and accepted", lp({ certificateRequired: true, acceptedTests: ["xx-test-cert-fr"] }), {}, "pass", "ok", [`${P}l`]],
  ["cert required, held but not accepted", lp({ certificateRequired: true, acceptedTests: ["xx-test-cert-other"] }), {}, "unknown", "missing_student_value", [`${P}l`]],
  ["cert required, any test, cert held", lp({ certificateRequired: true, acceptedTests: [] }), {}, "pass", "ok", [`${P}l`]],
  ["cert required, none held", lp({ certificateRequired: true }), langs("B2", null), "unknown", "missing_student_value", [`${P}l`]],
  ["cert requirement unpublished", lp({ certificateRequired: null }), {}, "unknown", "threshold_unpublished", [`${P}l`]],
  ["fail but stale", lp({ minCefr: "C1", fact: staleMeta() }), {}, "unknown", "stale_source", [`${P}l`]],
]));

describe("prior_study_years_min / manual_check", () => {
  check([
    ["0 < 1", rule("prior_study_years_min", { id: "y", years: 1 }), {}, "fail", "below_threshold", [`${P}y`]],
    ["1 >= 1", rule("prior_study_years_min", { id: "y", years: 1 }), { profile: profile({ priorHigherEducationYears: 1 }) }, "pass", "ok", [`${P}y`]],
    ["estimate", rule("prior_study_years_min", { id: "y", years: 1, fact: estimateMeta() }), {}, "unknown", "non_official_source", [`${P}y`]],
    ["manual", rule("manual_check", { id: "m", note: "programs/xx-test-prog#requirements.rules.m.note" }), {}, "unknown", "manual_check", [`${P}m`]],
  ]);
  it("manual_check carries note", () => expect(one(rule("manual_check", { id: "m", note: "k" })).note).toBe("k"));
});
```
- [ ] **Step 2: Run and expect FAIL**: `pnpm test tests/domain/rules.test.ts` fails with `Failed to resolve import "@/domain/rules"`.
- [ ] **Step 3: Implement** as specified. Use one small function per kind and a `switch` with an exhaustive `never` default. Use no `!`; guard `noUncheckedIndexedAccess` reads.
- [ ] **Step 4: Run and expect PASS**, then `pnpm typecheck && pnpm lint && pnpm test`.
- [ ] **Step 5: Commit** with message `feat: add requirement rule engine with decisiveness downgrade` and the trailer.

---

### Task 15: `route.ts` resolveRoute, `match.ts` matchProgram and aggregateMatchStatus

**Files:** Create `src/domain/route.ts`, `src/domain/match.ts`, `tests/domain/match.test.ts`

**Interfaces:**
- Consumes: `evaluateRules`, `toFactRef`, `downgrade`, `isDecisive`.
- Produces: `resolveRoute`, `MatchReference`, `MatchInput`, `matchProgram`, `aggregateMatchStatus`.

**Algorithm.**
- `resolveRoute` returns the first route with `origin === credential.country && credentialType === credential.type && destination === destination && level === "bachelor"`, else null.
- `matchProgram`:
  1. `r = resolveRoute(profile, program.country, routes)`. `routeRef = toFactRef("admission-routes/"+slug, "", r.fact, now)`.
  2. Route reason (`ruleId "route"`, `kind "route"`):
     - missing → unknown `route_check`, `facts: []`, `route: "missing"`.
     - `check` → unknown `route_check`, `[routeRef]`.
     - `foundation` → unknown `route_foundation`, `[routeRef]`, **return immediately**.
     - `not_eligible` → `downgrade("fail","route_not_eligible",[routeRef])`, **return immediately**.
     - `direct` → `downgrade("pass","ok",[routeRef])`.
     - Add `note: r.note` when non-null.
  3. Conditions (check/direct only): `evaluateRules(r.conditions, {…reference, profile, record: "admission-routes/"+slug, pathPrefix: "conditions", now})`, mapped to `ruleId: "route:"+id`.
  4. Program rules: `evaluateRules(program.requirements.rules, {record: "programs/"+program.slug, pathPrefix: "requirements.rules", …})`.
  5. Coverage: if `coverage === "partial"`, push `{ruleId:"coverage", kind:"coverage", outcome:"unknown", code:"coverage_partial", facts:[reqRef]}` with `reqRef = toFactRef(programRecord, "requirements", requirements.fact, now)`. Otherwise, if `!isDecisive(requirements.fact)`, push the same shape with the code from `downgrade("pass","ok",[reqRef])` (Amendment A2).
  6. `status = aggregateMatchStatus(reasons)`.
- `aggregateMatchStatus`: any `fail` → `not_satisfied`; else any `unknown` → `check`; else `satisfied` (including an empty list).

- [ ] **Step 1: Failing test** `tests/domain/match.test.ts`
```ts
import { describe, expect, it } from "vitest";
import type { AdmissionRoute, Program } from "@/data-schema/resolved";
import { aggregateMatchStatus, matchProgram } from "@/domain/match";
import { resolveRoute } from "@/domain/route";
import type { Reason } from "@/domain/types";
import {
  estimateMeta, meta, NOW, profile, program, reference, refKey, requirements, route, rule, staleMeta,
} from "../fixtures/domain/builders";

const run = (routes: AdmissionRoute[], p: Program = program(), prof = profile()) =>
  matchProgram({ profile: prof, program: p, routes, reference: reference(), now: NOW });
const brief = (rs: Reason[]) => rs.map((r) => `${r.ruleId}:${r.outcome}:${r.code}`);
const failRule = rule("prior_study_years_min", { id: "r-fail", years: 1 });
const passRule = rule("credential_type_in", { id: "r-pass", types: ["xx-test-cred"] });
const withRules = (...rules: Parameters<typeof requirements>[0]["rules"] & object[]) => program({ requirements: requirements({ rules }) });

describe("resolveRoute", () => {
  it.each([
    ["exact match", [route()], "XB", "xx-test-route"],
    ["destination mismatch", [route({ destination: "XC" })], "XB", null],
    ["origin mismatch", [route({ origin: "XC" })], "XB", null],
    ["credential type mismatch", [route({ credentialType: "xx-test-other" })], "XB", null],
    ["first of several matches", [route({ slug: "xx-test-route-a" }), route({ slug: "xx-test-route-b" })], "XB", "xx-test-route-a"],
  ] as const)("%s", (_n, routes, dest, slug) =>
    expect(resolveRoute(profile(), dest, [...routes])?.slug ?? null).toBe(slug));
});

describe("matchProgram route handling", () => {
  it.each([
    ["direct, no rules", [route()], program(), "satisfied", "direct", ["route:pass:ok"]],
    ["direct but stale route", [route({ fact: staleMeta() })], program(), "check", "direct", ["route:unknown:stale_source"]],
    ["direct but estimate route", [route({ fact: estimateMeta() })], program(), "check", "direct", ["route:unknown:non_official_source"]],
    ["missing route, rules still evaluated", [], withRules(passRule), "check", "missing", ["route:unknown:route_check", "r-pass:pass:ok"]],
    ["missing route + failing rule", [], withRules(failRule), "not_satisfied", "missing", ["route:unknown:route_check", "r-fail:fail:below_threshold"]],
    ["check route, rules evaluated", [route({ outcome: "check" })], withRules(passRule), "check", "check", ["route:unknown:route_check", "r-pass:pass:ok"]],
    ["foundation short-circuits", [route({ outcome: "foundation" })], program({ requirements: requirements({ coverage: "partial", rules: [failRule] }) }), "check", "foundation", ["route:unknown:route_foundation"]],
    ["not_eligible decisive", [route({ outcome: "not_eligible" })], withRules(passRule), "not_satisfied", "not_eligible", ["route:fail:route_not_eligible"]],
    ["not_eligible stale", [route({ outcome: "not_eligible", fact: staleMeta() })], withRules(passRule), "check", "not_eligible", ["route:unknown:stale_source"]],
    ["not_eligible guidance", [route({ outcome: "not_eligible", fact: meta({ info_kind: "guidance" }) })], program(), "check", "not_eligible", ["route:unknown:non_official_source"]],
    ["direct + failing condition", [route({ conditions: [rule("prior_study_years_min", { id: "xx-test-cond", years: 1 })] })], program(), "not_satisfied", "direct", ["route:pass:ok", "route:xx-test-cond:fail:below_threshold"]],
    ["foundation skips conditions", [route({ outcome: "foundation", conditions: [failRule] })], program(), "check", "foundation", ["route:unknown:route_foundation"]],
    ["direct + failing program rule", [route()], withRules(failRule), "not_satisfied", "direct", ["route:pass:ok", "r-fail:fail:below_threshold"]],
    ["coverage partial", [route()], program({ requirements: requirements({ coverage: "partial", rules: [passRule] }) }), "check", "direct", ["route:pass:ok", "r-pass:pass:ok", "coverage:unknown:coverage_partial"]],
    ["requirements fact stale, complete (A2)", [route()], program({ requirements: requirements({ fact: staleMeta() }) }), "check", "direct", ["route:pass:ok", "coverage:unknown:stale_source"]],
    ["decisive fail wins over stale elsewhere", [route({ fact: staleMeta() })], withRules(failRule), "not_satisfied", "direct", ["route:unknown:stale_source", "r-fail:fail:below_threshold"]],
  ] as const)("%s", (_n, routes, p, status, routeOutcome, reasons) => {
    const r = run([...routes], p);
    expect({ status: r.status, route: r.route, reasons: brief(r.reasons), programSlug: r.programSlug })
      .toEqual({ status, route: routeOutcome, reasons: [...reasons], programSlug: "xx-test-prog" });
  });

  it("orders route, conditions, program rules in data order, coverage", () => {
    const rb = rule("prior_study_years_min", { id: "r-b", years: 0 });
    const ra = rule("prior_study_years_min", { id: "r-a", years: 0 });
    const r = run([route({ conditions: [rule("prior_study_years_min", { id: "c-1", years: 0 })] })],
      program({ requirements: requirements({ coverage: "partial", rules: [rb, ra] }) }));
    expect(r.reasons.map((x) => x.ruleId)).toEqual(["route", "route:c-1", "r-b", "r-a", "coverage"]);
  });
  it("route and condition FactRefs", () => {
    const r = run([route({ conditions: [rule("prior_study_years_min", { id: "c-1", years: 0 })] })]);
    expect(r.reasons[0]?.facts.map(refKey)).toEqual(["admission-routes/xx-test-route#"]);
    expect(r.reasons[1]?.facts.map(refKey)).toEqual(["admission-routes/xx-test-route#conditions.c-1"]);
  });
  it("coverage reason cites the requirements fact", () => {
    const r = run([route()], program({ requirements: requirements({ coverage: "partial" }) }));
    expect(r.reasons.at(-1)).toMatchObject({ kind: "coverage", facts: [{ record: "programs/xx-test-prog", path: "requirements" }] });
  });
  it("route note is carried", () => {
    expect(run([route({ outcome: "foundation", note: "admission-routes/xx-test-route#note" })]).reasons[0]?.note)
      .toBe("admission-routes/xx-test-route#note");
  });
});

describe("aggregateMatchStatus", () => {
  const R = (outcome: Reason["outcome"]): Reason => ({ ruleId: "x", kind: "route", outcome, code: "ok", facts: [] });
  it.each([
    [[], "satisfied"], [[R("pass")], "satisfied"], [[R("pass"), R("unknown")], "check"],
    [[R("unknown"), R("fail")], "not_satisfied"], [[R("fail"), R("pass")], "not_satisfied"],
  ] as const)("%j → %s", (rs, s) => expect(aggregateMatchStatus([...rs])).toBe(s));
});

describe("invariants over a matrix", () => {
  const outcomes = ["missing", "direct", "check", "foundation", "not_eligible"] as const;
  const routeMetas = [meta(), staleMeta(), estimateMeta()];
  const ruleSets = [[], [passRule], [failRule], [{ ...passRule, fact: staleMeta() }], [rule("manual_check", { id: "m", note: "k" })], [passRule, failRule]];
  const coverages = ["complete", "partial"] as const;
  const reqMetas = [meta(), staleMeta()];
  const cases = outcomes.flatMap((o) => routeMetas.flatMap((rm) => ruleSets.flatMap((rs) => coverages.flatMap((cov) =>
    reqMetas.map((qm) => ({ o, rm, rs, cov, qm }))))));
  it(`holds for ${cases.length} combinations`, () => {
    for (const { o, rm, rs, cov, qm } of cases) {
      const routes = o === "missing" ? [] : [route({ outcome: o, fact: rm })];
      const r = run(routes, program({ requirements: requirements({ coverage: cov, fact: qm, rules: rs }) }));
      const facts = r.reasons.flatMap((x) => x.facts);
      if (r.status === "satisfied") {
        expect(r.reasons.every((x) => x.outcome === "pass")).toBe(true);
        expect(facts.every((f) => f.info_kind === "official" && f.freshness !== "stale")).toBe(true);
        expect(cov).toBe("complete"); expect(r.route).toBe("direct");
      }
      if (r.status === "not_satisfied") {
        expect(r.reasons.some((x) => x.outcome === "fail"
          && x.facts.every((f) => f.info_kind === "official" && f.freshness !== "stale"))).toBe(true);
      }
      if (facts.length > 0 && facts.every((f) => f.freshness === "stale") && o !== "missing") expect(r.status).toBe("check");
    }
  });
});
```
(The `withRules` helper type is awkward. The implementer may simplify it to `(...rules: ResolvedRule[]) => program({ requirements: requirements({ rules }) })`, importing `ResolvedRule` as a type.)

- [ ] **Step 2: Run and expect FAIL**: `pnpm test tests/domain/match.test.ts` fails with `Failed to resolve import "@/domain/match"`.
- [ ] **Step 3: Implement** as specified.
- [ ] **Step 4: Run and expect PASS**, then `pnpm typecheck && pnpm lint && pnpm test`.
- [ ] **Step 5: Commit** with message `feat: add admission route resolution and program matching` and the trailer.

---

### Task 16: `intakes.ts` nextIntake, `scholarships.ts` scholarshipsForProgram

**Files:** Create `src/domain/intakes.ts`, `src/domain/scholarships.ts`, `tests/domain/intakes.test.ts`, `tests/domain/scholarships.test.ts`

**Interfaces:** Produces `nextIntake(program, now): IntakeStatus` and `scholarshipsForProgram(profile, program, scholarships): Scholarship[]`.

**Algorithm.**
- nextIntake:
  - `fact = toFactRef("programs/"+slug, "intakes", program.intakes, now)`.
  - If the value is null or empty, or every deadline is null → `{kind:"unknown", fact}`.
  - Candidates are intakes whose non-null deadline satisfies `compareIso(deadline, now) >= 0`. Pick the minimum deadline; on a tie, keep the first in data order. Return `{kind:"upcoming", intake, fact}`.
  - With no candidates → `{kind:"closed", fact}`.
- scholarshipsForProgram:
  - Nationality-eligible = `eligibleNationalities.length === 0 || eligibleNationalities.includes(profile.nationality)`. The nationality filter applies to BOTH linked and matched scholarships (decision 2026-09-29: never list a scholarship the student's nationality excludes).
  - Linked = scholarships whose slug is in `program.scholarships` AND nationality-eligible (destination and field filters do not apply to linked ones).
  - Matched = `destinations.includes(program.country) && (fields.length === 0 || fields.includes(program.field)) && (eligibleNationalities.length === 0 || eligibleNationalities.includes(profile.nationality))`.
  - Return the union, de-duplicated by slug and sorted with `a.slug < b.slug ? -1 : …` (no locale compare). Past deadlines are not filtered out. Linked slugs absent from the input are dropped.

- [ ] **Step 1: Failing tests**
```ts
// tests/domain/intakes.test.ts
import { describe, expect, it } from "vitest";
import type { Intake } from "@/data-schema/records/program";
import { nextIntake } from "@/domain/intakes";
import { fact, NOW, program } from "../fixtures/domain/builders";

const I = (applicationDeadline: string | null, startDate = "2027-09-01"): Intake => ({ startDate, applicationOpens: null, applicationDeadline });
const at = (intakes: Intake[] | null) => nextIntake(program({ intakes: fact(intakes, { class: "volatile" }) }), NOW);

describe("nextIntake", () => {
  it.each([
    ["future deadline", [I("2027-01-15")], "upcoming", "2027-01-15"],
    ["deadline today is inclusive", [I(NOW)], "upcoming", NOW],
    ["deadline yesterday", [I("2026-09-28")], "closed", null],
    ["earliest future regardless of order", [I("2027-06-01", "2028-01-01"), I("2027-01-15")], "upcoming", "2027-01-15"],
    ["past then future", [I("2026-01-01"), I("2027-02-01")], "upcoming", "2027-02-01"],
    ["null + past", [I(null), I("2026-01-01")], "closed", null],
    ["null + future", [I(null), I("2027-02-01")], "upcoming", "2027-02-01"],
    ["all null", [I(null), I(null)], "unknown", null],
    ["empty list", [], "unknown", null],
    ["value not published", null, "unknown", null],
  ] as const)("%s → %s", (_n, intakes, kind, deadline) => {
    const r = at(intakes === null ? null : [...intakes]);
    expect(r.kind).toBe(kind);
    expect(r.kind === "upcoming" ? r.intake.applicationDeadline : null).toBe(deadline);
    expect(r.fact).toMatchObject({ record: "programs/xx-test-prog", path: "intakes", class: "volatile", freshness: "fresh" });
  });
});
```
```ts
// tests/domain/scholarships.test.ts
import { describe, expect, it } from "vitest";
import { scholarshipsForProgram } from "@/domain/scholarships";
import { profile, program, scholarship } from "../fixtures/domain/builders";

const S = (slug: string, o: Parameters<typeof scholarship>[0] = {}) => scholarship({ slug, ...o });
describe("scholarshipsForProgram", () => {
  it.each([
    ["matches destination, any field, any nationality", [S("xx-test-sch-a")], [], ["xx-test-sch-a"]],
    ["other destination excluded", [S("xx-test-sch-a", { destinations: ["XC"] })], [], []],
    ["field filter match", [S("xx-test-sch-a", { fields: ["xx-test-field"] })], [], ["xx-test-sch-a"]],
    ["field filter miss", [S("xx-test-sch-a", { fields: ["xx-test-field-other"] })], [], []],
    ["nationality filter match", [S("xx-test-sch-a", { eligibleNationalities: ["XA"] })], [], ["xx-test-sch-a"]],
    ["nationality filter miss", [S("xx-test-sch-a", { eligibleNationalities: ["XC"] })], [], []],
    ["linked despite destination and field mismatch", [S("xx-test-sch-a", { destinations: ["XC"], fields: ["xx-test-field-other"] })], ["xx-test-sch-a"], ["xx-test-sch-a"]],
    ["linked but nationality excluded", [S("xx-test-sch-a", { eligibleNationalities: ["XC"] })], ["xx-test-sch-a"], []],
    ["linked and matched de-duplicated", [S("xx-test-sch-a")], ["xx-test-sch-a"], ["xx-test-sch-a"]],
    ["sorted by slug", [S("xx-test-sch-c"), S("xx-test-sch-a"), S("xx-test-sch-b")], [], ["xx-test-sch-a", "xx-test-sch-b", "xx-test-sch-c"]],
    ["past deadline kept", [S("xx-test-sch-a", { deadline: { ...scholarship().deadline, value: "2020-01-01" } })], [], ["xx-test-sch-a"]],
    ["linked slug absent from input dropped", [], ["xx-test-sch-z"], []],
  ] as const)("%s", (_n, list, linked, expected) =>
    expect(scholarshipsForProgram(profile(), program({ scholarships: [...linked] }), [...list]).map((s) => s.slug)).toEqual([...expected]));
});
```
- [ ] **Step 2: Run and expect FAIL** (unresolved imports).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run and expect PASS**, then typecheck and lint.
- [ ] **Step 5: Commit** with message `feat: add next-intake status and program scholarship selection` and the trailer.

---

### Task 16A: `filter.ts` filterPrograms (preference filter)

Added 2026-09-29 at the product owner's request. M3 needs to narrow the program list by the student's stated preferences without hiding anything on weak evidence.

**Files:** Create `src/domain/filter.ts`, `tests/domain/filter.test.ts`

**Interfaces:**
- Consumes: `Profile` (contract §7), `Program` (contract §9), `isDecisive` from `./facts` (T12), `IsoDate`, `Slug`.
- Produces:
```ts
export type PreferenceMismatch = "destination" | "field" | "institution_type" | "study_language";
export type ProgramFilterResult = {
  kept: Program[];                                                          // input order preserved
  excluded: Array<{ programSlug: Slug; mismatches: PreferenceMismatch[] }>; // mismatches in the fixed order above
};
export function preferenceMismatches(profile: Profile, program: Program, now: IsoDate): PreferenceMismatch[];
export function filterPrograms(profile: Profile, programs: readonly Program[], now: IsoDate): ProgramFilterResult;
```

**Semantics (all conservative: hide only on a definite mismatch).**
- `destination`: mismatch iff `profile.destinations.length > 0 && !profile.destinations.includes(program.country)`.
- `field`: mismatch iff `!profile.fields.includes(program.field)`.
- `institution_type`: mismatch iff `profile.institutionType !== "any" && program.institutionType !== profile.institutionType`.
- `study_language`: mismatch iff `profile.studyLanguages.length > 0` AND `program.teachingLanguages.value !== null` AND `isDecisive(program.teachingLanguages, now)` AND no element of `program.teachingLanguages.value` is in `profile.studyLanguages`. A null value, a stale fact or a non-official fact never hides a program (unknown is not a mismatch).
- Budget is NOT a filter: it only affects `budgetFit` in `estimateCost`.
- A program is `kept` iff it has zero mismatches; otherwise it goes to `excluded` with all its mismatches. `excluded` is returned so the UI can say "N programs hidden by your preferences" instead of silently dropping them. Pure: never mutates inputs.
- Filtering is independent of matching: `matchProgram` is unaffected by this function.

- [ ] **Step 1: Failing test** `tests/domain/filter.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { filterPrograms, preferenceMismatches } from "@/domain/filter";
import { deepFreeze, estimateMeta, fact, NOW, profile, program, staleMeta } from "../fixtures/domain/builders";

describe("preferenceMismatches", () => {
  it.each([
    ["all defaults match", {}, {}, []],
    ["destinations empty means all", { destinations: [] }, { country: "XC" }, []],
    ["destination listed", { destinations: ["XB"] }, {}, []],
    ["destination not listed", { destinations: ["XC"] }, {}, ["destination"]],
    ["field not wanted", { fields: ["xx-test-field-other"] }, {}, ["field"]],
    ["one of several fields", { fields: ["xx-test-field-other", "xx-test-field"] }, {}, []],
    ["institution any", { institutionType: "any" }, { institutionType: "private" }, []],
    ["institution public wanted, public", { institutionType: "public" }, {}, []],
    ["institution private wanted, public", { institutionType: "private" }, {}, ["institution_type"]],
    ["language empty means any", { studyLanguages: [] }, { teachingLanguages: fact(["de"]) }, []],
    ["language overlap", { studyLanguages: ["fr", "en"] }, { teachingLanguages: fact(["en"]) }, []],
    ["language no overlap, decisive", { studyLanguages: ["fr"] }, { teachingLanguages: fact(["de"]) }, ["study_language"]],
    ["language unpublished never hides", { studyLanguages: ["fr"] }, { teachingLanguages: fact(null) }, []],
    ["language stale never hides", { studyLanguages: ["fr"] }, { teachingLanguages: fact(["de"], staleMeta()) }, []],
    ["language non-official never hides", { studyLanguages: ["fr"] }, { teachingLanguages: fact(["de"], estimateMeta()) }, []],
    ["several mismatches in fixed order",
      { destinations: ["XC"], fields: ["xx-test-field-other"], institutionType: "private", studyLanguages: ["fr"] },
      { teachingLanguages: fact(["de"]) }, ["destination", "field", "institution_type", "study_language"]],
  ] as const)("%s", (_n, p, prog, expected) =>
    expect(preferenceMismatches(profile({ ...p } as never), program({ ...prog } as never), NOW)).toEqual([...expected]));

  it("ignores budget entirely", () => {
    const p = profile({ budget: { amountMinor: 1, currency: "XTS", period: "month" } });
    expect(preferenceMismatches(p, program(), NOW)).toEqual([]);
  });
});

describe("filterPrograms", () => {
  const keep = program({ slug: "xx-test-keep" });
  const dropA = program({ slug: "xx-test-drop-a", country: "XC" });
  const dropB = program({ slug: "xx-test-drop-b", field: "xx-test-field-other", institutionType: "private" });
  const p = profile({ destinations: ["XB"], institutionType: "public" });

  it("splits kept and excluded, preserving input order and reporting mismatches", () => {
    const r = filterPrograms(p, [dropA, keep, dropB], NOW);
    expect(r.kept.map((x) => x.slug)).toEqual(["xx-test-keep"]);
    expect(r.excluded).toEqual([
      { programSlug: "xx-test-drop-a", mismatches: ["destination"] },
      { programSlug: "xx-test-drop-b", mismatches: ["field", "institution_type"] },
    ]);
  });
  it("returns everything kept when nothing mismatches, and handles an empty list", () => {
    expect(filterPrograms(profile(), [keep], NOW)).toEqual({ kept: [keep], excluded: [] });
    expect(filterPrograms(profile(), [], NOW)).toEqual({ kept: [], excluded: [] });
  });
  it("does not mutate inputs", () => {
    expect(() => filterPrograms(deepFreeze(p), deepFreeze([keep, dropA]), NOW)).not.toThrow();
  });
});
```
- [ ] **Step 2:** `pnpm test tests/domain/filter.test.ts`. Expected: FAIL (cannot resolve `@/domain/filter`).
- [ ] **Step 3: Implement** `src/domain/filter.ts` exactly per the semantics above: one small `preferenceMismatches` that pushes in the fixed order, and `filterPrograms` that folds programs into `kept` / `excluded`. No `Date`, no `zod`; type-only imports from `@/data-schema/*`; `import { isDecisive } from "./facts"`.
- [ ] **Step 4:** run the tests (PASS), then `pnpm typecheck && pnpm lint && pnpm test`.
- [ ] **Step 5: Commit** `feat: add program preference filter with excluded reasons` + the Co-Authored-By trailer.

---

### Task 17: `costs.ts` estimateCost

**Files:** Create `src/domain/costs.ts`, `tests/domain/costs.test.ts`

**Interfaces:** Produces `CostInput`, `estimateCost(input): CostEstimate`, and `export const ACADEMIC_YEAR_MONTHS = 10` (decision 2026-09-29: living costs are estimated for a 10-month academic year, not 12; `CostEstimate.academicYearMonths` carries the value so the UI can state the assumption). Lines always follow `["tuition","housing","food","transport","insurance","application_visa","setup"]`.

**Algorithm.**
- Tuition:
  - Value null → `{category:"tuition", status:"missing", firstYear:null, per:null, scope:"program", fact: ref(tuition)}`.
  - Else `k = period === "semester" ? 2 : 1` → `firstYear {min: amt*k, max: amt*k, currency}`, `per: period`, `scope: "program"`.
- Living category c:
  - `city = profiles.find(country === program.country && city === program.city)`; `country = profiles.find(country === program.country && city === null)`.
  - Use city if `city?.lines[c]?.value != null` (scope "city"), else country if its value is non-null (scope "country").
  - `k = per month ? ACADEMIC_YEAR_MONTHS : 1` (year and once both give 1). `firstYear = {min*k, max*k, currency}`, `per: amount.per`, `fact: toFactRef("cost-profiles/"+slug, "lines."+c, line, now)`.
  - If neither is non-null → missing. For missing lines, `fact`/`scope` point at the null-valued line (city first) if one exists, else both are null (Amendment A6). `per: null`, `firstYear: null`.
- Totals: accumulate per currency in order of first appearance over ok lines.
- `complete` = every line is ok.
- `academicYearMonths` = `ACADEMIC_YEAR_MONTHS` on every estimate.
- budgetFit:
  - `unknown` unless `budget && complete && totals.length === 1 && totals[0].currency === budget.currency`.
  - `B = amountMinor * (period === "month" ? ACADEMIC_YEAR_MONTHS : 1)`.
  - `max <= B` → within; `min > B` → above; else straddles.
- Never mutate input: build new objects only.

- [ ] **Step 1: Failing test**
```ts
import { describe, expect, it } from "vitest";
import type { Budget } from "@/data-schema/profile";
import type { CostProfile, Program } from "@/data-schema/resolved";
import { estimateCost } from "@/domain/costs";
import { costLine, costProfile, deepFreeze, fact, NOW, program, STALE } from "../fixtures/domain/builders";

const cityP = costProfile("xx-test-cost-city", "xx-test-city", {
  housing: costLine(40000, 60000, "month"), food: costLine(20000, 30000, "month") });
const countryP = costProfile("xx-test-cost-country", null, {
  housing: costLine(30000, 50000, "month"), transport: costLine(3000, 5000, "month"), insurance: costLine(10000, 20000, "year"),
  application_visa: costLine(5000, 9000, "once"), setup: costLine(20000, 40000, "once") });
const est = (o: { p?: Program; profiles?: CostProfile[]; budget?: Budget | null } = {}) =>
  estimateCost({ program: o.p ?? program(), costProfiles: o.profiles ?? [cityP, countryP], budget: o.budget ?? null, now: NOW });

describe("estimateCost lines", () => {
  it("computes the seven first-year lines with scope and per", () => {
    const r = est();
    expect(r.lines.map((l) => [l.category, l.status, l.firstYear?.min, l.firstYear?.max, l.per, l.scope])).toEqual([
      ["tuition", "ok", 100000, 100000, "year", "program"],
      ["housing", "ok", 400000, 600000, "month", "city"],
      ["food", "ok", 200000, 300000, "month", "city"],
      ["transport", "ok", 30000, 50000, "month", "country"],
      ["insurance", "ok", 10000, 20000, "year", "country"],
      ["application_visa", "ok", 5000, 9000, "once", "country"],
      ["setup", "ok", 20000, 40000, "once", "country"],
    ]);
    expect(r.totals).toEqual([{ min: 765000, max: 1119000, currency: "XTS" }]);
    expect(r.complete).toBe(true);
    expect(r.academicYearMonths).toBe(10);
    expect(r.lines[1]?.fact).toMatchObject({ record: "cost-profiles/xx-test-cost-city", path: "lines.housing" });
    expect(r.lines[0]?.fact).toMatchObject({ record: "programs/xx-test-prog", path: "tuition", class: "volatile" });
  });
  it("semester tuition doubles", () => {
    const r = est({ p: program({ tuition: fact({ amountMinor: 60000, currency: "XTS", period: "semester" as const }, { class: "volatile" }) }) });
    expect(r.lines[0]).toMatchObject({ firstYear: { min: 120000, max: 120000 }, per: "semester" });
  });
  it("tuition not published → missing, incomplete, unknown fit", () => {
    const r = est({ p: program({ tuition: fact(null, { class: "volatile" }) }), budget: { amountMinor: 9999999, currency: "XTS", period: "year" } });
    expect(r.lines[0]).toMatchObject({ status: "missing", firstYear: null, per: null, scope: "program" });
    expect(r.complete).toBe(false); expect(r.budgetFit).toBe("unknown");
    expect(r.totals).toEqual([{ min: 665000, max: 1019000, currency: "XTS" }]);
  });
  it("missing living line", () => {
    const { setup: _s, ...rest } = countryP.lines;
    const r = est({ profiles: [cityP, { ...countryP, lines: rest }] });
    expect(r.lines[6]).toEqual({ category: "setup", status: "missing", firstYear: null, per: null, scope: null, fact: null });
    expect(r.totals).toEqual([{ min: 745000, max: 1079000, currency: "XTS" }]); expect(r.complete).toBe(false);
  });
  it("ignores other cities and other countries", () => {
    const r = est({ profiles: [costProfile("xx-test-cost-other", "xx-test-other-city", { food: costLine(1, 1, "once") }),
      costProfile("xx-test-cost-xc", null, { food: costLine(1, 1, "once") }, "XC")] });
    expect(r.lines.slice(1).every((l) => l.status === "missing")).toBe(true);
  });
  it("multiple currencies → per-currency totals in first-appearance order, fit unknown", () => {
    const r = est({ p: program({ tuition: fact({ amountMinor: 100000, currency: "XXX", period: "year" as const }, { class: "volatile" }) }),
      budget: { amountMinor: 9999999, currency: "XTS", period: "year" } });
    expect(r.totals).toEqual([{ min: 100000, max: 100000, currency: "XXX" }, { min: 665000, max: 1019000, currency: "XTS" }]);
    expect(r.complete).toBe(true); expect(r.budgetFit).toBe("unknown");
  });
  it("stale line still counts, freshness visible", () => {
    const r = est({ profiles: [cityP, { ...countryP, lines: { ...countryP.lines, setup: costLine(20000, 40000, "once", { last_verified_at: STALE }) } }] });
    expect(r.lines[6]).toMatchObject({ status: "ok", fact: { freshness: "stale" } });
  });
  it("does not mutate inputs", () => {
    const p = deepFreeze(program()); const profiles = deepFreeze([cityP, countryP]);
    expect(() => estimateCost({ program: p, costProfiles: profiles, budget: null, now: NOW })).not.toThrow();
  });
});

describe("budgetFit (totals 765000..1119000 XTS, 10-month academic year)", () => {
  it.each([
    [null, "unknown"],
    [{ amountMinor: 1119000, currency: "XTS", period: "year" }, "within"],
    [{ amountMinor: 1000000, currency: "XTS", period: "year" }, "straddles"],
    [{ amountMinor: 765000, currency: "XTS", period: "year" }, "straddles"],
    [{ amountMinor: 764999, currency: "XTS", period: "year" }, "above"],
    [{ amountMinor: 112000, currency: "XTS", period: "month" }, "within"],   // x10 = 1 120 000
    [{ amountMinor: 76000, currency: "XTS", period: "month" }, "above"],     // x10 = 760 000
    [{ amountMinor: 9999999, currency: "XXX", period: "year" }, "unknown"],
  ] as const)("%j → %s", (budget, fit) => expect(est({ budget: budget === null ? null : { ...budget } }).budgetFit).toBe(fit));
});
```
- [ ] **Steps 2–5:** run and expect FAIL (unresolved import) → implement → run and expect PASS, then typecheck and lint → commit with message `feat: add first-year cost estimate with budget fit` and the trailer.

---

### Task 18: `checklist.ts` generateChecklist

**Files:** Create `src/domain/checklist.ts`, `tests/domain/checklist.test.ts`

**Interfaces:**
- Consumes: `nextIntake`, `toFactRef`, `isDecisive`, `CHECKLIST_STEP_IDS`.
- Produces: `ChecklistInput`, `generateChecklist(input): Checklist`. It returns 10 steps in `CHECKLIST_STEP_IDS` order. `match` is accepted but unused in M2 (Inconsistency I10).

**Step rules** (`docs = program.documents`, `docRef = programs/<slug>#documents`):
- **documents:** todo. Reason `unknown_data` if `docs.value === null`, else `applies`. `facts [docRef]`.
- **translation:** skipped `not_required_by_source` iff `docs.value !== null && docs.value.length > 0 && docs.value.every(d => d.translationRequired === false) && isDecisive(docs)`. Else todo, `applies` if some doc has `translationRequired === true`, else `unknown_data`. `facts [docRef]`.
- **language_exam:**
  - `L` = program `requirements.rules` of kind `language_proficiency`. `reqRef = programs/<slug>#requirements`. `facts` = the L rule refs (`requirements.rules.<id>`) in data order, then `reqRef`.
  - Skipped `certificate_held` iff `L.length > 0` and, for every rule, `isDecisive(rule.fact)` holds and the student's certificate for `rule.language` is non-null and (`rule.acceptedTests.length === 0` or in `rule.acceptedTests`). Empty `acceptedTests` means any certificate, exactly as in `evaluateRules` (decision 2026-09-29).
  - Else skipped `not_required_by_source` iff `coverage === "complete" && isDecisive(requirements.fact) && L.length === 0`.
  - Else todo: `applies` if `L.length > 0`, else `unknown_data`.
- **application_account:** `chRef = programs/<slug>#applicationChannel`. `channel` field = `input.channel?.slug ?? null`.
  - Null channel → todo `unknown_data`, `facts [chRef]`.
  - Else `facts [chRef, application-channels/<slug>#]`. `accountRequired === false && isDecisive(channel.fact)` → skipped `no_account_required`. `accountRequired === true` → todo `applies`. Otherwise (null, or false but not decisive) → todo `unknown_data`.
- **submit:** todo. `s = nextIntake(program, now)`. `deadline = s.kind === "upcoming" ? s.intake.applicationDeadline : null`. `reason = s.kind === "unknown" ? "unknown_data" : "applies"`. `channel = program.applicationChannel.value`. `facts [intakesRef, chRef]`.
- **scholarships:** list empty → skipped `no_scholarships_listed`, `scholarships: []`, `facts []`. Else todo `applies`, `scholarships` = slugs sorted, `facts` = each `scholarships/<slug>#deadline` in that order.
- **financial_documents, accommodation, visa, departure:** todo `applies`, `facts []`.
- Optional keys appear only on application_account (`channel`), submit (`deadline`, `channel`) and scholarships (`scholarships`).
- Unknown data never produces `skipped`: every skip above requires a non-null value plus a decisive fact.

- [ ] **Step 1: Failing test**
```ts
import { describe, expect, it } from "vitest";
import { generateChecklist } from "@/domain/checklist";
import { CHECKLIST_STEP_IDS } from "@/domain/types";
import type { ChecklistInput } from "@/domain/checklist";
import {
  channel, estimateMeta, fact, meta, NOW, profile, program, requirements, rule, scholarship, staleMeta,
} from "../fixtures/domain/builders";

const MATCH = { programSlug: "xx-test-prog", status: "check", route: "direct", reasons: [] } as const;
const gen = (o: Partial<ChecklistInput> = {}) =>
  generateChecklist({ profile: profile(), program: program(), match: { ...MATCH, reasons: [] }, channel: channel(), scholarships: [], now: NOW, ...o });
const step = (o: Partial<ChecklistInput>, id: (typeof CHECKLIST_STEP_IDS)[number]) => {
  const s = gen(o).steps.find((x) => x.id === id); if (!s) throw new Error(id); return s;
};
const docs = (flags: Array<boolean | null>, m = meta()) =>
  fact(flags.map((t, i) => ({ slug: `xx-test-doc-${i}`, name: `k${i}`, translationRequired: t })), m);
const lang = (acceptedTests: string[], m = meta()) =>
  rule("language_proficiency", { id: "l-fr", language: "fr", minCefr: "B2", certificateRequired: true, acceptedTests, fact: m });

describe("generateChecklist", () => {
  it("always ten steps in fixed order", () => {
    expect(gen().steps.map((s) => s.id)).toEqual([...CHECKLIST_STEP_IDS]);
    expect(gen({ program: program({ documents: fact(null), intakes: fact(null) }), channel: null }).steps).toHaveLength(10);
  });

  it.each([
    ["documents known", {}, "documents", "todo", "applies"],
    ["documents unpublished", { program: program({ documents: fact(null) }) }, "documents", "todo", "unknown_data"],
    ["translation required", {}, "translation", "todo", "applies"],
    ["translation none required, decisive", { program: program({ documents: docs([false, false]) }) }, "translation", "skipped", "not_required_by_source"],
    ["translation none required, stale", { program: program({ documents: docs([false], staleMeta()) }) }, "translation", "todo", "unknown_data"],
    ["translation none required, estimate", { program: program({ documents: docs([false], estimateMeta()) }) }, "translation", "todo", "unknown_data"],
    ["translation one unknown", { program: program({ documents: docs([false, null]) }) }, "translation", "todo", "unknown_data"],
    ["translation docs unpublished", { program: program({ documents: fact(null) }) }, "translation", "todo", "unknown_data"],
    ["translation empty document list", { program: program({ documents: docs([]) }) }, "translation", "todo", "unknown_data"],
    ["language: cert held & accepted", { program: program({ requirements: requirements({ rules: [lang(["xx-test-cert-fr"])] }) }) }, "language_exam", "skipped", "certificate_held"],
    ["language: cert held, any test accepted", { program: program({ requirements: requirements({ rules: [lang([])] }) }) }, "language_exam", "skipped", "certificate_held"],
    ["language: cert not accepted", { program: program({ requirements: requirements({ rules: [lang(["xx-test-cert-other"])] }) }) }, "language_exam", "todo", "applies"],
    ["language: accepted but rule stale", { program: program({ requirements: requirements({ rules: [lang(["xx-test-cert-fr"], staleMeta())] }) }) }, "language_exam", "todo", "applies"],
    ["language: no rules, complete, decisive", {}, "language_exam", "skipped", "not_required_by_source"],
    ["language: no rules, partial", { program: program({ requirements: requirements({ coverage: "partial" }) }) }, "language_exam", "todo", "unknown_data"],
    ["language: no rules, requirements stale", { program: program({ requirements: requirements({ fact: staleMeta() }) }) }, "language_exam", "todo", "unknown_data"],
    ["account required", {}, "application_account", "todo", "applies"],
    ["no account, decisive", { channel: channel({ accountRequired: false }) }, "application_account", "skipped", "no_account_required"],
    ["no account, stale", { channel: channel({ accountRequired: false, fact: staleMeta() }) }, "application_account", "todo", "unknown_data"],
    ["account requirement unpublished", { channel: channel({ accountRequired: null }) }, "application_account", "todo", "unknown_data"],
    ["channel missing", { channel: null }, "application_account", "todo", "unknown_data"],
    ["submit upcoming", {}, "submit", "todo", "applies"],
    ["submit closed", { program: program({ intakes: fact([{ startDate: null, applicationOpens: null, applicationDeadline: "2026-01-01" }], { class: "volatile" }) }) }, "submit", "todo", "applies"],
    ["submit unknown", { program: program({ intakes: fact(null, { class: "volatile" }) }) }, "submit", "todo", "unknown_data"],
    ["scholarships none", {}, "scholarships", "skipped", "no_scholarships_listed"],
    ["scholarships listed", { scholarships: [scholarship()] }, "scholarships", "todo", "applies"],
    ["financial documents", {}, "financial_documents", "todo", "applies"],
    ["accommodation", {}, "accommodation", "todo", "applies"],
    ["visa", {}, "visa", "todo", "applies"],
    ["departure", {}, "departure", "todo", "applies"],
  ] as const)("%s", (_n, o, id, status, reason) =>
    expect(step({ ...o } as Partial<ChecklistInput>, id)).toMatchObject({ status, reason }));

  it("submit carries deadline and channel", () => {
    expect(step({}, "submit")).toMatchObject({ deadline: "2027-01-15", channel: "xx-test-channel" });
    expect(step({ program: program({ intakes: fact([], { class: "volatile" }) }) }, "submit").deadline).toBeNull();
  });
  it("scholarships sorted, facts are deadlines", () => {
    const s = step({ scholarships: [scholarship({ slug: "xx-test-sch-b" }), scholarship({ slug: "xx-test-sch-a" })] }, "scholarships");
    expect(s.scholarships).toEqual(["xx-test-sch-a", "xx-test-sch-b"]);
    expect(s.facts.map((f) => `${f.record}#${f.path}`)).toEqual(["scholarships/xx-test-sch-a#deadline", "scholarships/xx-test-sch-b#deadline"]);
  });
  it("never skips on unknown data (all-null inputs)", () => {
    const c = gen({ program: program({ documents: fact(null), intakes: fact(null), requirements: requirements({ coverage: "partial", fact: estimateMeta() }) }),
      channel: channel({ accountRequired: null }), scholarships: [scholarship()] });
    expect(c.steps.filter((s) => s.status === "skipped")).toEqual([]);
  });
});
```
- [ ] **Steps 2–5:** run and expect FAIL → implement → run and expect PASS, then typecheck and lint → commit with message `feat: add ten-step application checklist` and the trailer.

---

### Task 19: End-to-end pipeline test, verification, docs, M3 hand-off

**Files:**
- Create: `tests/domain/pipeline.test.ts`
- Modify: `.claude/rules/matching-domain.md`. Also `.claude/docs/architecture.md`, but only if the conditions in Step 5 apply.

**Interfaces:**
- Consumes: the Part B CLI `scripts/data/build.ts` (flags `--data-dir`, `--out-dir`, per contract §10), fixture `tests/fixtures/data/valid-minimal`, and all of `src/domain`.
- Produces: proof that snapshot JSON flows through the domain. `node:fs` is used **in the test only**.

- [ ] **Step 1: Inspect the fixture.** `ls -R tests/fixtures/data/valid-minimal`. The test needs at least one `admission-routes`, `programs`, `institutions` and `credential-types` record. If any is missing, stop and report (Amendment A7). Do not add data to a Part B fixture without the main thread's approval.
- [ ] **Step 2: Write the test**
```ts
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { Profile } from "@/data-schema/profile";
import type { CoreShard, CostsShard, Manifest, ProgramsShard, RoutesShard, ScholarshipsShard } from "@/data-schema/snapshot";
import { generateChecklist } from "@/domain/checklist";
import { estimateCost } from "@/domain/costs";
import { matchProgram } from "@/domain/match";
import { resolveRoute } from "@/domain/route";
import { scholarshipsForProgram } from "@/domain/scholarships";
import { CHECKLIST_STEP_IDS } from "@/domain/types";

const ROOT = process.cwd();
let out = ""; let manifest: Manifest;
const read = <T>(name: string): T | null => {
  const e = manifest.shards[name]; return e ? (JSON.parse(readFileSync(path.join(out, e.file), "utf8")) as T) : null;
};

beforeAll(() => {
  out = mkdtempSync(path.join(os.tmpdir(), "jisr-e2e-"));
  const r = spawnSync(process.execPath, ["--import", "tsx", "scripts/data/build.ts",
    "--data-dir", "tests/fixtures/data/valid-minimal", "--out-dir", out], { cwd: ROOT, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`data:build failed\n${r.stdout}\n${r.stderr}`);
  manifest = JSON.parse(readFileSync(path.join(out, "manifest.json"), "utf8")) as Manifest;
}, 120_000);

describe("snapshot → domain pipeline", () => {
  it("runs match, costs, scholarships and checklist on built shards", () => {
    const core = read<CoreShard>("core"); if (!core) throw new Error("no core shard");
    const routesName = Object.keys(manifest.shards).find((n) => n.startsWith("routes."));
    const programsName = Object.keys(manifest.shards).find((n) => n.startsWith("programs."));
    if (!routesName || !programsName) throw new Error("valid-minimal must contain a route and a program");
    const routes = read<RoutesShard>(routesName)?.routes ?? [];
    const prog = read<ProgramsShard>(programsName)?.programs[0]; const r0 = routes[0];
    if (!prog || !r0) throw new Error("empty shards");
    const ct = core.credentialTypes.find((c) => c.slug === r0.credentialType); const track = ct?.tracks[0];
    if (!ct || !track) throw new Error("route credential type missing from core");
    const profile: Profile = { schemaVersion: 1, nationality: r0.origin,
      credential: { country: r0.origin, type: ct.slug, track: track.slug, status: "obtained", overall: null, subjects: [] },
      priorHigherEducationYears: 0, languages: [], fields: [prog.field], studyLanguages: [], destinations: [], budget: null, institutionType: "any" };
    const reference = { credentialTypes: core.credentialTypes, gradingScales: core.gradingScales, gradeConversions: core.gradeConversions };

    for (const now of ["2026-09-29", "2100-01-01"]) {
      const m = matchProgram({ profile, program: prog, routes, reference, now });
      const expectedRoute = resolveRoute(profile, prog.country, routes)?.outcome ?? "missing";
      expect(m.route).toBe(expectedRoute);
      expect(m.reasons[0]).toMatchObject({ ruleId: "route", kind: "route" });
      for (const f of m.reasons.flatMap((x) => x.facts)) expect(f.source_url.startsWith("https://")).toBe(true);
      expect(JSON.parse(JSON.stringify(m))).toEqual(m);
      if (now === "2100-01-01") expect(m.status).toBe("check"); // everything stale → never ✅/❌

      const costs = read<CostsShard>(`costs.${prog.country}`)?.profiles ?? [];
      const c = estimateCost({ program: prog, costProfiles: costs, budget: null, now });
      expect(c.lines.map((l) => l.category)).toEqual(["tuition", "housing", "food", "transport", "insurance", "application_visa", "setup"]);
      expect(c.budgetFit).toBe("unknown");

      const sch = scholarshipsForProgram(profile, prog, read<ScholarshipsShard>(`scholarships.${prog.country}`)?.scholarships ?? []);
      const channel = core.applicationChannels.find((x) => x.slug === prog.applicationChannel.value) ?? null;
      const cl = generateChecklist({ profile, program: prog, match: m, channel, scholarships: sch, now });
      expect(cl.steps.map((s) => s.id)).toEqual([...CHECKLIST_STEP_IDS]);
      if (now === "2100-01-01") {
        expect(cl.steps.find((s) => s.id === "translation")?.status).toBe("todo");
        expect(cl.steps.find((s) => s.id === "application_account")?.status).toBe("todo");
      }
    }
  });
});
```
The `node --import tsx` form needs verification: `MSYS_NO_PATHCONV=1 npx ctx7@latest library "tsx" "node --import tsx run TypeScript file"`. If it fails, use `node_modules/tsx/dist/cli.mjs`.
- [ ] **Step 3: Run it** with `pnpm test tests/domain/pipeline.test.ts`. The test should PASS on first run because T12–T18 already exist. Prove it can fail: temporarily reverse the `CHECKLIST_STEP_IDS` expectation, see it FAIL, then revert.
- [ ] **Step 4: Full verification (show output)**
```bash
pnpm typecheck; pnpm test; pnpm lint; pnpm data:check; pnpm build
```
Expected: all exit 0; `data:check` prints `0 records` on the empty `data/`; `build` ends with the route table.
- [ ] **Step 5: Docs**
  - `.claude/rules/matching-domain.md`, cost line: replace `{ min, max, currency, breakdown }` with "`CostEstimate`: 7 `CostLine`s (tuition…setup) each with its FactRef, per-currency `totals` ranges, `complete`, `budgetFit`". Also add to the same rules file: costs use a 10-month academic year (`ACADEMIC_YEAR_MONTHS`, exposed as `academicYearMonths`), and `filterPrograms` hides a program only on a definite preference mismatch (unknown/stale/non-official language data never hides).
  - `.claude/rules/matching-domain.md`, short-circuit line: append "(the result holds only the route reason; conditions, rules and coverage are not evaluated)".
  - `.claude/docs/architecture.md`: edit only if an accepted amendment changes behaviour it describes. As planned, nothing changes, so leave it untouched.
- [ ] **Step 6: Commit** with message `test: add snapshot-to-domain pipeline test; docs: align matching rule notes` and the trailer.

**M3 hand-off note.** The pages (client components on the cached snapshot) call:
- per candidate program: `matchProgram({profile, program, routes: routesShard(origin).routes, reference: core, now: today})`;
- then `estimateCost({program, costProfiles: costs(program.country).profiles, budget: profile.budget, now})`;
- then `scholarshipsForProgram(profile, program, scholarships(program.country).scholarships)` and `nextIntake(program, now)`;
- on the Plan page, `generateChecklist({…, channel: core.applicationChannels.find(slug === program.applicationChannel.value) ?? null})`.

Things M3 must add, none of which exist in M2:
- `now` from the one client clock boundary in `src/lib`;
- program filtering by `profile.destinations`, `fields`, `studyLanguages` and `institutionType` (no domain function yet; see Risk R5);
- TextKey → text lookup;
- the ✅⚠️❌ mapping and the reason-code copy.

---

## Risks / open questions (sensitive territory)
- **R1. Match-status semantics (trust).** Beyond Part A's flagged calls, Part C sets these:
  - (a) Short-circuit results contain only the route reason.
  - (b) `expected` status takes precedence over the downgrade, so an expected-credential reason shows `missing_student_value` even when a fact is stale. The stale FactRef is still listed.
  - (c) A decisive ❌ stands even if other facts are stale (per the contract's `aggregateMatchStatus`). This contradicts the brief's "stale anywhere ⇒ never ❌". My reading of ADR 0004 is "results depending on stale facts", and a decisive failing reason doesn't depend on them. Please confirm.
  - (d) `subject_taken` returns ⚠️ (not ✅) when the curriculum covers the subject but the student didn't list it.
  - (e) Any non-official rule, route or scale fact makes ✅ impossible.
- **R2. GDPR.** `Reason.student` / `studentConverted` embed grades and CEFR levels. MatchResults must never be logged, sent to Sentry or GoatCounter, or persisted server-side in the guest release. Recommend M3 test that Sentry `beforeSend` strips them. `console` is already banned in the domain.
- **R3. Cost presentation.** living costs use a 10-month academic year (decided 2026-09-29; `CostEstimate.academicYearMonths` exposes it). Housing is often paid for 12 months, so the UI must state the assumption next to the range. `budgetFit` is `unknown` for any multi-currency estimate. With MAD as the secondary display, that means no FX, which is intended.
- **R4. Scholarships** linked in `program.scholarships` bypass the nationality filter by contract, so an ineligible-nationality scholarship can be listed. Consider intersecting with the nationality filter.
- **R5.** No domain function filters programs by profile preferences (`studyLanguages` vs `teachingLanguages`, `institutionType`, `destinations`). M3 will need one; propose adding it to the contract before M3.
- **Unverified tool facts:**
  - `node --import tsx` invocation;
  - that `scripts/data/build.ts` runs as a CLI when executed directly;
  - the float cases in T13 (the 287 row's expected value 1.13 is right either way; only a missing guard could produce 1.12).

## Contract inconsistencies found
- **I1.** The reason-order rule (route, conditions, rules, coverage) conflicts with the short-circuit rule, and coverage handling on short-circuit is unspecified. Part C resolves it as route-only.
- **I2.** No `path` is defined for record-level provenance FactRefs (see A1).
- **I3.** The coverage Reason shape in §11 omits `facts`, but `Reason.facts` is required. Part C uses the requirements fact.
- **I4.** A non-decisive `requirements.fact` with `coverage: complete` could still yield ✅, even though "complete" is itself a stale/unofficial claim (see A2).
- **I5.** Reused codes lose meaning:
  - `track_not_accepted` covers credential-type rejection and curriculum failure;
  - `missing_student_value` covers missing values, `expected` status and a non-accepted certificate;
  - `threshold_unpublished` covers `certificateRequired: null`.
  UI copy must stay generic.
- **I6.** Precedence between the `expected` rule and the downgrade is unspecified. Part C applies `expected` first (R1b).
- **I7.** The route downgrade applies only to `direct` and `not_eligible`. `check`/`foundation` keep their own codes; that is consistent, but implicit.
- **I8.** Checklist `certificate_held` with zero language rules is vacuously true. Part C requires ≥1 rule. It also treats empty `acceptedTests` as not held, even though evaluateRules treats empty as "any certificate". This is a real asymmetry; please pick one.
- **I9.** Translation is skipped when the documents list is empty (vacuous `every`). This may be unintended.
- **I10.** `ChecklistInput.match` is unused. Language rules in route conditions are ignored by the checklist.
- **I11.** `submit` reason for `closed` is unspecified. Part C uses `applies` with `deadline: null`.
- **I12.** The brief's "stale anywhere ⇒ never ❌" conflicts with `aggregateMatchStatus` (see R1c).

## Contract amendments needed
- **A1.** §11: add "Record-level `fact` FactRefs use `path: ""` (records: `grading-scales/<slug>`, `grade-conversions/<slug>`, `credential-types/<slug>`, `admission-routes/<slug>`, `application-channels/<slug>`). Rule FactRef path = `<pathPrefix>.<ruleId>`; the coverage reason cites `programs/<slug>#requirements`."
- **A2.** §11 matchProgram: replace the coverage bullet with "If coverage is `partial`, append `{ruleId:'coverage', kind:'coverage', outcome:'unknown', code:'coverage_partial', facts:[requirementsRef]}`. Else, if `requirements.fact` is not decisive, append the same with code `stale_source`/`non_official_source`. Short-circuit results contain only the route reason."
- **A3.** §11 types: add `basis?: TextKey` to `FactRef`, copied from `FactMeta.basis`. Otherwise cost estimates cannot show their basis, which is a trust gap.
- **A4.** §11 normative semantics: add "The `expected`-status conversion is applied before the downgrade; the downgrade only affects outcomes still pass/fail."
- **A5.** §8 grade-conversion: refine linear `fromMin !== fromMax` and bavarian `nMax !== nMin`. §8 referential checks: `(from, to)` unique across conversions. Until then the domain returns `no_conversion` for degenerate params and uses the first match.
- **A6.** §11 Costs: "a line is present iff the key exists **and** its value is non-null; a null-valued city line falls through to the country line; a missing line reports the null-valued fact (city first) as `fact`/`scope` if one exists, else null."
- **A7.** §12 M1 → M2 hand-off: specify that `scripts/data/build.ts` is directly executable (`node --import tsx scripts/data/build.ts --data-dir … --out-dir …`). Also specify that `tests/fixtures/data/valid-minimal` contains at least one country pair XA→XB with a credential type (with ≥1 track), a grading scale, an application channel, an institution, a program, a direct admission route and a cost profile.
- **A8.** Resolve I8 (empty `acceptedTests` in the checklist) by choosing one of: "empty means any certificate" (matches evaluateRules) or "empty means not held". Part C currently uses "not held" and would switch to match evaluateRules if confirmed.

## Assumptions
- Part B implements §1–§10 exactly.
- The additive export `downgrade` in `src/domain/facts.ts` is acceptable, since Part C owns `src/domain`.
- Synthetic codes `XA`/`XB`/`XC` and currencies `XTS`/`XXX` are acceptable as obviously fake.

