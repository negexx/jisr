
# Jisr Foundation Plan, Part B: Milestone 1 (data platform), T6–T11

> Continues Part A (`docs/plans/2026-09-29-foundation-part-a-contract-m0.md`). The Global Constraints, plan-wide execution rules and the Shared type contract (sections 1–12) in Part A apply verbatim to every task below. Every implementer sees: their own task, Global Constraints, and the Shared type contract. The contract is normative. Where a task depends on a proposed amendment, it is tagged **[A#]** (see "Contract amendments needed" at the end). The main thread must apply accepted amendments to Part A **before** dispatching the task that uses them.

**Common to all M1 tasks**
- Branch `feat/foundation`, repo root `/c/Users/dagda/Downloads/nex/UniWay`, Git Bash.
- Before writing any Zod code, check the API: `MSYS_NO_PATHCONV=1 npx ctx7@latest library "Zod" "v4 strictObject record discriminatedUnion superRefine transform"`, then `MSYS_NO_PATHCONV=1 npx ctx7@latest docs <zodId> "<topic>"`. I checked these against zod.dev/v4/changelog on 2026-09-29, but they still need confirming with ctx7: `z.record` needs two arguments; `.refine`/`.superRefine` return the same schema type because there is no `ZodEffects` any more; `.transform` returns a `ZodPipe`; the generic is `z.ZodType<Output, Input>`; `z.ZodTypeAny` is gone, so use `z.ZodType`; issue `path` is `PropertyKey[]`; discriminated unions with invalid discriminators throw when the schema is created.
- For the `yaml` package: `MSYS_NO_PATHCONV=1 npx ctx7@latest library "yaml" "parseDocument uniqueKeys errors toJS core schema"`. I checked eemeli.org/yaml on 2026-09-29, but confirm these too: the default is YAML 1.2 with the `core` schema, so `2026-01-01` stays a **string** (timestamps need `customTags`) and `NO` stays a string; `uniqueKeys` defaults to true, and duplicate keys show up in `doc.errors` with code `DUPLICATE_KEY`; `prettyErrors` defaults to true and adds `linePos`.
- Fixtures: synthetic only, under `tests/fixtures/data/<scenario>/`, with slugs prefixed `xx-test-`. Country codes are the ISO user-assigned codes `XA`, `XB`, `XC`. Currency is `XTS` (the ISO 4217 test code). Language is `xx`. URLs use `https://example.org/…` (RFC 2606). `data/` holds only `README.md` and `.gitkeep`.
- Tests are table-driven (`it.each`). Temp dirs come from `mkdtempSync(join(tmpdir(), "jisr-"))` and are **not** deleted (`rm -rf` is denied; leave them in the OS temp dir).
- Done means `pnpm typecheck && pnpm test && pnpm lint` are all green, with the output shown in the report.
- Every commit ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Commits that add dependencies put a `Deps:` line directly before it. Use `git commit -F- <<'EOF' … EOF`.

---

### Task 6: Dependencies and the pure base modules (dates, staleness, primitives, localized-text, provenance)

**Files:**
- Modify: `package.json` (deps)
- Create: `src/data-schema/dates.ts`, `src/data-schema/staleness.ts`, `src/data-schema/primitives.ts`, `src/data-schema/localized-text.ts`, `src/data-schema/provenance.ts`
- Create: `tests/data-schema/dates.test.ts`, `tests/data-schema/staleness.test.ts`, `tests/data-schema/primitives.test.ts`, `tests/data-schema/provenance.test.ts`

**Interfaces:**
- Consumes: M0 (Vitest with the `@/` alias; the Biome override already covers `src/data-schema/dates.ts` and `staleness.ts`, which bans `Date`, `zod` and `node:*` there).
- Produces: contract sections 1–5, exactly as written.

- [ ] **Step 1: Install dependencies**
```bash
pnpm add zod
pnpm add -D tsx yaml
```
`yaml` is a dev dependency because it is only used by `scripts/data`, never at app runtime. If it is ever needed at runtime, move it to `dependencies`.

- [ ] **Step 2: Write the failing tests**

`tests/data-schema/dates.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import {
  addDays, compareIso, diffDays, formatIso, fromDayNumber, InvalidIsoDateError, isValidIsoDate, parseIso, toDayNumber,
} from "@/data-schema/dates";

describe("isValidIsoDate", () => {
  it.each([
    ["2024-02-29", true], ["2023-02-29", false], ["2000-02-29", true], ["1900-02-29", false],
    ["2026-12-31", true], ["2026-13-01", false], ["2026-00-10", false], ["2026-04-31", false],
    ["2026-4-01", false], ["26-04-01", false], ["2026-04-01T00:00:00Z", false], ["", false], [" 2026-04-01", false],
  ])("%s -> %s", (value, expected) => {
    expect(isValidIsoDate(value)).toBe(expected);
  });
});

describe("parseIso / formatIso", () => {
  it("round-trips a zero-padded date", () => {
    expect(parseIso("2026-03-07")).toEqual({ year: 2026, month: 3, day: 7 });
    expect(formatIso({ year: 2026, month: 3, day: 7 })).toBe("2026-03-07");
  });
  it.each(["2023-02-29", "nope"])("throws InvalidIsoDateError for %s", (v) => {
    expect(() => parseIso(v)).toThrow(InvalidIsoDateError);
  });
});

describe("day numbers", () => {
  it.each([
    ["1970-01-01", 0], ["1970-01-02", 1], ["1969-12-31", -1], ["2000-03-01", 11017], ["2024-02-29", 19782],
  ])("toDayNumber(%s) = %i and inverts", (iso, n) => {
    expect(toDayNumber(iso)).toBe(n);
    expect(fromDayNumber(n)).toBe(iso);
  });
});

describe("arithmetic", () => {
  it.each([
    ["2024-02-28", 1, "2024-02-29"], ["2023-02-28", 1, "2023-03-01"], ["2026-12-31", 1, "2027-01-01"],
    ["2026-01-01", -1, "2025-12-31"], ["2026-01-01", 0, "2026-01-01"],
  ])("addDays(%s, %i) = %s", (d, n, out) => {
    expect(addDays(d, n)).toBe(out);
  });
  it.each([
    ["2026-09-29", "2026-01-01", 271], ["2026-01-01", "2026-09-29", -271], ["2025-03-01", "2024-03-01", 365],
    ["2024-03-01", "2023-03-01", 366],
  ])("diffDays(%s, %s) = %i", (a, b, n) => {
    expect(diffDays(a, b)).toBe(n);
  });
  it.each([
    ["2026-01-01", "2026-01-02", -1], ["2026-01-02", "2026-01-01", 1], ["2026-01-01", "2026-01-01", 0],
  ] as const)("compareIso(%s, %s) = %i", (a, b, n) => {
    expect(compareIso(a, b)).toBe(n);
  });
});
```

`tests/data-schema/staleness.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { addDays } from "@/data-schema/dates";
import { freshnessOf, STALENESS } from "@/data-schema/staleness";

const NOW = "2026-09-29";
const ago = (days: number) => addDays(NOW, -days);

describe("STALENESS constants (ADR 0004)", () => {
  it("matches the ADR thresholds", () => {
    expect(STALENESS).toEqual({ volatile: { agingDays: 120, staleDays: 270 }, stable: { agingDays: 270, staleDays: 545 } });
  });
});

describe("freshnessOf", () => {
  it.each([
    ["volatile", 0, "fresh"], ["volatile", 119, "fresh"], ["volatile", 120, "aging"], ["volatile", 269, "aging"],
    ["volatile", 270, "stale"], ["stable", 269, "fresh"], ["stable", 270, "aging"], ["stable", 544, "aging"],
    ["stable", 545, "stale"], ["stable", 5000, "stale"],
    ["volatile", -1, "fresh"], ["stable", -400, "fresh"],
  ] as const)("%s fact verified %i days ago is %s", (cls, days, expected) => {
    expect(freshnessOf(cls, ago(days), NOW)).toBe(expected);
  });
});
```

`tests/data-schema/primitives.test.ts`: one table per schema, each row a `[input, ok]` pair checked with `safeParse(...).success`:
- `IsoDateSchema`: `"2024-02-29"` ok; `"2023-02-29"` fails; the number `20240229` fails.
- `SlugSchema`: `xx-test-a` ok; `Xx`, `a--b`, `-a`, `a_b`, `a-` all fail.
- `SourceKeySchema`: `main`, `fees_2026`, `a-b` ok; `Main`, `_a` fail.
- `CountryCodeSchema`: `XA` ok; `xa` and `XAA` fail.
- `LanguageCodeSchema`: `xx` ok; `XX` fails.
- `CurrencySchema`: `XTS` ok; `xts` fails.
- `HttpsUrlSchema`: `https://example.org/a` ok; `http://example.org` fails; `example.org` fails.
- `CefrSchema`: `B2` ok; `B3` fails.
- `MoneyRangeSchema`: `{min:1,max:2,currency:"XTS"}` ok; `min>max` fails; `min:1.5` fails; `min:-1` fails; an extra key fails.
- `LocalizedTextSchema` (in the same file): fr-only ok; en-only fails (fr is required); an empty `text` fails; whitespace-only text fails; text of 401 characters fails; `status:"final"` fails; an extra locale `de` fails.

`tests/data-schema/provenance.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { SourcesSchema, stableFact, volatileFact } from "@/data-schema/provenance";

const FR = { fr: { text: "Base fictive", status: "draft" } };
const num = volatileFact(z.number());
const stableNum = stableFact(z.number());

describe("fact factories", () => {
  it.each([
    ["official with value", { value: 1, source: "main", info_kind: "official" }, true],
    ["explicit null value", { value: null, source: "main", info_kind: "official" }, true],
    ["missing value key", { source: "main", info_kind: "official" }, false],
    ["estimate without basis", { value: 1, source: "main", info_kind: "estimate" }, false],
    ["estimate with basis", { value: 1, source: "main", info_kind: "estimate", basis: FR }, true],
    ["guidance with basis (allowed)", { value: 1, source: "main", info_kind: "guidance", basis: FR }, true],
    ["class written in YAML", { value: 1, source: "main", info_kind: "official", class: "stable" }, false],
    ["unknown key", { value: 1, source: "main", info_kind: "official", url: "x" }, false],
    ["bad inner value", { value: "1", source: "main", info_kind: "official" }, false],
    ["bad info_kind", { value: 1, source: "main", info_kind: "rumour" }, false],
    ["missing source", { value: 1, info_kind: "official" }, false],
  ])("%s", (_l, input, ok) => {
    expect(num.safeParse(input).success).toBe(ok);
  });

  it.each([
    [num, "volatile"], [stableNum, "stable"],
  ] as const)("injects the staleness class", (schema, cls) => {
    expect(schema.parse({ value: 1, source: "main", info_kind: "official" })).toEqual({
      value: 1, source: "main", info_kind: "official", class: cls,
    });
  });
});

describe("SourcesSchema", () => {
  it.each([
    [{ main: { url: "https://example.org/a", last_verified_at: "2026-09-01" } }, true],
    [{}, false],
    [{ Main: { url: "https://example.org/a", last_verified_at: "2026-09-01" } }, false],
    [{ main: { url: "http://example.org/a", last_verified_at: "2026-09-01" } }, false],
    [{ main: { url: "https://example.org/a", last_verified_at: "2026-02-30" } }, false],
    [{ main: { url: "https://example.org/a" } }, false],
  ])("%j -> %s", (input, ok) => {
    expect(SourcesSchema.safeParse(input).success).toBe(ok);
  });
});
```
Run `pnpm test`. Expected: FAIL, because the `@/data-schema/*` modules cannot be resolved.

- [ ] **Step 3: Implement the modules to contract sections 1–5**
- **`dates.ts`**: no imports and no `Date`.
  - `isValidIsoDate`: apply the regex, then check the month is 1–12 and the day is 1–daysInMonth (leap years: divisible by 4 and not by 100, or divisible by 400).
  - `toDayNumber` / `fromDayNumber`: Hinnant's `days_from_civil` / `civil_from_days`, using `Math.floor` for the divisions of negative eras.
  - `fromDayNumber` throws `InvalidIsoDateError` on non-integer input.
  - `compareIso` compares day numbers.
- **`staleness.ts`**: exactly as in contract section 2.
- **`primitives.ts`**, **`localized-text.ts`**: verbatim from the contract.
- **`provenance.ts`**: implement one private `makeFact(inner, cls)` used by both factories.
  - The `superRefine` adds `{ code: "custom", path: ["basis"], message: "basis is required when info_kind is estimate" }` when the fact is an estimate with no basis.
  - The transform returns `{ ...f, class: cls }`.
  - If TypeScript cannot reduce `z.output<ZodNullable<T>>` inside the generic, one `as RawFact<z.output<T>>` in the transform is acceptable. Do not use `any`, `@ts-ignore` or `!`.
  - Export `RecordProvenanceShape` as in the contract.

- [ ] **Step 4:** Run `pnpm test`. Expected: all four new files PASS. Then run `pnpm typecheck && pnpm lint`. Biome must not flag `dates.ts` or `staleness.ts`.

- [ ] **Step 5: Commit**
```bash
git add -A
git commit -F- <<'EOF'
feat: add data-schema base modules (dates, staleness, provenance)

Deps: zod validates every data file (ADR 0002); tsx runs scripts/data TypeScript without a build step; yaml parses data/ YAML 1.2 (dev-only, scripts).

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 7: Rules and profile schemas

**Files:**
- Create: `src/data-schema/rules.ts`, `src/data-schema/profile.ts`, `tests/data-schema/rules.test.ts`, `tests/data-schema/profile.test.ts`

**Interfaces:**
- Consumes: T6 (`primitives`, `localized-text`).
- Produces: contract sections 6–7, verbatim (`RuleSchema`, `RequirementsSchema`, `RuleRecord`, `RuleKind`, `RequirementsRecord`, `Coverage`, `PROFILE_SCHEMA_VERSION`, `GradeValueSchema`, `BudgetSchema`, `ProfileSchema`, `GradeValue`, `Budget`, `Profile`).

- [ ] **Step 1: Write the failing tests.** `tests/data-schema/rules.test.ts` starts with `const base = { source: "main", info_kind: "official" } as const;` and one valid object per kind:
```ts
const VALID = {
  credential_type_in: { ...base, id: "r1", kind: "credential_type_in", types: ["xx-test-cred"] },
  credential_track_in: { ...base, id: "r1", kind: "credential_track_in", tracks: ["xx-test-track"] },
  overall_grade_min: { ...base, id: "r1", kind: "overall_grade_min", scale: "xx-test-scale", threshold: 12 },
  subject_grade_min: { ...base, id: "r1", kind: "subject_grade_min", subject: "xx-test-subj", scale: "xx-test-scale", threshold: null },
  subject_taken: { ...base, id: "r1", kind: "subject_taken", subjects: ["xx-test-subj"], mode: "any" },
  language_proficiency: { ...base, id: "r1", kind: "language_proficiency", language: "xx", minCefr: "B2", certificateRequired: null, acceptedTests: [] },
  prior_study_years_min: { ...base, id: "r1", kind: "prior_study_years_min", years: 1 },
  manual_check: { ...base, id: "r1", kind: "manual_check", note: { fr: { text: "Vérifier", status: "draft" } } },
} as const;
```
Tables:
- (a) Every entry in `VALID` parses.
- (b) Each of these invalid variants fails:
  - `overall_grade_min` without the `threshold` key (the key is required even though null is allowed);
  - `language_proficiency` without `minCefr`;
  - `language_proficiency` without `certificateRequired`;
  - `credential_type_in` with `types: []`;
  - `subject_taken` with `mode: "some"`;
  - `prior_study_years_min` with `years: 0` or `1.5`;
  - an unknown `kind`;
  - an extra key;
  - `id: "R1"`;
  - a missing `source`.
- (c) `RequirementsSchema` accepts `{coverage:"complete", ...base, rules:[]}`, rejects duplicate rule ids (message `rule ids must be unique`), and rejects `coverage:"full"`.

`tests/data-schema/profile.test.ts` uses a valid synthetic profile:
```ts
const PROFILE = {
  schemaVersion: 1, nationality: "XA",
  credential: { country: "XA", type: "xx-test-cred", track: "xx-test-track", status: "obtained",
    overall: { scale: "xx-test-scale", value: 14 }, subjects: [{ subject: "xx-test-subj", grade: { scale: "xx-test-scale", value: 15 } }] },
  priorHigherEducationYears: 0, languages: [{ language: "xx", level: "B2", certificate: null }],
  fields: ["xx-test-field"], studyLanguages: ["xx"], destinations: [], budget: null, institutionType: "any",
};
```
Table of `[label, mutate(p), ok]` rows; each row builds `structuredClone(PROFILE)`, applies `mutate`, and checks `safeParse`:
- The base profile passes.
- `schemaVersion: 2` fails.
- `fields: []` fails.
- `priorHigherEducationYears: 4` fails; `-1` fails.
- Duplicate subjects fail.
- Duplicate languages fail.
- Level `"unknown"` passes.
- `overall: null` passes.
- `budget: {amountMinor: 1.5, …}` fails.
- `budget` with `period: "week"` fails.
- An extra key fails.
- `nationality: "xa"` fails.

Run `pnpm test`. Expected: FAIL (the modules are missing).

- [ ] **Step 2: Implement** both modules verbatim from the contract. The profile `superRefine` adds a custom issue at `["credential","subjects",i,"subject"]` or `["languages",i,"language"]` for the second occurrence of a duplicate.

- [ ] **Step 3:** Run `pnpm test`, `pnpm typecheck` and `pnpm lint`. Expected: PASS.

- [ ] **Step 4: Commit**
```bash
git add -A && git commit -F- <<'EOF'
feat: add requirement rule and student profile schemas

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 8: Record schemas and the collection registry

> **Additional requirements (from Part C review, contract §8):** in `grade-conversion.ts` add schema refines `linear`: `fromMin !== fromMax` and `modified_bavarian`: `nMax !== nMin` (with a failing-then-passing test row each). In T10's referential checks (`validate.ts`) add: `(from, to)` pairs unique across `grade-conversions` (with a fixture + test). The domain (Part C) returns `no_conversion` on degenerate params, but data must not contain them.

**Files:**
- Create: `src/data-schema/records/{country,field,subject,language-certificate,grading-scale,grade-conversion,credential-type,application-channel,admission-route,institution,program,cost-profile,scholarship,collections}.ts`
- Create: `tests/data-schema/records.test.ts`, `tests/data-schema/collections.test.ts`

**Interfaces:**
- Consumes: T6 and T7.
- Produces:
  - contract section 8, verbatim: every `XxxRecordSchema` / `XxxRecord`, plus `GradeConversionMethodSchema`, `GradeConversionMethod`, `TuitionSchema`, `IntakeSchema`, `DocumentSchema`, `Tuition`, `Intake`, `LIVING_COST_CATEGORIES`, `CostAmountSchema`, `LivingCostCategory`, `CostAmount`, `SUPPORT_COVERS`, `ScholarshipSupportSchema`, `ScholarshipSupport`;
  - `records/collections.ts`:
```ts
export const COLLECTIONS = {
  countries: { schema: CountryRecordSchema, idKey: "code" },
  fields: { schema: FieldRecordSchema, idKey: "slug" },
  subjects: { schema: SubjectRecordSchema, idKey: "slug" },
  "language-certificates": { schema: LanguageCertificateRecordSchema, idKey: "slug" },
  "grading-scales": { schema: GradingScaleRecordSchema, idKey: "slug" },
  "grade-conversions": { schema: GradeConversionRecordSchema, idKey: "slug" },
  "credential-types": { schema: CredentialTypeRecordSchema, idKey: "slug" },
  "application-channels": { schema: ApplicationChannelRecordSchema, idKey: "slug" },
  "admission-routes": { schema: AdmissionRouteRecordSchema, idKey: "slug" },
  institutions: { schema: InstitutionRecordSchema, idKey: "slug" },
  programs: { schema: ProgramRecordSchema, idKey: "slug" },
  "cost-profiles": { schema: CostProfileRecordSchema, idKey: "slug" },
  scholarships: { schema: ScholarshipRecordSchema, idKey: "slug" },
} as const;
export type CollectionName = keyof typeof COLLECTIONS;
export type RecordOf<C extends CollectionName> = z.output<(typeof COLLECTIONS)[C]["schema"]>;
export const COLLECTION_NAMES = Object.keys(COLLECTIONS) as CollectionName[];
export function isCollectionName(value: string): value is CollectionName;
```

Notes:
- Records with record-level provenance spread `...RecordProvenanceShape` and add `sources: SourcesSchema`.
- `admission-route.ts` `conditions` is `z.array(RuleSchema).default([])` (so its output is always an array).
- `grading-scale.ts` refines: `min < max` (message `min must be < max`) and `min <= pass <= max`.
- Credential-type tracks: `z.strictObject({ slug, name: z.string().min(1), gloss: LocalizedTextSchema.optional(), subjects: z.array(SlugSchema).nullable() })`, with `.min(1)` on the array. **[A4]** adds a refine for unique track slugs (`track slugs must be unique`).
- **[A5]** adds a refine on the program and scholarship `documents` value for unique document slugs.
- `cost-profile.ts` `lines` is `z.strictObject({ housing: stableFact(CostAmountSchema).optional(), … })` for the six categories.
- Official names (`name: string`) are never `LocalizedText`.

- [ ] **Step 1: Write the failing tests.** `tests/data-schema/records.test.ts` defines inline synthetic builders. Each one returns a minimal valid object:
```ts
const SRC = { main: { url: "https://example.org/x", last_verified_at: "2026-09-01" } };
const T = (text: string) => ({ fr: { text, status: "draft" as const } });
const F = <V>(value: V) => ({ value, source: "main", info_kind: "official" as const });
```
Write one builder per collection (for example `program()` returns a full program with every fact through `F(...)`, `requirements: { coverage: "partial", source: "main", info_kind: "official", rules: [] }`, `scholarships: []`, `sources: SRC`).

Table 1 is `[collection, builder]` for all 13 collections, asserting `COLLECTIONS[c].schema.safeParse(builder()).success === true`.

Table 2 is `[label, collection, mutate]` rows that must all fail:
- grading scale `min: 20, max: 0`; `pass` outside the range;
- conversion `method: "linear"` with `params: {}`; unknown method `"magic"`; `modified_bavarian` with `truncateDecimals: -1`;
- credential type `tracks: []`; track name as `LocalizedText`;
- channel `kind: "email"`; channel missing `accountRequired` (the key is required, `null` is allowed);
- route `level: "master"`; route `outcome: "maybe"`;
- institution `type: "mixed"`;
- program `tuition.value.period: "month"`; program missing `tuition` (the key is required); program `durationYears.value: 0`; program `teachingLanguages.value: []`; program `intakes.value[0].startDate: "2027-02-30"`;
- cost line `per: "week"`; cost line `min > max`; cost line estimate without `basis`; cost `lines.rent` (unknown category);
- scholarship `destinations: []`; `support.value.amount.per: "decade"`; `covers: ["food"]`;
- any record with an extra key;
- any provenance record missing `sources`;
- a country with `code: "xa"`.

Table 3 checks outputs:
- route without `conditions` parses to `conditions: []`;
- a program fact parses with `class` (`tuition.class === "volatile"`, `durationYears.class === "stable"`);
- a cost line has `class` `stable`;
- scholarship `deadline.class` is `volatile`.

`tests/data-schema/collections.test.ts`:
- `COLLECTION_NAMES` equals the 13 names in the contract order.
- `idKey` is `"code"` only for `countries`.
- `isCollectionName("programs")` is true; `isCollectionName("program")` is false.

- [ ] **Step 2:** Run `pnpm test`. Expected: FAIL.
- [ ] **Step 3:** Implement the files. Each file imports its siblings relatively (`../primitives`).
- [ ] **Step 4:** Run `pnpm test && pnpm typecheck && pnpm lint`. Expected: PASS.
- [ ] **Step 5: Commit** with message `feat: add reference record schemas and collection registry` and the trailer.

---

### Task 9: Resolved types, snapshot contract and locale parity

**Files:**
- Create: `src/data-schema/resolved.ts`, `src/data-schema/snapshot.ts`, `tests/data-schema/snapshot.test.ts`

**Interfaces:**
- Consumes: T6–T8.
- Produces: contract section 9, verbatim, types only. With **[A1]** applied, `Cefr` is added to the primitives type import. It also produces contract section 10, verbatim (`SNAPSHOT_FORMAT_VERSION`, `SHARD_GZIP_BUDGET_BYTES`, `shardNames`, all shard types, `ManifestShardSchema`, `ManifestSchema`, `Manifest`). `snapshot.ts` uses `import type` for the resolved types.

- [ ] **Step 1: Write the failing tests** in `tests/data-schema/snapshot.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { LOCALES } from "@/data-schema/primitives";
import { ManifestSchema, SHARD_GZIP_BUDGET_BYTES, shardNames } from "@/data-schema/snapshot";
import { routing } from "@/i18n/routing";

describe("locale parity", () => {
  it("LOCALES equals the next-intl routing locales", () => {
    expect([...LOCALES]).toEqual([...routing.locales]);
  });
});

describe("shardNames", () => {
  it.each([
    [shardNames.core(), "core"], [shardNames.routes("XA"), "routes.XA"],
    [shardNames.institutions("XB"), "institutions.XB"], [shardNames.costs("XB"), "costs.XB"],
    [shardNames.programs("XB", "xx-test-field"), "programs.XB.xx-test-field"],
    [shardNames.scholarships("XB"), "scholarships.XB"], [shardNames.text("ar", "core"), "text.ar.core"],
  ])("%s", (actual, expected) => {
    expect(actual).toBe(expected);
  });
});

const SHARD = { file: "s/core.0123456789ab.json", sha256: "a".repeat(64), bytes: 10, gzipBytes: 8 };
const MANIFEST = { formatVersion: 1, snapshotVersion: "0123456789ab", generatedAt: "2026-09-29T10:00:00.000Z",
  locales: ["fr", "en", "ar"], shards: { core: SHARD } };

describe("ManifestSchema", () => {
  it.each([
    ["valid", MANIFEST, true],
    ["formatVersion 2", { ...MANIFEST, formatVersion: 2 }, false],
    ["short snapshotVersion", { ...MANIFEST, snapshotVersion: "abc" }, false],
    ["no locales", { ...MANIFEST, locales: [] }, false],
    ["bad file name", { ...MANIFEST, shards: { core: { ...SHARD, file: "core.json" } } }, false],
    ["uppercase hash", { ...MANIFEST, shards: { core: { ...SHARD, sha256: "A".repeat(64) } } }, false],
    ["zero bytes", { ...MANIFEST, shards: { core: { ...SHARD, bytes: 0 } } }, false],
    ["extra key", { ...MANIFEST, extra: 1 }, false],
  ])("%s", (_l, input, ok) => {
    expect(ManifestSchema.safeParse(input).success).toBe(ok);
  });
  it("budget is 300 KiB", () => {
    expect(SHARD_GZIP_BUDGET_BYTES).toBe(307200);
  });
});
```
Also add a compile-only check at the bottom of the same file. It is a function that is never called, and it assigns a hand-written `Program` literal with every field to `const p: Program = …`. This makes `pnpm typecheck` catch drift between `resolved.ts` and the contract.

- [ ] **Step 2:** Run `pnpm test`. Expected: FAIL.
- [ ] **Step 3:** Implement both files.
- [ ] **Step 4:** Run `pnpm test && pnpm typecheck && pnpm lint`. Expected: PASS.
- [ ] **Step 5: Commit** with message `feat: add resolved snapshot types and manifest schema` and the trailer.

---

### Task 10: `pnpm data:check` (load, validate, report)

**Files:**
- Create: `scripts/data/cli-args.ts`, `scripts/data/load-data.ts`, `scripts/data/validate.ts`, `scripts/data/report.ts`, `scripts/data/check.ts`
- Create: `tests/scripts/data/cli-args.test.ts`, `tests/scripts/data/load-data.test.ts`, `tests/scripts/data/validate.test.ts`, `tests/scripts/data/check.test.ts`
- Create fixtures: `tests/fixtures/data/{valid-minimal,invalid-missing-source,invalid-bad-reference,invalid-structure,stale,missing-translation,empty}/…`
- Create: `data/README.md`, `data/.gitkeep`
- Modify: `package.json` (add the `data:check` script)

**Interfaces:**
- Consumes: T6–T9 (`COLLECTIONS`, `RecordOf`, `freshnessOf`, `compareIso`, `LOCALES`).
- Produces (T11 relies on these):
```ts
// cli-args.ts
export type DataCliArgs = { dataDir: string; outDir: string; strict: boolean; now: IsoDate | null };
export class CliUsageError extends Error {}
export function parseDataCliArgs(argv: readonly string[]): DataCliArgs;
// flags: --data-dir <p> (default "data"), --out-dir <p> (default "public/snapshots"), --strict, --now <YYYY-MM-DD> [A2]
// unknown flag / missing value / invalid --now → CliUsageError

// load-data.ts
export type LoadedFile = { file: string /* posix, relative to dataDir */; collection: CollectionName; id: string; raw: unknown };
export type Issue = { file: string; path: string /* dotted, "" for whole file */; message: string };
export type LoadResult = { files: LoadedFile[]; errors: Issue[] };
export function loadData(dataDir: string): LoadResult;  // files sorted by `file`

// validate.ts
export type Entry<C extends CollectionName> = { file: string; record: RecordOf<C> };
export type Catalog = { [C in CollectionName]: Map<string, Entry<C>> };
export type FactUse = { file: string; path: string; sourceKey: string; class: StalenessClass };
export type FreshnessRow = FactUse & { lastVerifiedAt: IsoDate; ageDays: number; freshness: Freshness };
export type TranslationCoverage = Record<Locale, { present: number; reviewed: number; total: number }>;
export type ValidationResult = { recordCount: number; catalog: Catalog; errors: Issue[]; warnings: Issue[];
  freshness: FreshnessRow[]; translations: TranslationCoverage };
export function validateData(loaded: LoadResult, opts: { now: IsoDate }): ValidationResult;
export function factUses(collection: CollectionName, record: RecordOf<CollectionName>, file: string): FactUse[];
export function localizedTexts(collection: CollectionName, record: RecordOf<CollectionName>): LocalizedText[];

// report.ts
export function formatReport(result: ValidationResult, opts: { strict: boolean }): { stdout: string[]; stderr: string[]; exitCode: 0 | 1 };

// check.ts
export function runCheck(args: DataCliArgs): { stdout: string[]; stderr: string[]; exitCode: 0 | 1 };
// CLI entry: parse argv; on CliUsageError print "data:check: <message>" to stderr and exit 2;
// now = args.now ?? today's UTC date (Date is fine in scripts/, not in domain).
```

**Loader rules (`load-data.ts`):**
- Walk `dataDir` recursively.
- Ignore `README.md`, `.gitkeep` and dotfiles.
- `*.yml` gives the error `use the .yaml extension`.
- Any other non-`.yaml` file gives the error `unexpected file`.
- A `.yaml` file directly under `dataDir` gives the error `records must live in a collection folder`.
- An unknown first segment gives the error `unknown collection "<seg>"`.
- Parse with `parseDocument(text, { version: "1.2", schema: "core", uniqueKeys: true, prettyErrors: true })`. Each entry in `doc.errors` gives `yaml: <message>`. Otherwise `raw = doc.toJS()`.
- A missing `dataDir` gives `{files:[], errors:[]}` when it is the default `data`; for any other path it gives the error `data dir not found`.

**Validation rules (`validate.ts`)**, in this order, each producing an `Issue` whose file is relative to `dataDir`:
1. **Schema.**
   - `COLLECTIONS[c].schema.safeParse(raw)`. Each Zod issue becomes an `Issue` with `path: issue.path.join(".")`.
   - The id (`record[idKey]`) must equal the filename; otherwise the error is `id "<id>" must equal the file name "<basename>"`.
   - A duplicate id within a collection gives the error `duplicate id "<id>" (also in <otherFile>)`.
   - Only records that pass all of these enter the `Catalog`.
2. **Provenance** (catalog records only; vocabulary collections are skipped).
   - `factUses` lists every `source` usage **explicitly per collection**, with no structural walk:
     - record-level `source` (path `""`, class stable);
     - each fact (for example path `tuition`, class taken from the fact);
     - `requirements` (path `requirements`, stable);
     - each rule (path `requirements.rules.<id>`, stable);
     - route conditions (`conditions.<id>`, stable);
     - cost lines (`lines.<cat>`).
   - A key that is not in `sources` gives the error `<path>: unknown source key "<k>"`.
   - A key in `sources` that is never used gives the warning `source "<k>" is never used`.
   - A `sources.<k>.last_verified_at` later than `now` gives the error `sources.<k>.last_verified_at <d> is in the future`.
3. **Coverage warnings.** When `requirements.coverage === "complete"`:
   - zero rules gives the warning `requirements: coverage is complete but there are no rules`;
   - any `manual_check` rule gives the warning `requirements: coverage is complete but rule "<id>" is manual_check`.
4. **Referential checks.** The message format is `<path>: unknown <collection> "<slug>"`.
   - Contract section 8:
     - program `institution`, `field`, `applicationChannel.value` (when non-null), `scholarships[]`;
     - program `country`/`city` must equal the institution's `country`/`city.slug` (`program country/city must match institution <slug>`);
     - route `credentialType` and `applicationChannels[]`;
     - rule `scale` (both grade kinds), `subject`, `subjects[]`, `acceptedTests[]` (language-certificates), and `tracks[]` (the union of all credential-type track slugs, `unknown track`), in program and scholarship requirements and in route conditions;
     - conversion `from` and `to`;
     - a duplicate `(origin, credentialType, destination, level)` route gives the error `duplicate admission route (also <file>)`;
     - a duplicate cost profile `(country, city)` gives the error `duplicate cost profile for <country>/<city|country-wide> (also <file>)`.
   - **[A3]** additions:
     - credential-type `gradingScale`, and track `subjects[]` when non-null;
     - rule `types[]` must be credential-types;
     - country codes must exist in `countries` for: route `origin`/`destination`, the `country` of institution, program, channel, credential type and cost profile, grading-scale `country` (when non-null), and scholarship `destinations[]`/`eligibleNationalities[]`;
     - scholarship `fields[]` must be fields.
5. **Reports.**
   - `freshness`: one row per `FactUse` (using `freshnessOf` against `now`), sorted by file then path.
   - `translations`: over `localizedTexts` (every `LocalizedText` in the record, listed explicitly per collection, including `basis`, rule notes, document names, track glosses and route notes).
     - `total` is the number of texts.
     - For `fr`, `present` = `total`.
     - For each locale, `reviewed` counts entries whose status is `reviewed`.

**Output format (`report.ts`).** Lines appear in this order:
- stderr: one `ERROR <file>: <path>: <message>` per error (`ERROR <file>: <message>` when `path` is empty), sorted by file.
- stdout:
  - `WARN <file>: <message>` per warning;
  - `STALE <file>: <path|(record)> last verified <date>, <age> days ago (<class>)` per stale row;
  - `AGING <file>: …` in the same shape;
  - `freshness: <f> fresh, <a> aging, <s> stale`;
  - `translations: fr <p>/<t> (<r> reviewed), en <p>/<t> (<r> reviewed), ar <p>/<t> (<r> reviewed)`;
  - `data:check: <N> records, <E> errors, <W> warnings`;
  - finally `data:check: OK` or `data:check: FAILED` (with ` (--strict: <s> stale)` appended when stale rows cause the failure).
- Exit code 1 when `E > 0`, or when `strict` is set and `s > 0`; otherwise 0.
- `<N>` counts catalog records plus files that failed validation. It is 0 for an empty dir, so the line is `data:check: 0 records, 0 errors, 0 warnings`.

- [ ] **Step 1: Fixtures.** Write these YAML files. Dates stay unquoted on purpose, to prove the YAML 1.2 behaviour. `S` below stands for `sources: { main: { url: https://example.org/xx-test, last_verified_at: 2026-09-01 } }`.

`valid-minimal/` (16 files; it must produce 0 errors and 0 warnings at `now=2026-09-29`):
- `countries/XA.yaml`, `XB.yaml`, `XC.yaml`: `code`, `name` (`XA` fr+en; `XB` fr+en+ar all `reviewed`; `XC` fr only), `currency: XTS`.
- `fields/xx-test-field.yaml`, `subjects/xx-test-subject-math.yaml`: `slug`, `name.fr`.
- `language-certificates/xx-test-cert.yaml`: `slug`, `name: XX Test Certificate`, `language: xx`, `url: https://example.org/cert`.
- `grading-scales/xx-test-scale-20.yaml`: `country: XA`, `min 0`, `max 20`, `pass 10`, `higher_better`, `source: main`, `info_kind: official`, `S`.
- `grading-scales/xx-test-scale-5.yaml`: `country: XB`, `min 1`, `max 5`, `pass 4`, `lower_better`, `source: main`, `info_kind: official`, `S`.
- `grade-conversions/xx-test-conv-20-to-5.yaml`: `from: xx-test-scale-20`, `to: xx-test-scale-5`, `conversion: { method: modified_bavarian, params: { nMax: 20, nMin: 10, truncateDecimals: 1 } }`, `source: main`, `info_kind: official`, `S`.
- `credential-types/xx-test-cred.yaml`: `country: XA`, `name: XX Test Credential`, `gloss.fr`, `gradingScale: xx-test-scale-20`, `tracks: [{ slug: xx-test-track, name: XX Test Track, gloss: {fr}, subjects: [xx-test-subject-math] }]`, `source: main`, `info_kind: official`, `S`.
- `application-channels/xx-test-channel.yaml`: `country: XB`, `kind: national_portal`, `url: https://example.org/portal`, `accountRequired: true`, `summary.fr`, `source: main`, `info_kind: official`, `S`.
- `admission-routes/xx-test-route-xa-xb.yaml`: `origin XA`, `credentialType xx-test-cred`, `destination XB`, `level bachelor`, `outcome direct`, `conditions: [{ id: xx-test-cond-track, kind: credential_track_in, source: main, info_kind: official, tracks: [xx-test-track] }]`, `note.fr`, `applicationChannels: [xx-test-channel]`, `source: main`, `info_kind: official`, `S`.
- `institutions/xx-test-inst.yaml`: `country XB`, `city { slug: xx-test-city, name: XX Test City }`, `type public`, `website https://example.org/inst`, `source: main`, `info_kind: official`, `S`.
- `programs/xx-test-prog.yaml`: `institution xx-test-inst`, `country XB`, `city xx-test-city`, `field xx-test-field`, `level bachelor`, `name XX Test Programme`, `summary` (fr + ar draft), `officialUrl`. Every fact uses `source: main` or `fees`:
  - `durationYears 3`;
  - `teachingLanguages [xx]`;
  - `tuition { amountMinor: 100000, currency: XTS, period: year }` (source `fees`);
  - `intakes [{ startDate: 2027-09-01, applicationOpens: 2026-11-01, applicationDeadline: 2027-01-15 }]`;
  - `applicationChannel xx-test-channel`;
  - `documents [{ slug: xx-test-doc, name.fr, translationRequired: null }]`;
  - `requirements { coverage: partial, source: main, info_kind: official, rules: [...] }`, with these rules in this order:
    - `overall_grade_min` on `xx-test-scale-5`, `threshold: null`;
    - `subject_taken [xx-test-subject-math]`, `mode all`;
    - `language_proficiency xx`, `B2`, `certificateRequired: true`, `acceptedTests [xx-test-cert]`;
    - `manual_check` with `note.fr`;
  - `scholarships [xx-test-schol]`;
  - `sources` with keys `main` and `fees`, both `2026-09-01`.
- `cost-profiles/xx-test-costs-xb.yaml`: `country XB`, `city: null`, `lines.housing { value {min 40000, max 70000, XTS, per month}, source main, info_kind estimate, basis.fr }`, `lines.application_visa { value {min 10000, max 10000, XTS, per once}, source main, info_kind official }`, `S`.
- `scholarships/xx-test-schol.yaml`: `name`, `provider`, `destinations [XB, XC]`, `eligibleNationalities [XA]`, `fields []`, `level bachelor`, `summary.fr`, `support { value { amount {min 50000, max 80000, XTS, per month}, covers [living] } }`, `deadline 2027-03-01`, `requirements { coverage complete, rules: [{ id: xx-test-rule-cred, kind: credential_type_in, types: [xx-test-cred] }] }`, `documents { value: [] }`, `howToApply.fr`, `officialUrl`, `S`.

Error scenarios:
- `invalid-missing-source/grading-scales/xx-test-scale-a.yaml` is valid but has `source: nope`.
- `invalid-missing-source/grading-scales/xx-test-scale-b.yaml` has no `info_kind` and no `sources`.
- `invalid-bad-reference/`: `grading-scales/xx-test-scale-a.yaml` (valid, `country: null`) and `grade-conversions/xx-test-conv.yaml` with `from: xx-test-scale-nope`, `to: xx-test-scale-a`, method `identity`.
- `invalid-structure/`:
  - `stray.yaml`;
  - `unknown-things/xx-test-a.yaml`;
  - `fields/xx-test-bad.yml`;
  - `fields/a/xx-test-dup.yaml` and `fields/b/xx-test-dup.yaml` (both valid, same slug);
  - `fields/xx-test-renamed.yaml` with `slug: xx-test-other`;
  - `subjects/xx-test-broken.yaml` containing a duplicate `slug:` key.
- `stale/grading-scales/xx-test-scale-old.yaml` is verified `2020-01-01`; `stale/grading-scales/xx-test-scale-aging.yaml` is verified `2026-01-01` (271 days before 2026-09-29, so it is aging).
- `missing-translation/`: `fields/xx-test-field-a.yaml` (fr `reviewed` only) and `subjects/xx-test-subject-b.yaml` (fr `reviewed` + en `draft`).
- `empty/.gitkeep`.

- [ ] **Step 2: Write the failing tests** (the fixture root is `path.join(process.cwd(), "tests/fixtures/data")`).
- **`cli-args.test.ts`**:
  - Defaults are `{dataDir:"data", outDir:"public/snapshots", strict:false, now:null}`.
  - Each flag parses.
  - Each of these throws `CliUsageError`: `--bogus`, `--data-dir` with no value, `--now 2026-02-30`.
- **`load-data.test.ts`**:
  - `invalid-structure` produces exactly these errors, matched with `toContainEqual(expect.objectContaining({file, message: expect.stringContaining(...)}))`:
    - `stray.yaml` → `collection folder`;
    - `unknown-things/xx-test-a.yaml` → `unknown collection`;
    - `fields/xx-test-bad.yml` → `.yaml extension`;
    - `subjects/xx-test-broken.yaml` → `yaml:`.
  - For `valid-minimal`, `raw.intakes.value[0].startDate` is the **string** `"2027-09-01"`, and country `XB`'s code is the string `"XB"`.
  - `empty` gives `{files:[], errors:[]}`.
- **`validate.test.ts`** (`now: "2026-09-29"` unless stated):

  | scenario | expectation |
  |---|---|
  | valid-minimal | `errors: []`, `warnings: []`, `recordCount` 16, every freshness row `fresh`, translations `fr {present 15? …}` (compute from the fixture: assert `translations.fr.present === translations.fr.total` and `en.present < en.total`) |
  | valid-minimal, now `2026-08-01` | an error containing `is in the future` |
  | invalid-missing-source | errors contain `unknown source key "nope"` (scale-a) and at least one error for scale-b at path `info_kind` and one at `sources` |
  | invalid-bad-reference | error `from: unknown grading-scales "xx-test-scale-nope"` |
  | invalid-structure | errors contain `duplicate id "xx-test-dup"` and `must equal the file name` |
  | stale | 0 errors; freshness rows: scale-old `stale`, scale-aging `aging` with `ageDays` 271 |
  | missing-translation | `translations.en` = `{present:1, reviewed:0, total:2}`, `ar` = `{present:0, reviewed:0, total:2}`, `fr` = `{present:2, reviewed:2, total:2}` |

  Mutation table: each row loads `valid-minimal`, clones one file's `raw` in memory, mutates it, and reruns `validateData`. Each row must produce the listed error or warning:
  - unused source (add `sources.extra`) → warning `never used`;
  - scholarship `rules: []` → warning `no rules`;
  - scholarship rule changed to `manual_check` → warning `manual_check`;
  - program `city: xx-test-other` → `must match institution`;
  - a second route with the same key → `duplicate admission route`;
  - a second cost profile for `XB`/null → `duplicate cost profile`;
  - rule `acceptedTests: [xx-test-nope]` → `unknown language-certificates`;
  - `tracks: [xx-test-nope]` → `unknown track`;
  - program `scholarships: [xx-test-nope]` → `unknown scholarships`;
  - **[A3]** cred `gradingScale: xx-test-nope` → `unknown grading-scales`;
  - **[A3]** scholarship `destinations: [XZ]` → `unknown countries`.
- **`check.test.ts`**: spawn the real CLI with `spawnSync(process.execPath, ["--import", "tsx", "scripts/data/check.ts", ...args], { encoding: "utf8" })`. Verify the tsx loader flag with `MSYS_NO_PATHCONV=1 npx ctx7@latest library "tsx" "node --import tsx"`. Set a 60 s timeout.

  | args | exit | output contains |
  |---|---|---|
  | `--data-dir tests/fixtures/data/empty` | 0 | `data:check: 0 records, 0 errors, 0 warnings`, `data:check: OK` |
  | `--data-dir …/valid-minimal --now 2026-09-29` | 0 | `16 records, 0 errors, 0 warnings` |
  | `--data-dir …/invalid-missing-source --now 2026-09-29` | 1 | stderr `ERROR grading-scales/xx-test-scale-a.yaml:`; `FAILED` |
  | `--data-dir …/stale --now 2026-09-29` | 0 | `STALE grading-scales/xx-test-scale-old.yaml`, `AGING`, `1 stale` |
  | `--data-dir …/stale --now 2026-09-29 --strict` | 1 | `--strict: 1 stale` |
  | `--bogus` | 2 | stderr `data:check:` |

  Also check `runCheck` in-process for the report-line order on `stale`.

- [ ] **Step 3:** Run `pnpm test`. Expected: FAIL (the modules are missing).
- [ ] **Step 4: Implement** the five modules to the rules above.
  - `check.ts` has an entry guard: `if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main()`. The guard lets tests import `runCheck` without running `main`.
  - Only `check.ts` calls `process.exit` / `console.*`.
  - Never print record values; print only files, paths, keys and dates.
- [ ] **Step 5:** Add `"data:check": "tsx scripts/data/check.ts"` to `package.json`. Create `data/.gitkeep`, and `data/README.md` covering:
  - the one-record-per-file layout `data/<collection>/**/<id>.yaml` (the collection is the first folder, deeper folders are organisational, the filename equals `slug`, or `code` for countries);
  - the 13 collection names;
  - "only records whose every value traces to an official https source belong here; never invent or fill in values, use `null`";
  - required provenance (`sources`, `source`, `info_kind`, `basis` for estimates, `last_verified_at` = the date a human actually read the page);
  - `pnpm data:check [--strict]` and `pnpm data:build`;
  - slugs are never renamed.
- [ ] **Step 6:** Run `pnpm data:check`. Expected: `data:check: 0 records, 0 errors, 0 warnings` and `data:check: OK`, exit 0 (`data/` holds only the README and `.gitkeep`). Then run `pnpm test && pnpm typecheck && pnpm lint`. All green.
- [ ] **Step 7: Commit** with message `feat: add data:check validation, provenance and freshness report` and the trailer.

---

### Task 11: `pnpm data:build` (resolve, text, shard, hash, manifest)

**Files:**
- Create: `scripts/data/canonical-json.ts`, `scripts/data/hash.ts`, `scripts/data/resolve.ts`, `scripts/data/text.ts`, `scripts/data/shard.ts`, `scripts/data/build.ts`
- Create: `tests/scripts/data/{canonical-json,hash,resolve,text,shard,build}.test.ts`
- Modify: `package.json` (`data:build`, `build`)

**Interfaces:**
- Consumes: T9 (`shardNames`, shard types, `ManifestSchema`, `SHARD_GZIP_BUDGET_BYTES`, `SNAPSHOT_FORMAT_VERSION`) and T10 (`loadData`, `validateData`, `Catalog`, `parseDataCliArgs`).
- Produces:
```ts
// canonical-json.ts
export class CanonicalJsonError extends Error {}
export function canonicalJson(value: unknown): string; // keys sorted by UTF-16 code unit, no whitespace, arrays in order,
// undefined-valued object keys omitted, non-ASCII not escaped; throws on non-finite numbers, bigint, functions, Map/Set, undefined in arrays
// hash.ts
export function sha256Hex(data: string | Uint8Array): string;
export function shortHash(hex: string): string;          // first 12 chars
export function gzipSize(data: Uint8Array): number;      // zlib gzipSync level 9
// resolve.ts
export type TextBag = Map<TextKey, LocalizedText>;
export type Resolved<T> = { value: T; texts: TextBag };
export function textKey(collection: CollectionName, id: string, path: string): TextKey;
export function resolveCatalog(catalog: Catalog): ResolvedCatalog;
export type ResolvedCatalog = { countries: Resolved<Country>[]; fields: Resolved<Field>[]; subjects: Resolved<Subject>[];
  languageCertificates: Resolved<LanguageCertificate>[]; gradingScales: Resolved<GradingScale>[];
  gradeConversions: Resolved<GradeConversion>[]; credentialTypes: Resolved<CredentialType>[];
  applicationChannels: Resolved<ApplicationChannel>[]; routes: Resolved<AdmissionRoute>[]; institutions: Resolved<Institution>[];
  programs: Resolved<Program>[]; costProfiles: Resolved<CostProfile>[]; scholarships: Resolved<Scholarship>[] }; // each sorted by id
// text.ts
export function textEntries(bag: TextBag, locale: Locale): Record<TextKey, TextEntry>;
// shard.ts
export type NamedShard = { name: string; shard: Shard };
export function buildShards(resolved: ResolvedCatalog): NamedShard[];  // structural shards + their text shards, sorted by name
// build.ts
export class BuildError extends Error {}
export type BuildOptions = { dataDir: string; outDir: string; generatedAt: string; gzipBudgetBytes?: number; now: IsoDate };
export function runBuild(opts: BuildOptions): Manifest; // throws BuildError
```

**Resolution rules (`resolve.ts`)**. Each record type has its own explicit function (`resolveProgram` and so on); nothing walks structures generically.
- `meta(sources, source, info_kind, cls, basisKey?)` returns a `FactMeta`.
- `fact(raw, sources, basisKey)` returns a `ResolvedFact` (the value is copied, `class` comes from the raw fact).
- Record-level provenance becomes `fact` with class `"stable"`. `requirements` and every rule `fact` are also stable.
- `LocalizedText` becomes a `TextKey` via `textKey(c, id, path)`, which returns `` `${c}/${id}#${path}` ``, and the text is added to the bag. The paths are:

| Text | Path |
|---|---|
| names | `name` |
| program summary | `summary` |
| gloss | `gloss` |
| track gloss | `tracks.<index>.gloss` |
| channel summary | `summary` |
| route note | `note` |
| route condition note | `conditions.<ruleId>.note` |
| document name | `<fact>.<index>.name` (e.g. `documents.0.name`) |
| rule note | `requirements.rules.<ruleId>.note` |
| fact basis | `<factPath>.basis` (e.g. `tuition.basis`, `lines.housing.basis`) |
| scholarship `howToApply` | `howToApply` |

- `Program.institutionType` is copied from the institution in the catalog. The institution must exist; otherwise throw `BuildError`, which cannot happen after validation.
- Missing optional texts become `null` (`note`, track `gloss`). Missing cost lines are omitted from `lines`.
- **[A6]** Top-level record arrays in every shard are sorted by id (`slug`, or `code`). Nested arrays (rules, conditions, documents, intakes, tracks) keep their data order, because the domain relies on rule order.

**Text rules (`text.ts`).**
- For `fr`: `{text, status, fallback:false}`.
- For `en`/`ar`: the locale entry when present (`fallback:false`); otherwise the fr text and fr status with `fallback:true`.

**Shard rules (`shard.ts`).**
- `core` is always emitted and holds all vocabulary, scales, conversions, credential types and channels.
- `routes.<origin>`, `institutions.<country>`, `costs.<country>` and `programs.<country>.<field>` are emitted only when non-empty.
- A scholarship appears in `scholarships.<d>` for each of its `destinations`.
- For each structural shard, the union of its records' text bags gives, per locale, `text.<locale>.<shard>`, emitted only if it has at least one entry.
- Output is sorted by name.

**Build rules (`build.ts`).**
1. `loadData` + `validateData`. Any load or validation error throws `BuildError("data is invalid; run pnpm data:check")`. Warnings are ignored.
2. `resolveCatalog` → `buildShards`.
3. For each shard, compute `bytes = Buffer.from(canonicalJson(shard))`, then `sha256`, `gzipBytes`. If any `gzipBytes > (gzipBudgetBytes ?? SHARD_GZIP_BUDGET_BYTES)`, throw `BuildError("shard <name> is <n> bytes gzipped, over the <b> byte budget")` **before** touching the out dir.
4. `rmSync(join(outDir, "s"), { recursive: true, force: true })` (Node API in the script, not a shell `rm`), then `mkdirSync`, then write each `s/<name>.<sha12>.json`.
5. `snapshotVersion = shortHash(sha256Hex(canonicalJson(Object.fromEntries(names.map(n => [n, sha256])))))`.
6. Build the manifest `{ formatVersion: SNAPSHOT_FORMAT_VERSION, snapshotVersion, generatedAt, locales: [...LOCALES], shards }`. Validate it with `ManifestSchema.parse`, then write `manifest.json` as canonical JSON.
7. CLI: `generatedAt = new Date().toISOString()`. On success print `data:build: <n> shards, snapshot <version>, largest <name> <gzipBytes> B gzip` and exit 0. On `BuildError` print `data:build: <message>` to stderr and exit 1. Usage errors exit 2.

- [ ] **Step 1: Write the failing tests.**
- **`canonical-json.test.ts`** (table):
  - `{b:1,a:{d:2,c:[3,{f:1,e:0}]}}` becomes `{"a":{"c":[3,{"e":0,"f":1}],"d":2},"b":1}`;
  - `{a:undefined,b:null}` becomes `{"b":null}`;
  - `"جسر"` is emitted unescaped;
  - `-0` becomes `0`;
  - `NaN`, `Infinity`, `1n`, `new Map()` and `[undefined]` all throw `CanonicalJsonError`;
  - two objects with the same content but different insertion order give identical strings.
- **`hash.test.ts`**:
  - `sha256Hex("")` is `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`;
  - `shortHash` has length 12;
  - `gzipSize` is a positive integer and deterministic across two calls.
- **`resolve.test.ts`** (on the `valid-minimal` catalog from `loadData` + `validateData`):
  - The program's `tuition` equals `{ value: {amountMinor:100000,currency:"XTS",period:"year"}, source_url: "https://example.org/fees", info_kind: "official", last_verified_at: "2026-09-01", class: "volatile" }` (use the `url` you gave the `fees` source).
  - The program's `requirements.rules.map(r => r.id)` is in data order.
  - The manual rule's `note` is `"programs/xx-test-prog#requirements.rules.<id>.note"`.
  - The cost line housing `basis` is `"cost-profiles/xx-test-costs-xb#lines.housing.basis"`.
  - The program's `institutionType` is `"public"`.
  - The route condition's `fact.class` is `"stable"`.
  - The result contains no raw `source` key anywhere: check that `canonicalJson(result)` does not match `/"source":/`.
  - `documents.value[0].name` is `"programs/xx-test-prog#documents.0.name"`.
- **`text.test.ts`** (table over locales):
  - For a bag of one fr-only text and one fr+en(draft) text:
    - `fr` gives `fallback:false`;
    - `en` gives the fallback for the first text and `fallback:false`/`draft` for the second;
    - `ar` gives the fallback for both.
- **`shard.test.ts`**:
  - On the valid-minimal resolved catalog, the shard names are exactly `core, costs.XB, institutions.XB, programs.XB.xx-test-field, routes.XA, scholarships.XB, scholarships.XC, text.{ar,en,fr}.{core,costs.XB,programs.XB.xx-test-field,routes.XA,scholarships.XB,scholarships.XC}` (sorted; `routes.XA` has text because of the route note).
  - `scholarships.XB` and `scholarships.XC` each contain `xx-test-schol`.
  - The empty catalog gives exactly `["core"]`, with empty arrays.
- **`build.test.ts`** (each case uses its own `mkdtempSync` out dir, `generatedAt` `"2026-09-29T00:00:00.000Z"`, `now` `"2026-09-29"`):
  1. **Empty.** `data-dir …/empty` gives `Object.keys(manifest.shards)` equal to `["core"]`, and `s/` holds exactly one file.
  2. **Full pipeline.**
     - On valid-minimal, every manifest file exists and its sha256 matches its bytes.
     - The file bytes have no trailing newline.
     - `ManifestSchema.parse(JSON.parse(manifest.json))` succeeds.
     - `JSON.parse(core)` has `kind:"core"`.
  3. **Determinism.** Two builds into two dirs, with different `generatedAt`, give an identical `snapshotVersion` and identical `shards`.
  4. **Content change.** Copy valid-minimal into a temp data dir with `cpSync(src, dst, {recursive:true})` and change the program `name`. The result is a new `snapshotVersion`, a changed `programs.XB.xx-test-field` sha256, and an unchanged `core` sha256.
  5. **Stale output cleared.** Write `s/old.000000000000.json` into the out dir, then build. The file is gone.
  6. **Budget.** With valid-minimal and `gzipBudgetBytes: 50`, the build throws `BuildError` with the message matching `/over the 50 byte budget/`, and the out dir has no `manifest.json`.
  7. **Budget with the real constant.** In a temp data dir, write a `fields/xx-test-huge.yaml` whose `name.fr.text` is at most 400 characters. That cannot exceed the budget, so this case goes through the pure helper instead: export `assertShardBudget(name, bytes, budget)` from `build.ts` and call it with `randomBytes(400 * 1024)`. It must throw `BuildError`.
  8. **Invalid data.** `invalid-missing-source` throws `BuildError(/data is invalid/)`.
- [ ] **Step 2:** Run `pnpm test`. Expected: FAIL.
- [ ] **Step 3:** Implement the modules.
- [ ] **Step 4:** In `package.json`, add `"data:build": "tsx scripts/data/build.ts"` and change `"build"` to `"pnpm data:check && pnpm data:build && next build"`.
- [ ] **Step 5: Verify**
```bash
pnpm data:build; echo "exit=$?"
ls public/snapshots public/snapshots/s
pnpm build
git status --short public/
pnpm test && pnpm typecheck && pnpm lint
```
Expected:
- `data:build: 1 shards, snapshot <12 hex>, largest core … B gzip` and `exit=0`;
- `public/snapshots` contains `manifest.json` and `s/core.<sha12>.json`;
- `pnpm build` runs check, build and next build, all green;
- `git status` shows nothing under `public/` (it is gitignored).
- [ ] **Step 6: Architecture doc check.** `.claude/docs/architecture.md` matches the M1 layout (module table: `src/data-schema/`, `scripts/data/`; the data flow `data:check` then `data:build`). **No edit is needed.** The output path `public/snapshots/` is an implementation detail and is not in the doc. The doc also mentions a "source-change watcher" under `scripts/data/`, which M1 does not build; it stays listed as planned. Record "architecture.md unchanged" in the task report.
- [ ] **Step 7: Commit** with message `feat: add data:build with content-hashed snapshot shards and manifest` and the trailer. No new dependencies are added here: `node:crypto` and `node:zlib` are built in.

---

## Risks / Open questions

- **Sensitive: trust and provenance.**
  - `data:check` checks that a source *key* resolves and that the URL is https. It cannot check that the domain is official (for example a university, government body, DAAD or Nuffic). The only guard is the human review of `data/`. Optional: a domain allowlist warning.
  - The `basis` rule is "required for estimate, optional otherwise" (my reading of "required iff"). If you want `basis` forbidden on `official` facts, say so; that would be a one-line refine plus a test row.
  - Rules and record-level provenance have no `basis`, even when their `info_kind` is `estimate`.
- **Sensitive: the snapshot as a public contract.**
  - The shard shapes, the TextKey format and the manifest become the web app's contract (`formatVersion: 1`).
  - TextKeys use array **indexes** for documents and tracks (following the contract example `documents.0.name`). Reordering documents in YAML therefore changes their keys. That is harmless for text lookup, but it matters to anyone who stores keys. [A5] makes document slugs unique so keying by slug is possible later, which would need a format bump.
  - [A6] (sorting only top-level arrays) matters for match semantics: sorting rules would change the order of reasons.
- **Staleness report granularity.** There is one row per fact use, so a program with many rules on one source prints many STALE lines. This is noisy but precise. The alternative is to aggregate per source key.
- **Future `last_verified_at` depends on the CLI clock.** CI in another timezone can disagree by one day near midnight. `now` is the UTC date; use `--now` to pin it.
- **The gzip budget is measured with gzip level 9.** Vercel may serve brotli. This makes the budget a conservative proxy.
- **Tool facts I could not execute** (the planner has no shell):
  - the Zod 4 API details and the `yaml` 1.2 defaults (checked against their web docs on 2026-09-29);
  - `node --import tsx` as the test spawn form;
  - tsx running `.ts` entry files that use the `@/` alias. **tsx must resolve the tsconfig `paths`, so verify this with ctx7.** If it does not, the scripts use relative imports into `src/data-schema`.

## Assumptions
- M0 is complete as specified in Part A: Biome override, Vitest aliases, and `routing.locales` equal to `["fr","en","ar"]`.
- `data/` stays empty (README only) through M2, so `pnpm build` produces a core-only snapshot.
- Test temp directories are left in the OS temp dir (following Part A's rule against `rm -rf`). `build.ts` clears `out-dir/s/` through the Node `fs` API, because the contract requires it.

## Contract amendments needed
- **A1 (defect), section 9.** `resolved.ts` uses `Cefr` but does not import it. Change the import to `import type { Cefr, CountryCode, Currency, InfoKind, LanguageCode, Slug } from "./primitives";`.
- **A2 (additive), section 10 build rules.** Add: "Both scripts also accept `--now <YYYY-MM-DD>` (default: today's UTC date) for freshness and future-date checks; `data:check` also accepts `--strict` (exit 1 if any fact is stale). Exit codes: 0 ok, 1 invalid data / strict stale / build failure, 2 usage error."
- **A3 (gap), section 8 referential checks.** Append:
  - credential-type `gradingScale` and track `subjects` must exist;
  - rule `types` must be credential-types;
  - every CountryCode field must exist in `countries`: route origin/destination; the country of institution, program, channel, credential type and cost profile; non-null grading-scale country; scholarship `destinations` and `eligibleNationalities`;
  - scholarship `fields` must be fields.
  - Without these, a typo such as `gradingScale` would silently give ⚠️ `no_scale_conversion` in M2 instead of failing the build.
- **A4 (gap), section 8, `credential-type.ts`.** Track slugs must be unique within a credential type (refine: `track slugs must be unique`).
- **A5 (gap), section 8, `program.ts` / `scholarship.ts`.** Document slugs must be unique within a `documents` value (refine inside `DocumentSchema` array usage: `z.array(DocumentSchema).refine(unique slug)`).
- **A6 (clarification), section 9 resolution.** Replace "Arrays inside shards are sorted by id." with "Top-level record arrays in each shard are sorted by id (`slug`, or `code` for countries); nested arrays (rules, conditions, documents, intakes, tracks, lists of slugs) keep data order."
- **A7 (clarification), section 10.** Text shards are per structural shard (`text.<locale>.<structuralShardName>`), and the TextKeys of a record appear in the text shard of every structural shard that contains the record (so multi-destination scholarships are duplicated). Also, `CoreShard` needs text for country/field/subject names, credential glosses and channel summaries, which go in `text.<locale>.core`.

