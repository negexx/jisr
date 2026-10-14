"use client";

import { lazy, Suspense, useState } from "react";

import { useSessionHint } from "@/lib/auth/session-hint";

import type { AccountSyncLabels } from "./account-sync-notices";

// The notices carry the sync layer and the Server Action references: they are fetched only once a
// sign-in hint is present, so a guest's page loads none of it.
const AccountSyncNotices = lazy(async () => ({
  default: (await import("./account-sync-notices")).AccountSyncNotices,
}));

export function AccountSyncLoader({ labels }: { labels: AccountSyncLabels }) {
  const hint = useSessionHint();
  const [seen, setSeen] = useState(false);
  // Adjusting state during render: once seen, the notices stay mounted after a sign-out.
  if (hint && !seen) setSeen(true);
  if (!seen) return null;
  return (
    <Suspense fallback={null}>
      <AccountSyncNotices labels={labels} />
    </Suspense>
  );
}
