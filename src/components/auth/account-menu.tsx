"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { usePathname } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { ACCOUNT_PATH, accountPath, returnPathFor, signInPath } from "@/lib/auth/callback-urls";
import { hasCurrentConsent } from "@/lib/auth/consent";
import { forgetSession, lookupSession } from "@/lib/auth/session-client";
import { clearAccountLocalState, useSessionHint } from "@/lib/auth/session-hint";
import { clearSignInBrowser } from "@/lib/auth/sign-in-browser";

import { FinishSetupButton } from "./finish-setup-button";

export type AccountMenuLabels = {
  signIn: string;
  account: string;
  signOut: string;
  signingOut: string;
  signOutFailed: string;
  checkFailed: string;
  retry: string;
  finishSetup: string;
};

// "consent": signed in, but not to the current privacy notice (new, or changed since).
type Check = "pending" | "signed-in" | "consent" | "unavailable";

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

  // `pathname` asks again after a navigation: free while signed in (the answer is kept), and it
  // picks up a consent given on the landing, which forgets the kept answer.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is the retry trigger
  useEffect(() => {
    if (!hint) return;
    let current = true;
    // Only a retry shows the check again; a navigation keeps what is on screen while it asks.
    setCheck((previous) => (previous === "unavailable" ? "pending" : previous));
    void lookupSession().then((result) => {
      if (!current) return;
      // The server does not know this session any more (expired, deleted elsewhere).
      if (result.status === "signed-out") clearAccountLocalState();
      else if (result.status === "signed-in" && !hasCurrentConsent(result)) setCheck("consent");
      else setCheck(result.status);
    });
    return () => {
      current = false;
    };
  }, [hint, attempt, pathname]);

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
    clearSignInBrowser();
    clearAccountLocalState();
    setSignOutStatus("idle");
  }

  const signedIn = hint && check !== "unavailable";
  return (
    <div className="ms-auto flex items-center gap-2 lg:ms-0">
      {signedIn && check === "consent" ? (
        <FinishSetupButton label={labels.finishSetup} size="sm" />
      ) : null}
      {signedIn ? (
        <Link
          href={accountPath(locale)}
          prefetch={false}
          aria-current={pathname === ACCOUNT_PATH ? "page" : undefined}
          className={buttonVariants({ size: "sm", variant: "ghost", className: "lg:px-3" })}
        >
          {labels.account}
        </Link>
      ) : null}
      {signedIn ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="lg:px-3"
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
