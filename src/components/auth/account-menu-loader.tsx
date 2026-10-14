"use client";

import { lazy, Suspense } from "react";

import type { AppLocale } from "@/i18n/routing";

import type { AccountMenuLabels } from "./account-menu";

// The menu, the hint store and their copy sit in their own chunk: a module reachable from the
// header by a plain import is shipped to every page, even while accounts are off and it never renders.
const AccountMenu = lazy(async () => ({ default: (await import("./account-menu")).AccountMenu }));

export function AccountMenuLoader({
  locale,
  labels,
}: {
  locale: AppLocale;
  labels: AccountMenuLabels;
}) {
  return (
    <Suspense fallback={null}>
      <AccountMenu locale={locale} labels={labels} />
    </Suspense>
  );
}
