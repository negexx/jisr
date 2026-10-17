"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ReportSnapshot } from "@/components/report-outdated/report-context";
import type { IsoDate } from "@/data-schema/dates";
import type { MatchFilters } from "@/data-schema/match-filters";
import type { CoreShard } from "@/data-schema/snapshot";
import type { AppLocale } from "@/i18n/routing";
import { track } from "@/lib/analytics";
import { todayIso } from "@/lib/clock";
import { buildMatchesView, MATCH_GROUPS, type MatchesView } from "@/lib/journey/matches-view";
import { getLocalStorage } from "@/lib/local-storage";
import { readMatchFilters, writeMatchFilters } from "@/lib/matches/filter-store";
import {
  decodeFilters,
  dropUnknownFilters,
  filtersSearch,
  hasMatchFilterParams,
} from "@/lib/matches/filter-url";
import { EMPTY_MATCH_FILTERS } from "@/lib/matches/filters";
import { useProfile } from "@/lib/profile/use-profile";
import type { SnapshotBundle, SnapshotClient } from "@/lib/snapshot/client";
import type { TextLookup } from "@/lib/snapshot/text";
import { useSnapshotBundle } from "@/lib/snapshot/use-snapshot";

import { CompareLink } from "./compare-link";
import { displayNumber } from "./display-number";
import { FilterPanel } from "./filter-panel";
import { FilterSummary } from "./filter-summary";
import { GroupSection } from "./group-section";
import { HiddenPrograms } from "./hidden-programs";
import { foldMatchesCounts, publishMatchesCounts } from "./matches-counts";
import { MatchesLayout } from "./matches-layout";
import { matchesRequest } from "./matches-request";
import { MatchesSkeleton } from "./matches-skeleton";
import {
  ErrorState,
  NoMatchesState,
  NoProfileState,
  NoProgramsState,
  ResetNotice,
} from "./matches-states";

type OkView = Extract<MatchesView, { kind: "ok" }>;

type Outcome =
  | { status: "pending" }
  | { status: "failed" }
  | { status: "view"; view: MatchesView; bundle: SnapshotBundle };

function Loading() {
  return (
    <div aria-busy="true">
      <MatchesSkeleton />
    </div>
  );
}

function Results({
  view,
  filters,
  core,
  text,
  locale,
  aliases,
  onFiltersChange,
}: {
  view: OkView;
  filters: MatchFilters;
  core: CoreShard;
  text: TextLookup;
  locale: AppLocale;
  aliases: SnapshotBundle["aliases"];
  onFiltersChange: (filters: MatchFilters) => void;
}) {
  const t = useTranslations("matches.states.noMatches");
  const shown = MATCH_GROUPS.reduce((sum, group) => sum + view.counts[group], 0);
  useEffect(() => {
    track("matches-viewed");
  }, []);
  return (
    <>
      <FilterPanel
        filters={filters}
        onFiltersChange={onFiltersChange}
        core={core}
        text={text}
        locale={locale}
        defaultOpen={shown === 0}
      />
      {shown === 0 ? (
        <NoMatchesState
          title={t("title", {
            n: view.totalPrograms,
            count: displayNumber(view.totalPrograms, locale),
          })}
          onClear={() => onFiltersChange(EMPTY_MATCH_FILTERS)}
        />
      ) : (
        <CompareLink locale={locale} />
      )}
      {MATCH_GROUPS.map((group) =>
        view.groups[group].length === 0 ? null : (
          <GroupSection
            key={group}
            group={group}
            cards={view.groups[group]}
            budgetProvided={filters.budget !== null}
            locale={locale}
            aliases={aliases}
          />
        ),
      )}
      {view.hiddenCount === 0 ? null : (
        <HiddenPrograms view={view} locale={locale} defaultOpen={shown === 0} />
      )}
    </>
  );
}

