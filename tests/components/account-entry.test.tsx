import { createTranslator } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AccountEntry } from "@/components/auth/account-entry";
import { routing } from "@/i18n/routing";

import ar from "../../messages/ar.json";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

const catalogues = { fr, en, ar } as const;

vi.mock("next-intl/server", () => ({
  getTranslations: async ({
    locale,
    namespace,
  }: {
    locale: keyof typeof catalogues;
    namespace: string;
  }) => createTranslator({ locale, messages: catalogues[locale], namespace } as never),
}));
vi.mock("@/components/auth/account-menu-loader", () => ({
  AccountMenuLoader: () => null,
}));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe.each(routing.locales)("account entry (%s)", (locale) => {
  it.each([
    undefined,
    "",
    "false",
    "yes",
  ])("renders nothing while ACCOUNTS_ENABLED is %j", async (value) => {
    vi.stubEnv("ACCOUNTS_ENABLED", value);
    expect(await AccountEntry({ locale })).toBeNull();
  });

  it("hands the lazy menu this locale's copy when accounts are on", async () => {
    vi.stubEnv("ACCOUNTS_ENABLED", "true");
    const entry = await AccountEntry({ locale });
    expect(entry?.props).toEqual({
      locale,
      labels: catalogues[locale].account,
    });
  });
});
