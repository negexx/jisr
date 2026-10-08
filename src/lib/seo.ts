import type { Metadata, MetadataRoute } from "next";

import { type AppLocale, routing } from "@/i18n/routing";

import type { SiteEnv } from "./site-env";

// Locale-relative paths that belong in the sitemap; "" is the home page. /matches, /plan and /compare
// are static shells around a personal client island: thin content, so they are noindex (ADR 0011).
export const INDEXABLE_PATHS: readonly string[] = ["", "/profile", "/scholarships"];

const SITE_NAME = "Jisr";

const OPEN_GRAPH_LOCALE: Record<AppLocale, string> = {
  fr: "fr_FR",
  en: "en_GB",
  ar: "ar_MA",
};

export function localizedUrl(siteUrl: string, locale: AppLocale, path: string): string {
  return `${siteUrl}/${locale}${path}`;
}

type Languages = Record<AppLocale | "x-default", string>;

function languageUrls(siteUrl: string, path: string): Languages {
  return {
    fr: localizedUrl(siteUrl, "fr", path),
    en: localizedUrl(siteUrl, "en", path),
    ar: localizedUrl(siteUrl, "ar", path),
    "x-default": localizedUrl(siteUrl, routing.defaultLocale, path),
  };
}

export function buildRobots(env: SiteEnv): MetadataRoute.Robots {
  if (!env.indexable || env.siteUrl === null) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return { rules: { userAgent: "*", allow: "/" }, sitemap: `${env.siteUrl}/sitemap.xml` };
}

export function buildSitemap(env: SiteEnv, programSlugs: readonly string[]): MetadataRoute.Sitemap {
  const { siteUrl } = env;
  if (!env.indexable || siteUrl === null) return [];
  const paths = [...INDEXABLE_PATHS, ...programSlugs.map((slug) => `/programs/${slug}`)];
  return paths.flatMap((path) => {
    const languages = languageUrls(siteUrl, path);
    return routing.locales.map((locale) => ({
      url: localizedUrl(siteUrl, locale, path),
      alternates: { languages },
    }));
  });
}

type PageMetadataArgs = {
  env: SiteEnv;
  locale: AppLocale;
  path: string;
  title: string;
  description: string;
  index?: boolean;
};

// openGraph and twitter are replaced, not merged, by a page's own value (Next metadata merging), so
// every page builds them here rather than inheriting from the layout.
export function pageMetadata({
  env,
  locale,
  path,
  title,
  description,
  index = true,
}: PageMetadataArgs): Metadata {
  const base: Metadata = { title, description };
  if (!index) return { ...base, robots: { index: false, follow: true } };
  const { siteUrl } = env;
  if (!env.indexable || siteUrl === null) return base;
  const url = localizedUrl(siteUrl, locale, path);
  return {
    ...base,
    alternates: { canonical: url, languages: languageUrls(siteUrl, path) },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title,
      description,
      url,
      locale: OPEN_GRAPH_LOCALE[locale],
    },
    twitter: { card: "summary", title, description },
  };
}
