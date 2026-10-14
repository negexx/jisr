"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { usePathname } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { POST_AUTH_LANDING, SIGN_IN_PATH, signInPath } from "@/lib/auth/callback-urls";
import { forgetSession, lookupSession } from "@/lib/auth/session-client";
import { clearAccountLocalState, useSessionHint } from "@/lib/auth/session-hint";

export type AccountMenuLabels = {
  signIn: string;
  signOut: string;
  signingOut: string;
  signOutFailed: string;
  checkFailed: string;
  retry: string;
};

type Check = "pending" | "signed-in" | "unavailable";

// The sign-in and landing pages are not somewhere to come back to.
function returnPathFor(locale: AppLocale, pathname: string): string | null {
  if (pathname.startsWith(SIGN_IN_PATH) || pathname.startsWith(POST_AUTH_LANDING)) return null;
  return pathname === "/" ? `/${locale}` : `/${locale}${pathname}`;
}

// Rendered only while accounts are switched on. A guest has no hint: this makes no request and
// links to nothing, so sign-in is a button that navigates on click (a Link would prefetch the page
// for every visitor). The session is asked for once, only when the hint is present.
export function AccountMenu({ locale, labels }: { locale: AppLocale; labels: AccountMenuLabels }) {
  // The paths below already carry the locale, so this is Next's router, not the locale-aware one,
  // which would prefix them a second time.
  const router = useRouter();
  const pathname = usePathname();
  const hint = useSessionHint();
  const [check, setCheck] = useState<Check>("pending");
  const [attempt, setAttempt] = useState(0);
  const [signOutStatus, setSignOutStatus] = useState<"idle" | "working" | "failed">("idle");

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is the retry trigger
  useEffect(() => {
    if (!hint) return;
    let current = true;
    setCheck("pending");
    void lookupSession().then((result) => {
      if (!current) return;
      // The server does not know this session any more (expired, deleted elsewhere).
      if (result.status === "signed-out") clearAccountLocalState();
      else setCheck(result.status);
    });
    return () => {
      current = false;
    };
  }, [hint, attempt]);

  async function signOut(): Promise<void> {
    setSignOutStatus("working");
    let failed: boolean;
    try {
      const { authClient } = await import("@/lib/auth/client");
      const { error } = await authClient.signOut();
      failed = Boolean(error);
    } catch {
      failed = true;
    }
    if (failed) {
      setSignOutStatus("failed");
      return;
    }
    forgetSession();
    clearAccountLocalState();
    setSignOutStatus("idle");
  }

  const signedIn = hint && check !== "unavailable";
  return (
    <div className="ms-auto flex items-center gap-2 lg:ms-0">
      {signedIn ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={signOutStatus === "working"}
          onClick={signOut}
        >
          {signOutStatus === "working" ? labels.signingOut : labels.signOut}
        </Button>
      ) : (
        <>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => router.push(signInPath(locale, returnPathFor(locale, pathname)))}
          >
            {labels.signIn}
          </Button>
          {hint ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setAttempt((n) => n + 1)}
            >
              {labels.retry}
            </Button>
          ) : null}
        </>
      )}
      <output className="empty:hidden text-sm text-destructive">
        {hint && check === "unavailable"
          ? labels.checkFailed
          : signOutStatus === "failed"
            ? labels.signOutFailed
            : null}
      </output>
    </div>
  );
}
