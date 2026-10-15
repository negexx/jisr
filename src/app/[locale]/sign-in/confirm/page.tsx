import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";

import { SIGN_IN_CONFIRM_MESSAGE_NAMESPACES } from "@/components/auth/namespaces";
import { SignInConfirm } from "@/components/auth/sign-in-confirm";
import { PageBand } from "@/components/page-band";
import { routing } from "@/i18n/routing";
import { accountsEnabled } from "@/lib/auth/accounts-enabled";
import { SIGN_IN_CONFIRM_PATH } from "@/lib/auth/callback-urls";
import { pickMessages } from "@/lib/i18n/client-messages";
import { pageMetadata } from "@/lib/seo";
import { readSiteEnv } from "@/lib/site-env";

type Props = { params: Promise<{ locale: string }> };

// Same rule as the sign-in, welcome and deletion pages (ruling P4): prerendered, so the switch is
// read at build time and the page does not exist while accounts are off. The token is read in the
// browser from the fragment, which never reaches the server (todo 28, F3).
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale) || !accountsEnabled()) notFound();
  const t = await getTranslations({ locale, namespace: "signInConfirm.meta" });
  return pageMetadata({
    env: readSiteEnv(),
    locale,
    path: SIGN_IN_CONFIRM_PATH,
    title: t("title"),
    description: t("description"),
    index: false,
  });
}

export default async function SignInConfirmPage({ params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale) || !accountsEnabled()) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "signInConfirm" });
  const messages = await getMessages();
  return (
    <>
      <PageBand title={t("title")} lead={t("lead")} />
      <div className="pt-8">
        <NextIntlClientProvider
          locale={locale}
          messages={pickMessages(messages, SIGN_IN_CONFIRM_MESSAGE_NAMESPACES)}
        >
          <SignInConfirm locale={locale} />
        </NextIntlClientProvider>
      </div>
    </>
  );
}
