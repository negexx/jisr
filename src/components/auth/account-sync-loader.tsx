"use client";

import { lazy, Suspense, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { getSyncUnavailable, subscribeSyncUnavailable } from "@/lib/account-sync-runner";
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
  // A signed-in change dropped because the sync chunk did not load; told here, as that chunk
  // (and its notices) is exactly what is missing.
  const unavailable = useSyncExternalStore(subscribeSyncUnavailable, getSyncUnavailable, () => 0);
  const [dismissed, setDismissed] = useState(getSyncUnavailable);
  // Adjusting state during render: once seen, the notices stay mounted after a sign-out.
  if (hint && !seen) setSeen(true);
  return (
    <>
      {seen ? (
        <Suspense fallback={null}>
          <AccountSyncNotices labels={labels} />
        </Suspense>
      ) : null}
      {unavailable > dismissed ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4">
          <div className="pointer-events-auto flex w-full max-w-prose items-start justify-between gap-3 rounded-xl border border-border bg-background p-4 shadow-lg">
            <p key={unavailable} role="alert" className="text-base">
              {labels.failed}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setDismissed(unavailable)}
            >
              {labels.dismiss}
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
