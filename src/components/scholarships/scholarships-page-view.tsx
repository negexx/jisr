import "server-only";

import { useLocale, useTranslations } from "next-intl";

import { formatNumber } from "@/lib/journey/reasons";
import type { ScholarshipsPageData } from "@/lib/snapshot/server";

import { ScholarshipCard } from "./scholarship-card";

export function ScholarshipsPageView({ data }: { data: ScholarshipsPageData }) {
  const locale = useLocale();
  const t = useTranslations("scholarshipsPage");
  const nameOf = (code: string) => {
    const country = data.core.countries.find((c) => c.code === code);
    return (country === undefined ? undefined : data.text(country.name)?.text) ?? code;
  };
  const countLabel = (count: number) =>
    t("sectionCount", { n: count, count: formatNumber(count, locale) ?? String(count) });

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-balance">{t("title")}</h1>
        <p className="max-w-prose text-base text-muted-foreground">{t("intro")}</p>
      </header>

      {data.sections.length === 0 ? (
        <p className="text-base text-muted-foreground">{t("empty")}</p>
      ) : (
        <>
          <nav aria-label={t("jump.label")}>
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {data.sections.map(({ country, entries }) => (
                <li key={country}>
                  <a
                    href={`#country-${country}`}
                    className="inline-flex min-h-11 items-center text-base text-primary underline underline-offset-4"
                  >
                    <bdi>{nameOf(country)}</bdi>
                    <span className="ms-2 text-sm text-muted-foreground">
                      {countLabel(entries.length)}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          {data.sections.map(({ country, entries }) => (
            <section
              key={country}
              id={`country-${country}`}
              data-testid="scholarship-section"
              aria-labelledby={`country-${country}-heading`}
              className="flex scroll-mt-6 flex-col gap-2"
            >
              <h2
                id={`country-${country}-heading`}
                className="flex flex-wrap items-baseline gap-x-3 text-xl font-semibold"
              >
                <bdi>{nameOf(country)}</bdi>
                <span className="text-base font-normal text-muted-foreground">
                  {countLabel(entries.length)}
                </span>
              </h2>
              <ul className="divide-y divide-border border-y border-border">
                {entries.map((entry) => (
                  <ScholarshipCard
                    key={entry.scholarship.slug}
                    entry={entry}
                    data={data}
                    countryName={nameOf(country)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
