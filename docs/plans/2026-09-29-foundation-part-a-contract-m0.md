# Jisr Foundation (Milestones 0–2): Implementation Plan, Part A

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to run this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking. Each task is self-contained: an implementer only sees its own task plus the "Global Constraints" and "Shared type contract" sections.

**Goal:** Deliver a working Next.js 16 app skeleton (M0), a validated YAML to immutable JSON snapshot data pipeline (M1), and a pure, fully tested domain core (M2) covering eligibility, matching, costs and the checklist. No real reference data and no user-facing journey pages are included yet.

**Architecture:** There is one Next.js 16 App Router app. Reference data is YAML under `data/`. `pnpm data:check` validates it with the Zod schemas in `src/data-schema/`, and `pnpm data:build` resolves provenance and writes content-hashed JSON shards and a manifest to `public/snapshots/` (gitignored). `src/domain/` is pure TypeScript: it works on *resolved* snapshot types plus a Zod-validated `Profile`, receives `now` as an ISO date string, and has no framework, DB, fs, network or `Date` access. Biome enforces this and a Vitest canary proves the ban works. The i18n shell is next-intl (`fr` default, `en`, `ar` RTL) routed by `src/proxy.ts`.

**Tech Stack:** Node 24.15, pnpm 10.33, TypeScript strict, Next.js 16 (Turbopack, `proxy.ts`), React 19, Tailwind CSS v4, shadcn/ui (Radix base), next-intl, Zod 4 (M1), `yaml` (M1, dev), `tsx` (M1, dev), Vitest, Biome 2, `node:crypto` / `node:zlib` for hashing and gzip sizing.

**Milestones:** M0 = scaffold and tooling (T1–T5, below). M1 = `src/data-schema/**` + `scripts/data/**` + `tests/scripts/data/**` + synthetic fixtures (Part B). M2 = `src/domain/**` + `tests/domain/**` (Part C). This part (A) contains M0 tasks and the shared contract only.

---

## Global Constraints (verbatim from `.claude/CLAUDE.md`; apply to every task)

- Match existing patterns before introducing new ones. Latest stable packages, no pinning unless required.
- Named exports over default exports (Next.js file conventions like `page.tsx` excepted).
- No `any`, no `@ts-ignore`, no non-null `!` — fix the type.
- Server Components by default; `"use client"` only for state/effects/browser APIs.
- `src/domain` imports nothing from React, Next, `src/db`, `src/lib`, `fs` or the network (Biome `noRestrictedImports` override); time is passed in as an argument.
- Zod-validate every Server Action, route handler, form input and data file; re-check the session inside each action.
- Money = integer minor units + ISO currency code; estimates are `{min, max}` ranges, never a single promised number.
- Every fact in `data/` has `source_url`, `info_kind` (`official | estimate | guidance`) and `last_verified_at`; the build fails without them.
- Staleness (ADR 0004; constants in `src/data-schema/staleness.ts`): volatile facts (deadlines, fees, scholarship amounts) are aging at 120 days, stale at 270; stable facts (requirements, routes, cost estimates, descriptions) aging 270, stale 545. Stale data never yields ✅ or ❌, only ⚠️.
- Short text is a `LocalizedText` map (`fr` required, `en`/`ar` optional, per-locale `draft|reviewed` status); long-form guides are MDX in `content/<locale>/`.
- Match status: ✅ only if every published requirement was evaluated and passed; ❌ only for a definite published-requirement failure; missing/ambiguous data → ⚠️.
- All user-facing strings go through next-intl in all three locales; Tailwind logical utilities (`ms-`, `pe-`, `text-start`) — never `ml-`/`pr-`/`left-`.
- Dates: ISO 8601 in code/data, DD/MM/YYYY in UI. Currency: EUR primary, MAD secondary display.
- GDPR (and Moroccan Law 09-08): minimise personal data, never log grades/nationality, support account deletion + export.
- Conventional commits: `feat: fix: chore: refactor: docs: test:`.
- Don't commit `.env*` files (except `.env.example`) or push to `main` directly — PRs only
- Don't add dependencies without justifying them in the commit message
- Don't invent university, tuition, deadline, route or scholarship data — every value must trace to an official URL
- Don't put reference data in Postgres, and don't put DB/network/framework code in `src/domain`
- Don't set cookies, record IPs or send profile data to analytics or Sentry; Sentry stays scrubbed with tracing off
- Don't hand-edit generated Better Auth tables, applied migrations, or built snapshots
- Don't log profile data (grades, nationality) or session tokens

**Plan-wide execution rules**
- Work on branch `feat/foundation`. **Never push. Never touch `main`.**
- Every commit ends with the trailer line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. If a commit adds a dependency, the line before the trailer is a one-line justification starting `Deps:`.
- Commit with a heredoc so the trailer survives: `git commit -F- <<'EOF' … EOF`.
- Shell is Git Bash on Windows. Prefix ctx7 calls with `MSYS_NO_PATHCONV=1`. Use absolute or repo-root-relative paths from `C:/Users/dagda/Downloads/nex/UniWay` (`/c/Users/dagda/Downloads/nex/UniWay` in Git Bash).
- `rm -rf` is denied by project settings. Never try to get around that; leave temporary directories under the OS temp dir.
- Test fixtures use obviously fake slugs prefixed `xx-test-`. Never invent real-looking reference data.
- "Done" for a task means `pnpm typecheck`, `pnpm test` (once it exists, from T3 on) and `pnpm lint` are all green, with the command output shown.

---

## File Structure (M0–M2)

```
UniWay/
├─ .gitattributes                         M0/T1  * text=auto eol=lf
├─ .gitignore                             M0/T1  (+ /public/snapshots/, scaffold entries)
├─ .env.example                           M0/T1
├─ biome.json                             M0/T2  (domain boundary override)
├─ components.json                        M0/T4  (shadcn)
├─ next.config.ts                         M0/T1, next-intl plugin in T5
├─ package.json / pnpm-lock.yaml          M0/T1 (+ pnpm-workspace.yaml only if the scaffold/pnpm creates it)
├─ postcss.config.mjs                     M0/T1
├─ tsconfig.json                          M0/T1  (strict+, @/* and @scripts/* aliases)
├─ vitest.config.ts                       M0/T3
├─ messages/{fr,en,ar}.json               M0/T5
├─ data/                                  M1     (created empty; real data arrives after M2)
│   └─ <collection>/**/<id>.yaml          one record per file; filename == id
├─ public/snapshots/                      M1 build output (gitignored)
│   ├─ manifest.json
│   └─ s/<shard-name>.<sha12>.json
├─ scripts/
│   ├─ not-configured.mjs                 M0/T1  (db:* stubs)
│   └─ data/                              M1
│       ├─ check.ts  build.ts  cli-args.ts  load-data.ts  validate.ts
│       ├─ resolve.ts  text.ts  shard.ts  canonical-json.ts  hash.ts  report.ts
├─ src/
│   ├─ proxy.ts                           M0/T5
│   ├─ app/
│   │   ├─ globals.css  favicon.ico       M0/T1 (theme via T4)
│   │   └─ [locale]/layout.tsx page.tsx   M0/T5
│   ├─ components/
│   │   ├─ ui/button.tsx                  M0/T4 (shadcn CLI)
│   │   └─ locale-switcher.tsx            M0/T5
│   ├─ i18n/
│   │   ├─ routing.ts navigation.ts request.ts direction.ts   M0/T5
│   │   └─ global.d.ts                    M0/T5 (next-intl AppConfig augmentation)
│   ├─ lib/utils.ts                       M0/T4 (shadcn cn)
│   ├─ data-schema/                       M1 (contract below)
│   │   ├─ dates.ts  staleness.ts         pure, no zod (Biome-enforced like domain)
│   │   ├─ primitives.ts  localized-text.ts  provenance.ts  rules.ts  profile.ts
│   │   ├─ resolved.ts                    types only (what the domain consumes)
│   │   ├─ snapshot.ts                    manifest Zod + shard types + shard names
│   │   └─ records/
│   │       ├─ country.ts field.ts subject.ts language-certificate.ts
│   │       ├─ grading-scale.ts grade-conversion.ts credential-type.ts
│   │       ├─ application-channel.ts admission-route.ts institution.ts
│   │       ├─ program.ts cost-profile.ts scholarship.ts
│   │       └─ collections.ts             collection name → schema registry
│   └─ domain/                            M2 (flat, no subfolders)
│       ├─ types.ts facts.ts cefr.ts grades.ts route.ts rules.ts
│       ├─ match.ts intakes.ts filter.ts costs.ts scholarships.ts checklist.ts
└─ tests/
    ├─ domain/boundary.test.ts            M0/T3 (canary)
    ├─ i18n/direction.test.ts messages.test.ts   M0/T5
    ├─ data-schema/*.test.ts              M1
    ├─ scripts/data/*.test.ts             M1
    ├─ fixtures/data/<scenario>/…yaml     M1 (xx-test- slugs)
    ├─ fixtures/domain/builders.ts        M2 (resolved-object builders)
    └─ domain/*.test.ts                   M2
```

`src/lib/snapshot/` (the client loader) and every page other than the placeholder home are **out of scope for M0–M2**.

---

## Shared type contract (single source of truth for Parts B and C)

**Ownership.** M1 (Part B) implements everything under `src/data-schema/**`. M2 (Part C) implements everything under `src/domain/**` and may only consume what is listed here. Names, file paths and shapes below are normative. If B or C needs a change, it changes this contract first.

**Naming.** Provenance keys are snake_case (`source_url`, `info_kind`, `last_verified_at`, and the cost line key `application_visa`). Everything else is camelCase. Raw YAML types are `XxxRecord` (the `z.infer` output of `XxxRecordSchema`). Resolved snapshot types, which the domain consumes, are the unqualified `Xxx`.

**Import rules.** Inside `src/data-schema/`, files import each other relatively (`./dates`). `src/domain/**` may:
- use value imports from `@/data-schema/dates` and `@/data-schema/staleness` only;
- use `import type` from any other `@/data-schema/*` module;
- use relative imports from `./` only.

**Zod.** The target is Zod 4 (`z.strictObject`, two-argument `z.record`). Verify with `MSYS_NO_PATHCONV=1 npx ctx7@latest library "Zod" "v4 strictObject record superRefine transform"` before writing schemas.

**TS config.** `noUncheckedIndexedAccess` is on, so indexed reads return `T | undefined`.

### 1. `src/data-schema/dates.ts` (pure, no imports)

```ts
export type IsoDate = string; // always a validated real calendar date "YYYY-MM-DD"
export type CivilDate = { year: number; month: number; day: number };

export class InvalidIsoDateError extends Error {}

export function isValidIsoDate(value: string): boolean;          // /^\d{4}-\d{2}-\d{2}$/ + real date (leap years)
export function parseIso(value: IsoDate): CivilDate;              // throws InvalidIsoDateError
export function formatIso(date: CivilDate): IsoDate;              // zero-padded
export function toDayNumber(value: IsoDate): number;              // days since 1970-01-01 (Hinnant days_from_civil)
export function fromDayNumber(days: number): IsoDate;             // inverse (civil_from_days); integer input
export function addDays(value: IsoDate, days: number): IsoDate;
export function diffDays(later: IsoDate, earlier: IsoDate): number; // toDayNumber(later) - toDayNumber(earlier)
export function compareIso(a: IsoDate, b: IsoDate): -1 | 0 | 1;
```
`Date` is never used here; Biome enforces this.

### 2. `src/data-schema/staleness.ts` (pure; imports only `./dates`)

```ts
import type { IsoDate } from "./dates";
import { diffDays } from "./dates";

export const STALENESS = {
  volatile: { agingDays: 120, staleDays: 270 },
  stable: { agingDays: 270, staleDays: 545 },
} as const;

export type StalenessClass = keyof typeof STALENESS; // "volatile" | "stable"
export type Freshness = "fresh" | "aging" | "stale";

// age = diffDays(now, lastVerifiedAt); age >= staleDays → "stale"; age >= agingDays → "aging"; else "fresh".
// Negative age (future date) → "fresh" (data:check rejects future last_verified_at separately).
export function freshnessOf(cls: StalenessClass, lastVerifiedAt: IsoDate, now: IsoDate): Freshness;
```

