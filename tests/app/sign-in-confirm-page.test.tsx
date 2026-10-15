import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import SignInConfirmPage, { generateMetadata } from "@/app/[locale]/sign-in/confirm/page";
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
])("sign-in confirm page with ACCOUNTS_ENABLED %s", (_label, value) => {
  it.each(routing.locales)("does not exist (%s)", async (locale) => {
    vi.stubEnv("ACCOUNTS_ENABLED", value);
    state.locale = locale;
    await expect(SignInConfirmPage(props(locale))).rejects.toThrow(NOT_FOUND);
    await expect(generateMetadata(props(locale))).rejects.toThrow(NOT_FOUND);
  });
});

describe("sign-in confirm page with accounts on (todo 28, F3)", () => {
  it.each(
    routing.locales,
  )("prerenders only a neutral placeholder and is not indexed (%s)", async (locale) => {
    vi.stubEnv("ACCOUNTS_ENABLED", "true");
    state.locale = locale;
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const html = renderToStaticMarkup(await SignInConfirmPage(props(locale)));
    for (const [message] of logged.mock.calls)
      expect(String(message)).toMatch(/ENVIRONMENT_FALLBACK/);
    logged.mockRestore();
    // The token is in the fragment, read after mount: the static HTML holds no button that could
    // sign in, only the neutral reading state.
    expect(html).toContain(catalogues[locale].signInConfirm.reading);
    expect(html).not.toContain("<button");
    const metadata = await generateMetadata(props(locale));
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });

  it("refuses an unknown locale", async () => {
    vi.stubEnv("ACCOUNTS_ENABLED", "true");
    await expect(SignInConfirmPage(props("de"))).rejects.toThrow(NOT_FOUND);
  });
});
