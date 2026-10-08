import "server-only";

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ScholarshipsPageView } from "@/components/scholarships/scholarships-page-view";
import { routing } from "@/i18n/routing";
import { loadScholarshipsPageData } from "@/lib/snapshot/server";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations({ locale, namespace: "scholarshipsPage.meta" });
  return { title: t("title"), description: t("description") };
}

// Static: generated from public/snapshots at build time. The nationality line and the freshness
// marks are client leaves, so no claim about the student or the clock is in the HTML.
export default async function ScholarshipsPage({ params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const data = await loadScholarshipsPageData(locale);
  return <ScholarshipsPageView data={data} />;
}
