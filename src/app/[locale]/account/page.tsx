import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";

import { AccountPage } from "@/components/auth/account-page";
import { ACCOUNT_PAGE_MESSAGE_NAMESPACES } from "@/components/auth/namespaces";
import { PageBand } from "@/components/page-band";
import { routing } from "@/i18n/routing";
import { accountsEnabled } from "@/lib/auth/accounts-enabled";
import { ACCOUNT_PATH } from "@/lib/auth/callback-urls";
import { pickMessages } from "@/lib/i18n/client-messages";
import { pageMetadata } from "@/lib/seo";
import { readSiteEnv } from "@/lib/site-env";

type Props = { params: Promise<{ locale: string }> };

// Same rule as the sign-in, welcome and delete pages (ruling P4): prerendered, so the switch is read
// at build time and the page does not exist while accounts are off. The session is read in the
// browser by the island, so the static HTML holds no claim about the student.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale) || !accountsEnabled()) notFound();
  const t = await getTranslations({ locale, namespace: "accountPage.meta" });
  return pageMetadata({
    env: readSiteEnv(),
    locale,
    path: ACCOUNT_PATH,
    title: t("title"),
    description: t("description"),
    index: false,
  });
}

export default async function AccountRoute({ params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale) || !accountsEnabled()) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "accountPage" });
  const messages = await getMessages();
  return (
    <>
      <PageBand title={t("title")} lead={t("lead")} />
      <div className="pt-8">
        <NextIntlClientProvider
          locale={locale}
          messages={pickMessages(messages, ACCOUNT_PAGE_MESSAGE_NAMESPACES)}
        >
          <AccountPage locale={locale} />
        </NextIntlClientProvider>
      </div>
    </>
  );
}
