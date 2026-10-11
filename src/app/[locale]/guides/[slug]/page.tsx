import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { SourceBadge } from "@/components/source-badge";
import type { FactMeta } from "@/data-schema/resolved";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { GUIDE_SLUGS, guideBySlug } from "@/lib/guides/catalog";
import { pageMetadata } from "@/lib/seo";
import { readSiteEnv } from "@/lib/site-env";

type Props = { params: Promise<{ locale: string; slug: string }> };

// Guide bodies are bundled at build time; an unknown slug must be a 404, never a runtime render.
export const dynamicParams = false;

export function generateStaticParams(): { slug: string }[] {
  return GUIDE_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const guide = guideBySlug(slug);
  if (guide === undefined) notFound();
  const t = await getTranslations({ locale, namespace: "guides" });
  return pageMetadata({
    env: readSiteEnv(),
    locale,
    path: `/guides/${guide.slug}`,
    title: t(`${guide.slug}.meta.title`),
    description: t(`${guide.slug}.meta.description`),
  });
}

export default async function GuidePage({ params }: Props) {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const guide = guideBySlug(slug);
  if (guide === undefined) notFound();
  const t = await getTranslations({ locale, namespace: "guides" });
  const Document = guide.Documents[locale];
  const meta: FactMeta = {
    source_url: guide.frontmatter.source_url,
    info_kind: guide.frontmatter.info_kind,
    last_verified_at: guide.frontmatter.last_verified_at,
    class: "volatile",
  };
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 md:px-6 md:py-14">
      <SourceBadge meta={meta} variant="full" label={t("sourceLabel")} />
      <article className="max-w-prose text-start">
        <Document />
      </article>
      <nav
        aria-labelledby="guide-related"
        className="rounded-xl border border-border bg-card p-6 shadow-sm"
      >
        <h2 id="guide-related" className="text-lg font-semibold tracking-tight">
          {t("related")}
        </h2>
        <ul className="mt-3 flex flex-col gap-2">
          <li>
            <Link
              href="/profile"
              prefetch={false}
              className="text-base text-primary underline underline-offset-4"
            >
              {t("cta.profile")}
            </Link>
          </li>
          <li>
            <Link
              href="/matches"
              prefetch={false}
              className="text-base text-primary underline underline-offset-4"
            >
              {t("cta.matches")}
            </Link>
          </li>
          <li>
            <Link
              href="/scholarships"
              prefetch={false}
              className="text-base text-primary underline underline-offset-4"
            >
              {t("cta.scholarships")}
            </Link>
          </li>
          <li>
            <Link
              href="/plan"
              prefetch={false}
              className="text-base text-primary underline underline-offset-4"
            >
              {t("cta.plan")}
            </Link>
          </li>
        </ul>
        <p className="mt-4">
          <Link
            href="/guides"
            prefetch={false}
            className="text-sm font-medium text-primary underline underline-offset-4"
          >
            {t("backToGuides")}
          </Link>
        </p>
      </nav>
    </div>
  );
}
