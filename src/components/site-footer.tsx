import { getTranslations } from "next-intl/server";

import { ClearDataButton } from "@/components/clear-data-button";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { accountsEnabled } from "@/lib/auth/accounts-enabled";

export async function SiteFooter({ locale }: { locale: AppLocale }) {
  const [t, tClear, tAccount] = await Promise.all([
    getTranslations({ locale, namespace: "footer" }),
    getTranslations({ locale, namespace: "clearData" }),
    getTranslations({ locale, namespace: "clearDataAccount" }),
  ]);
  // Read while the page is prerendered (ruling P4): with accounts off the button gets exactly the
  // guest copy it always had.
  const signedIn = accountsEnabled()
    ? {
        title: tAccount("title"),
        description: tAccount("description"),
        confirm: tAccount("confirm"),
        working: tAccount("working"),
        failed: tAccount("failed"),
        signedOut: tAccount("signedOut"),
      }
    : undefined;
  return (
    <footer className="mt-auto border-t border-border bg-canvas-soft">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:flex-row md:items-start md:justify-between md:gap-12 md:px-6">
        <div className="flex max-w-prose flex-col gap-2">
          <p className="text-base">{t("privacy")}</p>
          <p className="text-sm text-muted-foreground">{t("privacyLogs")}</p>
          <p className="text-sm text-muted-foreground">{t("sources")}</p>
          <p className="text-sm">
            <Link
              href="/guides"
              prefetch={false}
              className="font-medium text-primary underline underline-offset-4"
            >
              {t("guidesLink")}
            </Link>
            <span aria-hidden="true" className="mx-2 text-muted-foreground">
              ·
            </span>
            <Link
              href="/privacy"
              prefetch={false}
              className="font-medium text-primary underline underline-offset-4"
            >
              {t("privacyLink")}
            </Link>
            <span aria-hidden="true" className="mx-2 text-muted-foreground">
              ·
            </span>
            <Link
              href="/terms"
              prefetch={false}
              className="font-medium text-primary underline underline-offset-4"
            >
              {t("termsLink")}
            </Link>
          </p>
        </div>
        <div className="shrink-0">
          <ClearDataButton
            copy={{
              trigger: tClear("trigger"),
              title: tClear("title"),
              description: tClear("description"),
              cancel: tClear("cancel"),
              confirm: tClear("confirm"),
              ...(signedIn === undefined ? {} : { signedIn }),
            }}
          />
        </div>
      </div>
    </footer>
  );
}
