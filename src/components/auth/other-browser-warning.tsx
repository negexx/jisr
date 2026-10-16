"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import type { AppLocale } from "@/i18n/routing";
import { forgetSession } from "@/lib/auth/session-client";
import { clearAccountLocalState } from "@/lib/auth/session-hint";

type SignOutStatus = "idle" | "working" | "failed";

function accountTag(chunks: ReactNode) {
  return <bdi className="font-semibold">{chunks}</bdi>;
}

// Ruling Q19: the confirm page said this browser did not ask for the sign-in link. The student is
// signed in (a cross-device sign-in must keep working), but nothing from this browser is added to
// the account, and a student who did not request the sign-in is invited to sign out.
export function OtherBrowserWarning({
  locale,
  account,
  onContinue,
}: {
  locale: AppLocale;
  account: string;
  onContinue: () => void;
}) {
  const t = useTranslations("welcome.otherBrowser");
  const id = useId();
  const [status, setStatus] = useState<SignOutStatus>("idle");

  async function signOut(): Promise<void> {
    setStatus("working");
    let failed: boolean;
    try {
      const { authClient } = await import("@/lib/auth/client");
      const { error } = await authClient.signOut();
      failed = Boolean(error);
    } catch {
      failed = true;
    }
    if (failed) {
      setStatus("failed");
      return;
    }
    forgetSession();
    clearAccountLocalState();
    // A full page load: whatever this tab still holds in memory goes with it.
    window.location.replace(`/${locale}`);
  }

  const titleId = `${id}-title`;
  return (
    <section
      aria-labelledby={titleId}
      className="flex max-w-prose flex-col items-start gap-4 text-start"
    >
      <h2 id={titleId} className="text-xl font-semibold">
        {t("title")}
      </h2>
      <p className="text-base">{t.rich("account", { email: account, account: accountTag })}</p>
      <p className="text-base">{t("body")}</p>
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="destructive"
          disabled={status === "working"}
          onClick={() => void signOut()}
        >
          {status === "working" ? t("signingOut") : t("signOut")}
        </Button>
        <Button type="button" variant="outline" onClick={onContinue}>
          {t("continue")}
        </Button>
      </div>
      {status === "failed" ? (
        <p role="alert" className="text-base font-medium text-destructive">
          {t("failed")}
        </p>
      ) : null}
    </section>
  );
}
