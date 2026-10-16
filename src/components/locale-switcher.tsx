"use client";

import { Button } from "@/components/ui/button";
import { Link, usePathname } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { routing } from "@/i18n/routing";

type Props = {
  current: AppLocale;
  label: string;
  names: Record<AppLocale, string>;
};

export function LocaleSwitcher({ current, label, names }: Props) {
  const pathname = usePathname();
  return (
    <nav aria-label={label}>
      <ul className="flex gap-0.5 rounded-full border border-border bg-canvas-soft p-0.5">
        {routing.locales.map((locale) => {
          const isCurrent = locale === current;
          return (
            <li key={locale}>
              <Button
                asChild
                size="sm"
                variant="ghost"
                className={
                  isCurrent
                    ? "bg-background text-foreground shadow-sm lg:px-2"
                    : "text-muted-foreground hover:bg-background/70 hover:text-foreground lg:px-2"
                }
              >
                <Link
                  href={pathname}
                  locale={locale}
                  lang={locale}
                  hrefLang={locale}
                  // The current-locale link points at this very page; prefetching it only downloads the page again.
                  prefetch={isCurrent ? false : undefined}
                  aria-current={isCurrent ? "true" : undefined}
                >
                  {names[locale]}
                </Link>
              </Button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
