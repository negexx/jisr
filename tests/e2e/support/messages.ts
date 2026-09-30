import { readFileSync } from "node:fs";
import path from "node:path";
import { createTranslator } from "next-intl";

import type { E2eLocale } from "./locales";

type CreateOptions = Parameters<typeof createTranslator>[0];

export type Translate = (key: string, params?: Record<string, string | number>) => string;

// Specs read the real catalogues, so a copy change never needs a spec change. Keys are dotted from
// the catalogue root ("matches.hidden.summary"); ICU plurals and selects are formatted like the app does.
export function translatorFor(locale: E2eLocale): Translate {
  const messages: CreateOptions["messages"] = JSON.parse(
    readFileSync(path.resolve(process.cwd(), "messages", `${locale}.json`), "utf8"),
  );
  return createTranslator({ locale, messages }) as unknown as Translate;
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Labels in the profile form end with "(required)" or "(optional)", so a label is matched by its start.
export function startsWith(text: string): RegExp {
  return new RegExp(`^${escapeRegExp(text)}`);
}

// Language names come from CLDR in the app; case is ignored because the app capitalises the first letter.
export function languageLabel(code: string, locale: E2eLocale): RegExp {
  const name = new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? code;
  return new RegExp(escapeRegExp(name), "i");
}
