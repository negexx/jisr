import type { Metadata } from "next";

import { buttonVariants } from "@/components/ui/button";
import { localeDirection } from "@/i18n/direction";
import { type AppLocale, routing } from "@/i18n/routing";
import { cn } from "@/lib/utils";

import ar from "../../messages/ar.json";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
import { fontVariables } from "./fonts";

import "./globals.css";

const NOT_FOUND: Record<AppLocale, typeof fr.notFound> = {
  fr: fr.notFound,
  en: en.notFound,
  ar: ar.notFound,
};

export const metadata: Metadata = {
  title: routing.locales.map((locale) => NOT_FOUND[locale].title).join(" / "),
};

// Experimental (`experimental.globalNotFound` in next.config.ts). Next renders this page, outside
// every layout, for every unmatched URL: an unknown path under a locale (/fr/no-such-page), a program
// slug that was not generated at build time (dynamicParams = false), and a first segment that is not
// a locale (only paths the proxy skips, such as /robots.txt; the others are redirected to /fr/...).
// The locale is not known here, so the page speaks all three languages, each block with its own lang
// and dir. Static on purpose: it never repeats anything from the request.
export default function GlobalNotFound() {
  return (
    <html lang={routing.defaultLocale} dir="ltr" className={fontVariables}>
      <body className="flex min-h-dvh flex-col antialiased">
        <header className="border-b border-border">
          <p className="mx-auto flex min-h-12 w-full max-w-2xl items-center gap-2 px-4 text-lg font-semibold md:px-6">
            <bdi>{fr.shell.siteName}</bdi>
            <span lang="ar" className="font-normal text-muted-foreground">
              {fr.shell.siteNameArabic}
            </span>
          </p>
        </header>
        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-8 md:px-6 md:py-12">
          {routing.locales.map((locale, index) => {
            const messages = NOT_FOUND[locale];
            // One h1 for the page: the default locale's title; the other two are its translations.
            const Heading = index === 0 ? "h1" : "h2";
            return (
              <section
                key={locale}
                lang={locale}
                dir={localeDirection(locale)}
                aria-labelledby={`not-found-${locale}`}
                className={cn(
                  "flex flex-col gap-3 text-start",
                  index > 0 && "mt-8 border-t border-border pt-8",
                )}
              >
                <Heading id={`not-found-${locale}`} className="text-2xl font-bold tracking-tight">
                  {messages.title}
                </Heading>
                <p className="text-lg text-muted-foreground">{messages.description}</p>
                <a
                  href={`/${locale}`}
                  className={cn(
                    buttonVariants({ variant: index === 0 ? "default" : "outline" }),
                    "w-full sm:w-fit",
                  )}
                >
                  {messages.home}
                </a>
              </section>
            );
          })}
        </main>
      </body>
    </html>
  );
}
