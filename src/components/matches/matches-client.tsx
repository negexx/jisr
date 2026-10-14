"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { ReportSnapshot } from "@/components/report-outdated/report-context";
import type { IsoDate } from "@/data-schema/dates";
import type { Profile } from "@/data-schema/profile";
import type { AppLocale } from "@/i18n/routing";
import { track } from "@/lib/analytics";
import { todayIso } from "@/lib/clock";
import { buildMatchesView, MATCH_GROUPS, type MatchesView } from "@/lib/journey/matches-view";
import { useProfile } from "@/lib/profile/use-profile";
import type { SnapshotBundle, SnapshotClient } from "@/lib/snapshot/client";
import { useSnapshotBundle } from "@/lib/snapshot/use-snapshot";

import { CompareLink } from "./compare-link";
import { displayNumber } from "./display-number";
import { GroupSection } from "./group-section";
import { HiddenPrograms } from "./hidden-programs";
import { foldMatchesCounts, publishMatchesCounts } from "./matches-counts";
import { MatchesLayout } from "./matches-layout";
import { matchesRequest } from "./matches-request";
import { MatchesSkeleton } from "./matches-skeleton";
import {
  AllHiddenState,
  ErrorState,
  NoProfileState,
  NoProgramsForFieldsState,
  NoProgramsState,
  ResetNotice,
} from "./matches-states";
import { ProfileSummary } from "./profile-summary";

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
  profile,
  locale,
  aliases,
}: {
  view: OkView;
  profile: Profile;
  locale: AppLocale;
  aliases: SnapshotBundle["aliases"];
}) {
  const t = useTranslations("matches.states.allHidden");
  const shown = MATCH_GROUPS.reduce((sum, group) => sum + view.counts[group], 0);
  const budgetProvided = profile.budget !== null;
  useEffect(() => {
    track("matches-viewed");
  }, []);
  return (
    <>
      {shown === 0 ? (
        <AllHiddenState
          title={t("title", {
            n: view.totalPrograms,
            count: displayNumber(view.totalPrograms, locale),
          })}
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
            budgetProvided={budgetProvided}
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

  // The browser clock, read once after mount: the server render and the first client render hold
  // no date, so nothing clock-dependent can differ between them.
  const [now, setNow] = useState<IsoDate | null>(null);
  useEffect(() => {
    setNow(todayIso());
  }, []);

  const request = matchesRequest(profile);
  const { state, retry } = useSnapshotBundle(request, locale, client);

  const outcome = useMemo<Outcome>(() => {
    if (profile === null || now === null || state.status === "idle" || state.status === "loading") {
      return { status: "pending" };
    }
    if (state.status === "error") return { status: "failed" };
    try {
      const view = buildMatchesView({ profile, bundle: state.bundle, now, locale });
      return { status: "view", view, bundle: state.bundle };
    } catch {
      // A programmer error (e.g. a snapshot without its core shard) must not crash the page, and
      // its message must not reach the student.
      return { status: "failed" };
    }
  }, [profile, now, state, locale]);

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
    const { core } = bundle;
    // `no_programs_for_fields` and `ok` need the core shard, which buildMatchesView already required.
    const summary =
      core === undefined ? null : (
        <ProfileSummary profile={profile} core={core} text={bundle.text} locale={locale} />
      );
    return {
      loading: false,
      node: (
        <MatchesLayout aside={summary}>
          {view.kind === "no_programs_for_fields" ? (
            <NoProgramsForFieldsState />
          ) : (
            <Results view={view} profile={profile} locale={locale} aliases={bundle.aliases} />
          )}
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
