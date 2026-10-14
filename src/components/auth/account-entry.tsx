import { getTranslations } from "next-intl/server";

import type { AppLocale } from "@/i18n/routing";
import { accountsEnabled } from "@/lib/auth/accounts-enabled";

import { AccountMenuLoader } from "./account-menu-loader";

// Read while the page is prerendered (ruling P4). With accounts off nothing renders here, and the
// menu itself is a lazy chunk (account-menu-loader) that no page fetches.
export async function AccountEntry({ locale }: { locale: AppLocale }) {
  if (!accountsEnabled()) return null;
  const t = await getTranslations({ locale, namespace: "account" });
  return (
    <AccountMenuLoader
      locale={locale}
      labels={{
        signIn: t("signIn"),
        signOut: t("signOut"),
        signingOut: t("signingOut"),
        signOutFailed: t("signOutFailed"),
        checkFailed: t("checkFailed"),
        retry: t("retry"),
      }}
    />
  );
}
