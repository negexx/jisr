import type { IsoDate } from "@/data-schema/dates";
import { isValidIsoDate } from "@/data-schema/dates";
import { MAX_SAVED_PROGRAMS, SAVED_SCHEMA_VERSION } from "@/lib/constants";
import { hasOnlyKeys, isRecord, matches } from "@/lib/guards";

export const SAVED_KEY = "jisr.saved";

// country and field are public program attributes: the manifest cannot map a slug to its program
// shard, so the plan page needs them to know which shard to load.
export type SavedProgram = {
  slug: string;
  country: string;
  field: string;
  snapshotVersion: string;
  savedAt: IsoDate;
};
export type SavedList = { schemaVersion: 1; items: SavedProgram[] };

export const EMPTY_SAVED: SavedList = { schemaVersion: SAVED_SCHEMA_VERSION, items: [] };

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COUNTRY = /^[A-Z]{2}$/;
const VERSION = /^[0-9a-f]{12}$/;

function parseItem(value: unknown): SavedProgram | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["slug", "country", "field", "snapshotVersion", "savedAt"])
  ) {
    return null;
  }
  const { slug, country, field, snapshotVersion, savedAt } = value;
  if (
    !matches(slug, SLUG) ||
    !matches(country, COUNTRY) ||
    !matches(field, SLUG) ||
    !matches(snapshotVersion, VERSION) ||
    typeof savedAt !== "string" ||
    !isValidIsoDate(savedAt)
  ) {
    return null;
  }
  return { slug, country, field, snapshotVersion, savedAt };
}

// Bad items are dropped, not fatal: one corrupt entry must not lose the student's whole list.
export function parseSaved(raw: unknown): SavedList | null {
  if (!isRecord(raw) || !hasOnlyKeys(raw, ["schemaVersion", "items"])) return null;
  if (raw.schemaVersion !== SAVED_SCHEMA_VERSION || !Array.isArray(raw.items)) return null;
  const seen = new Set<string>();
  const items: SavedProgram[] = [];
  for (let index = 0; index < raw.items.length && items.length < MAX_SAVED_PROGRAMS; index += 1) {
    const item = parseItem(raw.items[index]);
    if (item === null || seen.has(item.slug)) continue;
    seen.add(item.slug);
    items.push(item);
  }
  return { schemaVersion: SAVED_SCHEMA_VERSION, items };
}

export function isSavedSlug(list: SavedList, slug: string): boolean {
  return list.items.some((item) => item.slug === slug);
}

// null: the list is full (a duplicate is returned unchanged).
export function addSaved(list: SavedList, item: SavedProgram): SavedList | null {
  if (isSavedSlug(list, item.slug)) return list;
  if (list.items.length >= MAX_SAVED_PROGRAMS) return null;
  return { schemaVersion: SAVED_SCHEMA_VERSION, items: [...list.items, item] };
}

export function removeSaved(list: SavedList, slug: string): SavedList {
  return {
    schemaVersion: SAVED_SCHEMA_VERSION,
    items: list.items.filter((item) => item.slug !== slug),
  };
}
