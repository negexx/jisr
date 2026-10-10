import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { routing } from "@/i18n/routing";
import { PRIVACY } from "@/lib/legal/documents";
import { pageMetadata } from "@/lib/seo";
import { readSiteEnv } from "@/lib/site-env";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations({ locale, namespace: "legal.privacy.meta" });
  return pageMetadata({
    env: readSiteEnv(),
    locale,
    path: "/privacy",
    title: t("title"),
    description: t("description"),
  });
}

export default async function PrivacyPage({ params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "legal" });
  const Document = PRIVACY[locale];
  return (
    <article className="max-w-prose text-start">
      <Document />
      <p className="mt-8 text-sm text-muted-foreground">{t("updated")}</p>
    </article>
  );
}
