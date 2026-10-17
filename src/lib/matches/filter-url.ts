import type { MatchFilters } from "@/data-schema/match-filters";
import type { Budget } from "@/data-schema/profile";
import type { CoreShard } from "@/data-schema/snapshot";
import { MATCH_FILTERS_VERSION } from "@/lib/constants";
import { isInteger, isOneOf, matches } from "@/lib/guards";
import { fieldOptions, studyLanguageOptions } from "@/lib/profile/form/options";

// The filter list on the wire. The URL is a public entry point (shared links, bookmarks, hand-edited
// addresses): decoding never throws, it shape-validates every value, and dropUnknownFilters
// reconciles the result with the loaded catalogue before the view uses it.
const FIELD_PARAM = "field";
const LANGUAGE_PARAM = "lang";
const DESTINATION_PARAM = "dest";
const TYPE_PARAM = "type";
const BUDGET_PARAM = "budget";
const OWNED_PARAMS = [
  FIELD_PARAM,
  LANGUAGE_PARAM,
  DESTINATION_PARAM,
  TYPE_PARAM,
  BUDGET_PARAM,
] as const;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LANGUAGE_CODE = /^[a-z]{2}$/;
const COUNTRY_CODE = /^[A-Z]{2}$/;
const CURRENCY = /^[A-Z]{3}$/;
const AMOUNT = /^\d+$/;
const INSTITUTION_TYPES = ["any", "public", "private"] as const;
const PERIODS = ["month", "year"] as const;

function addAll(params: URLSearchParams, key: string, values: readonly string[]): void {
  for (const value of values) params.append(key, value);
}

export function encodeFilters(filters: MatchFilters): URLSearchParams {
  const params = new URLSearchParams();
  addAll(params, FIELD_PARAM, filters.fields);
  addAll(params, LANGUAGE_PARAM, filters.studyLanguages);
  addAll(params, DESTINATION_PARAM, filters.destinations);
  if (filters.institutionType !== "any") params.set(TYPE_PARAM, filters.institutionType);
  if (filters.budget !== null) {
    const { amountMinor, currency, period } = filters.budget;
    params.set(BUDGET_PARAM, `${amountMinor}-${currency}-${period}`);
  }
  return params;
}

export function filtersSearch(filters: MatchFilters): string {
  const query = encodeFilters(filters).toString();
  return query === "" ? "" : `?${query}`;
}

export function hasMatchFilterParams(params: URLSearchParams): boolean {
  return OWNED_PARAMS.some((key) => params.has(key));
}

function pick(params: URLSearchParams, key: string, pattern: RegExp): string[] {
  const seen = new Set<string>();
  for (const value of params.getAll(key)) {
    if (matches(value, pattern)) seen.add(value);
  }
  return [...seen];
}

function parseBudgetParam(value: string | null): Budget | null {
  if (value === null) return null;
  const parts = value.split("-");
  if (parts.length !== 3) return null;
  const [amountText, currency, period] = parts;
  if (amountText === undefined || currency === undefined || period === undefined) return null;
  if (!matches(amountText, AMOUNT) || !matches(currency, CURRENCY)) return null;
  if (!isOneOf(period, PERIODS)) return null;
  const amountMinor = Number(amountText);
  if (!isInteger(amountMinor) || amountMinor < 0) return null;
  return { amountMinor, currency, period };
}

export function decodeFilters(params: URLSearchParams): MatchFilters {
  const type = params.get(TYPE_PARAM) ?? "any";
  return {
    schemaVersion: MATCH_FILTERS_VERSION,
    fields: pick(params, FIELD_PARAM, SLUG),
    studyLanguages: pick(params, LANGUAGE_PARAM, LANGUAGE_CODE),
    destinations: pick(params, DESTINATION_PARAM, COUNTRY_CODE),
    institutionType: isOneOf(type, INSTITUTION_TYPES) ? type : "any",
    budget: parseBudgetParam(params.get(BUDGET_PARAM)),
  };
}

function keepKnown(values: readonly string[], catalogue: ReadonlySet<string>): string[] {
  return values.filter((value) => catalogue.has(value));
}

// The wire grammar cannot know which values exist: a field, country or language removed from the
// catalogue still decodes, and a filter on it hides every program. Callers run this once the core
// shard is loaded and mirror the result in both the store and the URL. Returns the same object when
// nothing was dropped, so a caller can tell "no change" from "sanitized".
export function dropUnknownFilters(filters: MatchFilters, core: CoreShard): MatchFilters {
  const fields = keepKnown(filters.fields, new Set(fieldOptions(core).map((field) => field.slug)));
  const studyLanguages = keepKnown(filters.studyLanguages, new Set(studyLanguageOptions(core)));
  const destinations = keepKnown(
    filters.destinations,
    new Set(core.countries.map((country) => country.code)),
  );
  if (
    fields.length === filters.fields.length &&
    studyLanguages.length === filters.studyLanguages.length &&
    destinations.length === filters.destinations.length
  ) {
    return filters;
  }
  return { ...filters, fields, studyLanguages, destinations };
}
