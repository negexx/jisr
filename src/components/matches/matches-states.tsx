import { Info, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { EmptyState } from "@/components/empty-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { useSessionHint } from "@/lib/auth/session-hint";

export function NoProfileState() {
  const t = useTranslations("matches.states.none");
  const signedIn = useSessionHint();
  return (
    <EmptyState
      title={t("title")}
      description={t(signedIn ? "descriptionSignedIn" : "description")}
      action={
        <Link href="/profile" className={buttonVariants({ size: "lg" })}>
          {t("cta")}
        </Link>
      }
    />
  );
}

export function ResetNotice({ onDismiss }: { onDismiss: () => void }) {
  const t = useTranslations("matches.states.reset");
  const signedIn = useSessionHint();
  return (
    <output className="flex items-start gap-3 rounded-xl bg-secondary px-4 py-3">
      <Info aria-hidden="true" className="mt-1 size-5 shrink-0 text-muted-foreground" />
      <p className="flex-1 pt-0.5 text-base">{t(signedIn ? "noticeSignedIn" : "notice")}</p>
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

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations("matches.states.error");
  return (
    <EmptyState
      tone="error"
      title={t("title")}
      description={t("description")}
      action={
        <Button type="button" variant="outline" onClick={onRetry}>
          {t("retry")}
        </Button>
      }
    />
  );
}

export function NoProgramsState() {
  const t = useTranslations("matches.states.noPrograms");
  return <EmptyState title={t("title")} description={t("description")} />;
}

// Every published program is hidden by the filters: the recovery is Clear, not an edit of the
// profile, which no longer carries any of the values that hide a program.
export function NoMatchesState({ title, onClear }: { title: string; onClear: () => void }) {
  const t = useTranslations("matches.states.noMatches");
  const tFilters = useTranslations("matches.filters");
  return (
    <EmptyState
      title={title}
      description={t("description")}
      action={
        <Button type="button" variant="outline" onClick={onClear}>
          {tFilters("clear")}
        </Button>
      }
    />
  );
}
