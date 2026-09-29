import type { Locale } from "@/data-schema/primitives";
import type { TextEntry, TextKey } from "@/data-schema/resolved";

import type { TextBag } from "./resolve";

export function textEntries(bag: TextBag, locale: Locale): Record<TextKey, TextEntry> {
  const entries: Record<TextKey, TextEntry> = {};
  for (const [key, text] of bag) {
    const own = text[locale];
    entries[key] =
      own === undefined
        ? { text: text.fr.text, status: text.fr.status, fallback: true }
        : { text: own.text, status: own.status, fallback: false };
  }
  return entries;
}
