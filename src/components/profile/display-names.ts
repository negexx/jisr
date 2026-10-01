import type { CoreShard } from "@/data-schema/snapshot";
import type { AppLocale } from "@/i18n/routing";
import { intlLocale } from "@/lib/format";
import type { DataText, TextLookup, TextLookupNote } from "@/lib/snapshot/text";

export type Choice = { value: string; label: string };

const displayNames = new Map<string, Intl.DisplayNames>();

function displayNamesFor(locale: AppLocale, type: "language" | "currency"): Intl.DisplayNames {
  const key = `${locale}:${type}`;
  let names = displayNames.get(key);
  if (names === undefined) {
    names = new Intl.DisplayNames([intlLocale(locale)], { type });
    displayNames.set(key, names);
  }
  return names;
}

function upperFirst(text: string, locale: AppLocale): string {
  const [first = ""] = text;
  return first.toLocaleUpperCase(intlLocale(locale)) + text.slice(first.length);
}

// Languages and currencies are named by the browser (CLDR), so no language list is hard-coded here.
export function languageName(code: string, locale: AppLocale): string {
  try {
    const name = displayNamesFor(locale, "language").of(code);
    return name === undefined ? code : upperFirst(name, locale);
  } catch {
    return code;
  }
}

export function currencyName(code: string, locale: AppLocale): string {
  try {
    return displayNamesFor(locale, "currency").of(code) ?? code;
  } catch {
    return code;
  }
}

// Latin names inside Arabic (and the reverse) must not reorder their neighbours; option text cannot
// carry markup, so it is isolated with the Unicode isolate marks instead.
export function isolate(name: string): string {
  return `⁨${name}⁩`;
}

type Kind = "country" | "subject" | "field";

// A name the snapshot lacks falls back to the slug or code, never to an empty label. `data` keeps
// the lookup's note, so a field can say when the shown text is French or a draft.
export function lookupName(
  core: CoreShard,
  text: TextLookup,
  kind: Kind,
  id: string,
): { label: string; data: DataText | undefined } {
  const key =
    kind === "country"
      ? core.countries.find((country) => country.code === id)?.name
      : kind === "subject"
        ? core.subjects.find((subject) => subject.slug === id)?.name
        : core.fields.find((field) => field.slug === id)?.name;
  const data = key === undefined ? undefined : text(key);
  return { label: data?.text ?? id, data };
}

const NOTE_RANK: Record<TextLookupNote, number> = {
  none: 0,
  machine_translated: 1,
  french_fallback: 2,
};

// The note for the text actually shown: pass the entries of the SELECTED options only. When several
// are shown the most restrictive note wins.
export function strongestNote(notes: readonly (DataText | undefined)[]): TextLookupNote {
  let strongest: TextLookupNote = "none";
  for (const entry of notes) {
    if (entry !== undefined && NOTE_RANK[entry.note] > NOTE_RANK[strongest]) {
      strongest = entry.note;
    }
  }
  return strongest;
}

// Arabic-Indic, extended Arabic-Indic digits and the Arabic decimal separator.
const NON_LATIN_DIGITS = /[٠-٩۰-۹٫]/u;

export function hasNonLatinDigits(value: string): boolean {
  return NON_LATIN_DIGITS.test(value);
}
