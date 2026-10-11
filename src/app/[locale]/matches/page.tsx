import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";

import { MatchesClient } from "@/components/matches/matches-client";
import { MatchesSummary } from "@/components/matches/matches-summary";
import { MATCHES_MESSAGE_NAMESPACES } from "@/components/matches/namespaces";
import { PageBand } from "@/components/page-band";
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
  const [messages, t] = await Promise.all([getMessages(), getTranslations("matches")]);
  return (
    <div className="-mt-8 md:-mt-12">
      <NextIntlClientProvider
        locale={locale}
        messages={pickMessages(messages, MATCHES_MESSAGE_NAMESPACES)}
      >
        <PageBand title={t("title")} lead={t("lead")}>
          <MatchesSummary locale={locale} />
        </PageBand>
        <div className="pt-8 md:pt-12">
          <MatchesClient locale={locale} />
        </div>
      </NextIntlClientProvider>
    </div>
  );
}
