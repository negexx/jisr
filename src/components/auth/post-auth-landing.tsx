"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { AppLocale } from "@/i18n/routing";
import { landingReturnPath, RETURN_PARAM, signInErrorPath } from "@/lib/auth/callback-urls";
import { runPostAuthSeam } from "@/lib/auth/post-auth";
import { lookupSession } from "@/lib/auth/session-client";
import { setSessionHint } from "@/lib/auth/session-hint";

import { FinishSignupGate } from "./finish-signup-gate";

type Stage =
  | { kind: "checking" }
  | { kind: "unavailable" }
  | { kind: "consent"; consentVersion: string | null };

// Failure code when the student arrives with no session and no code of their own.
const NO_SESSION_ERROR = "NO_SESSION";

function readLocation(): { returnParam: string | null; error: string | null } {
  const params = new URLSearchParams(window.location.search);
  return { returnParam: params.get(RETURN_PARAM), error: params.get("error") };
}

// Rendered once the finish-signup gate is clear: records the sign-in on this device, runs the
// post-auth step, then moves on. Mounted only after the gate, so it runs exactly once.
function Completion({ locale, children }: { locale: AppLocale; children: ReactNode }) {
  const router = useRouter();
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    setSessionHint();
    void runPostAuthSeam().then(() => {
      router.replace(landingReturnPath(readLocation().returnParam, locale));
    });
  }, [locale, router]);
  return children;
}

// The one completion point for every redirect-based sign-in (magic link on any device, Google). It
// is a static page, so everything it needs comes from the URL and from one session lookup.
export function PostAuthLanding({ locale }: { locale: AppLocale }) {
  const t = useTranslations("welcome");
  const router = useRouter();
  const [stage, setStage] = useState<Stage>({ kind: "checking" });
  const [attempt, setAttempt] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is the retry trigger
  useEffect(() => {
    const { returnParam, error } = readLocation();
    const returnPath = landingReturnPath(returnParam, locale);
    // Better Auth sends its failure code here (errorCallbackURL); the sign-in page words it.
    if (error !== null && error !== "") {
      router.replace(signInErrorPath(locale, returnPath, error));
      return;
    }
    let current = true;
    setStage({ kind: "checking" });
    void lookupSession().then((result) => {
      if (!current) return;
      if (result.status === "signed-out") {
        router.replace(signInErrorPath(locale, returnPath, NO_SESSION_ERROR));
      } else if (result.status === "unavailable") {
        setStage({ kind: "unavailable" });
      } else {
        setStage({ kind: "consent", consentVersion: result.consentVersion });
      }
    });
    return () => {
      current = false;
    };
  }, [attempt, locale, router]);

  if (stage.kind === "consent") {
    return (
      <FinishSignupGate consentVersion={stage.consentVersion}>
        <Completion locale={locale}>
          <output>{t("finishing")}</output>
        </Completion>
      </FinishSignupGate>
    );
  }
  if (stage.kind === "unavailable") {
    return (
      <div className="flex max-w-prose flex-col items-start gap-4 text-start">
        <p role="alert" className="text-base font-medium text-destructive">
          {t("failed")}
        </p>
        <Button type="button" variant="outline" onClick={() => setAttempt((n) => n + 1)}>
          {t("retry")}
        </Button>
      </div>
    );
  }
  return <output>{t("checking")}</output>;
}
