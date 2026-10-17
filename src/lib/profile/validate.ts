import type { GradeValue, Profile } from "@/data-schema/profile";
import { CEFR_LEVELS, PROFILE_SCHEMA_VERSION } from "@/lib/constants";
import {
  hasOnlyKeys,
  isFiniteNumber,
  isInteger,
  isOneOf,
  isRecord,
  matches,
  parseEach,
  type UnknownRecord,
} from "@/lib/guards";

// Hand-written twin of ProfileSchema (src/data-schema/profile.ts) for client code: importing Zod
// costs about 120 KB gzipped. tests/lib/profile/validate.test.ts runs both over fixtures, one
// mutation per rule and a seeded fuzzer, and fails on any disagreement, so change both together.
// Returns a validated copy, or null: never anything derived from the input (it holds grades).
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COUNTRY_CODE = /^[A-Z]{2}$/;
const LANGUAGE_CODE = /^[a-z]{2}$/;

const CREDENTIAL_STATUSES = ["obtained", "expected"] as const;
const LANGUAGE_LEVELS = [...CEFR_LEVELS, "unknown"] as const;

function strictRecord(value: unknown, keys: readonly string[]): UnknownRecord | null {
  return isRecord(value) && hasOnlyKeys(value, keys) ? value : null;
}

function parseSlug(value: unknown): string | null {
  return matches(value, SLUG) ? value : null;
}

function parseCountry(value: unknown): string | null {
  return matches(value, COUNTRY_CODE) ? value : null;
}

function parseLanguageCode(value: unknown): string | null {
  return matches(value, LANGUAGE_CODE) ? value : null;
}

function parseGrade(value: unknown): GradeValue | null {
  const record = strictRecord(value, ["scale", "value"]);
  if (record === null) return null;
  const { scale, value: grade } = record;
  if (!matches(scale, SLUG) || !isFiniteNumber(grade)) return null;
  return { scale, value: grade };
}

function parseSubject(value: unknown): Profile["credential"]["subjects"][number] | null {
  const record = strictRecord(value, ["subject", "grade"]);
  if (record === null) return null;
  const subject = parseSlug(record.subject);
  const grade = parseGrade(record.grade);
  return subject === null || grade === null ? null : { subject, grade };
}

function parseCredential(value: unknown): Profile["credential"] | null {
  const record = strictRecord(value, ["country", "type", "track", "status", "overall", "subjects"]);
  if (record === null) return null;
  const country = parseCountry(record.country);
  const type = parseSlug(record.type);
  const track = parseSlug(record.track);
  const { status } = record;
  const overall = record.overall === null ? null : parseGrade(record.overall);
  const subjects = parseEach(record.subjects, parseSubject);
  if (
    country === null ||
    type === null ||
    track === null ||
    !isOneOf(status, CREDENTIAL_STATUSES) ||
    (overall === null && record.overall !== null) ||
    subjects === null
  ) {
    return null;
  }
  return { country, type, track, status, overall, subjects };
}

function parseLanguage(value: unknown): Profile["languages"][number] | null {
  const record = strictRecord(value, ["language", "level", "certificate"]);
  if (record === null) return null;
  const language = parseLanguageCode(record.language);
  const { level } = record;
  const certificate = record.certificate === null ? null : parseSlug(record.certificate);
  if (
    language === null ||
    !isOneOf(level, LANGUAGE_LEVELS) ||
    (certificate === null && record.certificate !== null)
  ) {
    return null;
  }
  return { language, level, certificate };
}

function hasDuplicate(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

export function parseProfile(raw: unknown): Profile | null {
  const record = strictRecord(raw, [
    "schemaVersion",
    "nationality",
    "credential",
    "priorHigherEducationYears",
    "languages",
  ]);
  if (record === null || record.schemaVersion !== PROFILE_SCHEMA_VERSION) return null;

  const nationality = parseCountry(record.nationality);
  const credential = parseCredential(record.credential);
  const years = record.priorHigherEducationYears;
  const languages = parseEach(record.languages, parseLanguage);

  if (
    nationality === null ||
    credential === null ||
    !isInteger(years) ||
    years < 0 ||
    years > 3 ||
    languages === null
  ) {
    return null;
  }
  if (hasDuplicate(credential.subjects.map((entry) => entry.subject))) return null;
  if (hasDuplicate(languages.map((entry) => entry.language))) return null;

  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    nationality,
    credential,
    priorHigherEducationYears: years,
    languages,
  };
}
