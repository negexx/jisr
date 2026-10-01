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
      <ul className="flex gap-1">
        {routing.locales.map((locale) => (
          <li key={locale}>
            <Button asChild size="sm" variant={locale === current ? "secondary" : "ghost"}>
              <Link
                href={pathname}
                locale={locale}
                lang={locale}
                hrefLang={locale}
                // The current-locale link points at this very page; prefetching it only downloads the page again.
                prefetch={locale === current ? false : undefined}
                aria-current={locale === current ? "true" : undefined}
              >
                {names[locale]}
              </Link>
            </Button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
