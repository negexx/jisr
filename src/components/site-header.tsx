import { getTranslations } from "next-intl/server";

import { AccountEntry } from "@/components/auth/account-entry";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { NavLinks } from "@/components/nav-links";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";

export async function SiteHeader({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: "shell" });
  const tSwitcher = await getTranslations({ locale, namespace: "localeSwitcher" });
  const tNav = await getTranslations({ locale, namespace: "nav" });
  // Read raw: the `{count}` placeholder is filled in the browser, once the saved list is known.
  const savedCountTemplate: unknown = tNav.raw("savedCount");
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-white/70 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-4 px-4 md:px-6 lg:flex-nowrap lg:gap-x-2">
        <Link href="/" className="flex min-h-16 items-center">
          {/* biome-ignore lint/performance/noImgElement: the header ships on every route and the guest JS budget has no headroom for the next/image runtime (ADR 0008); the mark is a static fixed-size asset. */}
          <img src="/logo-mark.png" alt="" width={160} height={108} className="h-9 w-auto" />
          <span className="sr-only">{t("homeLink")}</span>
        </Link>
        <div className="order-3 w-full lg:order-none lg:me-auto lg:ms-3 lg:w-auto">
          <NavLinks
            label={tNav("label")}
            items={[
              { href: "/profile", label: tNav("profile") },
              { href: "/matches", label: tNav("matches") },
              { href: "/scholarships", label: tNav("scholarships"), prefetch: false },
              {
                href: "/plan",
                label: tNav("plan"),
                ...(typeof savedCountTemplate === "string"
                  ? { savedCount: { template: savedCountTemplate } }
                  : {}),
              },
            ]}
          />
        </div>
        <AccountEntry locale={locale} />
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
