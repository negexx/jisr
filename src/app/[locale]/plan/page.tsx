import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";

import { PLAN_MESSAGE_NAMESPACES } from "@/components/plan/namespaces";
import { PlanClient } from "@/components/plan/plan-client";
import { routing } from "@/i18n/routing";
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

// Static: it holds the title and a neutral skeleton only. The saved list, the profile and the clock
// are read in the browser by the island, so no claim about the student is in the HTML.
export default async function PlanPage({ params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const [messages, t] = await Promise.all([getMessages(), getTranslations("plan")]);
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight text-balance">{t("title")}</h1>
      <NextIntlClientProvider
        locale={locale}
        messages={pickMessages(messages, PLAN_MESSAGE_NAMESPACES)}
      >
        <PlanClient locale={locale} />
      </NextIntlClientProvider>
    </div>
  );
}
