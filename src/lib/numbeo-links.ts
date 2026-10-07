// Zod-free. Used only by the server-only NumbeoLink on the programme page. A link only: no Numbeo figure is stored or shown.
import type { AppLocale } from "@/i18n/routing";
import { intlLocale } from "@/lib/format";

export type NumbeoLink = { url: string; kind: "city" | "country" };

export type NumbeoLinkView = {
  href: string;
  kind: NumbeoLink["kind"];
  // City name for a city page, country name for a country page, in the active locale.
  place: string;
};

const CITY_BASE = "https://www.numbeo.com/cost-of-living/in/";
const COUNTRY_BASE = "https://www.numbeo.com/cost-of-living/country_result.jsp?country=";

// Numbeo names its pages "Name-Country" for most cities and the bare name for a few, and an unknown
// name returns "Cannot find city id": only a page seen to exist is listed, so no city url is ever built.
// Each of the 23 pages below was fetched in the 2026-10-05 runs and its cached page shows
// `<h1> Cost of Living in <City>` plus the breadcrumb country: Paris from the sample page; Budapest,
// Ancona, Bari, Bologna, Alkmaar, Almere and Amsterdam from the first sample run; the DE, FR and HU
// ones from the parked profiles in data-staging/parked-numbeo/.
const NUMBEO_CITY_PAGES: Readonly<Record<string, string>> = {
  "DE/aachen": "Aachen",
  "DE/aalen": "Aalen-Germany",
  "DE/ansbach": "Ansbach-Germany",
  "DE/aschaffenburg": "Aschaffenburg-Germany",
  "DE/augsburg": "Augsburg",
  "DE/berlin": "Berlin",
  "DE/bremerhaven": "Bremerhaven-Germany",
  "DE/coburg": "Coburg-Germany",
  "DE/duisburg": "Duisburg-Germany",
  "FR/agen": "Agen-France",
  "FR/albi": "Albi-France",
  "FR/amiens": "Amiens-France",
  "FR/angers": "Angers-France",
  "FR/paris": "Paris",
  "HU/baja": "Baja-Hungary",
  "HU/bekescsaba": "B%C3%A9k%C3%A9scsaba-Hungary",
  "HU/budapest": "Budapest",
  "IT/ancona": "Ancona",
  "IT/bari": "Bari",
  "IT/bologna": "Bologna",
  "NL/alkmaar": "Alkmaar",
  "NL/almere": "Almere",
  "NL/amsterdam": "Amsterdam",
};

const NUMBEO_COUNTRY_NAMES: Readonly<Record<string, string>> = {
  FR: "France",
  DE: "Germany",
  NL: "Netherlands",
  IT: "Italy",
  HU: "Hungary",
};

export function numbeoLinkFor(country: string, citySlug: string): NumbeoLink | null {
  const countryName = Object.hasOwn(NUMBEO_COUNTRY_NAMES, country)
    ? NUMBEO_COUNTRY_NAMES[country]
    : undefined;
  if (countryName === undefined) return null;
  const cityKey = `${country}/${citySlug}`;
  const cityPage = Object.hasOwn(NUMBEO_CITY_PAGES, cityKey)
    ? NUMBEO_CITY_PAGES[cityKey]
    : undefined;
  if (cityPage !== undefined) return { url: `${CITY_BASE}${cityPage}`, kind: "city" };
  return { url: `${COUNTRY_BASE}${countryName}`, kind: "country" };
}

function regionName(country: string, locale: AppLocale): string {
  try {
    return new Intl.DisplayNames([intlLocale(locale)], { type: "region" }).of(country) ?? country;
  } catch {
    return country;
  }
}

export function numbeoLinkView(
  country: string,
  citySlug: string,
  cityName: string,
  locale: AppLocale,
): NumbeoLinkView | null {
  const link = numbeoLinkFor(country, citySlug);
  if (link === null) return null;
  return {
    href: link.url,
    kind: link.kind,
    place: link.kind === "city" ? cityName : regionName(country, locale),
  };
}
