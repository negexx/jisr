import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { routing } from "@/i18n/routing";

export async function LocaleSwitcher({ current }: { current: AppLocale }) {
  const t = await getTranslations("localeSwitcher");
  return (
    <nav aria-label={t("label")}>
      <ul className="flex gap-2">
        {routing.locales.map((locale) => (
          <li key={locale}>
            <Button asChild size="sm" variant={locale === current ? "secondary" : "ghost"}>
              <Link
                href="/"
                locale={locale}
                lang={locale}
                aria-current={locale === current ? "page" : undefined}
              >
                {t(`names.${locale}`)}
              </Link>
            </Button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
