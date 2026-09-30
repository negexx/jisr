import { getTranslations } from "next-intl/server";

import { ClearDataButton } from "@/components/clear-data-button";
import type { AppLocale } from "@/i18n/routing";

export async function SiteFooter({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: "footer" });
  return (
    <footer className="mt-auto border-t border-border bg-muted">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:flex-row md:items-start md:justify-between md:gap-12 md:px-6">
        <div className="flex max-w-prose flex-col gap-2">
          <p className="text-base">{t("privacy")}</p>
          <p className="text-sm text-muted-foreground">{t("sources")}</p>
        </div>
        <div className="shrink-0">
          <ClearDataButton />
        </div>
      </div>
    </footer>
  );
}
