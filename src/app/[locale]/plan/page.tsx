import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";

import { PageBand } from "@/components/page-band";
import { PLAN_MESSAGE_NAMESPACES } from "@/components/plan/namespaces";
import { PlanClient } from "@/components/plan/plan-client";
import {
  loadReportCopy,
  ReportOutdatedEntry,
} from "@/components/report-outdated/report-outdated-entry";
import { SessionText } from "@/components/session-text";
import { routing } from "@/i18n/routing";
import { accountsEnabled } from "@/lib/auth/accounts-enabled";
import { pickMessages } from "@/lib/i18n/client-messages";
import { pageMetadata } from "@/lib/seo";
import { readSiteEnv } from "@/lib/site-env";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations({ locale, namespace: "plan.meta" });
  return pageMetadata({
    env: readSiteEnv(),
    locale,
    path: "/plan",
    title: t("title"),
    description: t("description"),
    index: false,
  });
}

// Static: the band carries the title and the lead only. The saved list, the profile and the clock
// are read in the browser by the island, so no claim about the student is in the HTML.
export default async function PlanPage({ params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const [messages, t, reportCopy] = await Promise.all([
    getMessages(),
    getTranslations("plan"),
    loadReportCopy(locale),
  ]);
  return (
    <div className="-mt-8 md:-mt-12">
      <PageBand
        eyebrow={t("eyebrow")}
        title={t("title")}
        lead={
          accountsEnabled() ? (
            <SessionText guest={t("lead")} signedIn={t("leadSignedIn")} />
          ) : (
            t("lead")
          )
        }
      />
      <div className="pt-8 md:pt-12">
        <NextIntlClientProvider
          locale={locale}
          messages={pickMessages(messages, PLAN_MESSAGE_NAMESPACES)}
        >
          <ReportOutdatedEntry copy={reportCopy} locale={locale}>
            <PlanClient locale={locale} />
          </ReportOutdatedEntry>
        </NextIntlClientProvider>
      </div>
    </div>
  );
}
