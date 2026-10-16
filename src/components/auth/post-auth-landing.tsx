"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  lazy,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import type { AppLocale } from "@/i18n/routing";
import { landingReturnPath, RETURN_PARAM, signInErrorPath } from "@/lib/auth/callback-urls";
import { maskEmail } from "@/lib/auth/mask-email";
import { deviceHasGuestData, runPostAuthSeam } from "@/lib/auth/post-auth";
import { forgetSession, lookupSession } from "@/lib/auth/session-client";
import { clearAccountLocalState, setSessionHint } from "@/lib/auth/session-hint";
import { takeSignInBrowser } from "@/lib/auth/sign-in-browser";
import type { ImportMode } from "@/lib/server/import";

import { FinishSignupGate } from "./finish-signup-gate";
import { OtherBrowserWarning } from "./other-browser-warning";

type Stage =
  | { kind: "checking" }
  | { kind: "unavailable" }
  | { kind: "other-browser"; account: string }
  | { kind: "consent"; consentVersion: string | null; account: string };

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

type Step =
  | { kind: "working" }
  | { kind: "confirm" }
  | { kind: "choose" }
  | { kind: "failed"; mode: ImportMode };

// The masked address, kept left-to-right inside Arabic copy.
function accountTag(chunks: ReactNode) {
  return <bdi className="font-semibold">{chunks}</bdi>;
}

// Rendered once the finish-signup gate is clear: records the sign-in on this device, asks before
// any guest import, runs it if the student agrees, then moves on. A failure never strands the
// student here.
function Completion({ locale, account }: { locale: AppLocale; account: string }) {
  const t = useTranslations("welcome");
  const router = useRouter();
  const started = useRef(false);
  const id = useId();
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
    // Whatever an earlier account left in this browser's cache is never shown under this session
    // (ruling P24): it is read again from the server.
    clearAccountLocalState();
    setSessionHint();
    // A sign-in link can be opened in a browser by someone other than its owner (login CSRF), so
    // this device's data goes into an account only once the student confirms it is theirs.
    if (deviceHasGuestData()) setStep({ kind: "confirm" });
    else leave();
  }, [leave]);

  if (step.kind === "confirm") {
    const titleId = `${id}-title`;
    const hintId = `${id}-hint`;
    return (
      <section
        aria-labelledby={titleId}
        className="flex max-w-prose flex-col items-start gap-4 text-start"
      >
        <h2 id={titleId} className="text-xl font-semibold">
          {t.rich("confirm.title", { email: account, account: accountTag })}
        </h2>
        <p className="text-base">{t("confirm.body")}</p>
        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={() => run("auto")}>
            {t("confirm.add")}
          </Button>
          <Button type="button" variant="outline" aria-describedby={hintId} onClick={leave}>
            {t("confirm.notNow")}
          </Button>
        </div>
        <p id={hintId} className="text-sm text-muted-foreground">
          {t("confirm.notNowHint")}
        </p>
      </section>
    );
  }

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
        <ImportChoiceDialog
          account={t.rich("import.account", { email: account, account: accountTag })}
          onKeep={leave}
          onReplace={() => run("replace")}
        />
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

  const leave = useCallback(() => {
    router.replace(landingReturnPath(readLocation().returnParam, locale));
  }, [locale, router]);

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
        const account = maskEmail(result.email);
        // Ruling Q19: the confirm page binds the sign-in to the browser that asked for the link. When
        // it did not, this device's data is never offered for import.
        setStage(
          takeSignInBrowser() === "other"
            ? { kind: "other-browser", account }
            : { kind: "consent", consentVersion: result.consentVersion, account },
        );
      }
    });
    return () => {
      current = false;
    };
  }, [attempt, locale, router]);

  if (stage.kind === "other-browser") {
    return <OtherBrowserWarning locale={locale} account={stage.account} onContinue={leave} />;
  }
  if (stage.kind === "consent") {
    return (
      // The kept session answer predates the consent: forget it, so the menu asks again.
      <FinishSignupGate consentVersion={stage.consentVersion} onAccepted={forgetSession}>
        <Completion locale={locale} account={stage.account} />
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
