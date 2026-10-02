"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import type { IsoDate } from "@/data-schema/dates";
import type { AppLocale } from "@/i18n/routing";
import { todayIso } from "@/lib/clock";
import type { PlanView } from "@/lib/journey/plan-view";
import { usePlanProgress } from "@/lib/plan/use-plan-progress";
import { useProfile } from "@/lib/profile/use-profile";
import { removeFromPlan } from "@/lib/saved/actions";
import { useSaved } from "@/lib/saved/use-saved";
import type { SnapshotClient } from "@/lib/snapshot/client";
import { shardsForPlan } from "@/lib/snapshot/plan";
import { type SnapshotRequest, useSnapshotBundle } from "@/lib/snapshot/use-snapshot";

import { CompareEntry } from "./compare-entry";
import { MissingProgram } from "./missing-program";
import {
  ErrorState,
  NoProfileState,
  NoSavedState,
  PlanLayout,
  PlanSkeleton,
  ResetNotice,
  StorageNotice,
} from "./plan-states";
import { ProgramPlan, stepProgress } from "./program-plan";
import { ProgramSwitcher, type SwitcherItem } from "./program-switcher";

// The view model is loaded on demand: it carries the matching and checklist code, which only a
// student with a saved program ever needs.
type PlanModule = typeof import("@/lib/journey/plan-view");

type Computed = { kind: "view"; view: PlanView } | { kind: "error" };

// The plan reads the credential country and the shards of every saved program, so the key changes
// with exactly those. It stays in memory: never sent, logged or put in a URL.
function planKey(country: string, items: ReadonlyArray<{ country: string; field: string }>) {
  const shards = [...new Set(items.map((item) => `${item.country}.${item.field}`))].sort();
  return `plan:${country}:${shards.join(",")}`;
}