### 3. `src/data-schema/primitives.ts`

```ts
import { z } from "zod";
import { isValidIsoDate } from "./dates";

export const IsoDateSchema = z.string().refine(isValidIsoDate, { message: "Expected a real date YYYY-MM-DD" });
export const SlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Expected a kebab-case slug");
export const SourceKeySchema = z.string().regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/);
export const CountryCodeSchema = z.string().regex(/^[A-Z]{2}$/, "ISO 3166-1 alpha-2");
export const LanguageCodeSchema = z.string().regex(/^[a-z]{2}$/, "ISO 639-1");
export const CurrencySchema = z.string().regex(/^[A-Z]{3}$/, "ISO 4217");
export const HttpsUrlSchema = z.string().refine((v) => URL.canParse(v) && v.startsWith("https://"), { message: "Expected an https URL" });
export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export const CefrSchema = z.enum(CEFR_LEVELS);
export const INFO_KINDS = ["official", "estimate", "guidance"] as const;
export const InfoKindSchema = z.enum(INFO_KINDS);
export const LOCALES = ["fr", "en", "ar"] as const;          // must equal src/i18n/routing.ts locales
export const LocaleSchema = z.enum(LOCALES);
export const MinorAmountSchema = z.number().int().nonnegative();
export const MoneyRangeSchema = z.strictObject({ min: MinorAmountSchema, max: MinorAmountSchema, currency: CurrencySchema })
  .refine((r) => r.min <= r.max, { message: "min must be <= max" });

export type Slug = string;
export type SourceKey = string;
export type CountryCode = string;
export type LanguageCode = string;
export type Currency = string;
export type Cefr = z.infer<typeof CefrSchema>;
export type InfoKind = z.infer<typeof InfoKindSchema>;
export type Locale = z.infer<typeof LocaleSchema>;
export type MoneyRange = z.infer<typeof MoneyRangeSchema>;   // integer minor units
```
The domain cannot import `CEFR_LEVELS` because it is a value in a zod module. The domain keeps its own ordered `CEFR_ORDER: readonly Cefr[]` in `src/domain/cefr.ts`.

### 4. `src/data-schema/localized-text.ts`

```ts
export const TranslationStatusSchema = z.enum(["draft", "reviewed"]);
const LocalizedEntrySchema = z.strictObject({ text: z.string().trim().min(1).max(400), status: TranslationStatusSchema });
export const LocalizedTextSchema = z.strictObject({
  fr: LocalizedEntrySchema,
  en: LocalizedEntrySchema.optional(),
  ar: LocalizedEntrySchema.optional(),
});
export type TranslationStatus = z.infer<typeof TranslationStatusSchema>;
export type LocalizedText = z.infer<typeof LocalizedTextSchema>;
```

### 5. `src/data-schema/provenance.ts` (raw facts and sources)

```ts
export const SourceSchema = z.strictObject({ url: HttpsUrlSchema, last_verified_at: IsoDateSchema });
export const SourcesSchema = z.record(SourceKeySchema, SourceSchema)
  .refine((m) => Object.keys(m).length > 0, { message: "at least one source" });
export type Source = z.infer<typeof SourceSchema>;
export type SourcesMap = z.infer<typeof SourcesSchema>;

// Fact factories. YAML authors write {value, source, info_kind, basis?}; parsing adds `class`.
// value: explicit null means "not published" (never omitted). basis is required iff info_kind === "estimate".
export function volatileFact<T extends z.ZodType>(inner: T): z.ZodType<RawFact<z.output<T>>, unknown>;
export function stableFact<T extends z.ZodType>(inner: T): z.ZodType<RawFact<z.output<T>>, unknown>;
// implementation shape: z.strictObject({ value: inner.nullable(), source: SourceKeySchema, info_kind: InfoKindSchema,
//   basis: LocalizedTextSchema.optional() }).superRefine(basis rule).transform(f => ({ ...f, class: "<cls>" }))

export type RawFact<T> = {
  value: T | null;
  source: SourceKey;          // key into the record's `sources`
  info_kind: InfoKind;
  basis?: LocalizedText;
  class: StalenessClass;      // added by the factory, never written in YAML
};

// Records that are themselves a claim (routes, scales, conversions, credential types, channels, institutions)
// carry record-level provenance; its class is always "stable".
export const RecordProvenanceShape = { source: SourceKeySchema, info_kind: InfoKindSchema } as const;
```
**Cross-field invariant (checked by data:check in M1):** every `source` key used anywhere in a record, including rules and requirements, exists in that record's `sources`. Unused sources produce a warning.

### 6. `src/data-schema/rules.ts`

```ts
const RuleBase = { id: SlugSchema, source: SourceKeySchema, info_kind: InfoKindSchema };
const GradeScaleSlug = SlugSchema;

export const RuleSchema = z.discriminatedUnion("kind", [
  z.strictObject({ ...RuleBase, kind: z.literal("credential_type_in"), types: z.array(SlugSchema).min(1) }),
  z.strictObject({ ...RuleBase, kind: z.literal("credential_track_in"), tracks: z.array(SlugSchema).min(1) }),
  z.strictObject({ ...RuleBase, kind: z.literal("overall_grade_min"), scale: GradeScaleSlug, threshold: z.number().nullable() }),
  z.strictObject({ ...RuleBase, kind: z.literal("subject_grade_min"), subject: SlugSchema, scale: GradeScaleSlug, threshold: z.number().nullable() }),
  z.strictObject({ ...RuleBase, kind: z.literal("subject_taken"), subjects: z.array(SlugSchema).min(1), mode: z.enum(["all", "any"]) }),
  z.strictObject({ ...RuleBase, kind: z.literal("language_proficiency"), language: LanguageCodeSchema,
    minCefr: CefrSchema.nullable(), certificateRequired: z.boolean().nullable(), acceptedTests: z.array(SlugSchema) }),
  z.strictObject({ ...RuleBase, kind: z.literal("prior_study_years_min"), years: z.number().int().min(1) }),
  z.strictObject({ ...RuleBase, kind: z.literal("manual_check"), note: LocalizedTextSchema }),
]);
// `threshold`, `minCefr`, `certificateRequired` are REQUIRED keys; null = "not published".

export const RequirementsSchema = z.strictObject({
  coverage: z.enum(["complete", "partial"]),
  source: SourceKeySchema,
  info_kind: InfoKindSchema,
  rules: z.array(RuleSchema),
}).refine((r) => new Set(r.rules.map((x) => x.id)).size === r.rules.length, { message: "rule ids must be unique" });

export type RuleRecord = z.infer<typeof RuleSchema>;
export type RuleKind = RuleRecord["kind"];
export type RequirementsRecord = z.infer<typeof RequirementsSchema>;
export type Coverage = RequirementsRecord["coverage"];
```

### 7. `src/data-schema/profile.ts` (student profile; personal data, never logged)

```ts
export const PROFILE_SCHEMA_VERSION = 1;
export const GradeValueSchema = z.strictObject({ scale: SlugSchema, value: z.number() });
export const BudgetSchema = z.strictObject({
  amountMinor: z.number().int().nonnegative(), currency: CurrencySchema, period: z.enum(["month", "year"]),
});
export const ProfileSchema = z.strictObject({
  schemaVersion: z.literal(1),
  nationality: CountryCodeSchema,
  credential: z.strictObject({
    country: CountryCodeSchema,
    type: SlugSchema,
    track: SlugSchema,
    status: z.enum(["obtained", "expected"]),
    overall: GradeValueSchema.nullable(),
    subjects: z.array(z.strictObject({ subject: SlugSchema, grade: GradeValueSchema })),
  }),
  priorHigherEducationYears: z.number().int().min(0).max(3),
  languages: z.array(z.strictObject({
    language: LanguageCodeSchema,
    level: z.union([CefrSchema, z.literal("unknown")]),
    certificate: SlugSchema.nullable(),
  })),
  fields: z.array(SlugSchema).min(1),
  studyLanguages: z.array(LanguageCodeSchema),
  destinations: z.array(CountryCodeSchema),          // empty = all destinations
  budget: BudgetSchema.nullable(),
  institutionType: z.enum(["public", "private", "any"]),
}).superRefine(/* unique credential.subjects[].subject; unique languages[].language */);

export type GradeValue = z.infer<typeof GradeValueSchema>;
export type Budget = z.infer<typeof BudgetSchema>;
export type Profile = z.infer<typeof ProfileSchema>;
```

### 8. Raw records: `src/data-schema/records/*.ts`

Each file exports `XxxRecordSchema` and `type XxxRecord`. Every record is `z.strictObject`. The id is `slug`, except for Country, whose id is `code`. The YAML filename (without `.yaml`) equals the id.

| File / collection dir | Schema fields |
|---|---|
| `country.ts` / `countries` | `code: CountryCode, name: LocalizedText, currency: Currency` (vocabulary, no provenance) |
| `field.ts` / `fields` | `slug, name: LocalizedText` (vocabulary) |
| `subject.ts` / `subjects` | `slug, name: LocalizedText` (vocabulary) |
| `language-certificate.ts` / `language-certificates` | `slug, name: string (official), language: LanguageCode, url: HttpsUrl` (vocabulary) |
| `grading-scale.ts` / `grading-scales` | `slug, country: CountryCode\|null, min: number, max: number, pass: number, direction: "higher_better"\|"lower_better", ...RecordProvenanceShape, sources`; refine `min < max`, `min <= pass <= max` |
| `grade-conversion.ts` / `grade-conversions` | `slug, from: Slug, to: Slug, method` (discriminated on `method`, see below), `...RecordProvenanceShape, sources` |
| `credential-type.ts` / `credential-types` | `slug, country, name: string (official, never translated), gloss: LocalizedText, gradingScale: Slug, tracks: Array<{slug, name: string, gloss?: LocalizedText, subjects: Slug[] \| null}>.min(1), ...RecordProvenanceShape, sources` |
| `application-channel.ts` / `application-channels` | `slug, name: string, country, kind: "national_portal"\|"intermediary"\|"direct", url: HttpsUrl, accountRequired: boolean\|null, summary: LocalizedText, ...RecordProvenanceShape, sources` |
| `admission-route.ts` / `admission-routes` | `slug, origin: CountryCode, credentialType: Slug, destination: CountryCode, level: "bachelor", outcome: "direct"\|"foundation"\|"not_eligible"\|"check", conditions: RuleRecord[] (default []), note?: LocalizedText, applicationChannels: Slug[], ...RecordProvenanceShape, sources` |
| `institution.ts` / `institutions` | `slug, name: string, country, city: {slug, name: string}, type: "public"\|"private", website: HttpsUrl, ...RecordProvenanceShape, sources` |
| `program.ts` / `programs` | see below |
| `cost-profile.ts` / `cost-profiles` | `slug, country, city: Slug\|null, lines: {housing?, food?, transport?, insurance?, application_visa?, setup?}` each `stableFact(CostAmountSchema)`, `sources` |
| `scholarship.ts` / `scholarships` | see below |

