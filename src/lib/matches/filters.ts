import type { MatchFilters } from "@/data-schema/match-filters";
import { MATCH_FILTERS_VERSION } from "@/lib/constants";
import {
  hasOnlyKeys,
  isInteger,
  isOneOf,
  isRecord,
  matches,
  parseEach,
  type UnknownRecord,
} from "@/lib/guards";

// Hand-written twin of MatchFiltersSchema (src/data-schema/match-filters.ts) for client code:
// importing Zod costs about 120 KB gzipped. tests/lib/matches/filters.test.ts runs both over
// fixtures, one mutation per rule and a seeded fuzzer, and fails on any disagreement, so change
// both together. Returns a validated copy, or null.
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COUNTRY_CODE = /^[A-Z]{2}$/;
const LANGUAGE_CODE = /^[a-z]{2}$/;
const CURRENCY = /^[A-Z]{3}$/;

const BUDGET_PERIODS = ["month", "year"] as const;
const INSTITUTION_TYPES = ["public", "private", "any"] as const;

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

function parseBudget(value: unknown): MatchFilters["budget"] | null {
  const record = strictRecord(value, ["amountMinor", "currency", "period"]);
  if (record === null) return null;
  const { amountMinor, currency, period } = record;
  if (
    !isInteger(amountMinor) ||
    amountMinor < 0 ||
    !matches(currency, CURRENCY) ||
    !isOneOf(period, BUDGET_PERIODS)
  ) {
    return null;
  }
  return { amountMinor, currency, period };
}

export const EMPTY_MATCH_FILTERS: MatchFilters = {
  schemaVersion: MATCH_FILTERS_VERSION,
  fields: [],
  studyLanguages: [],
  destinations: [],
  institutionType: "any",
  budget: null,
};

export function isEmptyFilters(filters: MatchFilters): boolean {
  return (
    filters.fields.length === 0 &&
    filters.studyLanguages.length === 0 &&
    filters.destinations.length === 0 &&
    filters.institutionType === "any" &&
    filters.budget === null
  );
}

export function parseMatchFilters(raw: unknown): MatchFilters | null {
  const record = strictRecord(raw, [
    "schemaVersion",
    "fields",
    "studyLanguages",
    "destinations",
    "institutionType",
    "budget",
  ]);
  if (record === null || record.schemaVersion !== MATCH_FILTERS_VERSION) return null;

  const fields = parseEach(record.fields, parseSlug);
  const studyLanguages = parseEach(record.studyLanguages, parseLanguageCode);
  const destinations = parseEach(record.destinations, parseCountry);
  const budget = record.budget === null ? null : parseBudget(record.budget);
  const { institutionType } = record;

  if (
    fields === null ||
    studyLanguages === null ||
    destinations === null ||
    (budget === null && record.budget !== null) ||
    !isOneOf(institutionType, INSTITUTION_TYPES)
  ) {
    return null;
  }

  return {
    schemaVersion: MATCH_FILTERS_VERSION,
    fields,
    studyLanguages,
    destinations,
    institutionType,
    budget,
  };
}
