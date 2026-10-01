import type { TextKey } from "@/data-schema/resolved";
import type { TextShard } from "@/data-schema/snapshot";
import type { AppLocale } from "@/i18n/routing";

export type TextLookupNote = "french_fallback" | "machine_translated" | "none";
export type DataText = { text: string; note: TextLookupNote };
export type TextLookup = (key: TextKey) => DataText | undefined;

// French is the authoring language, so a French draft carries no note.
export function createTextLookup(textShards: readonly TextShard[], locale: AppLocale): TextLookup {
  const entries = new Map<TextKey, DataText>();
  for (const shard of textShards) {
    for (const [key, entry] of Object.entries(shard.entries)) {
      const note: TextLookupNote = entry.fallback
        ? "french_fallback"
        : locale !== "fr" && entry.status === "draft"
          ? "machine_translated"
          : "none";
      entries.set(key, { text: entry.text, note });
    }
  }
  return (key) => entries.get(key);
}
