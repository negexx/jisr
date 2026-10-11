import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { GUIDES } from "@/lib/guides/catalog";
import { pageMetadata } from "@/lib/seo";
import { readSiteEnv } from "@/lib/site-env";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations({ locale, namespace: "guides.meta" });
  return pageMetadata({
    env: readSiteEnv(),
    locale,
    path: "/guides",
    title: t("title"),
    description: t("description"),
  });
}

export default async function GuidesPage({ params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "guides" });
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 md:px-6 md:py-14">
      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-light tracking-tight text-balance">{t("index.title")}</h1>
        <p className="max-w-prose text-base text-secondary-foreground">{t("index.lead")}</p>
      </header>
      <ul className="flex flex-col gap-4">
        {GUIDES.map((guide) => (
          <li key={guide.slug}>
            <article className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <h2 className="text-lg font-semibold tracking-tight">
                <Link
                  href={`/guides/${guide.slug}`}
                  className="text-primary underline underline-offset-4"
                >
                  {t(`${guide.slug}.title`)}
                </Link>
              </h2>
              <p className="mt-2 max-w-prose text-base text-secondary-foreground">
                {t(`${guide.slug}.lead`)}
              </p>
              <p className="mt-4">
                <Link
                  href={`/guides/${guide.slug}`}
                  className="text-sm font-medium text-primary underline underline-offset-4"
                >
                  {t("read")}
                </Link>
              </p>
            </article>
          </li>
        ))}
      </ul>
    </div>
  );
}
