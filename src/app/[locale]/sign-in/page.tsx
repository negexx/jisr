import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";

import { SIGN_IN_MESSAGE_NAMESPACES } from "@/components/auth/namespaces";
import { SignInForm } from "@/components/auth/sign-in-form";
import { PageBand } from "@/components/page-band";
import { SessionText } from "@/components/session-text";
import { routing } from "@/i18n/routing";
import { accountsEnabled } from "@/lib/auth/accounts-enabled";
import { pickMessages } from "@/lib/i18n/client-messages";
import { pageMetadata } from "@/lib/seo";
import { readSiteEnv } from "@/lib/site-env";

type Props = { params: Promise<{ locale: string }> };

// The page is prerendered, so the switch is read at build time (ruling P4): while accounts are off
// the surface does not exist at all, the same 404 as any unknown path. The per-request gates stay in
// the auth handler and in the Server Action, which refuse on their own if the switch is turned off
// later without a redeploy.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale) || !accountsEnabled()) notFound();
  const t = await getTranslations({ locale, namespace: "signup.meta" });
  return pageMetadata({
    env: readSiteEnv(),
    locale,
    path: "/sign-in",
    title: t("title"),
    description: t("description"),
    index: false,
  });
}

export default async function SignInPage({ params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale) || !accountsEnabled()) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "signup" });
  const messages = await getMessages();
  return (
    <>
      <PageBand
        title={t("title")}
        lead={<SessionText guest={t("lead")} signedIn={t("leadSignedIn")} />}
      />
      <div className="pt-8">
        <NextIntlClientProvider
          locale={locale}
          messages={pickMessages(messages, SIGN_IN_MESSAGE_NAMESPACES)}
        >
          <SignInForm locale={locale} />
        </NextIntlClientProvider>
      </div>
    </>
  );
}
