import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import type { AppLocale } from "@/i18n/routing";
import { accountsEnabled } from "@/lib/auth/accounts-enabled";

import { type ReportCopy, ReportProvider } from "./report-context";

// Read while the page is prerendered (ruling P4): null while accounts are off. A page awaits this
// itself and hands the result to ReportOutdatedEntry, which stays synchronous so a page element can
// still be rendered without an async component in it.
export async function loadReportCopy(locale: AppLocale): Promise<ReportCopy | null> {
  if (!accountsEnabled()) return null;
  const t = await getTranslations({ locale, namespace: "reportOutdated" });
  return {
    button: t("button"),
    reported: t("reported"),
    failed: t("failed"),
    rateLimited: t("rateLimited"),
  };
}

// With no copy (accounts off) this is a pass-through, so the page renders exactly as it did before
// reporting existed and no button anywhere can appear.
export function ReportOutdatedEntry({
  copy,
  locale,
  snapshotVersion = null,
  children,
}: {
  copy: ReportCopy | null;
  locale: AppLocale;
  snapshotVersion?: string | null;
  children: ReactNode;
}) {
  if (copy === null) return children;
  return (
    <ReportProvider locale={locale} snapshotVersion={snapshotVersion} copy={copy}>
      {children}
    </ReportProvider>
  );
}
