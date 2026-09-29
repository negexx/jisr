import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { LocaleSwitcher } from "@/components/locale-switcher";
import { routing } from "@/i18n/routing";

type Props = { params: Promise<{ locale: string }> };

const STEP_KEYS = ["profile", "options", "costs", "scholarships", "plan"] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations({ locale, namespace: "metadata" });
  return { title: t("title"), description: t("description") };
}

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("home");
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 px-4 py-10 text-start">
      <header className="flex justify-end">
        <LocaleSwitcher current={locale} />
      </header>
      <section className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-lg text-muted-foreground">{t("lead")}</p>
      </section>
      <section aria-labelledby="journey" className="flex flex-col gap-3">
        <h2 id="journey" className="text-xl font-medium">
          {t("stepsTitle")}
        </h2>
        <ol className="list-decimal ps-6">
          {STEP_KEYS.map((key) => (
            <li key={key}>{t(`steps.${key}`)}</li>
          ))}
        </ol>
      </section>
      <p className="text-sm text-muted-foreground">{t("comingSoon")}</p>
    </main>
  );
}
