import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";

import { MatchesClient } from "@/components/matches/matches-client";
import { MatchesSkeleton } from "@/components/matches/matches-skeleton";
import { MatchesSummary } from "@/components/matches/matches-summary";
import { MATCHES_MESSAGE_NAMESPACES } from "@/components/matches/namespaces";
import { PageBand } from "@/components/page-band";
import {
  loadReportCopy,
  ReportOutdatedEntry,
} from "@/components/report-outdated/report-outdated-entry";
import { routing } from "@/i18n/routing";
import { pickMessages } from "@/lib/i18n/client-messages";
import { pageMetadata } from "@/lib/seo";
import { readSiteEnv } from "@/lib/site-env";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations({ locale, namespace: "matches.meta" });
  return pageMetadata({
    env: readSiteEnv(),
    locale,
    path: "/matches",
    title: t("title"),
    description: t("description"),
    index: false,
  });
}

export default async function MatchesPage({ params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const [messages, t, reportCopy] = await Promise.all([
    getMessages(),
    getTranslations("matches"),
    loadReportCopy(locale),
  ]);
  return (
    <div className="-mt-8 md:-mt-12">
      <NextIntlClientProvider
        locale={locale}
        messages={pickMessages(messages, MATCHES_MESSAGE_NAMESPACES)}
      >
        <PageBand title={t("title")} lead={t("lead")}>
          <MatchesSummary />
        </PageBand>
        <div className="pt-8 md:pt-12">
          <ReportOutdatedEntry copy={reportCopy} locale={locale}>
            {/* The island reads useSearchParams, so this statically rendered page keeps it behind a
                boundary; the fallback is the same busy skeleton the island shows before hydration. */}
            <Suspense
              fallback={
                <div aria-busy="true">
                  <MatchesSkeleton />
                </div>
              }
            >
              <MatchesClient locale={locale} />
            </Suspense>
          </ReportOutdatedEntry>
        </div>
      </NextIntlClientProvider>
    </div>
  );
}
