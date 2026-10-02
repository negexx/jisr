"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { displayNumber } from "@/components/matches/display-number";
import type { IsoDate } from "@/data-schema/dates";
import type { AppLocale } from "@/i18n/routing";
import { todayIso } from "@/lib/clock";
import { MAX_COMPARE, MIN_COMPARE } from "@/lib/constants";
import {
  effectiveSelection,
  selectionBlock,
  toggleSelection,
} from "@/lib/journey/compare-selection";
import type { CompareView } from "@/lib/journey/compare-view";
import { useProfile } from "@/lib/profile/use-profile";
import { useSaved } from "@/lib/saved/use-saved";
import type { SnapshotClient } from "@/lib/snapshot/client";
import { shardsForPlan } from "@/lib/snapshot/plan";
import { type SnapshotRequest, useSnapshotBundle } from "@/lib/snapshot/use-snapshot";
import { CompareGrid, DifferencesSwitch } from "./compare-grid";
import { ComparePicker } from "./compare-picker";
import {
  CompareSkeleton,
  ErrorState,
  NoProfileState,
  NoSavedState,
  NotEnoughState,
  ResetNotice,
  StorageNotice,
} from "./compare-states";
import { pickerItems } from "./picker-items";

// The view model is loaded on demand: it carries the matching, cost and reason code, which only a
// student with two saved programs ever needs.
type CompareModule = typeof import("@/lib/journey/compare-view");

type Computed = { kind: "view"; view: CompareView } | { kind: "error" };

// The comparison reads the credential country and the shards of EVERY saved program (the same plan
// as My plan, so the shared snapshot client reuses what is cached), so the key changes with exactly
// those and never with the selection. It stays in memory: never sent, logged or put in a URL.
function compareKey(country: string, items: ReadonlyArray<{ country: string; field: string }>) {
  const shards = [...new Set(items.map((item) => `${item.country}.${item.field}`))].sort();
  return `compare:${country}:${shards.join(",")}`;
}

// `client` is a test seam: production always uses the shared snapshot client.
export function CompareClient({ locale, client }: { locale: AppLocale; client?: SnapshotClient }) {
  const t = useTranslations("compare");
  const { state: profileState, dismissReset } = useProfile();
  const saved = useSaved();
  const profile = profileState.status === "ok" ? profileState.profile : null;
  const items = saved.items;
  const wanted = profile !== null && saved.hydrated && items.length >= MIN_COMPARE;

  // The browser clock, read once after mount: the server render and the first client render hold
  // no date, so nothing clock-dependent can differ between them.
  const [now, setNow] = useState<IsoDate | null>(null);
  useEffect(() => {
    setNow(todayIso());
  }, []);

  const request: SnapshotRequest | null =
    wanted && profile !== null
      ? {
          key: compareKey(profile.credential.country, items),
          plan: (manifest) => shardsForPlan(items, profile.credential.country, manifest),
        }
      : null;
  const { state: snapshot, retry } = useSnapshotBundle(request, locale, client);
  const bundle = snapshot.status === "ready" ? snapshot.bundle : null;

  const [compareModule, setCompareModule] = useState<CompareModule | "failed" | null>(null);
  const [attempt, setAttempt] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` only re-runs the import after a failed one
  useEffect(() => {
    if (!wanted) return;
    let current = true;
    import("@/lib/journey/compare-view").then(
      (module) => {
        if (current) setCompareModule(module);
      },
      () => {
        if (current) setCompareModule("failed");
      },
    );
    return () => {
      current = false;
    };
  }, [wanted, attempt]);

  // Saved programs that the loaded shards contain, in saved order: only these can be compared.
  const available = useMemo(() => {
    if (bundle === null) return [];
    const known = new Set(bundle.programs.flatMap((shard) => shard.programs.map((p) => p.slug)));
    return items.map((item) => item.slug).filter((slug) => known.has(slug));
  }, [bundle, items]);
  const rows = useMemo(
    () =>
      bundle === null
        ? []
        : pickerItems(
            bundle,
            items.map((item) => item.slug),
          ),
    [bundle, items],
  );

  // `null` is the default selection (the first MAX_COMPARE); the student's own choice replaces it.
  // React state only: nothing about the selection is stored, sent or put in a URL.
  const [picked, setPicked] = useState<string[] | null>(null);
  const selected = useMemo(() => effectiveSelection(available, picked), [available, picked]);
  const [onlyDifferences, setOnlyDifferences] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  function toggle(slug: string) {
    const block = selectionBlock(selected, slug);
    if (block !== null) {
      setAnnouncement(
        block === "max"
          ? t("picker.limit", { max: displayNumber(MAX_COMPARE, locale) })
          : t("picker.minimum", { min: displayNumber(MIN_COMPARE, locale) }),
      );
      return;
    }
    const next = toggleSelection(selected, slug, available);
    setPicked(next);
    setAnnouncement(t("picker.announce", { n: displayNumber(next.length, locale) }));
  }

  // Derived, never stored: a result can only be shown for exactly this profile, bundle and selection.
  const computed = useMemo<Computed | null>(() => {
    if (
      profile === null ||
      bundle === null ||
      now === null ||
      compareModule === null ||
      compareModule === "failed" ||
      selected.length < MIN_COMPARE
    ) {
      return null;
    }
    try {
      return {
        kind: "view",
        view: compareModule.buildCompareView({ profile, bundle, slugs: selected, now, locale }),
      };
    } catch {
      // A programmer error must not crash the page, and its message must not reach the student.
      return { kind: "error" };
    }
  }, [profile, bundle, now, compareModule, selected, locale]);

  function retryAll() {
    setCompareModule(null);
    setAttempt((n) => n + 1);
    retry();
  }

  function body(): { loading: boolean; node: ReactNode } {
    const hydrated = profileState.status !== "unhydrated" && saved.hydrated;
    if (!hydrated) return { loading: true, node: <CompareSkeleton /> };
    // Zero saved programs and one are the same state.
    if (items.length < MIN_COMPARE) return { loading: false, node: <NoSavedState /> };
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
    if (snapshot.status === "error" || compareModule === "failed") {
      return { loading: false, node: <ErrorState onRetry={retryAll} /> };
    }
    if (computed?.kind === "error") return { loading: false, node: <ErrorState /> };
    if (bundle !== null && available.length < MIN_COMPARE) {
      return {
        loading: false,
        node: (
          <>
            <NotEnoughState />
            <ComparePicker items={rows} selected={selected} onToggle={toggle} idle />
          </>
        ),
      };
    }
    if (computed === null || profile === null) return { loading: true, node: <CompareSkeleton /> };

    return {
      loading: false,
      node: (
        <>
          <p className="max-w-prose text-base text-muted-foreground">{t("lead")}</p>
          <ComparePicker items={rows} selected={selected} onToggle={toggle} />
          <DifferencesSwitch checked={onlyDifferences} onChange={setOnlyDifferences} />
          <CompareGrid
            view={computed.view}
            onlyDifferences={onlyDifferences}
            budgetProvided={profile.budget !== null}
          />
        </>
      ),
    };
  }

  const { loading, node } = body();
  const storageNotice = saved.hydrated && !saved.storageAvailable;
  // One polite status region for the whole life of the island: a region inserted together with its
  // text is skipped by some screen readers, so only its text changes.
  return (
    <div className="flex flex-col gap-6">
      <output className="sr-only">{loading ? t("loading") : announcement}</output>
      {storageNotice ? <StorageNotice /> : null}
      {node}
    </div>
  );
}
