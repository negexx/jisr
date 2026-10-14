import type { AppLocale } from "@/i18n/routing";
import { authCallbackUrls, signInPath } from "@/lib/auth/callback-urls";
import { forgetSession } from "@/lib/auth/session-client";
import { clearAccountLocalState, readSessionHint } from "@/lib/auth/session-hint";
import { createFeedbackReport } from "@/lib/server/account-actions";

// Its own chunk, fetched on the first click: the Server Action reference and the session code stay
// out of every page a student only reads.
export type ReportOutcome =
  | { kind: "sent" }
  | { kind: "navigate"; to: string }
  | { kind: "failed"; reason: "rate_limited" | "other" };

export type ReportRequest = {
  locale: AppLocale;
  returnPath: string;
  record: string;
  path: string;
  sourceUrl: string;
  snapshotVersion: string;
};

export async function submitReport(request: ReportRequest): Promise<ReportOutcome> {
  const { locale, returnPath } = request;
  if (!readSessionHint()) return { kind: "navigate", to: signInPath(locale, returnPath) };

  const result = await createFeedbackReport({
    record: request.record,
    path: request.path,
    sourceUrl: request.sourceUrl,
    snapshotVersion: request.snapshotVersion,
  });
  if (result.ok) return { kind: "sent" };
  switch (result.error) {
    case "unauthenticated":
      // The server no longer knows this session: the device signs out as the menu does.
      forgetSession();
      clearAccountLocalState();
      return { kind: "navigate", to: signInPath(locale, returnPath) };
    case "consent_required":
      // The finish-signup gate lives on the landing page and sends the student back here after.
      return { kind: "navigate", to: authCallbackUrls(locale, returnPath).callbackURL };
    case "rate_limited":
      return { kind: "failed", reason: "rate_limited" };
    default:
      return { kind: "failed", reason: "other" };
  }
}
