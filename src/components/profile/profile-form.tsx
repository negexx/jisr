"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import type { AppLocale } from "@/i18n/routing";
import { useProfile } from "@/lib/profile/use-profile";
import type { SnapshotClient } from "@/lib/snapshot/client";
import { shardsForProfileForm } from "@/lib/snapshot/plan";
import { type SnapshotRequest, useSnapshotBundle } from "@/lib/snapshot/use-snapshot";

import { PageTitle, ProfileWizard } from "./profile-wizard";

// One stable key: the plan does not depend on anything the student types.
const REQUEST: SnapshotRequest = { key: "profile-form", plan: shardsForProfileForm() };

function Shell({ editing, children }: { editing: boolean; children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-[40rem] flex-col gap-6">
      <PageTitle mode={editing ? "edit" : "create"} />
      {children}
    </div>
  );
}

function FormSkeleton({ label }: { label: string }) {
  const block = "rounded-lg bg-muted motion-safe:animate-pulse";
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
  const editing = profile.status === "ok";

  if (snapshot.status === "error") {
    return (
      <Shell editing={editing}>
        <EmptyState
          tone="error"
          title={t("states.error.title")}
          description={t("states.error.description")}
          action={
            <Button type="button" variant="outline" onClick={retry}>
              {t("states.error.retry")}
            </Button>
          }
        />
      </Shell>
    );
  }

  if (snapshot.status === "ready") {
    const { core, text } = snapshot.bundle;
    if (core === undefined || core.credentialTypes.length === 0) {
      return (
        <Shell editing={editing}>
          <EmptyState
            title={t("states.unavailable.title")}
            description={t("states.unavailable.description")}
          />
        </Shell>
      );
    }
    if (profile.status !== "unhydrated") {
      return <ProfileWizard core={core} text={text} locale={locale} />;
    }
  }

  return (
    <Shell editing={editing}>
      <FormSkeleton label={t("states.loading")} />
    </Shell>
  );
}
