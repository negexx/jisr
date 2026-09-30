import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";

import { MatchesClient } from "@/components/matches/matches-client";
import { MATCHES_MESSAGE_NAMESPACES } from "@/components/matches/namespaces";
import { routing } from "@/i18n/routing";
import { pickMessages } from "@/lib/i18n/client-messages";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations({ locale, namespace: "matches.meta" });
  return { title: t("title"), description: t("description") };
}

export default async function MatchesPage({ params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const [messages, t] = await Promise.all([getMessages(), getTranslations("matches")]);
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-balance">{t("title")}</h1>
        <p className="max-w-prose text-base text-muted-foreground">{t("lead")}</p>
      </header>
      <NextIntlClientProvider
        locale={locale}
        messages={pickMessages(messages, MATCHES_MESSAGE_NAMESPACES)}
      >
        <MatchesClient locale={locale} />
      </NextIntlClientProvider>
    </div>
  );
}
