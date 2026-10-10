import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Hero } from "@/components/home/hero";
import { Questions } from "@/components/home/questions";
import { TrustBand } from "@/components/home/trust-band";
import { routing } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";
import { readSiteEnv } from "@/lib/site-env";

type Props = { params: Promise<{ locale: string }> };

const QUESTION_KEYS = ["where", "apply", "cost", "next"] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations({ locale, namespace: "metadata" });
  return pageMetadata({
    env: readSiteEnv(),
    locale,
    path: "",
    title: t("title"),
    description: t("description"),
  });
}

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("home");
  const tKind = await getTranslations("domain.infoKind");
  return (
    <div className="flex flex-col">
      <Hero
        eyebrow={t("hero.eyebrow")}
        titleLead={t("hero.titleLead")}
        titleAccent={t("hero.titleAccent")}
        lead={t("lead")}
        cta={t("cta")}
        ctaNote={t("ctaNote")}
        matchesCta={t("matchesCta")}
        scholarshipsCta={t("scholarshipsCta")}
      />
      <Questions
        kicker={t("questions.kicker")}
        title={t("questionsTitle")}
        items={QUESTION_KEYS.map((key) => ({
          key,
          title: t(`questions.${key}.title`),
          body: t(`questions.${key}.body`),
        }))}
      />
      <TrustBand
        kicker={t("trust.kicker")}
        titleLead={t("trust.titleLead")}
        titleAccent={t("trust.titleAccent")}
        body={t("trust.body")}
        labels={{
          official: tKind("official.label"),
          estimate: tKind("estimate.label"),
          guidance: tKind("guidance.label"),
        }}
        legend={{
          official: t("trust.legend.official"),
          estimate: t("trust.legend.estimate"),
          guidance: t("trust.legend.guidance"),
        }}
      />
    </div>
  );
}
