import { getTranslations } from "next-intl/server";

import { LocaleSwitcher } from "@/components/locale-switcher";
import { NavLinks } from "@/components/nav-links";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";

export async function SiteHeader({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: "shell" });
  const tSwitcher = await getTranslations({ locale, namespace: "localeSwitcher" });
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-4 px-4 md:flex-nowrap md:px-6">
        <Link
          href="/"
          aria-label={t("homeLink")}
          className="flex min-h-12 items-center gap-2 text-lg font-semibold"
        >
          <bdi>{t("siteName")}</bdi>
          <span lang="ar" className="font-normal text-muted-foreground">
            {t("siteNameArabic")}
          </span>
        </Link>
        <div className="order-3 w-full md:order-none md:me-auto md:ms-6 md:w-auto">
          <NavLinks />
        </div>
        <LocaleSwitcher
          current={locale}
          label={tSwitcher("label")}
          names={{
            fr: tSwitcher("names.fr"),
            en: tSwitcher("names.en"),
            ar: tSwitcher("names.ar"),
          }}
        />
      </div>
    </header>
  );
}
