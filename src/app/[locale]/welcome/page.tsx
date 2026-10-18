import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";

import { WELCOME_MESSAGE_NAMESPACES } from "@/components/auth/namespaces";
import { PostAuthLanding } from "@/components/auth/post-auth-landing";
import { PageBand } from "@/components/page-band";
import { routing } from "@/i18n/routing";
import { accountsEnabled } from "@/lib/auth/accounts-enabled";
import { pickMessages } from "@/lib/i18n/client-messages";
import { pageMetadata } from "@/lib/seo";
import { readSiteEnv } from "@/lib/site-env";

type Props = { params: Promise<{ locale: string }> };

// Same rule as the sign-in page (ruling P4): prerendered, so the switch is read at build time and
// the page does not exist while accounts are off.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale) || !accountsEnabled()) notFound();
  const t = await getTranslations({ locale, namespace: "welcome.meta" });
  return pageMetadata({
    env: readSiteEnv(),
    locale,
    path: "/welcome",
    title: t("title"),
    description: t("description"),
    index: false,
  });
}

export default async function WelcomePage({ params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale) || !accountsEnabled()) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "welcome" });
  const messages = await getMessages();
  return (
    <>
      <PageBand title={t("title")} lead={t("lead")} />
      {/* Keeps the footer below the fold before the landing resolves, so it cannot jump off-screen
          when the post-auth redirect swaps in the sign-in page (design audit D1). */}
      <div className="min-h-[calc(100dvh-8rem)] pt-8">
        <NextIntlClientProvider
          locale={locale}
          messages={pickMessages(messages, WELCOME_MESSAGE_NAMESPACES)}
        >
          <PostAuthLanding locale={locale} />
        </NextIntlClientProvider>
      </div>
    </>
  );
}
