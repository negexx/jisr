import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { HomeMatchesLink } from "@/components/home-matches-link";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
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
  return (
    <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] md:items-start md:gap-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
      <section className="flex flex-col gap-6 text-start">
        <div className="flex flex-col gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-balance">{t("title")}</h1>
          <p className="max-w-[65ch] text-lg text-muted-foreground">{t("lead")}</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-[auto_auto] sm:justify-start sm:gap-x-3">
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href="/profile">
              {t("cta")}
              <ArrowRight data-icon="inline-end" className="rtl:rotate-180" aria-hidden />
            </Link>
          </Button>
          {/* Reserved slot: it holds the button's height, so a saved profile shifts nothing. On a
              phone the order is the primary button, the note, this slot, then the scholarships
              link: the slot and the link are both order-last, and DOM order breaks the tie. */}
          <div className="order-last sm:order-none">
            <HomeMatchesLink label={t("matchesCta")} />
          </div>
          <p className="text-sm text-muted-foreground sm:col-span-2">{t("ctaNote")}</p>
          <p className="order-last sm:order-none sm:col-span-2">
            <Link
              href="/scholarships"
              prefetch={false}
              className="inline-flex min-h-11 items-center gap-1 text-base font-medium text-primary underline underline-offset-4"
            >
              {t("scholarshipsCta")}
              <ArrowRight aria-hidden className="size-4 rtl:rotate-180" />
            </Link>
          </p>
        </div>
      </section>
      <section aria-labelledby="questions" className="flex flex-col gap-4 text-start">
        <h2 id="questions" className="text-xl font-semibold">
          {t("questionsTitle")}
        </h2>
        <ol className="divide-y divide-border border-y border-border">
          {QUESTION_KEYS.map((key, index) => (
            <li key={key} className="flex gap-4 py-4">
              <span aria-hidden className="w-6 shrink-0 text-lg font-medium text-muted-foreground">
                {index + 1}
              </span>
              <div className="flex flex-col gap-1">
                <h3 className="text-lg font-medium">{t(`questions.${key}.title`)}</h3>
                <p className="text-base text-muted-foreground">{t(`questions.${key}.body`)}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
