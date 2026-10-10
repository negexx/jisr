import { afterEach, describe, expect, it, vi } from "vitest";

import * as compare from "@/app/[locale]/compare/page";
import * as layout from "@/app/[locale]/layout";
import * as matches from "@/app/[locale]/matches/page";
import * as home from "@/app/[locale]/page";
import * as plan from "@/app/[locale]/plan/page";
import * as privacy from "@/app/[locale]/privacy/page";
import * as profile from "@/app/[locale]/profile/page";
import * as program from "@/app/[locale]/programs/[slug]/page";
import * as scholarships from "@/app/[locale]/scholarships/page";
import * as terms from "@/app/[locale]/terms/page";
import type { AppLocale } from "@/i18n/routing";

// Wiring only: the page copy is covered by each page's own test. Here the translations are stubs so the
// assertions are about the env-dependent part of the metadata (canonical, alternates, robots).
// next/font only works under Next's compiler; the layout imports it.
vi.mock("@/app/fonts", () => ({ fontVariables: "font-test" }));

vi.mock("next-intl/server", () => ({
  setRequestLocale: () => undefined,
  getMessages: async () => ({}),
  getTranslations: async () => (key: string) => key,
}));

vi.mock("@/lib/snapshot/server", () => ({
  loadScholarshipsPageData: async () => null,
  programStaticParams: async () => [],
  loadProgramPageData: async (slug: string) =>
    slug === "xx-test-program"
      ? { program: { name: "XX Program", summary: null }, institution: null, text: () => null }
      : null,
}));

vi.mock("@/lib/legal/documents", () => {
  const Doc = () => null;
  return { PRIVACY: { en: Doc, fr: Doc, ar: Doc }, TERMS: { en: Doc, fr: Doc, ar: Doc } };
});

const SITE = "https://x.test";
const LOCALES: readonly AppLocale[] = ["fr", "ar"];
const SLUG = "xx-test-program";

type MetadataOf = (locale: AppLocale) => Promise<{
  robots?: unknown;
  alternates?: { canonical?: unknown; languages?: unknown } | null;
  openGraph?: unknown;
}>;

const indexablePages: Array<[string, string, MetadataOf]> = [
  ["home", "", (locale) => home.generateMetadata({ params: Promise.resolve({ locale }) })],
  [
    "profile",
    "/profile",
    (locale) => profile.generateMetadata({ params: Promise.resolve({ locale }) }),
  ],
  [
    "scholarships",
    "/scholarships",
    (locale) => scholarships.generateMetadata({ params: Promise.resolve({ locale }) }),
  ],
  [
    "privacy",
    "/privacy",
    (locale) => privacy.generateMetadata({ params: Promise.resolve({ locale }) }),
  ],
  ["terms", "/terms", (locale) => terms.generateMetadata({ params: Promise.resolve({ locale }) })],
  [
    "program",
    `/programs/${SLUG}`,
    (locale) => program.generateMetadata({ params: Promise.resolve({ locale, slug: SLUG }) }),
  ],
];

const personalShells: Array<[string, MetadataOf]> = [
  ["matches", (locale) => matches.generateMetadata({ params: Promise.resolve({ locale }) })],
  ["plan", (locale) => plan.generateMetadata({ params: Promise.resolve({ locale }) })],
  ["compare", (locale) => compare.generateMetadata({ params: Promise.resolve({ locale }) })],
];

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("page metadata wiring, indexable build", () => {
  it.each(
    indexablePages.flatMap(([name, path, metadataOf]) =>
      LOCALES.map((locale) => [name, path, locale, metadataOf] as const),
    ),
  )("%s %s sets a canonical and all alternates (%s)", async (_name, path, locale, metadataOf) => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", SITE);
    const metadata = await metadataOf(locale);
    expect(metadata.alternates?.canonical).toBe(`${SITE}/${locale}${path}`);
    expect(metadata.alternates?.languages).toEqual({
      fr: `${SITE}/fr${path}`,
      en: `${SITE}/en${path}`,
      ar: `${SITE}/ar${path}`,
      "x-default": `${SITE}/fr${path}`,
    });
    expect(metadata.robots).toBeUndefined();
  });

  it.each(
    personalShells.flatMap(([name, metadataOf]) =>
      LOCALES.map((locale) => [name, locale, metadataOf] as const),
    ),
  )("%s is noindex with no alternates (%s)", async (_name, locale, metadataOf) => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", SITE);
    const metadata = await metadataOf(locale);
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.alternates).toBeUndefined();
  });
});

describe("page metadata wiring, build that is not indexable", () => {
  it.each(
    indexablePages.flatMap(([name, , metadataOf]) =>
      LOCALES.map((locale) => [name, locale, metadataOf] as const),
    ),
  )("%s has no alternates or open graph (%s)", async (_name, locale, metadataOf) => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    const metadata = await metadataOf(locale);
    expect(metadata.alternates).toBeUndefined();
    expect(metadata.openGraph).toBeUndefined();
  });

  it("is not indexable on a Vercel preview even with a site url", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", SITE);
    vi.stubEnv("VERCEL_ENV", "preview");
    const metadata = await home.generateMetadata({ params: Promise.resolve({ locale: "fr" }) });
    expect(metadata.alternates).toBeUndefined();
    expect(metadata.openGraph).toBeUndefined();
  });
});

describe("locale layout generateMetadata", () => {
  it("returns nothing when the site url is unset", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(layout.generateMetadata()).toEqual({});
  });

  it("returns the metadata base when the site url is set", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", SITE);
    expect(layout.generateMetadata()).toEqual({ metadataBase: new URL(SITE) });
  });
});
