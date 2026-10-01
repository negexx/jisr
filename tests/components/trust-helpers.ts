import type { ReactElement } from "react";
import { expect, vi } from "vitest";

import type { AppLocale } from "@/i18n/routing";
import ar from "../../messages/ar.json";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
import { renderIntl } from "./intl";

export const catalogs = { fr, en, ar };
export const LOCALES: readonly AppLocale[] = ["fr", "en", "ar"];

// The word that would make an estimate or a guidance read as an official requirement, per locale.
export const OFFICIAL_WORD: Record<AppLocale, RegExp> = {
  en: /official/i,
  fr: /officiel/i,
  ar: /رسمي/,
};

export function expectNoPhysicalDirection(root: HTMLElement): void {
  expect(root.innerHTML).not.toMatch(/\b(ml|mr|pl|pr|left|right)-/);
}

// Visible text, screen-reader-only text and every accessible attribute a user or a screen reader can reach.
export function reachableText(root: HTMLElement): string {
  const attributes = [...root.querySelectorAll("*")].flatMap((element) =>
    ["aria-label", "title", "alt", "aria-description"].flatMap(
      (name) => element.getAttribute(name) ?? [],
    ),
  );
  return [root.textContent ?? "", ...attributes].join("\n");
}

export function watchConsole() {
  const spies = (["error", "warn", "log"] as const).map((method) =>
    vi.spyOn(console, method).mockImplementation(() => undefined),
  );
  return {
    expectSilent() {
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    },
    restore() {
      for (const spy of spies) spy.mockRestore();
    },
  };
}

// These components use useTranslations under a nested provider, so they need the messages that the root provider (messages={null}) does not carry.
export function renderWithMessages(ui: ReactElement, locale: AppLocale = "fr") {
  return renderIntl(ui, locale, { withMessages: true });
}
