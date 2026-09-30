import { useTranslations } from "next-intl";
import type { ReactNode, Ref } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { AlertIcon, CloseIcon, InfoIcon } from "./icons";
import type { ShownIssue } from "./issues";

const STEP_COUNT = 4;

// The text carries the meaning; the segments are a non-essential picture of it: one per step, and the
// review keeps them all filled. Segments sit in a
// flex row, so they run from the start edge and mirror by themselves in Arabic.
export function StepHeader({ stepIndex, label }: { stepIndex: number; label: string }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-base font-medium">{label}</p>
      <div aria-hidden="true" className="flex gap-1.5">
        {Array.from({ length: STEP_COUNT }, (_, index) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed list of segments
            key={index}
            className={cn(
              "h-1.5 flex-1 rounded-full",
              index <= Math.min(stepIndex, STEP_COUNT - 1) ? "bg-primary" : "bg-border",
            )}
          />
        ))}
      </div>
    </div>
  );
}

export function ErrorSummary({
  issues,
  summaryRef,
  onFocusField,
}: {
  issues: readonly ShownIssue[];
  summaryRef: Ref<HTMLDivElement>;
  onFocusField: (id: string) => void;
}) {
  const t = useTranslations("profile.errors");
  if (issues.length === 0) return null;
  return (
    <div
      ref={summaryRef}
      tabIndex={-1}
      className="flex flex-col gap-3 rounded-lg border-2 border-destructive bg-destructive-bg p-4 outline-none"
    >
      <h2 className="flex items-center gap-2 text-lg font-semibold text-destructive">
        <AlertIcon className="size-5 shrink-0" />
        {t("summaryTitle")}
      </h2>
      <ul className="flex flex-col gap-1">
        {issues.map((issue) => (
          <li key={issue.key}>
            <a
              href={`#${issue.id}`}
              onClick={(event) => {
                event.preventDefault();
                onFocusField(issue.id);
              }}
              className="inline-flex min-h-12 items-center text-base font-medium text-destructive underline underline-offset-4 hover:no-underline"
            >
              {issue.summary}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Notice({
  children,
  dismissLabel,
  onDismiss,
}: {
  children: ReactNode;
  dismissLabel?: string;
  onDismiss?: () => void;
}) {
  return (
    <output className="flex items-start gap-3 rounded-lg border border-border bg-muted px-4 py-3">
      <InfoIcon className="mt-1 size-5 shrink-0 text-muted-foreground" />
      <p className="flex-1 pt-0.5 text-base">{children}</p>
      {onDismiss === undefined ? null : (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={dismissLabel}
          onClick={onDismiss}
          className="-my-2 shrink-0"
        >
          <CloseIcon />
        </Button>
      )}
    </output>
  );
}
export const PAGE_GRID =
  "lg:grid lg:grid-cols-[minmax(0,40rem)_minmax(0,16rem)] lg:justify-center lg:gap-12";

// "neutral" is what the server renders: it does not yet know whether a profile is saved.
export function PageTitle({ mode }: { mode: "create" | "edit" | "neutral" }) {
  const t = useTranslations("profile.title");
  return (
    <h1 id="profile-title" className="text-2xl font-bold tracking-tight text-balance">
      {t(mode)}
    </h1>
  );
}
