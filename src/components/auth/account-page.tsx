"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { isValidIsoDate } from "@/data-schema/dates";
import type { AppLocale } from "@/i18n/routing";
import { requestAccountDeletion } from "@/lib/auth/account-deletion";
import { downloadAccountExport } from "@/lib/auth/account-export";
import { accountPath, signInPath } from "@/lib/auth/callback-urls";
import { forgetSession, lookupSession } from "@/lib/auth/session-client";
import { clearAccountLocalState, readSessionHint } from "@/lib/auth/session-hint";
import { formatDate } from "@/lib/format";

type Account = { email: string; consentVersion: string | null; consentedAt: string | null };

type Check =
  | { kind: "checking" }
  | { kind: "signed-out" }
  | { kind: "unavailable" }
  | ({ kind: "signed-in" } & Account);

// The addresses, versions and dates stay left-to-right inside Arabic copy.
function valueTag(chunks: ReactNode) {
  return (
    <bdi dir="ltr" className="font-medium [overflow-wrap:anywhere]">
      {chunks}
    </bdi>
  );
}

// The day the student gave consent, as they lived it: the browser's own calendar day, not UTC's.
function localDay(timestamp: string): string | null {
  const moment = new Date(timestamp);
  if (Number.isNaN(moment.getTime())) return null;
  const month = String(moment.getMonth() + 1).padStart(2, "0");
  const day = String(moment.getDate()).padStart(2, "0");
  const iso = `${String(moment.getFullYear()).padStart(4, "0")}-${month}-${day}`;
  return isValidIsoDate(iso) ? iso : null;
}

