import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import AccountRoute, { generateMetadata } from "@/app/[locale]/account/page";
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

const NOT_FOUND = /NEXT_HTTP_ERROR_FALLBACK;404/;

function props(locale: string) {
  return { params: Promise.resolve({ locale }) };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe.each([
  ["unset", undefined],
  ["empty", ""],
  ["false", "false"],
])("account page with ACCOUNTS_ENABLED %s", (_label, value) => {
  it.each(routing.locales)("does not exist (%s)", async (locale) => {
    vi.stubEnv("ACCOUNTS_ENABLED", value);
    state.locale = locale;
    await expect(AccountRoute(props(locale))).rejects.toThrow(NOT_FOUND);
    await expect(generateMetadata(props(locale))).rejects.toThrow(NOT_FOUND);
  });
});

describe("account page with accounts on", () => {
  it.each(
    routing.locales,
  )("prerenders only a neutral placeholder and is not indexed (%s)", async (locale) => {
    vi.stubEnv("ACCOUNTS_ENABLED", "true");
    state.locale = locale;
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const html = renderToStaticMarkup(await AccountRoute(props(locale)));
    for (const [message] of logged.mock.calls)
      expect(String(message)).toMatch(/ENVIRONMENT_FALLBACK/);
    logged.mockRestore();
    expect(html).toContain(catalogues[locale].accountPage.checking);
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<a ");
    const metadata = await generateMetadata(props(locale));
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });

  it("refuses an unknown locale", async () => {
    vi.stubEnv("ACCOUNTS_ENABLED", "true");
    await expect(AccountRoute(props("de"))).rejects.toThrow(NOT_FOUND);
  });
});
