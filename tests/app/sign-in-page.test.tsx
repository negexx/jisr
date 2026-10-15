import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import SignInPage, { generateMetadata } from "@/app/[locale]/sign-in/page";
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

vi.mock("@/lib/server/signup", () => ({ requestSignInLink: async () => ({ ok: true }) }));

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
])("sign-in page with ACCOUNTS_ENABLED %s", (_label, value) => {
  it.each(routing.locales)("does not exist (%s)", async (locale) => {
    vi.stubEnv("ACCOUNTS_ENABLED", value);
    state.locale = locale;
    await expect(SignInPage(props(locale))).rejects.toThrow(NOT_FOUND);
    await expect(generateMetadata(props(locale))).rejects.toThrow(NOT_FOUND);
  });
});

describe("sign-in page with accounts on", () => {
  it.each(
    routing.locales,
  )("renders the form, unticked, and is not indexed (%s)", async (locale) => {
    vi.stubEnv("ACCOUNTS_ENABLED", "true");
    state.locale = locale;
    // Rendered outside Next, the nested provider has no request time zone and next-intl reports
    // that once; nothing on this page formats a date.
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const html = renderToStaticMarkup(await SignInPage(props(locale)));
    for (const [message] of logged.mock.calls)
      expect(String(message)).toMatch(/ENVIRONMENT_FALLBACK/);
    logged.mockRestore();
    const checkboxes = html.match(/<input[^>]*type="checkbox"[^>]*>/g) ?? [];
    expect(checkboxes).toHaveLength(2);
    for (const box of checkboxes) expect(box).not.toContain("checked");
    expect(html).toContain(catalogues[locale].signup.submit);
    const metadata = await generateMetadata(props(locale));
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });

  it("refuses an unknown locale", async () => {
    vi.stubEnv("ACCOUNTS_ENABLED", "true");
    await expect(SignInPage(props("de"))).rejects.toThrow(NOT_FOUND);
  });
});
