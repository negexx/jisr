import type { ProfileDraft } from "@/data-schema/draft";
import { DRAFT_SCHEMA_VERSION } from "@/lib/constants";
import {
  hasOnlyKeys,
  isInteger,
  isOneOf,
  isRecord,
  parseEach,
  type UnknownRecord,
} from "@/lib/guards";

// Hand-written twin of DraftSchema (src/data-schema/draft.ts): importing Zod costs about 120 KB
// gzipped on the client. tests/lib/profile/draft-validate.test.ts runs both over a table and a
// seeded fuzzer and fails on any disagreement, so change both together. Returns a validated copy,
// or null: never anything derived from the input.
const MAX_TYPED_LENGTH = 200;
const CREDENTIAL_STATUSES = ["obtained", "expected"] as const;
const BUDGET_PERIODS = ["month", "year"] as const;
const INSTITUTION_TYPES = ["public", "private", "any"] as const;

// A parsed value is wrapped so that a legitimate `null` or `undefined` is not mistaken for failure.
type Parsed<T> = { value: T } | null;
type Parser<T> = (value: unknown) => Parsed<T>;

function ok<T>(value: T): Parsed<T> {
  return { value };
}

function typed(value: unknown): Parsed<string> {
  return typeof value === "string" && value.length <= MAX_TYPED_LENGTH ? ok(value) : null;
}

function oneOf<T extends string>(options: readonly T[]): Parser<T> {
  return (value) => (isOneOf(value, options) ? ok(value) : null);
}

function optional<T>(parse: Parser<T>): Parser<T | undefined> {
  return (value) => (value === undefined ? ok(undefined) : parse(value));
}

function nullable<T>(parse: Parser<T>): Parser<T | null> {
  return (value) => (value === null ? ok(null) : parse(value));
}

function listOf<T>(parse: Parser<T>): Parser<T[]> {
  return (value) => {
    const items = parseEach(value, parse);
    return items === null ? null : ok(items.map((item) => item.value));
  };
}

function strictRecord(value: unknown, keys: readonly string[]): UnknownRecord | null {
  return isRecord(value) && hasOnlyKeys(value, keys) ? value : null;
}

// Zod leaves an optional key out of its output when the input has no value for it.
function withoutUndefined<T extends object>(entries: T): T {
  return Object.fromEntries(
    Object.entries(entries).filter(([, value]) => value !== undefined),
  ) as T;
}

const parseGradeInput: Parser<{ scale: string; value: string }> = (value) => {
  const record = strictRecord(value, ["scale", "value"]);
  if (record === null) return null;
  const scale = typed(record.scale);
  const grade = typed(record.value);
  return scale === null || grade === null ? null : ok({ scale: scale.value, value: grade.value });
};

const parseSubject: Parser<{ subject: string; grade: { scale: string; value: string } }> = (
  value,
) => {
  const record = strictRecord(value, ["subject", "grade"]);
  if (record === null) return null;
  const subject = typed(record.subject);
  const grade = parseGradeInput(record.grade);
  return subject === null || grade === null
    ? null
    : ok({ subject: subject.value, grade: grade.value });
};

type DraftCredential = NonNullable<ProfileDraft["credential"]>;

const parseCredential: Parser<DraftCredential> = (value) => {
  const record = strictRecord(value, ["country", "type", "track", "status", "overall", "subjects"]);
  if (record === null) return null;
  const country = optional(typed)(record.country);
  const type = optional(typed)(record.type);
  const track = optional(typed)(record.track);
  const status = optional(oneOf(CREDENTIAL_STATUSES))(record.status);
  const overall = optional(nullable(parseGradeInput))(record.overall);
  const subjects = optional(listOf(parseSubject))(record.subjects);
  if (!country || !type || !track || !status || !overall || !subjects) return null;
  return ok(
    withoutUndefined({
      country: country.value,
      type: type.value,
      track: track.value,
      status: status.value,
      overall: overall.value,
      subjects: subjects.value,
    }),
  );
};

type DraftLanguage = NonNullable<ProfileDraft["languages"]>[number];

const parseLanguage: Parser<DraftLanguage> = (value) => {
  const record = strictRecord(value, ["language", "level", "certificate"]);
  if (record === null) return null;
  const language = typed(record.language);
  const level = optional(typed)(record.level);
  const certificate = optional(nullable(typed))(record.certificate);
  if (!language || !level || !certificate) return null;
  return ok(
    withoutUndefined({
      language: language.value,
      level: level.value,
      certificate: certificate.value,
    }),
  );
};

type DraftBudget = NonNullable<ProfileDraft["budget"]>;

const parseBudget: Parser<DraftBudget> = (value) => {
  const record = strictRecord(value, ["amount", "currency", "period"]);
  if (record === null) return null;
  const amount = optional(typed)(record.amount);
  const currency = optional(typed)(record.currency);
  const period = optional(oneOf(BUDGET_PERIODS))(record.period);
  if (!amount || !currency || !period) return null;
  return ok(
    withoutUndefined({
      amount: amount.value,
      currency: currency.value,
      period: period.value,
    }),
  );
};

export function parseDraft(raw: unknown): ProfileDraft | null {
  const record = strictRecord(raw, [
    "schemaVersion",
    "step",
    "nationality",
    "credential",
    "priorHigherEducationYears",
    "languages",
    "fields",
    "studyLanguages",
    "destinations",
    "budget",
    "institutionType",
  ]);
  if (record === null || record.schemaVersion !== DRAFT_SCHEMA_VERSION) return null;
  const { step } = record;
  if (!isInteger(step) || step < 0) return null;

  const nationality = optional(typed)(record.nationality);
  const credential = optional(parseCredential)(record.credential);
  const years = optional(typed)(record.priorHigherEducationYears);
  const languages = optional(listOf(parseLanguage))(record.languages);
  const fields = optional(listOf(typed))(record.fields);
  const studyLanguages = optional(listOf(typed))(record.studyLanguages);
  const destinations = optional(listOf(typed))(record.destinations);
  const budget = optional(nullable(parseBudget))(record.budget);
  const institutionType = optional(oneOf(INSTITUTION_TYPES))(record.institutionType);
  if (
    !nationality ||
    !credential ||
    !years ||
    !languages ||
    !fields ||
    !studyLanguages ||
    !destinations ||
    !budget ||
    !institutionType
  ) {
    return null;
  }

  return withoutUndefined<ProfileDraft>({
    schemaVersion: DRAFT_SCHEMA_VERSION,
    step,
    nationality: nationality.value,
    credential: credential.value,
    priorHigherEducationYears: years.value,
    languages: languages.value,
    fields: fields.value,
    studyLanguages: studyLanguages.value,
    destinations: destinations.value,
    budget: budget.value,
    institutionType: institutionType.value,
  });
}
