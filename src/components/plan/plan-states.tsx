import { Info, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/empty-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

const BLOCK = "rounded-xl bg-secondary motion-safe:animate-pulse";

// The switcher comes first in the DOM so a phone shows it above the plan and the tab order is the
// same in every direction; from lg it becomes a sticky rail in the first column.
export function PlanLayout({ aside, children }: { aside: ReactNode; children: ReactNode }) {
  if (aside === null) return <div className="flex min-w-0 flex-col gap-6">{children}</div>;
  return (
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start lg:gap-8">
      <div className="lg:sticky lg:top-6">{aside}</div>
      <div className="flex min-w-0 flex-col gap-6">{children}</div>
    </div>
  );
}

// Decorative: the busy container that holds it, and the separate live status, carry the meaning.
export function PlanSkeleton() {
  return (
    <div aria-busy="true">
      <PlanLayout aside={<div aria-hidden="true" className={`${BLOCK} h-16`} />}>
        <div aria-hidden="true" className="flex flex-col gap-4">
          <div className={`${BLOCK} h-8 w-2/3`} />
          <div className={`${BLOCK} h-4 w-1/2`} />
          <div className={`${BLOCK} h-24`} />
          <div className={`${BLOCK} h-16`} />
          <div className={`${BLOCK} h-16`} />
          <div className={`${BLOCK} h-16`} />
        </div>
      </PlanLayout>
    </div>
  );
}

export function NoSavedState() {
  const t = useTranslations("plan.empty");
  return (
    <EmptyState
      focusTarget
      title={t("title")}
      description={t("description")}
      action={
        <Link href="/matches" className={buttonVariants({ size: "lg" })}>
          {t("action")}
        </Link>
      }
    />
  );
}

export function NoProfileState() {
  const t = useTranslations("plan.noProfile");
  return (
    <EmptyState
      title={t("title")}
      description={t("description")}
      action={
        <Link href="/profile" className={buttonVariants({ size: "lg" })}>
          {t("action")}
        </Link>
      }
    />
  );
}

export function ErrorState({ onRetry }: { onRetry?: () => void }) {
  const t = useTranslations("plan.error");
  return (
    <EmptyState
      tone="error"
      title={t("title")}
      description={t("description")}
      action={
        onRetry === undefined ? undefined : (
          <Button type="button" variant="outline" onClick={onRetry}>
            {t("retry")}
          </Button>
        )
      }
    />
  );
}

// A standing notice, not a one-off: saving a program announces success even when the device cannot
// keep the list, so the page says so for as long as it is true.
export function StorageNotice() {
  const t = useTranslations("plan.storage");
  return (
    <output className="flex items-start gap-3 rounded-xl bg-secondary px-4 py-3">
      <Info aria-hidden="true" className="mt-1 size-5 shrink-0 text-muted-foreground" />
      <p className="flex-1 pt-0.5 text-base">{t("notice")}</p>
    </output>
  );
}

export function ResetNotice({ onDismiss }: { onDismiss: () => void }) {
  const t = useTranslations("plan.reset");
  return (
    <output className="flex items-start gap-3 rounded-xl bg-secondary px-4 py-3">
      <Info aria-hidden="true" className="mt-1 size-5 shrink-0 text-muted-foreground" />
      <p className="flex-1 pt-0.5 text-base">{t("notice")}</p>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={t("dismiss")}
        onClick={onDismiss}
        className="-my-2 shrink-0"
      >
        <X aria-hidden="true" />
      </Button>
    </output>
  );
}