```ts
// grade-conversion.ts
export const GradeConversionMethodSchema = z.discriminatedUnion("method", [
  z.strictObject({ method: z.literal("identity"), params: z.strictObject({}) }),
  z.strictObject({ method: z.literal("linear"), params: z.strictObject({ fromMin: z.number(), fromMax: z.number(), toMin: z.number(), toMax: z.number() }) }),
  z.strictObject({ method: z.literal("modified_bavarian"), params: z.strictObject({ nMax: z.number(), nMin: z.number(), truncateDecimals: z.number().int().min(0).nullable() }) }),
]);
// record: { slug, from, to, conversion: GradeConversionMethodSchema, source, info_kind, sources }
export type GradeConversionMethod = z.infer<typeof GradeConversionMethodSchema>;
// linear: to = toMin + (v - fromMin) * (toMax - toMin) / (fromMax - fromMin)
// modified_bavarian: to = 1 + 3 * (nMax - v) / (nMax - nMin), then truncated (not rounded) to truncateDecimals if non-null

// program.ts
export const TuitionSchema = z.strictObject({ amountMinor: MinorAmountSchema, currency: CurrencySchema, period: z.enum(["year", "semester"]) });
export const IntakeSchema = z.strictObject({ startDate: IsoDateSchema.nullable(), applicationOpens: IsoDateSchema.nullable(), applicationDeadline: IsoDateSchema.nullable() });
export const DocumentSchema = z.strictObject({ slug: SlugSchema, name: LocalizedTextSchema, translationRequired: z.boolean().nullable() });
export const ProgramRecordSchema = z.strictObject({
  slug: SlugSchema, institution: SlugSchema, country: CountryCodeSchema, city: SlugSchema, field: SlugSchema,
  level: z.literal("bachelor"), name: z.string().min(1), summary: LocalizedTextSchema, officialUrl: HttpsUrlSchema,
  durationYears: stableFact(z.number().positive()),
  teachingLanguages: stableFact(z.array(LanguageCodeSchema).min(1)),
  tuition: volatileFact(TuitionSchema),
  intakes: volatileFact(z.array(IntakeSchema)),
  applicationChannel: stableFact(SlugSchema),
  documents: stableFact(z.array(DocumentSchema)),
  requirements: RequirementsSchema,
  scholarships: z.array(SlugSchema),
  sources: SourcesSchema,
});
export type Tuition = z.infer<typeof TuitionSchema>;
export type Intake = z.infer<typeof IntakeSchema>;

// cost-profile.ts
export const LIVING_COST_CATEGORIES = ["housing", "food", "transport", "insurance", "application_visa", "setup"] as const;
export const CostAmountSchema = z.strictObject({ min: MinorAmountSchema, max: MinorAmountSchema, currency: CurrencySchema, per: z.enum(["month", "year", "once"]) })
  .refine((a) => a.min <= a.max);
export type LivingCostCategory = (typeof LIVING_COST_CATEGORIES)[number];
export type CostAmount = z.infer<typeof CostAmountSchema>;

// scholarship.ts
export const SUPPORT_COVERS = ["tuition", "living", "housing", "travel", "insurance", "other"] as const;
export const ScholarshipSupportSchema = z.strictObject({
  amount: z.strictObject({ min: MinorAmountSchema, max: MinorAmountSchema, currency: CurrencySchema, per: z.enum(["month", "year", "once", "total"]) }).nullable(),
  covers: z.array(z.enum(SUPPORT_COVERS)),
});
export const ScholarshipRecordSchema = z.strictObject({
  slug, name: z.string().min(1), provider: z.string().min(1),
  destinations: z.array(CountryCodeSchema).min(1),
  eligibleNationalities: z.array(CountryCodeSchema),   // empty = any
  fields: z.array(SlugSchema),                          // empty = any
  level: z.literal("bachelor"),
  summary: LocalizedTextSchema,
  support: volatileFact(ScholarshipSupportSchema),
  deadline: volatileFact(IsoDateSchema),
  requirements: RequirementsSchema,
  documents: stableFact(z.array(DocumentSchema)),
  howToApply: LocalizedTextSchema,
  officialUrl: HttpsUrlSchema,
  sources: SourcesSchema,
});
export type ScholarshipSupport = z.infer<typeof ScholarshipSupportSchema>;
```
`records/collections.ts` exports `COLLECTIONS`, an ordered map from collection dir name to `{ schema, idKey: "slug" | "code" }`, covering the 13 collections above. The collection is the first path segment under `data/`. Deeper folders are organisational only.

**Referential checks (data:check, M1):** program → institution/field/channel/scholarships; program.country/city consistent with the institution; route → credentialType/channels; rule `scale`, `subject`, `acceptedTests` and track slugs exist; conversion `from`/`to` scales exist; `(origin, credentialType, destination, level)` unique across routes; `(from, to)` unique across grade conversions (and refine: linear `fromMin !== fromMax`, modified_bavarian `nMax !== nMin`); at most one cost profile per `(country, city)`; credential-type `gradingScale` and track `subjects` exist; rule `types` are credential-types; every CountryCode field exists in `countries` (route origin/destination; country of institution, program, channel, credential type and cost profile; non-null grading-scale country; scholarship `destinations` and `eligibleNationalities`); scholarship `fields` are fields. Uniqueness refines: track slugs within a credential type; document slugs within a `documents` value.

### 9. `src/data-schema/resolved.ts` (types only; what shards contain and what the domain consumes)

```ts
import type { IsoDate } from "./dates";
import type { StalenessClass } from "./staleness";
import type { Cefr, CountryCode, Currency, InfoKind, LanguageCode, Slug } from "./primitives";
import type { GradeConversionMethod } from "./records/grade-conversion";
import type { Intake, Tuition } from "./records/program";
import type { CostAmount, LivingCostCategory } from "./records/cost-profile";
import type { ScholarshipSupport } from "./records/scholarship";
import type { Coverage } from "./rules";

// "<collection>/<id>#<dotted.path>", e.g. "programs/xx-test-prog#summary",
// "programs/xx-test-prog#documents.0.name", "programs/xx-test-prog#requirements.rules.r-math.note"
export type TextKey = string;

export type FactMeta = {
  source_url: string;
  info_kind: InfoKind;
  last_verified_at: IsoDate;
  class: StalenessClass;
  basis?: TextKey;
};
export type ResolvedFact<T> = FactMeta & { value: T | null };

type RuleBase = { id: Slug; fact: FactMeta };          // rule facts are class "stable"
export type ResolvedRule =
  | (RuleBase & { kind: "credential_type_in"; types: Slug[] })
  | (RuleBase & { kind: "credential_track_in"; tracks: Slug[] })
  | (RuleBase & { kind: "overall_grade_min"; scale: Slug; threshold: number | null })
  | (RuleBase & { kind: "subject_grade_min"; subject: Slug; scale: Slug; threshold: number | null })
  | (RuleBase & { kind: "subject_taken"; subjects: Slug[]; mode: "all" | "any" })
  | (RuleBase & { kind: "language_proficiency"; language: LanguageCode; minCefr: Cefr | null; certificateRequired: boolean | null; acceptedTests: Slug[] })
  | (RuleBase & { kind: "prior_study_years_min"; years: number })
  | (RuleBase & { kind: "manual_check"; note: TextKey });
export type ResolvedRequirements = { coverage: Coverage; fact: FactMeta; rules: ResolvedRule[] };

export type RouteOutcome = "direct" | "foundation" | "not_eligible" | "check";
export type ResolvedDocument = { slug: Slug; name: TextKey; translationRequired: boolean | null };

export type Country = { code: CountryCode; name: TextKey; currency: Currency };
export type Field = { slug: Slug; name: TextKey };
export type Subject = { slug: Slug; name: TextKey };
export type LanguageCertificate = { slug: Slug; name: string; language: LanguageCode; url: string };
export type GradingScale = { slug: Slug; country: CountryCode | null; min: number; max: number; pass: number;
  direction: "higher_better" | "lower_better"; fact: FactMeta };
export type GradeConversion = { slug: Slug; from: Slug; to: Slug; conversion: GradeConversionMethod; fact: FactMeta };
export type CredentialTrack = { slug: Slug; name: string; gloss: TextKey | null; subjects: Slug[] | null };
export type CredentialType = { slug: Slug; country: CountryCode; name: string; gloss: TextKey; gradingScale: Slug;
  tracks: CredentialTrack[]; fact: FactMeta };
export type ApplicationChannel = { slug: Slug; name: string; country: CountryCode;
  kind: "national_portal" | "intermediary" | "direct"; url: string; accountRequired: boolean | null; summary: TextKey; fact: FactMeta };
export type AdmissionRoute = { slug: Slug; origin: CountryCode; credentialType: Slug; destination: CountryCode; level: "bachelor";
  outcome: RouteOutcome; conditions: ResolvedRule[]; note: TextKey | null; applicationChannels: Slug[]; fact: FactMeta };
export type Institution = { slug: Slug; name: string; country: CountryCode; city: { slug: Slug; name: string };
  type: "public" | "private"; website: string; fact: FactMeta };
export type Program = {
  slug: Slug; institution: Slug; institutionType: "public" | "private";   // denormalised from institution
  country: CountryCode; city: Slug; field: Slug; level: "bachelor"; name: string; summary: TextKey; officialUrl: string;
  durationYears: ResolvedFact<number>; teachingLanguages: ResolvedFact<LanguageCode[]>;
  tuition: ResolvedFact<Tuition>; intakes: ResolvedFact<Intake[]>; applicationChannel: ResolvedFact<Slug>;
  documents: ResolvedFact<ResolvedDocument[]>; requirements: ResolvedRequirements; scholarships: Slug[];
};
export type CostProfile = { slug: Slug; country: CountryCode; city: Slug | null;
  lines: Partial<Record<LivingCostCategory, ResolvedFact<CostAmount>>> };
export type Scholarship = {
  slug: Slug; name: string; provider: string; destinations: CountryCode[]; eligibleNationalities: CountryCode[];
  fields: Slug[]; level: "bachelor"; summary: TextKey; support: ResolvedFact<ScholarshipSupport>;
  deadline: ResolvedFact<IsoDate>; requirements: ResolvedRequirements; documents: ResolvedFact<ResolvedDocument[]>;
  howToApply: TextKey; officialUrl: string;
};
export type TextEntry = { text: string; status: "draft" | "reviewed"; fallback: boolean }; // fallback: fr substituted
```
**Resolution (M1):** `source` key plus the record's `sources[key]` become `source_url` and `last_verified_at`. `class` is taken from the factory. Record-level provenance becomes `fact` with class `"stable"`. Every `LocalizedText` becomes its `TextKey`, and its entries go into the text shards. `basis` becomes a TextKey. Resolution is written explicitly per record type, not by structural walking. Top-level record arrays in each shard are sorted by id (`slug`, or `code` for countries); nested arrays (rules, conditions, documents, intakes, tracks, lists of slugs) keep data order.

### 10. `src/data-schema/snapshot.ts`

