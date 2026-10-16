"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import type { AppLocale } from "@/i18n/routing";
import {
  confirmAccountDeletion,
  type DeletionConfirmOutcome,
  eraseThisDevice,
  readDeletionToken,
} from "@/lib/auth/account-deletion";
import { signInPath } from "@/lib/auth/callback-urls";

type Stage =
  | { kind: "reading" }
  | { kind: "no-token" }
  | { kind: "ready"; token: string }
  | { kind: "working"; token: string }
  | { kind: "deleted" }
  | { kind: "refused"; token: string; outcome: Exclude<DeletionConfirmOutcome, "deleted"> }
  | { kind: "erased" };

// The emailed deletion link lands here. Opening it deletes nothing (mail scanners open links): the
// student confirms with the button, which posts the token to Better Auth.
export function AccountDeleteConfirm({ locale }: { locale: AppLocale }) {
  const t = useTranslations("accountDelete");
  const id = useId();
  const [stage, setStage] = useState<Stage>({ kind: "reading" });

  // Read once: the URL is cleaned below, so a second run (Strict Mode) would find no token.
  const started = useRef(false);

  useEffect(() => {
    function readToken(): void {
      const token = readDeletionToken(window.location.hash);
      // The token leaves the address bar at once, so it is not in the history or a shared screenshot.
      if (window.location.hash !== "" || window.location.search !== "") {
        window.history.replaceState(window.history.state, "", window.location.pathname);
      }
      setStage(token === null ? { kind: "no-token" } : { kind: "ready", token });
    }
    // A second emailed deletion link opened in this tab changes only the fragment (no reload, no
    // remount); the strip above uses replaceState, which fires no hashchange.
    function onHashChange(): void {
      if (window.location.hash !== "") readToken();
    }
    window.addEventListener("hashchange", onHashChange);
    if (!started.current) {
      started.current = true;
      readToken();
    }
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  async function confirm(token: string): Promise<void> {
    setStage({ kind: "working", token });
    const outcome = await confirmAccountDeletion(token);
    setStage(outcome === "deleted" ? { kind: "deleted" } : { kind: "refused", token, outcome });
  }

  if (stage.kind === "reading") return <output>{t("reading")}</output>;

  if (stage.kind === "deleted") {
    return (
      <section className="flex max-w-prose flex-col items-start gap-4 text-start">
        <h2 className="text-xl font-semibold">{t("deleted.title")}</h2>
        <p className="text-base">{t("deleted.body")}</p>
        {/* A full page load, not a client navigation: whatever the signed-in page still holds in
            memory (the account sync's queue) is dropped with it. */}
        <a href={`/${locale}`} className={buttonVariants({ variant: "outline" })}>
          {t("deleted.home")}
        </a>
      </section>
    );
  }

  if (stage.kind === "erased") {
    return <output className="block max-w-prose text-base">{t("errors.erased")}</output>;
  }

  if (stage.kind === "no-token") {
    return (
      <p role="alert" className="max-w-prose text-base font-medium text-destructive">
        {t("errors.invalidToken")}
      </p>
    );
  }

  if (stage.kind === "refused" && stage.outcome !== "failed") {
    return (
      <div className="flex max-w-prose flex-col items-start gap-4 text-start">
        <p role="alert" className="text-base font-medium text-destructive">
          {stage.outcome === "invalid-token"
            ? t("errors.invalidToken")
            : stage.outcome === "signed-out"
              ? t("errors.signedOut")
              : t("errors.unavailable")}
        </p>
        {stage.outcome === "signed-out" ? (
          // A token was submitted and the answer is "no session": a deletion whose response was
          // lost ends the session too, so the account is probably gone. Erasing stays the
          // student's choice (ruling Q6), since a device that was never signed in answers the same.
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                eraseThisDevice();
                setStage({ kind: "erased" });
              }}
            >
              {t("errors.eraseDevice")}
            </Button>
            <a href={signInPath(locale, null)} className={buttonVariants({ variant: "outline" })}>
              {t("errors.signIn")}
            </a>
          </div>
        ) : null}
      </div>
    );
  }

  const warningId = `${id}-warning`;
  const working = stage.kind === "working";
  return (
    <section className="flex max-w-prose flex-col items-start gap-4 text-start">
      <p id={warningId} className="text-base">
        {t("warning")}
      </p>
      {stage.kind === "refused" ? (
        <p role="alert" className="text-base font-medium text-destructive">
          {t("errors.failed")}
        </p>
      ) : null}
      <Button
        type="button"
        variant="destructive"
        aria-describedby={warningId}
        disabled={working}
        onClick={() => void confirm(stage.token)}
      >
        {working ? t("working") : t("confirm")}
      </Button>
    </section>
  );
}
