"use client";

import { useEffect, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { accountSync } from "@/lib/account-sync/client";
import type { SyncNoticeKind, SyncStatus } from "@/lib/account-sync/sync";
import { rehydrateOnReturn } from "@/lib/account-sync/visibility";
import { useSessionHint } from "@/lib/auth/session-hint";

export type AccountSyncLabels = Record<SyncNoticeKind, string> & {
  conflictTitle: string;
  conflictBody: string;
  useOther: string;
  keepMine: string;
  dismiss: string;
};

const IDLE: SyncStatus = { notice: null, conflict: null };

// Long labels (French, Arabic) wrap on a phone instead of overflowing the button.
const WRAPPING = "h-auto min-h-11 whitespace-normal py-2 text-start";

// Mounted for the rest of the page once a sign-in hint was seen, so a "you are signed out" notice
// outlives the hint it is about. While signed in it reads the account on mount and whenever the
// tab comes back after more than a minute away.
export function AccountSyncNotices({ labels }: { labels: AccountSyncLabels }) {
  const hint = useSessionHint();
  useEffect(() => {
    if (!hint) return;
    void accountSync.hydrate();
    return rehydrateOnReturn(document, Date.now, () => {
      void accountSync.hydrate();
    });
  }, [hint]);
  const { notice, conflict } = useSyncExternalStore(
    accountSync.subscribe,
    accountSync.getStatus,
    () => IDLE,
  );
  if (notice === null && conflict === null) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4">
      <div className="pointer-events-auto flex w-full max-w-prose flex-col gap-4 rounded-xl border border-border bg-background p-4 shadow-lg">
        {conflict !== null ? (
          <section aria-labelledby="account-sync-conflict" className="flex flex-col gap-3">
            <div role="alert" className="flex flex-col gap-1">
              <p id="account-sync-conflict" className="text-base font-semibold">
                {labels.conflictTitle}
              </p>
              <p className="text-base text-muted-foreground">{labels.conflictBody}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={WRAPPING}
                onClick={() => accountSync.resolveConflict("server")}
              >
                {labels.useOther}
              </Button>
              <Button
                type="button"
                size="sm"
                className={WRAPPING}
                onClick={() => accountSync.resolveConflict("mine")}
              >
                {labels.keepMine}
              </Button>
            </div>
          </section>
        ) : null}
        {notice !== null ? (
          <div className="flex items-start justify-between gap-3">
            {/* Keyed by the notice, so the same message raised twice is announced twice. */}
            <p key={notice.id} role="alert" className="text-base">
              {labels[notice.kind]}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => accountSync.dismissNotice()}
            >
              {labels.dismiss}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
