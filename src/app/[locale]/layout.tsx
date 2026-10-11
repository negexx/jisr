import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";

import { AnalyticsLoader } from "@/components/analytics-loader";
import { DirectionProvider } from "@/components/direction-provider";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { localeDirection } from "@/i18n/direction";
import { routing } from "@/i18n/routing";
import { readSiteEnv } from "@/lib/site-env";

import { fontVariables } from "../fonts";

import "../globals.css";

type Props = { children: ReactNode; params: Promise<{ locale: string }> };

// A first segment that is not a locale (only paths the proxy skips, such as /robots.txt) is then
// unmatched and gets global-not-found, rather than this layout's notFound(), which Next can only
// answer with a blank error shell rendered in the browser. Child segments inherit this: a future
// dynamic child under [locale] without generateStaticParams must set dynamicParams = true itself.
export const dynamicParams = false;

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// Only the base for absolute URLs: a page's own openGraph/twitter replace (not merge with) the
// parent's, so pageMetadata builds those per page. Unset when the build is not indexable.
export function generateMetadata(): Metadata {
  const { siteUrl } = readSiteEnv();
  return siteUrl === null ? {} : { metadataBase: new URL(siteUrl) };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const dir = localeDirection(locale);
  const t = await getTranslations({ locale, namespace: "shell" });
  return (
    <html lang={locale} dir={dir} className={fontVariables}>
      <body className="flex min-h-dvh flex-col overflow-x-clip antialiased">
        {/*
          No catalogue at the root: the shell's client leaves get formatted strings as props (about
          2 KB gzipped less than shipping the shell namespaces). A page that needs many client
          strings adds its own nested provider.
        */}
        <NextIntlClientProvider messages={null}>
          <DirectionProvider dir={dir}>
            <a
              href="#main"
              className="sr-only rounded-lg bg-primary text-base font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:px-4 focus:py-3"
            >
              {t("skipToContent")}
            </a>
            <SiteHeader locale={locale} />
            <main
              id="main"
              tabIndex={-1}
              className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 outline-none md:px-6 md:py-12"
            >
              {children}
            </main>
            <SiteFooter locale={locale} />
          </DirectionProvider>
        </NextIntlClientProvider>
        <AnalyticsLoader goatCounterUrl={readSiteEnv().goatCounterUrl} />
      </body>
    </html>
  );
}
