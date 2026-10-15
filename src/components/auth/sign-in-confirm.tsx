"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import type { AppLocale } from "@/i18n/routing";
import {
  authCallbackUrls,
  readSignInLink,
  type SignInLink,
  signInErrorPath,
  signInPath,
} from "@/lib/auth/callback-urls";
import { confirmSignIn } from "@/lib/auth/sign-in-confirm";

type Ready = SignInLink & { token: string };

type Stage =
  | { kind: "reading" }
  | { kind: "no-token"; returnPath: string | null }
  | { kind: "ready"; link: Ready; failed: boolean }
  | { kind: "working"; link: Ready }
  | { kind: "unavailable" };

// A full page load, never a client navigation: the landing reads the new session from scratch, and
// replace() keeps this page out of the history.
function leave(url: string): void {
  window.location.replace(url);
}

const ALERT_CLASS = "text-base font-medium text-destructive outline-none";

// The emailed sign-in link lands here (todo 28, F3). Opening it signs nobody in (mail scanners open
// links; an attacker's link must not sign a visitor into the attacker's account): the student
// confirms with the button, which posts the token from the fragment. The address is not shown: the
// page cannot know it without asking the server about the token, and a fragment value is forgeable.
export function SignInConfirm({
  locale,
  navigate = leave,
}: {
  locale: AppLocale;
  navigate?: (url: string) => void;
}) {
  const t = useTranslations("signInConfirm");
  const id = useId();
  const [stage, setStage] = useState<Stage>({ kind: "reading" });
  const alertRef = useRef<HTMLParagraphElement>(null);

  // Read once: the URL is cleaned below, so a second run (Strict Mode) would find no token.
  const started = useRef(false);

  useEffect(() => {
    function readLink(): void {
      const link = readSignInLink(window.location.hash, locale);
      // The token leaves the address bar at once, so it is not in the history or a shared screenshot.
      if (window.location.hash !== "" || window.location.search !== "") {
        window.history.replaceState(window.history.state, "", window.location.pathname);
      }
      setStage(
        link.token === null
          ? { kind: "no-token", returnPath: link.returnPath }
          : { kind: "ready", link: { ...link, token: link.token }, failed: false },
      );
    }
    // A second emailed link opened in this tab changes only the fragment (no reload, no remount).
    // Stripping the fragment above uses replaceState, which fires no hashchange.
    function onHashChange(): void {
      if (window.location.hash !== "") readLink();
    }
    window.addEventListener("hashchange", onHashChange);
    if (!started.current) {
      started.current = true;
      readLink();
    }
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [locale]);

  const failed = stage.kind === "ready" && stage.failed;
  const refused = stage.kind === "unavailable" || stage.kind === "no-token" || failed;
  // A refusal takes focus, so a keyboard or screen-reader user starts from it.
  useEffect(() => {
    if (refused) alertRef.current?.focus();
  }, [refused]);

  async function confirm(link: Ready): Promise<void> {
    setStage({ kind: "working", link });
    const outcome = await confirmSignIn(link.token);
    if (outcome.kind === "signed-in") {
      navigate(authCallbackUrls(locale, link.returnPath).callbackURL);
    } else if (outcome.kind === "refused") {
      // The sign-in form already words every refusal (expired or used link, no account yet).
      navigate(signInErrorPath(locale, link.returnPath, outcome.code));
    } else if (outcome.kind === "unavailable") {
      setStage({ kind: "unavailable" });
    } else {
      setStage({ kind: "ready", link, failed: true });
    }
  }

  if (stage.kind === "reading") return <output>{t("reading")}</output>;

  if (stage.kind === "unavailable") {
    return (
      <p ref={alertRef} role="alert" tabIndex={-1} className={`max-w-prose ${ALERT_CLASS}`}>
        {t("errors.unavailable")}
      </p>
    );
  }

  if (stage.kind === "no-token") {
    return (
      <div className="flex max-w-prose flex-col items-start gap-4 text-start">
        <p ref={alertRef} role="alert" tabIndex={-1} className={ALERT_CLASS}>
          {t("errors.noToken")}
        </p>
        <a
          href={signInPath(locale, stage.returnPath)}
          className={buttonVariants({ variant: "outline" })}
        >
          {t("newLink")}
        </a>
      </div>
    );
  }

  const { link } = stage;
  const bodyId = `${id}-body`;
  const working = stage.kind === "working";
  return (
    <section className="flex max-w-prose flex-col items-start gap-4 text-start">
      <p id={bodyId} className="text-base">
        {t(`${link.mode}.body`)}
      </p>
      {failed ? (
        <p ref={alertRef} role="alert" tabIndex={-1} className={ALERT_CLASS}>
          {t("errors.failed")}
        </p>
      ) : null}
      <Button
        type="button"
        aria-describedby={bodyId}
        disabled={working}
        onClick={() => void confirm(link)}
      >
        {working ? t("working") : t(`${link.mode}.confirm`)}
      </Button>
      <p className="text-sm text-muted-foreground">{t("notYou")}</p>
    </section>
  );
}
