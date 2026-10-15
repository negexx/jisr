import "server-only";

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";

import { PROGRAM_CLIENT_NAMESPACES } from "@/components/program/client-namespaces";
import { ProgramPageView } from "@/components/program/program-page-view";
import {
  loadReportCopy,
  ReportOutdatedEntry,
} from "@/components/report-outdated/report-outdated-entry";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { pickMessages } from "@/lib/i18n/client-messages";
import { pageMetadata } from "@/lib/seo";
import { readSiteEnv } from "@/lib/site-env";
import {
  loadProgramPageData,
  programAliasTarget,
  programStaticParams,
} from "@/lib/snapshot/server";

type Props = { params: Promise<{ locale: string; slug: string }> };

// Every page is generated at build time from public/snapshots, which is not traced into server
// functions on Vercel: an unknown slug must be a 404, never a runtime render that would fail.
export const dynamicParams = false;

// The [locale] layout generates the locales; this runs once per locale and adds the slugs: the live
// ones and the former slugs of renamed programmes, which redirect to the current slug.
export async function generateStaticParams(): Promise<Array<{ slug: string }>> {
  return programStaticParams();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const data = await loadProgramPageData(slug, locale);
  if (data === null) {
    if ((await programAliasTarget(slug)) !== null) return { robots: { index: false } };
    notFound();
  }
  const t = await getTranslations({ locale, namespace: "program.meta" });
  const program = data.program.name;
  return pageMetadata({
    env: readSiteEnv(),
    locale,
    path: `/programs/${slug}`,
    title:
      data.institution === null
        ? t("titleWithoutInstitution", { program })
        : t("title", { program, institution: data.institution.name }),
    description: data.text(data.program.summary)?.text ?? t("description", { program }),
  });
}

export default async function ProgramPage({ params }: Props) {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const data = await loadProgramPageData(slug, locale);
  if (data === null) {
    const current = await programAliasTarget(slug);
    if (current === null) notFound();
    return redirect({ href: `/programs/${current}`, locale });
  }
  const [messages, reportCopy] = await Promise.all([getMessages(), loadReportCopy(locale)]);
  return (
    <ReportOutdatedEntry copy={reportCopy} locale={locale} snapshotVersion={data.snapshotVersion}>
      <ProgramPageView
        data={data}
        locale={locale}
        clientMessages={pickMessages(messages, PROGRAM_CLIENT_NAMESPACES)}
      />
    </ReportOutdatedEntry>
  );
}
