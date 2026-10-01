import { isValidElement } from "react";
import { describe, expect, it, vi } from "vitest";

import ProfilePage from "@/app/[locale]/profile/page";
import { routing } from "@/i18n/routing";

import ar from "../../messages/ar.json";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

const catalogues = { fr, en, ar } as const;
const state = vi.hoisted(() => ({ locale: "fr" }));

vi.mock("next-intl/server", () => ({
  setRequestLocale: () => undefined,
  getMessages: async () => catalogues[state.locale as keyof typeof catalogues],
  getTranslations: async () => (key: string) => key,
}));

describe("ProfilePage", () => {
  it.each(routing.locales)("gives its nested provider an explicit locale (%s)", async (locale) => {
    state.locale = locale;
    const page = await ProfilePage({ params: Promise.resolve({ locale }) });
    expect(isValidElement<{ locale?: string }>(page)).toBe(true);
    expect(isValidElement<{ locale?: string }>(page) ? page.props.locale : undefined).toBe(locale);
  });
});
