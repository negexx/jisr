import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";

import { DEMO_NAMESPACES } from "@/components/home/demo-namespaces";
import { Hero } from "@/components/home/hero";
import { HeroDemo } from "@/components/home/hero-demo";
import { Questions } from "@/components/home/questions";
import { TrustBand } from "@/components/home/trust-band";
import { routing } from "@/i18n/routing";
import { pickMessages } from "@/lib/i18n/client-messages";
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
  const [messages, t, tKind] = await Promise.all([
    getMessages(),
    getTranslations("home"),
    getTranslations("domain.infoKind"),
  ]);
  return (
    <div className="-my-8 md:-my-12">
      <Hero
        eyebrow={t("hero.eyebrow")}
        titleLead={t("hero.titleLead")}
        titleAccent={t("hero.titleAccent")}
        lead={t("lead")}
        cta={t("cta")}
        ctaNote={t("ctaNote")}
        matchesCta={t("matchesCta")}
        scholarshipsCta={t("scholarshipsCta")}
        demo={
          <NextIntlClientProvider
            locale={locale}
            messages={pickMessages(messages, DEMO_NAMESPACES)}
          >
            <HeroDemo
              copy={{
                title: t("demo.title"),
                illustrative: t("demo.illustrative"),
                fieldLabel: t("demo.fieldLabel"),
                levelLabel: t("demo.levelLabel"),
                field: {
                  computerScience: t("demo.field.computerScience"),
                  engineering: t("demo.field.engineering"),
                },
                level: { a2: t("demo.level.a2"), b2: t("demo.level.b2") },
                fact: {
                  institution: t("demo.fact.institution"),
                  teachingLanguage: t("demo.fact.teachingLanguage"),
                  tuition: t("demo.fact.tuition"),
                  toCheck: t("demo.fact.toCheck"),
                },
                reason: {
                  met: t("demo.reason.met"),
                  notMet: t("demo.reason.notMet"),
                  nonOfficial: t("demo.reason.nonOfficial"),
                  toCheck: t("demo.reason.toCheck"),
                },
              }}
            />
          </NextIntlClientProvider>
        }
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
