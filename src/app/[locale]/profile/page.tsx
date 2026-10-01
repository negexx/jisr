import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";

import { ProfileForm } from "@/components/profile/profile-form";
import { routing } from "@/i18n/routing";
import { pickMessages } from "@/lib/i18n/client-messages";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations({ locale, namespace: "profile.meta" });
  return { title: t("title"), description: t("description") };
}

export default async function ProfilePage({ params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={pickMessages(messages, ["profile", "domain.textNote"])}
    >
      <ProfileForm locale={locale} />
    </NextIntlClientProvider>
  );
}
