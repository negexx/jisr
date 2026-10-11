"use client";

import { useTranslations } from "next-intl";
import { lazy, type ReactNode, Suspense } from "react";

import { Button } from "@/components/ui/button";
import type { AppLocale } from "@/i18n/routing";
import { useProfile } from "@/lib/profile/use-profile";
import type { SnapshotClient } from "@/lib/snapshot/client";
import { shardsForProfileForm } from "@/lib/snapshot/plan";
import { type SnapshotRequest, useSnapshotBundle } from "@/lib/snapshot/use-snapshot";

import { PAGE_GRID, PageTitle } from "./chrome";
import { AlertIcon } from "./icons";
import { ProfileWizard } from "./profile-wizard";

// Only the "still verifying" state uses it, and it would bring the icon library into the first
// load. The error state must not: it shows when the network failed, so another chunk would too.
const EmptyState = lazy(() =>
  import("@/components/empty-state").then((module) => ({ default: module.EmptyState })),
);

// One stable key: the plan does not depend on anything the student types.
const REQUEST: SnapshotRequest = { key: "profile-form", plan: shardsForProfileForm() };

// Same grid as the wizard, so nothing moves when the form replaces a placeholder.
function Shell({ mode, children }: { mode: "create" | "edit" | "neutral"; children: ReactNode }) {
  return (
    <div className={PAGE_GRID}>
      <div className="flex min-w-0 flex-col gap-6">
        <PageTitle mode={mode} />
        {children}
      </div>
      <aside className="hidden lg:block" />
    </div>
  );
}

function FormSkeleton({ label }: { label: string }) {
  const block = "rounded-xl bg-secondary motion-safe:animate-pulse";
  return (
    <output aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="flex flex-col gap-6">
        <div className={`${block} h-6 w-2/3`} />
        {[0, 1, 2].map((row) => (
          <div key={row} className="flex flex-col gap-2">
            <div className={`${block} h-5 w-1/3`} />
            <div className={`${block} h-12 w-full`} />
          </div>
        ))}
      </div>
    </output>
  );
}

// `client` is a test seam: production always uses the shared snapshot client.
export function ProfileForm({ locale, client }: { locale: AppLocale; client?: SnapshotClient }) {
  const t = useTranslations("profile");
  const { state: snapshot, retry } = useSnapshotBundle(REQUEST, locale, client);
  const { state: profile } = useProfile();
  const mode =
    profile.status === "unhydrated" ? "neutral" : profile.status === "ok" ? "edit" : "create";

  if (snapshot.status === "error") {
    return (
      <Shell mode={mode}>
        <div role="alert" className="flex flex-col items-start gap-4 py-10">
          <AlertIcon className="size-10 text-destructive" />
          <div className="flex max-w-prose flex-col gap-2">
            <h2 className="text-xl font-semibold">{t("states.error.title")}</h2>
            <p className="text-base text-muted-foreground">{t("states.error.description")}</p>
          </div>
          <Button type="button" variant="outline" onClick={retry}>
            {t("states.error.retry")}
          </Button>
        </div>
      </Shell>
    );
  }

  if (snapshot.status === "ready") {
    const { core, text } = snapshot.bundle;
    if (core === undefined || core.credentialTypes.length === 0) {
      return (
        <Shell mode={mode}>
          <Suspense fallback={null}>
            <EmptyState
              title={t("states.unavailable.title")}
              description={t("states.unavailable.description")}
            />
          </Suspense>
        </Shell>
      );
    }
    if (profile.status !== "unhydrated") {
      return <ProfileWizard core={core} text={text} locale={locale} />;
    }
  }

  return (
    <Shell mode={mode}>
      <FormSkeleton label={t("states.loading")} />
    </Shell>
  );
}