// `client` is a test seam: production always uses the shared snapshot client.
export function PlanClient({ locale, client }: { locale: AppLocale; client?: SnapshotClient }) {
  const t = useTranslations("plan");
  const { state: profileState, dismissReset } = useProfile();
  const saved = useSaved();
  const progress = usePlanProgress();
  const profile = profileState.status === "ok" ? profileState.profile : null;
  const items = saved.items;
  const wanted = profile !== null && saved.hydrated && items.length > 0;

  // The browser clock, read once after mount: the server render and the first client render hold
  // no date, so nothing clock-dependent can differ between them.
  const [now, setNow] = useState<IsoDate | null>(null);
  useEffect(() => {
    setNow(todayIso());
  }, []);

  const request: SnapshotRequest | null =
    wanted && profile !== null
      ? {
          key: planKey(profile.credential.country, items),
          plan: (manifest) => shardsForPlan(items, profile.credential.country, manifest),
        }
      : null;
  const { state: snapshot, retry } = useSnapshotBundle(request, locale, client);
  const bundle = snapshot.status === "ready" ? snapshot.bundle : null;

  const [planModule, setPlanModule] = useState<PlanModule | "failed" | null>(null);
  const [attempt, setAttempt] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` only re-runs the import after a failed one
  useEffect(() => {
    if (!wanted) return;
    let current = true;
    import("@/lib/journey/plan-view").then(
      (module) => {
        if (current) setPlanModule(module);
      },
      () => {
        if (current) setPlanModule("failed");
      },
    );
    return () => {
      current = false;
    };
  }, [wanted, attempt]);

  // Derived, never stored: a result can only be shown for exactly this profile, bundle and list.
  const computed = useMemo<Computed | null>(() => {
    if (
      profile === null ||
      bundle === null ||
      now === null ||
      planModule === null ||
      planModule === "failed"
    ) {
      return null;
    }
    try {
      return {
        kind: "view",
        view: planModule.buildPlanView({ profile, bundle, saved: items, now }),
      };
    } catch {
      // A programmer error must not crash the page, and its message must not reach the student.
      return { kind: "error" };
    }
  }, [profile, bundle, now, planModule, items]);

  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const focusAfterRemoval = useRef(false);

  function remove(slug: string) {
    focusAfterRemoval.current = true;
    removeFromPlan(slug);
  }

  function retryAll() {
    setPlanModule(null);
    setAttempt((n) => n + 1);
    retry();
  }

  function body(): { loading: boolean; node: ReactNode } {
    const hydrated = profileState.status !== "unhydrated" && saved.hydrated && progress.hydrated;
    if (!hydrated) return { loading: true, node: <PlanSkeleton /> };
    if (items.length === 0) return { loading: false, node: <NoSavedState /> };
    if (profileState.status === "none") return { loading: false, node: <NoProfileState /> };
    if (profileState.status === "reset") {
      return {
        loading: false,
        node: (
          <div className="flex flex-col gap-2">
            <ResetNotice onDismiss={dismissReset} />
            <NoProfileState />
          </div>
        ),
      };
    }
    if (snapshot.status === "error" || planModule === "failed") {
      return { loading: false, node: <ErrorState onRetry={retryAll} /> };
    }
    if (computed?.kind === "error") return { loading: false, node: <ErrorState /> };
    if (computed === null) return { loading: true, node: <PlanSkeleton /> };

    const { entries } = computed.view;
    const active = entries.find((entry) => entry.slug === activeSlug) ?? entries[0];
    if (active === undefined) return { loading: false, node: <NoSavedState /> };

    const switcherItems = entries.map((entry): SwitcherItem => {
      if (entry.kind === "missing") return { kind: "missing", slug: entry.slug };
      const counted = stepProgress(entry, progress.doneSteps(entry.slug));
      return {
        kind: "program",
        slug: entry.slug,
        name: entry.name,
        institutionName: entry.institutionName,
        cityName: entry.cityName,
        done: counted.done,
        total: counted.todo.length,
      };
    });
    const several = entries.length > 1;

    return {
      loading: false,
      node: (
        <>
          <p className="max-w-prose text-base text-muted-foreground">{t("lead")}</p>
          <CompareEntry count={items.length} />
          <PlanLayout
            aside={
              several ? (
                <ProgramSwitcher
                  items={switcherItems}
                  activeSlug={active.slug}
                  onSelect={setActiveSlug}
                />
              ) : null
            }
          >
            {active.kind === "missing" ? (
              <MissingProgram slug={active.slug} onRemove={() => remove(active.slug)} />
            ) : (
              <ProgramPlan
                key={active.slug}
                program={active}
                done={progress.doneSteps(active.slug)}
                showProgress={!several}
                onToggle={(step, done) => progress.setDone(active.slug, step, done)}
                onRemove={() => remove(active.slug)}
              />
            )}
          </PlanLayout>
        </>
      ),
    };
  }

  const { loading, node } = body();

  // After Remove the focused button disappears. Once the view settles, focus the heading that takes
  // its place: the next program's, the missing-program card's, or the empty state's title. While
  // the plan is still loading the request waits; if it settles on a view with no such heading
  // (an error, say) the request is dropped so it cannot pull focus away later.
  useEffect(() => {
    if (!focusAfterRemoval.current) return;
    const target = root.current?.querySelector<HTMLElement>(
      '[data-slot="plan-heading"], [data-slot="focus-target"]',
    );
    if (target !== null && target !== undefined) {
      focusAfterRemoval.current = false;
      target.focus();
    } else if (!loading) {
      focusAfterRemoval.current = false;
    }
  });
  const storageNotice = saved.hydrated && !saved.storageAvailable;
  // One polite status region for the whole life of the island: a region inserted together with its
  // text is skipped by some screen readers, so only its text changes.
  return (
    <div ref={root} className="flex flex-col gap-6">
      <output className="sr-only">{loading ? t("loading") : ""}</output>
      {storageNotice ? <StorageNotice /> : null}
      {node}
    </div>
  );
}