// `client` is a test seam: production always uses the shared snapshot client.
export function MatchesClient({ locale, client }: { locale: AppLocale; client?: SnapshotClient }) {
  const t = useTranslations("matches");
  const { state: profileState, dismissReset } = useProfile();
  const profile = profileState.status === "ok" ? profileState.profile : null;
  const searchParams = useSearchParams();

  // The browser clock, read once after mount: the server render and the first client render hold
  // no date, so nothing clock-dependent can differ between them.
  const [now, setNow] = useState<IsoDate | null>(null);
  useEffect(() => {
    setNow(todayIso());
  }, []);

  // The filters are seeded exactly once, after mount: a URL that carries filter parameters is a
  // shared or bookmarked view and wins; without them the device's last choice applies. Neither is
  // read during render, so the server HTML and the first client render stay identical.
  const [filters, setFilters] = useState<MatchFilters>(EMPTY_MATCH_FILTERS);
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    const params = searchParams ?? new URLSearchParams(window.location.search);
    if (hasMatchFilterParams(params)) {
      setFilters(decodeFilters(params));
      return;
    }
    const storage = getLocalStorage();
    if (storage !== null) setFilters(readMatchFilters(storage));
  }, [searchParams]);

  // A choice is written to both places it lives, the device store and the URL, so a reload and a
  // shared link show the same view.
  const changeFilters = useCallback((next: MatchFilters): void => {
    setFilters(next);
    const storage = getLocalStorage();
    if (storage !== null) writeMatchFilters(storage, next);
    const search = filtersSearch(next);
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${search}${window.location.hash}`,
    );
  }, []);

  const request = matchesRequest(profile);
  const { state, retry } = useSnapshotBundle(request, locale, client);

  const outcome = useMemo<Outcome>(() => {
    if (profile === null || now === null || state.status === "idle" || state.status === "loading") {
      return { status: "pending" };
    }
    if (state.status === "error") return { status: "failed" };
    try {
      const view = buildMatchesView({ profile, filters, bundle: state.bundle, now, locale });
      return { status: "view", view, bundle: state.bundle };
    } catch {
      // A programmer error (e.g. a snapshot without its core shard) must not crash the page, and
      // its message must not reach the student.
      return { status: "failed" };
    }
  }, [profile, filters, now, state, locale]);

  // A URL or a stored choice can name a field, country or language the catalogue no longer knows,
  // and a filter on it would hide every program. Once the bundle is loaded, drop those values and
  // mirror the sanitized choice in the store and the URL.
  const catalogueChecked = useRef(false);
  useEffect(() => {
    if (catalogueChecked.current || outcome.status !== "view") return;
    const core = outcome.bundle.core;
    if (core === undefined) return;
    catalogueChecked.current = true;
    const known = dropUnknownFilters(filters, core);
    if (known !== filters) changeFilters(known);
  }, [filters, outcome, changeFilters]);

  // The band's summary (a sibling island) reads these through the store: one snapshot load for the
  // whole page, so a shard-404 recovery re-reads the manifest once, not once per island.
  const counts = useMemo(
    () =>
      outcome.status === "view" && outcome.view.kind === "ok"
        ? foldMatchesCounts(outcome.view.counts)
        : null,
    [outcome],
  );
  useEffect(() => {
    publishMatchesCounts(counts);
    return () => publishMatchesCounts(null);
  }, [counts]);

  function body(): { loading: boolean; node: ReactNode } {
    if (profileState.status === "unhydrated") return { loading: true, node: <Loading /> };
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
    if (outcome.status === "failed")
      return { loading: false, node: <ErrorState onRetry={retry} /> };
    if (outcome.status === "pending" || profile === null) {
      return { loading: true, node: <Loading /> };
    }

    const { view, bundle } = outcome;
    if (view.kind === "no_programs") return { loading: false, node: <NoProgramsState /> };
    const core = bundle.core;
    if (core === undefined) return { loading: false, node: <ErrorState onRetry={retry} /> };
    return {
      loading: false,
      node: (
        <MatchesLayout
          aside={
            <FilterSummary
              filters={filters}
              onClear={() => changeFilters(EMPTY_MATCH_FILTERS)}
              core={core}
              text={bundle.text}
              locale={locale}
            />
          }
        >
          <Results
            view={view}
            filters={filters}
            core={core}
            text={bundle.text}
            locale={locale}
            aliases={bundle.aliases}
            onFiltersChange={changeFilters}
          />
        </MatchesLayout>
      ),
    };
  }

  const { loading, node } = body();
  // One polite status region for the whole life of the island: a region inserted together with its
  // text is skipped by some screen readers, so only its text changes.
  return (
    <>
      <output className="sr-only">{loading ? t("loading") : ""}</output>
      <ReportSnapshot version={state.status === "ready" ? state.bundle.snapshotVersion : null}>
        {node}
      </ReportSnapshot>
    </>
  );
}