// A static page cannot see the session, so the server renders only the checking line. A browser with
// no sign-in hint is a guest: it gets the sign-in prompt and makes no request at all.
export function AccountPage({ locale }: { locale: AppLocale }) {
  const t = useTranslations("accountPage");
  const [check, setCheck] = useState<Check>({ kind: "checking" });
  const [attempt, setAttempt] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is the retry trigger
  useEffect(() => {
    if (!readSessionHint()) {
      setCheck({ kind: "signed-out" });
      return;
    }
    let current = true;
    setCheck({ kind: "checking" });
    void lookupSession().then((result) => {
      if (!current) return;
      if (result.status === "signed-in") {
        setCheck({
          kind: "signed-in",
          email: result.email,
          consentVersion: result.consentVersion,
          consentedAt: result.consentedAt,
        });
        return;
      }
      if (result.status === "signed-out") clearAccountLocalState();
      setCheck({ kind: result.status });
    });
    return () => {
      current = false;
    };
  }, [attempt]);

  // The server no longer knows this session (expired, signed out elsewhere): same as the menu.
  function leaveSession(): void {
    forgetSession();
    clearAccountLocalState();
    setCheck({ kind: "signed-out" });
  }

  if (check.kind === "checking") return <output className="block">{t("checking")}</output>;

  if (check.kind === "signed-out") {
    return (
      <div className="flex max-w-prose flex-col items-start gap-4 text-start">
        <p className="text-base">{t("signedOut.body")}</p>
        <a
          href={signInPath(locale, accountPath(locale))}
          className={buttonVariants({ variant: "default" })}
        >
          {t("signedOut.signIn")}
        </a>
      </div>
    );
  }

  if (check.kind === "unavailable") {
    return (
      <div className="flex max-w-prose flex-col items-start gap-4 text-start">
        <p role="alert" className="text-base font-medium text-destructive">
          {t("unavailable.body")}
        </p>
        <Button type="button" variant="outline" onClick={() => setAttempt((n) => n + 1)}>
          {t("unavailable.retry")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex max-w-prose flex-col gap-8 text-start">
      <p className="text-base">{t.rich("signedIn", { email: check.email, value: valueTag })}</p>
      <ExportSection onSignedOut={leaveSession} />
      <ConsentSection
        locale={locale}
        version={check.consentVersion}
        consentedAt={check.consentedAt}
      />
      <DeleteSection email={check.email} locale={locale} onSignedOut={leaveSession} />
    </div>
  );
}

const SECTION = "flex flex-col items-start gap-3 border-t border-border pt-6";

type ExportStatus = "idle" | "working" | "done" | "failed" | "unavailable";

function ExportSection({ onSignedOut }: { onSignedOut: () => void }) {
  const t = useTranslations("accountPage.export");
  const titleId = useId();
  const [status, setStatus] = useState<ExportStatus>("idle");

  async function download(): Promise<void> {
    setStatus("working");
    const outcome = await downloadAccountExport();
    if (outcome === "signed-out") onSignedOut();
    else setStatus(outcome === "downloaded" ? "done" : outcome);
  }

  return (
    <section aria-labelledby={titleId} className={SECTION}>
      <h2 id={titleId} className="text-xl font-semibold">
        {t("title")}
      </h2>
      <p className="text-base">{t("body")}</p>
      <Button
        type="button"
        variant="outline"
        disabled={status === "working"}
        onClick={() => void download()}
      >
        {status === "working" ? t("working") : t("button")}
      </Button>
      <output className="empty:hidden text-sm">{status === "done" ? t("done") : null}</output>
      {status === "failed" || status === "unavailable" ? (
        <p role="alert" className="text-base font-medium text-destructive">
          {t(`errors.${status}`)}
        </p>
      ) : null}
    </section>
  );
}

function ConsentSection({
  locale,
  version,
  consentedAt,
}: {
  locale: AppLocale;
  version: string | null;
  consentedAt: string | null;
}) {
  const t = useTranslations("accountPage.consent");
  const titleId = useId();
  const date = consentedAt === null ? null : localDay(consentedAt);
  return (
    <section aria-labelledby={titleId} className={SECTION}>
      <h2 id={titleId} className="text-xl font-semibold">
        {t("title")}
      </h2>
      <p className="text-base">
        {version === null
          ? t("none")
          : date === null
            ? t.rich("recordNoDate", { version, value: valueTag })
            : t.rich("record", { version, date: formatDate(date, locale), value: valueTag })}
      </p>
    </section>
  );
}

type DeleteStatus = "idle" | "working" | "sent" | "failed" | "unavailable" | "try-later";

function DeleteSection({
  email,
  locale,
  onSignedOut,
}: {
  email: string;
  locale: AppLocale;
  onSignedOut: () => void;
}) {
  const t = useTranslations("accountPage.delete");
  const ids = useId();
  const [status, setStatus] = useState<DeleteStatus>("idle");
  // How many requests were accepted so far: every one moves focus to the confirmation, so a
  // repeat is announced too, and the second one says it is a repeat.
  const [sentCount, setSentCount] = useState(0);
  const sentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (sentCount > 0) sentRef.current?.focus();
  }, [sentCount]);

  async function request(): Promise<void> {
    setStatus("working");
    const outcome = await requestAccountDeletion(locale);
    if (outcome === "signed-out") {
      onSignedOut();
      return;
    }
    if (outcome === "sent") setSentCount((count) => count + 1);
    setStatus(outcome === "sent" ? "sent" : outcome);
  }

  const titleId = `${ids}-title`;
  const bodyId = `${ids}-body`;
  const working = status === "working";
  const asked = sentCount > 0;
  // A failed or refused repeat takes the confirmation away: it would contradict the notice.
  const showSent = status === "sent" || (working && asked);
  return (
    <section aria-labelledby={titleId} className={SECTION}>
      <h2 id={titleId} className="text-xl font-semibold">
        {t("title")}
      </h2>
      <p id={bodyId} className="text-base">
        {t.rich("body", { email, value: valueTag })}
      </p>
      {showSent ? (
        <div
          ref={sentRef}
          tabIndex={-1}
          className="flex flex-col items-start gap-2 rounded-lg border border-border bg-muted p-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <h3 className="text-base font-semibold">{t("sent.title")}</h3>
          <p className="text-base">{t.rich("sent.body", { email, value: valueTag })}</p>
          {sentCount > 1 ? <output className="text-sm">{t("sent.repeated")}</output> : null}
        </div>
      ) : null}
      <Button
        type="button"
        variant={asked ? "outline" : "destructive"}
        aria-describedby={bodyId}
        disabled={working}
        onClick={() => void request()}
      >
        {working ? t("working") : asked ? t("sent.again") : t("button")}
      </Button>
      {status === "failed" || status === "unavailable" || status === "try-later" ? (
        <p role="alert" className="text-base font-medium text-destructive">
          {t(status === "try-later" ? "errors.tryLater" : `errors.${status}`)}
        </p>
      ) : null}
    </section>
  );
}
