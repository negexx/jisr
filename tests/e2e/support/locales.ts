export const E2E_LOCALES = [
  { locale: "fr", dir: "ltr" },
  { locale: "ar", dir: "rtl" },
] as const;

export type E2eLocale = (typeof E2E_LOCALES)[number]["locale"];
