import { getTranslations } from "next-intl/server";

import { displayNumber } from "@/components/matches/display-number";
import type { AppLocale } from "@/i18n/routing";
import { accountsEnabled } from "@/lib/auth/accounts-enabled";
import { MAX_SAVED_PROGRAMS } from "@/lib/constants";

import { AccountSyncLoader } from "./account-sync-loader";

// Read while the page is prerendered (ruling P4): with accounts off nothing renders here.
export async function AccountSyncEntry({ locale }: { locale: AppLocale }) {
  if (!accountsEnabled()) return null;
  const t = await getTranslations({ locale, namespace: "accountSync" });
  return (
    <AccountSyncLoader
      labels={{
        conflictTitle: t("conflictTitle"),
        conflictBody: t("conflictBody"),
        useOther: t("useOther"),
        keepMine: t("keepMine"),
        failed: t("failed"),
        savedLimit: t("savedLimit", { max: displayNumber(MAX_SAVED_PROGRAMS, locale) }),
        planLimit: t("planLimit"),
        signedOut: t("signedOut"),
        consentRequired: t("consentRequired"),
        consentPending: t("consentPending"),
        profileReloaded: t("profileReloaded"),
        dismiss: t("dismiss"),
        finishSetup: t("finishSetup"),
      }}
    />
  );
}