```ts
export const SNAPSHOT_FORMAT_VERSION = 1;
export const SHARD_GZIP_BUDGET_BYTES = 300 * 1024;        // build fails above this
export const shardNames = {
  core: () => "core",
  routes: (origin: CountryCode) => `routes.${origin}`,
  institutions: (destination: CountryCode) => `institutions.${destination}`,
  costs: (destination: CountryCode) => `costs.${destination}`,
  programs: (destination: CountryCode, field: Slug) => `programs.${destination}.${field}`,
  scholarships: (destination: CountryCode) => `scholarships.${destination}`,
  text: (locale: Locale, shard: string) => `text.${locale}.${shard}`,
} as const;

export type CoreShard = { kind: "core"; countries: Country[]; fields: Field[]; subjects: Subject[];
  languageCertificates: LanguageCertificate[]; gradingScales: GradingScale[]; gradeConversions: GradeConversion[];
  credentialTypes: CredentialType[]; applicationChannels: ApplicationChannel[] };
export type RoutesShard = { kind: "routes"; origin: CountryCode; routes: AdmissionRoute[] };
export type InstitutionsShard = { kind: "institutions"; destination: CountryCode; institutions: Institution[] };
export type CostsShard = { kind: "costs"; destination: CountryCode; profiles: CostProfile[] };
export type ProgramsShard = { kind: "programs"; destination: CountryCode; field: Slug; programs: Program[] };
export type ScholarshipsShard = { kind: "scholarships"; destination: CountryCode; scholarships: Scholarship[] }; // multi-destination scholarships are duplicated
export type TextShard = { kind: "text"; locale: Locale; shard: string; entries: Record<TextKey, TextEntry> };
export type Shard = CoreShard | RoutesShard | InstitutionsShard | CostsShard | ProgramsShard | ScholarshipsShard | TextShard;

export const ManifestShardSchema = z.strictObject({
  file: z.string().regex(/^s\/[A-Za-z0-9.-]+\.[0-9a-f]{12}\.json$/),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  bytes: z.number().int().positive(),
  gzipBytes: z.number().int().positive(),
});
export const ManifestSchema = z.strictObject({
  formatVersion: z.literal(1),
  snapshotVersion: z.string().regex(/^[0-9a-f]{12}$/),
  generatedAt: z.string(),                // ISO 8601 datetime; excluded from all hashes
  locales: z.array(LocaleSchema).min(1),  // always ["fr","en","ar"]
  shards: z.record(z.string(), ManifestShardSchema),
});
export type Manifest = z.infer<typeof ManifestSchema>;
```
**Build rules (M1):**
- Shard file bytes are the canonical JSON (keys sorted recursively, no whitespace, UTF-8, no trailing newline).
- `sha256` is computed over those bytes, and the filename uses its first 12 hex characters.
- `snapshotVersion` is the first 12 hex characters of sha256(canonical JSON of `{shardName: sha256}`).
- Text shards are emitted only when they have at least one entry. Missing `en`/`ar` text uses `fr` with `fallback: true`.
- An empty `data/` gives exactly one shard (`core`, with empty arrays).
- Before writing, `out-dir/s/` is cleared so only the current version remains.
- Both scripts accept `--data-dir` (default `data`) and `--out-dir` (default `public/snapshots`). `data:check` prints `0 records` on empty data and exits 0.
- Both scripts also accept `--now <YYYY-MM-DD>` (default: today's UTC date) for freshness and future-date checks; `data:check` also accepts `--strict` (exit 1 if any fact is stale). Exit codes: 0 ok, 1 invalid data / strict stale / build failure, 2 usage error.
- Text shards are per structural shard (`text.<locale>.<structuralShardName>`); the TextKeys of a record appear in the text shard of every structural shard that contains the record (multi-destination scholarships are duplicated). Text for country/field/subject names, credential glosses and channel summaries goes in `text.<locale>.core`.

### 11. Domain outputs and signatures: `src/domain/*` (M2)

```ts
// types.ts
import type { Freshness, StalenessClass } from "@/data-schema/staleness";
import type { IsoDate } from "@/data-schema/dates";
import type { InfoKind, Slug, Currency } from "@/data-schema/primitives";
import type { GradeValue } from "@/data-schema/profile";
import type { Intake } from "@/data-schema/records/program";
import type { ResolvedRule, RouteOutcome, TextKey } from "@/data-schema/resolved";

export type FactRef = { record: string /* "<collection>/<id>" */; path: string /* e.g. "tuition", "requirements.rules.r-math" */;
  source_url: string; last_verified_at: IsoDate; info_kind: InfoKind; class: StalenessClass; freshness: Freshness;
  basis?: TextKey /* copied from FactMeta.basis */ };
// Record-level provenance FactRefs (grading-scales, grade-conversions, credential-types, admission-routes, application-channels) use path "".
// Rule FactRef path = `${pathPrefix}.${rule.id}`.

export type MatchStatus = "satisfied" | "check" | "not_satisfied";   // UI maps to ✅ ⚠️ ❌
export type RuleOutcome = "pass" | "fail" | "unknown";
export type ReasonCode =
  | "ok" | "below_threshold" | "track_not_accepted" | "missing_student_value" | "threshold_unpublished"
  | "no_scale_conversion" | "stale_source" | "non_official_source" | "route_foundation" | "route_not_eligible"
  | "route_check" | "coverage_partial" | "manual_check";
export type ReasonKind = ResolvedRule["kind"] | "route" | "coverage";
export type ReasonValue = string | number | boolean | readonly string[] | GradeValue;
export type Reason = {
  ruleId: string;               // rule id; "route"; "route:<conditionId>"; or "coverage"
  kind: ReasonKind; outcome: RuleOutcome; code: ReasonCode;
  student?: ReasonValue; studentConverted?: GradeValue; required?: ReasonValue; note?: TextKey;
  facts: FactRef[];
};
export type MatchResult = { programSlug: Slug; status: MatchStatus; route: RouteOutcome | "missing"; reasons: Reason[] };

export type CostCategory = "tuition" | "housing" | "food" | "transport" | "insurance" | "application_visa" | "setup";
export type CostLine = { category: CostCategory; status: "ok" | "missing";
  firstYear: { min: number; max: number; currency: Currency } | null;   // minor units
  per: "month" | "year" | "semester" | "once" | null; scope: "program" | "city" | "country" | null; fact: FactRef | null };
export type BudgetFit = "within" | "straddles" | "above" | "unknown";
export type CostEstimate = { programSlug: Slug; lines: CostLine[] /* 7, fixed order above */;
  totals: Array<{ min: number; max: number; currency: Currency }>; complete: boolean; budgetFit: BudgetFit;
  academicYearMonths: number /* 10: monthly lines are multiplied by this (decision 2026-09-29) */ };

export const CHECKLIST_STEP_IDS = ["documents", "translation", "language_exam", "application_account", "submit",
  "scholarships", "financial_documents", "accommodation", "visa", "departure"] as const;
export type ChecklistStepId = (typeof CHECKLIST_STEP_IDS)[number];
export type ChecklistReasonCode = "applies" | "unknown_data" | "not_required_by_source" | "certificate_held"
  | "no_account_required" | "no_scholarships_listed";
export type ChecklistStep = { id: ChecklistStepId; status: "todo" | "skipped"; reason: ChecklistReasonCode; facts: FactRef[];
  deadline?: IsoDate | null; channel?: Slug | null; scholarships?: Slug[] };
export type Checklist = { programSlug: Slug; steps: ChecklistStep[] /* always 10, CHECKLIST_STEP_IDS order */ };

export type IntakeStatus =
  | { kind: "upcoming"; intake: Intake; fact: FactRef }
  | { kind: "closed"; fact: FactRef }              // UI: "Closed — next dates not yet published"
  | { kind: "unknown"; fact: FactRef | null };
```

```ts
// facts.ts
export function toFactRef(record: string, path: string, meta: FactMeta, now: IsoDate): FactRef;
export function isDecisive(meta: FactMeta, now: IsoDate): boolean;  // info_kind === "official" && freshness !== "stale"
// cefr.ts
export const CEFR_ORDER: readonly Cefr[];  export function cefrAtLeast(level: Cefr, min: Cefr): boolean;
// grades.ts
export type GradeConversionResult = { kind: "same_scale"; value: GradeValue } | { kind: "converted"; value: GradeValue; via: GradeConversion } | { kind: "no_conversion" };
export function convertGrade(grade: GradeValue, toScale: Slug, conversions: readonly GradeConversion[]): GradeConversionResult; // direct conversions only, no chaining
// route.ts
export function resolveRoute(profile: Profile, destination: CountryCode, routes: readonly AdmissionRoute[]): AdmissionRoute | null;
  // matches origin = profile.credential.country, credentialType = profile.credential.type, destination, level "bachelor"
// rules.ts
export type RuleContext = { profile: Profile; credentialTypes: readonly CredentialType[]; gradingScales: readonly GradingScale[];
  gradeConversions: readonly GradeConversion[]; record: string; pathPrefix: string; now: IsoDate };
export function evaluateRules(rules: readonly ResolvedRule[], ctx: RuleContext): Reason[];  // one Reason per rule, same order
// match.ts
export type MatchReference = Pick<CoreShard, "credentialTypes" | "gradingScales" | "gradeConversions">;
export type MatchInput = { profile: Profile; program: Program; routes: readonly AdmissionRoute[]; reference: MatchReference; now: IsoDate };
export function matchProgram(input: MatchInput): MatchResult;
export function aggregateMatchStatus(reasons: readonly Reason[]): MatchStatus; // any fail → not_satisfied; else any unknown → check; else satisfied
// intakes.ts
export function nextIntake(program: Program, now: IsoDate): IntakeStatus;
// filter.ts (added 2026-09-29; see Part C T16A)
export type PreferenceMismatch = "destination" | "field" | "institution_type" | "study_language";
export type ProgramFilterResult = { kept: Program[]; excluded: Array<{ programSlug: Slug; mismatches: PreferenceMismatch[] }> };
export function preferenceMismatches(profile: Profile, program: Program, now: IsoDate): PreferenceMismatch[];
export function filterPrograms(profile: Profile, programs: readonly Program[], now: IsoDate): ProgramFilterResult;
  // hides a program only on a definite mismatch: destinations (empty=all), fields, institutionType (any=all),
  // study language only when teachingLanguages is non-null AND decisive (official, not stale). Budget is not a filter.
// costs.ts
export type CostInput = { program: Program; costProfiles: readonly CostProfile[]; budget: Budget | null; now: IsoDate };
export function estimateCost(input: CostInput): CostEstimate;
// scholarships.ts
export function scholarshipsForProgram(profile: Profile, program: Program, scholarships: readonly Scholarship[]): Scholarship[];
// checklist.ts
export type ChecklistInput = { profile: Profile; program: Program; match: MatchResult; channel: ApplicationChannel | null;
  scholarships: readonly Scholarship[]; now: IsoDate };
export function generateChecklist(input: ChecklistInput): Checklist;
```

**Normative semantics (M2 tests must encode these):**
- **Decisiveness and downgrade.**
  - A rule outcome of `pass` or `fail` becomes `unknown` if any fact it relied on is not decisive. Relied-on facts are: the rule's own fact, the target grading scale's fact, the conversion's fact if one was used, and the credential type's fact when `subject_taken` fails from a curriculum.
  - The downgrade code is `stale_source` if any of those facts is stale, otherwise `non_official_source`.
  - An `unknown` produced by the rule itself keeps its own code.
  - Every relied-on fact appears in `Reason.facts`.
- **Rule evaluation (before downgrade).**
  - `credential_type_in`: pass if `credential.type ∈ types`, else fail with `track_not_accepted`.
  - `credential_track_in`: pass if `credential.track ∈ tracks`, else fail with `track_not_accepted`.
  - `overall_grade_min` and `subject_grade_min`:
    - Missing student value (`overall` null, or no subject entry): unknown `missing_student_value`.
    - `threshold` null: unknown `threshold_unpublished`.
    - Rule scale unknown or no conversion: unknown `no_scale_conversion`.
    - Otherwise compare using the target scale `direction` (`>=` for higher_better, `<=` for lower_better). Pass gives `ok`; fail gives `below_threshold`.
    - If `credential.status === "expected"`, pass/fail becomes unknown `missing_student_value`.
  - `subject_taken`:
    - Pass (`ok`) if the student's subjects satisfy `mode`.
    - Otherwise, if the student's track has non-null `subjects` that do not satisfy `mode`: fail `track_not_accepted`.
    - Otherwise unknown `missing_student_value`.
  - `language_proficiency`:
    - No profile entry for the language, or level `"unknown"`: unknown `missing_student_value`.
    - `minCefr` null: unknown `threshold_unpublished`.
    - Level below `minCefr`: fail `below_threshold`.
    - Then by `certificateRequired`:
      - `true`: pass if the student's certificate is in `acceptedTests` (or `acceptedTests` is empty and the certificate is non-null); otherwise unknown `missing_student_value`.
      - `null`: unknown `threshold_unpublished`.
      - `false`: pass `ok`.
  - `prior_study_years_min`: pass if `priorHigherEducationYears >= years`, else fail `below_threshold`.
  - `manual_check`: always unknown `manual_check`, with `note`.
- **matchProgram.**
  - It resolves the route for `program.country`.
    - Missing route: unknown `route_check`; program rules are still evaluated.
    - `check`: unknown `route_check`; rules are still evaluated.
    - `direct`: pass `ok` (subject to downgrade); rules are evaluated.
    - `foundation`: unknown `route_foundation`; **short-circuit**, so program rules are not evaluated.
    - `not_eligible`: fail `route_not_eligible` if decisive, otherwise unknown with the downgrade code; **short-circuit** in both cases.
  - Route `conditions` are evaluated like rules, with `ruleId` `route:<id>`.
  - Coverage `partial` appends `{ruleId:"coverage", kind:"coverage", outcome:"unknown", code:"coverage_partial", facts:[requirementsRef]}`. If coverage is `complete` but `requirements.fact` is not decisive, the same reason is appended with code `stale_source` / `non_official_source`. Short-circuit results (`foundation`, `not_eligible`) contain only the route reason.
  - Reason order: route, route conditions, program rules in data order, coverage (except on short-circuit).
  - The `expected`-status conversion is applied before the stale/non-official downgrade; the downgrade only affects outcomes still pass/fail.
  - A decisive fail (built only from fresh official facts) yields `not_satisfied` even if other facts in the result are stale: results that depend on a stale fact are downgraded, a fail that does not depend on one stands. (Confirm with product owner.)
- **Costs.**
  - Tuition comes from `program.tuition`: semester × 2, year × 1, null value → `missing`.
  - A cost line is present iff its key exists AND its value is non-null; a null-valued city line falls through to the country line; a missing line reports the null-valued fact (city first) as `fact`/`scope` if one exists, else null.
  - Each living category uses the city profile `(program.country, program.city)` if it has that line, else the country profile (`city: null`), else `missing`.
  - Annualising: month × `ACADEMIC_YEAR_MONTHS` (= 10, a 10-month academic year; decision 2026-09-29), year × 1, once × 1. `CostEstimate.academicYearMonths` exposes the value so the UI states the assumption.
  - `totals` are summed per currency over `ok` lines, with no FX conversion.
  - `complete` means all 7 lines are ok.
  - `budgetFit` is `unknown` if the budget is null, the estimate is incomplete, there is more than one currency, or the currency differs. Otherwise, with the budget annualised (month × `ACADEMIC_YEAR_MONTHS`): `within` if `max <= budget`, `above` if `min > budget`, else `straddles`.
  - Stale facts still count; their freshness is visible in the FactRef. `budgetFit` never affects match status.
- **nextIntake.**
  - `upcoming` is the earliest intake with `applicationDeadline >= now` (inclusive).
  - `closed` means every deadline is before `now`.
  - `unknown` covers a null value, an empty list, or all deadlines null.
- **scholarshipsForProgram.** Nationality filter (`eligibleNationalities` empty or contains `profile.nationality`) applies to all results. Returns the union of `program.scholarships` (nationality-eligible only) and scholarships where `destinations ∋ program.country`, `fields` is empty or contains `program.field`, and `eligibleNationalities` is empty or contains `profile.nationality`. Results are de-duplicated and sorted by slug. Past deadlines are not excluded.
- **Checklist.**
  - `translation` is skipped (`not_required_by_source`) only when the documents value is non-null and non-empty, every `translationRequired === false`, and the fact is decisive.
  - `language_exam` is skipped:
    - with `certificate_held` when at least one `language_proficiency` rule exists, every one is decisive, and the student's certificate for its language is non-null and in its `acceptedTests` (empty `acceptedTests` = any certificate, as in `evaluateRules`); or
    - with `not_required_by_source` when coverage is `complete`, the requirements fact is decisive and there are zero language rules.
  - `application_account` is skipped (`no_account_required`) only when the channel is non-null, `accountRequired === false` and the channel fact is decisive. A null channel gives todo `unknown_data`.
  - `submit` is todo; its `deadline` comes from `nextIntake` when upcoming, else null.
  - `scholarships` is skipped (`no_scholarships_listed`) when the list is empty. The UI wording is "none listed in Jisr".
  - All other steps are todo `applies`, or `unknown_data` when their input fact value is null.
  - Unknown data never produces `skipped`.

### 12. Cross-milestone handoffs
- **M0 → M1:** `package.json` `build` is `next build` after M0. M1 must change it to `pnpm data:check && pnpm data:build && next build`, add `data:check` and `data:build` (run via `tsx`), and add deps `zod`, plus dev deps `tsx` and `yaml`, each justified in the commit. The `@scripts/*` alias already exists (tsconfig and vitest), so tests import `@scripts/data/…`.
- **M0 → M2:** the Biome domain override and the canary test already exist. M2 only adds files under `src/domain/`, flat.
- **M1 → M2:** `scripts/data/build.ts` is directly executable (`node --import tsx scripts/data/build.ts --data-dir <dir> --out-dir <dir>`). `tests/fixtures/data/valid-minimal` contains at least one country pair XA→XB with a credential type (≥1 track), a grading scale, an application channel, an institution, a program, a direct admission route and a cost profile.
- **i18n locale list:** `src/i18n/routing.ts` (M0) and `LOCALES` (M1) must stay equal. M1 adds a test asserting this.

---

## Milestone 0: Foundation

### Task 1: Scaffold Next.js 16 app, repo hygiene, scripts

**Files:**
- Create: `.gitattributes`, `.env.example`, `scripts/not-configured.mjs`, and from the scaffold: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `biome.json`, `src/app/{layout.tsx,page.tsx,globals.css,favicon.ico}`, `public/` (emptied of boilerplate), `pnpm-lock.yaml`, `pnpm-workspace.yaml` (only if generated)
- Modify: `.gitignore`

**Interfaces:**
- Consumes: the existing repo (`.claude/`, `docs/`, `.gitignore`) on branch `feat/foundation`.
- Produces:
  - scripts `dev`, `build` (= `next build` for now), `start`, `typecheck`, `lint`, `format`, `db:generate`, `db:migrate` (stubs exiting 1);
  - tsconfig aliases `@/*` → `./src/*` and `@scripts/*` → `./scripts/*`;
  - `noUncheckedIndexedAccess`;
  - LF line endings.

- [ ] **Step 1: Confirm branch and clean tree**

```bash
cd /c/Users/dagda/Downloads/nex/UniWay
git branch --show-current
git status --short
```
Expected: `feat/foundation`, and empty status output. If the tree is dirty, stop and report.

- [ ] **Step 2: Add `.gitattributes` and renormalise**

Create `.gitattributes`:
```
* text=auto eol=lf
*.ico binary
*.png binary
*.jpg binary
*.woff2 binary
```
```bash
git add .gitattributes && git add --renormalize . && git status --short
```
Expected: `.gitattributes` listed as added, possibly with some renormalised files.
```bash
git commit -F- <<'EOF'
chore: normalise line endings to LF

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 3: Verify create-next-app flags (docs check)**

```bash
MSYS_NO_PATHCONV=1 npx ctx7@latest library "Next.js" "create-next-app CLI options biome src-dir agents-md"
MSYS_NO_PATHCONV=1 npx ctx7@latest docs /vercel/next.js "create-next-app options --biome --no-agents-md --skip-install"
```
As of 2026-08 the documented flags include `--biome`, `--src-dir`, `--app`, `--tailwind`, `--import-alias`, `--use-pnpm`, `--skip-install`, `--disable-git`, `--agents-md` (default on, negate with `--no-agents-md`), `--react-compiler`, `--yes`, and `--no-*` negation. If a flag was renamed, adapt it and note the change in the report.

- [ ] **Step 4: Scaffold into a temp directory (the repo is not empty)**

```bash
SCAFFOLD="$(mktemp -d)"
cd "$SCAFFOLD"
pnpm dlx create-next-app@latest jisr --ts --tailwind --biome --app --src-dir --import-alias "@/*" \
  --use-pnpm --skip-install --disable-git --no-agents-md --no-react-compiler --yes
ls -la "$SCAFFOLD/jisr" "$SCAFFOLD/jisr/src/app" "$SCAFFOLD/jisr/public"
echo "$SCAFFOLD"
```
Expected: a `jisr/` folder with `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `biome.json`, `src/app/…`, `public/*.svg`, and no `node_modules`. It must not contain `AGENTS.md` or `CLAUDE.md`; if either appears, do not copy it.

- [ ] **Step 5: Copy scaffold files into the repo**

```bash
REPO=/c/Users/dagda/Downloads/nex/UniWay
S="$SCAFFOLD/jisr"
cp "$S/package.json" "$S/tsconfig.json" "$S/next.config.ts" "$S/postcss.config.mjs" "$S/biome.json" "$REPO/"
[ -f "$S/pnpm-workspace.yaml" ] && cp "$S/pnpm-workspace.yaml" "$REPO/"
mkdir -p "$REPO/src" "$REPO/public" && cp -r "$S/src/app" "$REPO/src/"
cat "$S/.gitignore"
```
Do **not** copy `README.md`, `.gitignore`, `next-env.d.ts`, `AGENTS.md`, `CLAUDE.md` or `public/*.svg`. The temp dir stays where it is; do not delete it with `rm -rf`.

- [ ] **Step 6: Merge `.gitignore`**

Append the following to the existing `.gitignore` (keep every existing line), and add any other scaffold entries printed in Step 5 that are not already covered:
```
# Next.js scaffold extras
/build
.pnp
.pnp.*
*.pem
npm-debug.log*
.pnpm-debug.log*

# Built data snapshots (pnpm data:build output)
/public/snapshots/
```

- [ ] **Step 7: Edit `package.json`**

Set `"name": "jisr"`, `"version": "0.1.0"`, `"private": true`, `"engines": { "node": ">=24" }`. Keep `dependencies`/`devDependencies` exactly as generated. Replace `scripts` with:
```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "typecheck": "tsc --noEmit",
  "lint": "biome check .",
  "format": "biome format --write .",
  "db:generate": "node scripts/not-configured.mjs db:generate",
  "db:migrate": "node scripts/not-configured.mjs db:migrate"
}
```
If the generated `dev` script had extra flags (for example `--turbopack`), keep them. `test` arrives in T3; `data:*` arrives in M1.

- [ ] **Step 8: Create `scripts/not-configured.mjs`**

```js
const [name = "this command"] = process.argv.slice(2);
console.error(`${name}: not configured until phase 2 (Drizzle)`);
process.exit(1);
```

- [ ] **Step 9: Create `.env.example`**

```
# Jisr environment variables. Copy to .env.local for local overrides; never commit real values.
# The guest release (M0-M2) needs none.
# Phase 2 (accounts, Neon EU, Better Auth) — not used yet:
# DATABASE_URL=
# DATABASE_URL_UNPOOLED=
# BETTER_AUTH_SECRET=
# BETTER_AUTH_URL=
```

- [ ] **Step 10: Tighten `tsconfig.json`**

Keep every generated option and **add** the following in `compilerOptions`:
```json
"noUncheckedIndexedAccess": true,
"noImplicitOverride": true,
"noFallthroughCasesInSwitch": true,
"paths": { "@/*": ["./src/*"], "@scripts/*": ["./scripts/*"] }
```
Also set `"exclude": ["node_modules", "public/snapshots"]`. Confirm `"strict": true` is present.

- [ ] **Step 11: Remove the boilerplate page content**

Replace `src/app/page.tsx` with:
```tsx
export default function Home() {
  return <main>Jisr</main>;
}
```
Leave `src/app/layout.tsx` as generated; T5 replaces it. Delete any `public/*.svg` that were copied: `git ls-files --others public`.

- [ ] **Step 12: Install**

```bash
cd /c/Users/dagda/Downloads/nex/UniWay && pnpm install
```
Expected: installs cleanly. If pnpm prints `Ignored build scripts: <pkgs>`:
1. Look up the setting name: `MSYS_NO_PATHCONV=1 npx ctx7@latest library "pnpm" "onlyBuiltDependencies pnpm-workspace.yaml approve builds"`.
2. Add the listed packages (commonly `sharp`) to that allowlist in `pnpm-workspace.yaml`.
3. Re-run `pnpm install`.

- [ ] **Step 13: Verify**

```bash
pnpm typecheck; echo "exit=$?"
pnpm build
pnpm db:generate; echo "exit=$?"
pnpm db:migrate; echo "exit=$?"
```
Expected:
- `typecheck` prints nothing and `exit=0`.
- `build` ends with the route table and `○ /`, and exits 0.
- Each db stub prints `db:generate: not configured until phase 2 (Drizzle)` (or `db:migrate: …`) and `exit=1`.

`pnpm lint` may still fail here; T2 owns Biome config.

- [ ] **Step 14: Commit**

```bash
git add -A && git status --short
git commit -F- <<'EOF'
chore: scaffold Next.js 16 app with Tailwind v4 and Biome

Add package scripts, strict tsconfig with @/ and @scripts/ aliases,
.env.example, snapshot gitignore and phase-2 db script stubs.

Deps: next, react, react-dom, typescript, tailwindcss, @biomejs/biome are the stack chosen in ADR 0002.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```
Check that `git status --short` showed no `.env` files and no `node_modules` before committing.

---

### Task 2: Biome config and domain boundary override (manual canary)

**Files:**
- Modify: `biome.json` (replace)
- Possibly modify: scaffold files that `biome check --write` reformats

**Interfaces:**
- Consumes: T1 scaffold, including `@biomejs/biome` in devDependencies.
- Produces:
  - `pnpm lint` is green.
  - The domain override covers `src/domain/**`, `src/data-schema/dates.ts` and `src/data-schema/staleness.ts`. It bans React, Next, `@/db`, `@/lib`, `@/components`, `@/app`, `@/i18n`, `@scripts`, `node:*`, `fs`, `zod`, `yaml`, `next-intl` and `../` imports. It also bans the globals `Date`, `fetch`, `window`, `document`, `localStorage`, `sessionStorage`, `navigator`, `process`, `XMLHttpRequest`, `WebSocket`, and `console` (via `noConsole`).
  - Named exports are enforced everywhere except Next/config convention files.

- [ ] **Step 1: Docs check**

```bash
pnpm exec biome --version
MSYS_NO_PATHCONV=1 npx ctx7@latest library "Biome" "overrides includes noRestrictedImports patterns"
MSYS_NO_PATHCONV=1 npx ctx7@latest docs <biomeId> "noRestrictedImports paths patterns group options"
MSYS_NO_PATHCONV=1 npx ctx7@latest docs <biomeId> "noRestrictedGlobals deniedGlobals; lint --stdin-file-path; css parser tailwindDirectives"
```
As of Biome 2.x:
- `overrides[].includes` holds globs.
- `noRestrictedImports` (group `style`) takes `options.paths` (a map from specifier to message) and `options.patterns` (an array of `{ group: string[], message }`, gitignore-style). It also checks `import type`, `import()` and `require()`.
- `noRestrictedGlobals` (group `style`) takes `options.deniedGlobals` as a map from name to message.
- `files.includes` accepts `!folder`.
- `css.parser.tailwindDirectives` exists.

Confirm these against the installed version.

- [ ] **Step 2: Canary before the override (expect NO boundary diagnostic)**

```bash
printf 'import { z } from "zod";\nexport const x = z;\n' | pnpm exec biome lint --stdin-file-path=src/domain/canary.ts; echo "exit=$?"
```
Expected: the output does **not** contain `noRestrictedImports`. This is the "failing" state: the boundary does not exist yet. Note whether stdin mode prints the source back and what exit code it uses; T3 relies on the diagnostics text, not the exit code.

- [ ] **Step 3: Write `biome.json`**

Keep the generated `$schema` value, or use `./node_modules/@biomejs/biome/configuration_schema.json`. Keep any generated `css` block. If there is none and Step 5 reports Tailwind at-rule errors, add `"css": { "parser": { "tailwindDirectives": true } }`.
```json
{
  "$schema": "./node_modules/@biomejs/biome/configuration_schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": {
    "ignoreUnknown": true,
    "includes": ["**", "!.next", "!node_modules", "!public/snapshots", "!.claude", "!pnpm-lock.yaml"]
  },
  "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2, "lineWidth": 100 },
  "javascript": { "formatter": { "quoteStyle": "double" } },
  "assist": { "actions": { "source": { "organizeImports": "on" } } },
  "linter": {
    "enabled": true,
    "domains": { "next": "recommended", "react": "recommended" },
    "rules": {
      "recommended": true,
      "suspicious": { "noExplicitAny": "error", "noTsIgnore": "error" },
      "style": { "noNonNullAssertion": "error", "useImportType": "error", "noDefaultExport": "error" }
    }
  },
  "overrides": [
    {
      "includes": [
        "src/app/**/page.tsx", "src/app/**/layout.tsx", "src/app/**/not-found.tsx", "src/app/**/error.tsx",
        "src/app/**/loading.tsx", "src/app/**/template.tsx", "src/app/**/default.tsx",
        "src/i18n/request.ts", "next.config.ts", "vitest.config.ts", "postcss.config.mjs"
      ],
      "linter": { "rules": { "style": { "noDefaultExport": "off" } } }
    },
    {
      "includes": ["src/domain/**", "src/data-schema/dates.ts", "src/data-schema/staleness.ts"],
      "linter": {
        "rules": {
          "suspicious": { "noConsole": "error" },
          "style": {
            "noRestrictedImports": {
              "level": "error",
              "options": {
                "paths": {
                  "react": "src/domain is pure TS: no React.",
                  "react-dom": "src/domain is pure TS: no React.",
                  "next": "src/domain is pure TS: no Next.",
                  "next-intl": "src/domain is pure TS: no i18n runtime.",
                  "zod": "src/domain consumes already-validated data; import types only from @/data-schema.",
                  "yaml": "src/domain never parses files.",
                  "fs": "src/domain has no filesystem access.",
                  "@/db": "src/domain has no DB access.",
                  "@/lib": "src/domain must not import app libraries.",
                  "@/components": "src/domain must not import UI.",
                  "@/app": "src/domain must not import UI.",
                  "@/i18n": "src/domain must not import i18n runtime."
                },
                "patterns": [
                  {
                    "group": ["react/*", "react-dom/*", "next/*", "next-intl/*", "zod/*", "fs/*", "node:*",
                              "@/db/*", "@/lib/*", "@/components/*", "@/app/*", "@/i18n/*", "@scripts/*"],
                    "message": "src/domain is pure TS: no framework, DB, fs, network or app-layer imports."
                  },
                  {
                    "group": ["../*", "../**"],
                    "message": "src/domain is flat: import siblings with ./ and schemas via @/data-schema (types only)."
                  }
                ]
              }
            },
            "noRestrictedGlobals": {
              "level": "error",
              "options": {
                "deniedGlobals": {
                  "Date": "Pass `now` as an IsoDate; use @/data-schema/dates for arithmetic.",
                  "fetch": "src/domain has no network access.",
                  "XMLHttpRequest": "src/domain has no network access.",
                  "WebSocket": "src/domain has no network access.",
                  "window": "src/domain has no browser access.",
                  "document": "src/domain has no browser access.",
                  "navigator": "src/domain has no browser access.",
                  "localStorage": "src/domain has no storage access.",
                  "sessionStorage": "src/domain has no storage access.",
                  "process": "src/domain has no process/env access."
                }
              }
            }
          }
        }
      }
    }
  ]
}
```

- [ ] **Step 4: Canary after the override (expect diagnostics)**

Run each command and check its output against the expectation that follows it:
```bash
printf 'import { z } from "zod";\nexport const x = z;\n' | pnpm exec biome lint --stdin-file-path=src/domain/canary.ts
```
Expected: contains `noRestrictedImports`.
```bash
printf 'import { readFileSync } from "node:fs";\nexport const x = readFileSync;\n' | pnpm exec biome lint --stdin-file-path=src/domain/canary.ts
```
Expected: contains `noRestrictedImports`.
```bash
printf 'import { y } from "../lib/utils";\nexport const x = y;\n' | pnpm exec biome lint --stdin-file-path=src/domain/canary.ts
```
Expected: contains `noRestrictedImports`.
```bash
printf 'export const t = new Date();\n' | pnpm exec biome lint --stdin-file-path=src/domain/canary.ts
```
Expected: contains `noRestrictedGlobals`.
```bash
printf 'export const t = new Date();\n' | pnpm exec biome lint --stdin-file-path=src/data-schema/dates.ts
```
Expected: contains `noRestrictedGlobals`.
```bash
printf 'import { z } from "zod";\nexport const x = z;\n' | pnpm exec biome lint --stdin-file-path=src/lib/canary.ts
```
Expected: does NOT contain `noRestrictedImports` (the control case).

If a case fails:
- **`node:*` or `../` not matched:** try the alternative glob forms from the docs (for example `"node:**"`). If `../` still cannot be expressed, drop that group and write it down in the task report.
- **stdin ignores overrides:** stop and report. The fallback is a temp file under `src/domain/`, decided by the main thread.

- [ ] **Step 5: Apply formatting and imports to the scaffold, then lint**

```bash
pnpm exec biome check --write .
pnpm lint; echo "exit=$?"
pnpm typecheck
```
Expected: `Checked N files in …ms. No fixes applied.` and `exit=0`. Fix any remaining diagnostics in scaffold files properly; do not disable rules. For Tailwind at-rules in `globals.css`, see Step 3.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -F- <<'EOF'
chore: configure Biome with pure-domain import boundary

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Vitest and the domain boundary canary test

**Files:**
- Create: `vitest.config.ts`, `tests/domain/boundary.test.ts`
- Modify: `package.json` (add the `test` script and the `vitest` devDependency)

**Interfaces:**
- Consumes: the T2 `biome.json` override (paths `src/domain/**`, `src/data-schema/dates.ts`, `src/data-schema/staleness.ts`).
- Produces:
  - `pnpm test` = `vitest run`, with tests in `tests/**/*.test.ts` and a node environment.
  - Aliases `@/` → `src/` and `@scripts/` → `scripts/`.
  - A canary that fails if the domain boundary stops firing, plus a scan that rejects runtime imports from non-pure `@/data-schema` modules inside `src/domain`.

- [ ] **Step 1: Docs check**

```bash
MSYS_NO_PATHCONV=1 npx ctx7@latest library "Vitest" "defineConfig resolve.alias include environment"
MSYS_NO_PATHCONV=1 npx ctx7@latest docs <vitestId> "vitest.config.ts defineConfig resolve alias test.include describe options timeout"
```

- [ ] **Step 2: Write the failing test first**

Create `tests/domain/boundary.test.ts`:
```ts
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const BIOME_BIN = path.join(ROOT, "node_modules", "@biomejs", "biome", "bin", "biome");
const PURE_DATA_SCHEMA_MODULES = new Set(["@/data-schema/dates", "@/data-schema/staleness"]);
const IMPORT_RE = /^\s*(?:import|export)\s+(type\s+)?[^;]*?\sfrom\s+["']([^"']+)["']/gm;

function lintAs(virtualPath: string, source: string): string {
  const result = spawnSync(process.execPath, [BIOME_BIN, "lint", `--stdin-file-path=${virtualPath}`], {
    cwd: ROOT,
    input: source,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  return `${result.stdout}\n${result.stderr}`;
}

function findDataSchemaValueImports(source: string): string[] {
  const hits: string[] = [];
  for (const match of source.matchAll(IMPORT_RE)) {
    const typeKeyword = match[1];
    const specifier = match[2];
    if (specifier === undefined || !specifier.startsWith("@/data-schema")) continue;
    if (typeKeyword !== undefined || PURE_DATA_SCHEMA_MODULES.has(specifier)) continue;
    hits.push(specifier);
  }
  return hits;
}

function domainSourceFiles(): string[] {
  const dir = path.join(ROOT, "src", "domain");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"))
    .map((file) => path.join(dir, file));
}

const FORBIDDEN_IN_DOMAIN: ReadonlyArray<readonly [string, string]> = [
  ["react", 'import { useState } from "react";\nexport const x = useState;\n'],
  ["next/*", 'import Link from "next/link";\nexport const x = Link;\n'],
  ["zod", 'import { z } from "zod";\nexport const x = z;\n'],
  ["@/db", 'import { db } from "@/db";\nexport const x = db;\n'],
  ["@/lib/*", 'import { cn } from "@/lib/utils";\nexport const x = cn;\n'],
  ["node:*", 'import { readFileSync } from "node:fs";\nexport const x = readFileSync;\n'],
  ["fs", 'import { readFileSync } from "fs";\nexport const x = readFileSync;\n'],
  ["../ escape", 'import { y } from "../lib/utils";\nexport const x = y;\n'],
];

describe("domain import boundary (Biome override canary)", { timeout: 60_000 }, () => {
  it.each(FORBIDDEN_IN_DOMAIN)("rejects %s imports inside src/domain", (_label, source) => {
    expect(lintAs("src/domain/canary.ts", source)).toContain("noRestrictedImports");
  });

  it("rejects the Date global inside src/domain", () => {
    expect(lintAs("src/domain/canary.ts", "export const t = new Date();\n")).toContain("noRestrictedGlobals");
  });

  it("rejects the Date global inside the pure data-schema date module", () => {
    expect(lintAs("src/data-schema/dates.ts", "export const t = Date.now();\n")).toContain("noRestrictedGlobals");
  });

  it("allows type imports from data-schema and value imports from the pure date modules", () => {
    const source = [
      'import type { Profile } from "@/data-schema/profile";',
      'import { addDays } from "@/data-schema/dates";',
      'import { freshnessOf } from "@/data-schema/staleness";',
      "export const f = (p: Profile) => [p, addDays, freshnessOf];",
      "",
    ].join("\n");
    expect(lintAs("src/domain/canary.ts", source)).not.toContain("noRestrictedImports");
  });

  it("does not apply the domain ban outside src/domain", () => {
    expect(lintAs("src/lib/canary.ts", 'import { z } from "zod";\nexport const x = z;\n')).not.toContain(
      "noRestrictedImports",
    );
  });
});

describe("domain runtime imports from data-schema", () => {
  it("flags a value import from a schema module", () => {
    expect(findDataSchemaValueImports('import { ProfileSchema } from "@/data-schema/profile";')).toEqual([
      "@/data-schema/profile",
    ]);
  });

  it("accepts type imports and the pure date modules", () => {
    const source = 'import type { Profile } from "@/data-schema/profile";\nimport { addDays } from "@/data-schema/dates";\n';
    expect(findDataSchemaValueImports(source)).toEqual([]);
  });

  it("finds no value imports from non-pure data-schema modules in src/domain", () => {
    const offenders = domainSourceFiles().flatMap((file) =>
      findDataSchemaValueImports(readFileSync(file, "utf8")).map((spec) => `${path.relative(ROOT, file)} -> ${spec}`),
    );
    expect(offenders).toEqual([]);
  });
});
```
If T2 dropped the `../` pattern, remove that row and keep a note.

- [ ] **Step 3: Run it and expect FAIL (no runner)**

```bash
pnpm test; echo "exit=$?"
```
Expected: `ERR_PNPM_NO_SCRIPT` / `Missing script: test` and a non-zero exit.

- [ ] **Step 4: Install Vitest and configure it**

```bash
pnpm add -D vitest
```
Create `vitest.config.ts`:
```ts
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@scripts": fileURLToPath(new URL("./scripts", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
```
Add `"test": "vitest run"` to `package.json` scripts.

- [ ] **Step 5: Run and expect PASS**

```bash
pnpm test
```
Expected: `Test Files  1 passed (1)`, with every test passing.

- [ ] **Step 6: Prove the canary can fail**

1. In `biome.json`, temporarily change `"src/domain/**"` to `"src/domainx/**"`.
2. Run `pnpm test`. Expected: the `rejects …` tests FAIL.
3. Revert the change and run `pnpm test` again. Expected: PASS.
4. Confirm with `git diff biome.json`, which should show no changes.

- [ ] **Step 7: Lint, typecheck, commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add -A
git commit -F- <<'EOF'
test: add Vitest and domain import boundary canary

Deps: vitest is the test runner chosen in ADR 0002.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: shadcn/ui on Tailwind v4 (RTL-safe)

**Files:**
- Create (via CLI): `components.json`, `src/lib/utils.ts`, `src/components/ui/button.tsx`
- Modify (via CLI): `src/app/globals.css`, `package.json`

**Interfaces:**
- Consumes: the T1 Tailwind v4 setup and the `@/*` alias.
- Produces: `cn()` from `@/lib/utils`; `Button` (and `buttonVariants`) from `@/components/ui/button`, supporting `asChild`; theme CSS variables in `globals.css`; components that use logical utilities only.

- [ ] **Step 1: Docs check**

```bash
MSYS_NO_PATHCONV=1 npx ctx7@latest library "shadcn/ui" "init existing Next.js project Tailwind v4 rtl"
MSYS_NO_PATHCONV=1 npx ctx7@latest docs <shadcnId> "shadcn init flags --template --base --rtl; RTL support"
pnpm dlx shadcn@latest init --help
```
As of 2026-09 the `init` flags include `-t/--template next`, `-b/--base radix|base|aria`, `--rtl`, `--css-variables` (default), `-y` and `-d/--defaults`. Confirm these from `--help`.

- [ ] **Step 2: Init**

```bash
pnpm dlx shadcn@latest init -t next -b radix --rtl
```
If it prompts for a colour/preset, choose neutral. Make sure the aliases are: components `@/components`, ui `@/components/ui`, utils `@/lib/utils`, lib `@/lib`, hooks `@/hooks`.

- [ ] **Step 3: Add Button**

```bash
pnpm dlx shadcn@latest add button -y
```

- [ ] **Step 4: RTL audit (physical utilities are forbidden)**

```bash
grep -rnE '(^|[" :])-?(ml|mr|pl|pr|left|right|border-l|border-r|rounded-l|rounded-r|scroll-ml|scroll-mr)-[0-9a-z\[]|text-(left|right)\b' src/components src/app || echo "clean"
```
Expected: `clean`. If anything matches, rewrite it to the logical form (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`, `border-s`, `rounded-s`, `text-start`) in the copied component.

- [ ] **Step 5: Verify**

```bash
pnpm exec biome check --write .
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```
Expected: all green. If Biome flags Tailwind at-rules added to `globals.css` (for example `@custom-variant`, `@theme inline`), enable `css.parser.tailwindDirectives` as described in T2 Step 3. Do not exclude CSS from linting.

- [ ] **Step 6: Commit**

List the actual runtime deps the CLI added (from `git diff package.json`) in the Deps line.
```bash
git add -A
git commit -F- <<'EOF'
chore: add shadcn/ui (Radix base, RTL) with Button

Deps: shadcn/ui primitives chosen in ADR 0002; clsx, tailwind-merge, class-variance-authority, radix and icons are its runtime deps.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: next-intl (fr/en/ar), locale root layout, proxy, messages, placeholder home, browser check

**Files:**
- Create: `src/i18n/routing.ts`, `src/i18n/navigation.ts`, `src/i18n/request.ts`, `src/i18n/direction.ts`, `src/i18n/global.d.ts`, `src/proxy.ts`, `src/app/[locale]/layout.tsx`, `src/app/[locale]/page.tsx`, `src/components/locale-switcher.tsx`, `messages/fr.json`, `messages/en.json`, `messages/ar.json`, `tests/i18n/direction.test.ts`, `tests/i18n/messages.test.ts`
- Modify: `next.config.ts`, `src/app/globals.css` (Arabic font stack)
- Delete: `src/app/layout.tsx`, `src/app/page.tsx`

**Interfaces:**
- Consumes: `Button` from `@/components/ui/button` (T4) and the Biome `noDefaultExport` allowlist for `src/i18n/request.ts`, `page.tsx` and `layout.tsx` (T2).
- Produces:
  - `routing` with locales `["fr","en","ar"]`, `defaultLocale` `"fr"` and `localeCookie: false`;
  - `AppLocale` type;
  - `Link`, `redirect`, `usePathname`, `useRouter`, `getPathname` from `@/i18n/navigation`;
  - `localeDirection(locale)`;
  - `proxy` export with matcher `/((?!api|_next|_vercel|snapshots|.*\..*).*)`;
  - a messages key-parity test.

- [ ] **Step 1: Docs check (required; next-intl moves fast)**

```bash
MSYS_NO_PATHCONV=1 npx ctx7@latest library "next-intl" "App Router i18n routing Next.js 16 proxy"
MSYS_NO_PATHCONV=1 npx ctx7@latest docs <nextIntlId> "createNextIntlPlugin path, defineRouting localeCookie, createNavigation, getRequestConfig request.ts, proxy.ts matcher"
MSYS_NO_PATHCONV=1 npx ctx7@latest docs <nextIntlId> "setRequestLocale generateStaticParams hasLocale; AppConfig TypeScript augmentation Locale Messages"
MSYS_NO_PATHCONV=1 npx ctx7@latest docs /vercel/next.js "proxy.ts named export proxy config matcher Next 16"
```
Points to confirm:
- **Plugin path.** `createNextIntlPlugin("./src/i18n/request.ts")` takes the **request config** file, not `routing.ts`.
- **`request.ts` shape.** Current docs (2026) show `getRequestConfig(async ({ locale }) => …)` with a `next/root-params` fallback and describe `requestLocale` as legacy. Use whichever form the installed major documents without an experimental flag. Both variants are given in Step 4.
- **Proxy export.** Next 16 accepts a named `proxy` export from `proxy.ts`.
- **Locale cookie.** `localeCookie: false` disables the `NEXT_LOCALE` cookie. This is required because the project may not set cookies.

- [ ] **Step 2: Install**

```bash
pnpm add next-intl
```

- [ ] **Step 3: Write failing tests first**

`tests/i18n/direction.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { localeDirection } from "@/i18n/direction";

describe("localeDirection", () => {
  it.each([
    ["fr", "ltr"],
    ["en", "ltr"],
    ["ar", "rtl"],
  ] as const)("renders %s as %s", (locale, dir) => {
    expect(localeDirection(locale)).toBe(dir);
  });
});
```
`tests/i18n/messages.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import ar from "../../messages/ar.json";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out.set(path, value);
    else for (const [k, v] of flatten(value, path)) out.set(k, v);
  }
  return out;
}

const catalogs = { fr: flatten(fr), en: flatten(en), ar: flatten(ar) };

describe("messages catalogs", () => {
  it.each(["en", "ar"] as const)("%s has exactly the same keys as fr", (locale) => {
    expect([...catalogs[locale].keys()].sort()).toEqual([...catalogs.fr.keys()].sort());
  });

  it.each(["fr", "en", "ar"] as const)("%s has no empty strings", (locale) => {
    const empty = [...catalogs[locale]].filter(([, v]) => v.trim() === "").map(([k]) => k);
    expect(empty).toEqual([]);
  });
});
```
The `../../messages` relative import is the one sanctioned exception, because `messages/` is outside `src/`.

Run `pnpm test`. Expected: FAIL, because `@/i18n/direction` and `messages/*.json` cannot be resolved.

- [ ] **Step 4: i18n modules**

`src/i18n/routing.ts`:
```ts
import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["fr", "en", "ar"],
  defaultLocale: "fr",
  // Project rule: no cookies (ADR 0004). Locale lives in the URL prefix.
  localeCookie: false,
});

export type AppLocale = (typeof routing.locales)[number];
```
`src/i18n/navigation.ts`:
```ts
import { createNavigation } from "next-intl/navigation";

import { routing } from "./routing";

export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
```
`src/i18n/direction.ts`:
```ts
import type { AppLocale } from "./routing";

export function localeDirection(locale: AppLocale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}
```
`src/i18n/request.ts`. **Variant A** follows the current docs; verify it in Step 1:
```ts
import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import * as rootParams from "next/root-params";

import { routing } from "./routing";

export default getRequestConfig(async ({ locale }) => {
  let resolved = locale;
  if (!resolved) {
    const param = await rootParams.locale();
    resolved = hasLocale(routing.locales, param) ? param : routing.defaultLocale;
  }
  return {
    locale: resolved,
    timeZone: "UTC",
    messages: (await import(`../../messages/${resolved}.json`)).default,
  };
});
```
**Variant B.** Use this if `next/root-params` is unavailable or needs an experimental flag on the installed Next:
```ts
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  return { locale, timeZone: "UTC", messages: (await import(`../../messages/${locale}.json`)).default };
});
```
`timeZone: "UTC"` is set because the app only renders date-only values, so UTC cannot shift a calendar day.

`src/i18n/global.d.ts` augments next-intl's `AppConfig`. Its exact shape must be verified in Step 1. An `interface` is required here for declaration merging.
```ts
import type messages from "../../messages/fr.json";
import type { routing } from "./routing";

declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof messages;
  }
}
```

- [ ] **Step 5: Messages (all three, same keys)**

`messages/fr.json`:
```json
{
  "metadata": {
    "title": "Jisr — Étudier en Europe après le Bac",
    "description": "Trouvez des licences réalistes en France, en Allemagne et aux Pays-Bas, avec les coûts, les bourses et les étapes pour candidater."
  },
  "home": {
    "title": "Étudier en Europe après le Bac",
    "lead": "Jisr vous aide à trouver des licences réalistes pour votre profil, à estimer les coûts et à préparer votre candidature.",
    "stepsTitle": "Votre parcours",
    "steps": {
      "profile": "Votre profil",
      "options": "Des options réalistes",
      "costs": "Les coûts",
      "scholarships": "Les bourses",
      "plan": "Votre plan de candidature"
    },
    "comingSoon": "Jisr est en construction. Le parcours complet arrive bientôt."
  },
  "localeSwitcher": {
    "label": "Langue",
    "names": { "fr": "Français", "en": "English", "ar": "العربية" }
  }
}
```
`messages/en.json`:
```json
{
  "metadata": {
    "title": "Jisr — Study in Europe after the Bac",
    "description": "Find realistic Bachelor's programmes in France, Germany and the Netherlands, with costs, scholarships and application steps."
  },
  "home": {
    "title": "Study in Europe after the Bac",
    "lead": "Jisr helps you find Bachelor's programmes that are realistic for your profile, estimate the costs and prepare your application.",
    "stepsTitle": "Your journey",
    "steps": {
      "profile": "Your profile",
      "options": "Realistic options",
      "costs": "Costs",
      "scholarships": "Scholarships",
      "plan": "Your application plan"
    },
    "comingSoon": "Jisr is being built. The full journey is coming soon."
  },
  "localeSwitcher": {
    "label": "Language",
    "names": { "fr": "Français", "en": "English", "ar": "العربية" }
  }
}
```
`messages/ar.json` (Modern Standard Arabic; needs review by a fluent speaker, see Risks):
```json
{
  "metadata": {
    "title": "جسر — الدراسة في أوروبا بعد البكالوريا",
    "description": "اعثر على برامج بكالوريوس واقعية في فرنسا وألمانيا وهولندا، مع التكاليف والمنح وخطوات التقديم."
  },
  "home": {
    "title": "الدراسة في أوروبا بعد البكالوريا",
    "lead": "يساعدك جسر على إيجاد برامج بكالوريوس واقعية تناسب ملفك، وتقدير التكاليف، والتحضير لطلب الالتحاق.",
    "stepsTitle": "مسارك",
    "steps": {
      "profile": "ملفك الشخصي",
      "options": "خيارات واقعية",
      "costs": "التكاليف",
      "scholarships": "المنح الدراسية",
      "plan": "خطة التقديم"
    },
    "comingSoon": "جسر قيد الإنشاء. المسار الكامل متاح قريبًا."
  },
  "localeSwitcher": {
    "label": "اللغة",
    "names": { "fr": "Français", "en": "English", "ar": "العربية" }
  }
}
```
Run `pnpm test`. Expected: both i18n test files PASS.

- [ ] **Step 6: Proxy and Next config**

`src/proxy.ts`:
```ts
import createMiddleware from "next-intl/middleware";

import { routing } from "@/i18n/routing";

export const proxy = createMiddleware(routing);

export const config = {
  // Keep API, Next internals, Vercel internals, snapshot files and any path with a dot out of the proxy (Hobby caps).
  matcher: ["/((?!api|_next|_vercel|snapshots|.*\\..*).*)"],
};
```
`next.config.ts`:
```ts
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {};

export default withNextIntl(nextConfig);
```
Keep any options the scaffold had placed in `nextConfig`.

- [ ] **Step 7: Layout, page, switcher (invoke `impeccable:impeccable` first if available)**

Delete `src/app/layout.tsx` and `src/app/page.tsx`. `[locale]/layout.tsx` becomes the root layout.

`src/app/[locale]/layout.tsx`:
```tsx
import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { Geist, Noto_Sans_Arabic } from "next/font/google";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { localeDirection } from "@/i18n/direction";
import { routing } from "@/i18n/routing";

import "../globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
// Not preloaded: Latin-only locales should not download Arabic glyphs.
const notoSansArabic = Noto_Sans_Arabic({ variable: "--font-arabic", subsets: ["arabic"], preload: false });

type Props = { children: ReactNode; params: Promise<{ locale: string }> };

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return (
    <html lang={locale} dir={localeDirection(locale)}>
      <body className={`${geistSans.variable} ${notoSansArabic.variable} antialiased`}>{children}</body>
    </html>
  );
}
```
Add to `src/app/globals.css`, after the existing theme and without removing shadcn variables:
```css
html[lang="ar"] body {
  font-family: var(--font-arabic), var(--font-geist-sans), system-ui, sans-serif;
}
```
`NextIntlClientProvider` is intentionally omitted. There are no client components yet, and adding the provider would serialise every message into the page. Add it, with only the needed messages, when the first client component appears.

`src/components/locale-switcher.tsx`:
```tsx
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { routing } from "@/i18n/routing";

export async function LocaleSwitcher({ current }: { current: AppLocale }) {
  const t = await getTranslations("localeSwitcher");
  return (
    <nav aria-label={t("label")}>
      <ul className="flex gap-2">
        {routing.locales.map((locale) => (
          <li key={locale}>
            <Button asChild size="sm" variant={locale === current ? "secondary" : "ghost"}>
              <Link href="/" locale={locale} lang={locale} aria-current={locale === current ? "page" : undefined}>
                {t(`names.${locale}`)}
              </Link>
            </Button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```
`src/app/[locale]/page.tsx`:
```tsx
import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { LocaleSwitcher } from "@/components/locale-switcher";
import { routing } from "@/i18n/routing";

type Props = { params: Promise<{ locale: string }> };

const STEP_KEYS = ["profile", "options", "costs", "scholarships", "plan"] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  return { title: t("title"), description: t("description") };
}

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("home");
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 px-4 py-10 text-start">
      <header className="flex justify-end">
        <LocaleSwitcher current={locale} />
      </header>
      <section className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-lg text-muted-foreground">{t("lead")}</p>
      </section>
      <section aria-labelledby="journey" className="flex flex-col gap-3">
        <h2 id="journey" className="text-xl font-medium">{t("stepsTitle")}</h2>
        <ol className="list-decimal ps-6">
          {STEP_KEYS.map((key) => (
            <li key={key}>{t(`steps.${key}`)}</li>
          ))}
        </ol>
      </section>
      <p className="text-sm text-muted-foreground">{t("comingSoon")}</p>
    </main>
  );
}
```
Physical utilities: `justify-end` flips correctly under `dir="rtl"`, and `mx-`/`px-` are symmetric, so none of the banned forms are used. If `impeccable` proposes design changes, apply them within these constraints.

- [ ] **Step 8: Verify statically**

```bash
pnpm exec biome check --write .
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```
Expected:
- All green.
- The build route table lists `/[locale]` as SSG (●) with `/fr`, `/en`, `/ar`, and lists the Proxy.
- If the build complains about a missing root `not-found` or root layout, run `MSYS_NO_PATHCONV=1 npx ctx7@latest docs <nextIntlId> "not-found page with [locale] root layout"`, follow it, and note the change in the report.

- [ ] **Step 9: Verify over HTTP**

Start `pnpm start` in a background shell, wait until it prints `Ready`, then run each check and compare with the expectation after it:
```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3000/
```
Expected: `307 http://localhost:3000/fr` (a 308 is also acceptable; note which one).
```bash
curl -sI http://localhost:3000/fr | grep -i '^set-cookie' || echo "no cookies"
```
Expected: `no cookies`.
```bash
curl -s http://localhost:3000/fr | grep -o '<html[^>]*>'
```
Expected: `<html lang="fr" dir="ltr" …>`.
```bash
curl -s http://localhost:3000/ar | grep -o '<html[^>]*>'
```
Expected: `<html lang="ar" dir="rtl" …>`.
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/snapshots/manifest.json
```
Expected: `404`, not `307`. This shows snapshots bypass the proxy.
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/de
```
Expected: `404` or a redirect to `/fr/de` that then 404s; record which. It must not render a German page.

Stop the background server afterwards.

- [ ] **Step 10: Browser check in fr (LTR) and ar (RTL)**

With `pnpm start` running, use an available browser tool (Playwright MCP or Claude in Chrome). Open `http://localhost:3000/fr` and `http://localhost:3000/ar` at 390×844 (phone) and 1280×800. Check:
- the text aligns to the start edge;
- in `ar` the switcher sits at the visual left and the list numbers are on the right;
- Arabic renders in Noto Sans Arabic, not a fallback;
- switcher links go to `/fr`, `/en`, `/ar`;
- there are no console errors.

Capture screenshots for the report. **If no browser tool is available, say so explicitly in the report as "browser verification pending — main thread must do it". Do not claim it was done.**

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -F- <<'EOF'
feat: add fr/en/ar routing with RTL root layout and placeholder home

Locale routing via next-intl in src/proxy.ts (no locale cookie),
snapshot paths excluded from the proxy matcher, messages parity test.

Deps: next-intl is the i18n library chosen in ADR 0002.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

---

## Risks / Open questions (flag to the user)

- **Sensitive territory: match semantics (✅ ⚠️ ❌).** Section 11 fixes several judgement calls beyond the approved design, and each one moves students toward ⚠️:
  - `credential.status === "expected"` turns grade pass/fail into ⚠️.
  - A missing required certificate is ⚠️, not ❌.
  - `certificateRequired: null` is ⚠️.
  - `credential_type_in` failures reuse the code `track_not_accepted`, because the approved code enum is closed.
  - Route `foundation` and a non-decisive `not_eligible` short-circuit, so program rules are skipped.
  - Grades converted with modified Bavarian are truncated only when `truncateDecimals` says so.

  Please confirm these or say which to change before Part C is written.
- **Sensitive territory: personal data.** `Profile` holds nationality, grades, language levels and budget. The domain override bans `console`, and the profile stays client-side (localStorage) through M2. No persistence or logging is planned in M0–M2.
- **Cost presentation.** DECIDED 2026-09-29: living costs use a 10-month academic year (`ACADEMIC_YEAR_MONTHS = 10`). Housing is often paid for 12 months, so the UI must show the assumption next to every range.
- **Fields `min(1)`.** The profile requires at least one field; destinations may be empty (meaning all). Confirm.
- **UI copy.** The French uses "vous". The Arabic brand is rendered "جسر". The Arabic strings were written by the planner and need a fluent MSA speaker's review; `messages/*.json` has no draft/reviewed flag, unlike data text.
- **Tool facts I could not execute (no shell in the planner).** These were checked against web docs (2026-08/09), not run, and each task has a ctx7 step to re-verify:
  - create-next-app flags;
  - Biome option shapes and whether stdin mode honours overrides;
  - `--stdin-file-path` exit codes;
  - `node:*` and `../` glob matching in `noRestrictedImports` patterns;
  - shadcn `--rtl`;
  - next-intl's `next/root-params` form versus `requestLocale`, and the `AppConfig` augmentation;
  - Next 16 named `proxy` export;
  - the pnpm build-script allowlist key.
- **Biome excludes `.claude/`.** This prevents the formatting hook from rewriting agent config. Say if you want `.claude/*.json` formatted.
- **The canary test lives in T3, not T2**, because it needs Vitest. T2 proves the ban by hand with before/after stdin runs.
- **Initial-JS budget (≤150 KB gzip)** is not measured automatically in M0. Next 16's build output may no longer print First Load JS; a budget check should come with the first real client component.
- **Radix `DirectionProvider`.** Interactive Radix components (menus, popovers) default to LTR unless wrapped in one. It is not needed for the placeholder page, but it is flagged for the first such component.

## Assumptions
- M1 = data schema plus the check/build pipeline with synthetic fixtures only. M2 = the pure domain with tests. No real reference data and no journey pages are in M0–M2.
- Scaffolding goes into an OS temp dir, because create-next-app will not target the non-empty repo and `rm -rf` is denied.
- The shard gzip budget is 300 × 1024 bytes. Shard files and the manifest are canonical JSON with no trailing newline.
- The domain is flat (`src/domain/*.ts`), which is what lets the `../` import ban work.

> Contract amendments A1–A7 from Part B were applied to sections 8, 9 and 10 on 2026-09-29.
