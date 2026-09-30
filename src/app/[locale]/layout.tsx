import { Geist, Noto_Sans_Arabic } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";

import { DirectionProvider } from "@/components/direction-provider";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { localeDirection } from "@/i18n/direction";
import { routing } from "@/i18n/routing";

import "../globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
// Not preloaded: Latin-only locales should not download Arabic glyphs.
const notoSansArabic = Noto_Sans_Arabic({
  variable: "--font-arabic",
  subsets: ["arabic"],
  preload: false,
});

type Props = { children: ReactNode; params: Promise<{ locale: string }> };

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const dir = localeDirection(locale);
  const t = await getTranslations({ locale, namespace: "shell" });
  return (
    <html lang={locale} dir={dir} className={`${geistSans.variable} ${notoSansArabic.variable}`}>
      <body className="flex min-h-dvh flex-col antialiased">
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
      </body>
    </html>
  );
}
