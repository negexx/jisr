"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { readSessionHint } from "@/lib/auth/session-hint";

import type { ReportScope } from "./report-context";
import { REPORT_WRAPPER_CLASS, ReportTrigger, reportContext } from "./report-trigger";

type Status = "idle" | "reported" | "failed" | "rate_limited";

export type ReportButtonProps = {
  record: string;
  path: string;
  sourceUrl: string;
  hostname: string | null;
  scope: ReportScope;
  snapshotVersion: string;
  // The student already clicked while this chunk was loading: act on that click once it is here.
  autoStart: boolean;
};

// The full button, in its own chunk: loaded once a sign-in hint is present or after the first click,
// never for a page a signed-out visitor only reads.
export function ReportButton({
  record,
  path,
  sourceUrl,
  hostname,
  scope,
  snapshotVersion,
  autoStart,
}: ReportButtonProps) {
  // The paths the flow builds already carry the locale, so this is Next's router, not the
  // locale-aware one, which would prefix them a second time. A button that navigates on click,
  // never a Link: a Link would prefetch the sign-in page for every visitor.
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const started = useRef(false);
  const { copy, locale } = scope;

  async function report(): Promise<void> {
    // Signed in, the answer is shown at once and taken back if the server refuses.
    setStatus(readSessionHint() ? "reported" : "idle");
    try {
      const flow = await import("./report-flow");
      const outcome = await flow.submitReport({
        locale,
        // Locale prefixes are always on, so the address bar already holds the path to come back to.
        returnPath: window.location.pathname,
        record,
        path,
        sourceUrl,
        snapshotVersion,
      });
      if (outcome.kind === "sent") {
        setStatus("reported");
      } else if (outcome.kind === "navigate") {
        setStatus("idle");
        router.push(outcome.to);
      } else {
        setStatus(outcome.reason === "rate_limited" ? "rate_limited" : "failed");
      }
    } catch {
      setStatus("failed");
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once, for the click made before this chunk arrived
  useEffect(() => {
    if (!autoStart || started.current) return;
    started.current = true;
    void report();
  }, []);

  const reported = status === "reported";
  return (
    <span data-slot="report-outdated" className={REPORT_WRAPPER_CLASS}>
      <ReportTrigger
        label={reported ? copy.reported : copy.button}
        context={reportContext(copy, record, path)}
        hostname={hostname}
        disabled={reported}
        onClick={report}
      />
      <output className="empty:hidden text-sm text-destructive">
        {status === "failed" ? copy.failed : status === "rate_limited" ? copy.rateLimited : null}
      </output>
    </span>
  );
}
