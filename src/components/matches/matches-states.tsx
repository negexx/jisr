import { Info, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { EmptyState } from "@/components/empty-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export function EditProfileLink({ size = "default" }: { size?: "default" | "sm" }) {
  const t = useTranslations("matches.summary");
  return (
    <Link href="/profile" className={buttonVariants({ variant: "outline", size })}>
      {t("edit")}
    </Link>
  );
}

export function NoProfileState() {
  const t = useTranslations("matches.states.none");
  return (
    <EmptyState
      title={t("title")}
      description={t("description")}
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

export function NoProgramsForFieldsState() {
  const t = useTranslations("matches.states.noProgramsForFields");
  return (
    <EmptyState title={t("title")} description={t("description")} action={<EditProfileLink />} />
  );
}

export function AllHiddenState({ title }: { title: string }) {
  const t = useTranslations("matches.states.allHidden");
  return <EmptyState title={title} description={t("description")} action={<EditProfileLink />} />;
}
