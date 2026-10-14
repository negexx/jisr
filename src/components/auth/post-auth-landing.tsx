"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { AppLocale } from "@/i18n/routing";
import { landingReturnPath, RETURN_PARAM, signInErrorPath } from "@/lib/auth/callback-urls";
import { runPostAuthSeam } from "@/lib/auth/post-auth";

import { lookupSession } from "@/lib/auth/session-client";
import { setSessionHint } from "@/lib/auth/session-hint";
import type { ImportMode } from "@/lib/server/import";

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

// Most sign-ins never need the choice, so its dialog (Radix) loads only when one does.
const ImportChoiceDialog = lazy(async () => ({
  default: (await import("./import-choice-dialog")).ImportChoiceDialog,
}));

type Step = { kind: "working" } | { kind: "choose" } | { kind: "failed"; mode: ImportMode };

// Rendered once the finish-signup gate is clear: records the sign-in on this device, runs the
// post-auth step (the guest import), then moves on. Mounted only after the gate, so the automatic
// import starts exactly once; a failure never strands the student here.
function Completion({ locale }: { locale: AppLocale }) {
  const t = useTranslations("welcome");
  const router = useRouter();
  const started = useRef(false);
  const [step, setStep] = useState<Step>({ kind: "working" });

  const leave = useCallback(() => {
    router.replace(landingReturnPath(readLocation().returnParam, locale));
  }, [locale, router]);

  const run = useCallback(
    (mode: ImportMode) => {
      setStep({ kind: "working" });
      void runPostAuthSeam(locale, mode).then(
        (outcome) => {
          if (outcome === "done") leave();
          else if (outcome === "choose") setStep({ kind: "choose" });
          else setStep({ kind: "failed", mode });
        },
        () => setStep({ kind: "failed", mode }),
      );
    },
    [leave, locale],
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    setSessionHint();
    run("auto");
  }, [run]);

  if (step.kind === "failed") {
    return (
      <div className="flex max-w-prose flex-col items-start gap-4 text-start">
        <p role="alert" className="text-base font-medium text-destructive">
          {t("import.failed")}
        </p>
        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={() => run(step.mode)}>
            {t("import.retry")}
          </Button>
          <Button type="button" variant="outline" onClick={leave}>
            {t("import.continue")}
          </Button>
        </div>
      </div>
    );
  }
  if (step.kind === "choose") {
    return (
      <Suspense fallback={null}>
        <ImportChoiceDialog onKeep={leave} onReplace={() => run("replace")} />
      </Suspense>
    );
  }
  return <output>{t("finishing")}</output>;
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
        <Completion locale={locale} />
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
