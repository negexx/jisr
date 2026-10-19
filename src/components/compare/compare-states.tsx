import { Info, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { EmptyState } from "@/components/empty-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { useSessionHint } from "@/lib/auth/session-hint";

const BLOCK = "rounded-lg bg-muted motion-safe:animate-pulse";

// Decorative: the busy container that holds it, and the separate live status, carry the meaning.
// The min-height reserves a viewport-height placeholder so the footer starts below the fold while
// the island loads; it cannot then jump when the records replace the skeleton (a 0.195 layout shift
// on desktop, design audit D1).
export function CompareSkeleton() {
  return (
    <div aria-busy="true" className="flex min-h-[calc(100dvh-8rem)] flex-col gap-6">
      <div aria-hidden="true" className="flex flex-col gap-4">
        <div className={`${BLOCK} h-16`} />
        <div className={`${BLOCK} h-12 w-2/3`} />
        <div className={`${BLOCK} h-6 w-1/3`} />
        <div className={`${BLOCK} h-28`} />
        <div className={`${BLOCK} h-28`} />
      </div>
    </div>
  );
}

// Zero saved programs and one saved program are the same state: there is nothing to compare yet.
export function NoSavedState() {
  const t = useTranslations("compare.empty");
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

export function NotEnoughState() {
  const t = useTranslations("compare.notEnough");
  return <EmptyState title={t("title")} description={t("description")} />;
}

export function NoProfileState() {
  const t = useTranslations("compare.noProfile");
  const signedIn = useSessionHint();
  return (
    <EmptyState
      title={t("title")}
      description={t(signedIn ? "descriptionSignedIn" : "description")}
      action={
        <Link href="/profile" className={buttonVariants({ size: "lg" })}>
          {t("action")}
        </Link>
      }
    />
  );
}

export function ErrorState({ onRetry }: { onRetry?: () => void }) {
  const t = useTranslations("compare.error");
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
  const t = useTranslations("compare.storage");
  const signedIn = useSessionHint();
  return (
    <output className="flex items-start gap-3 rounded-lg border border-border bg-muted px-4 py-3">
      <Info aria-hidden="true" className="mt-1 size-5 shrink-0 text-muted-foreground" />
      <p className="flex-1 pt-0.5 text-base">{t(signedIn ? "noticeSignedIn" : "notice")}</p>
    </output>
  );
}

export function ResetNotice({ onDismiss }: { onDismiss: () => void }) {
  const t = useTranslations("compare.reset");
  return (
    <output className="flex items-start gap-3 rounded-lg border border-border bg-muted px-4 py-3">
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
