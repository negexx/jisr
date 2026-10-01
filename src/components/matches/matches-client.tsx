"use client";

import { ArrowDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import type { IsoDate } from "@/data-schema/dates";
import type { Profile } from "@/data-schema/profile";
import type { AppLocale } from "@/i18n/routing";
import { todayIso } from "@/lib/clock";
import { buildMatchesView, MATCH_GROUPS, type MatchesView } from "@/lib/journey/matches-view";
import { useProfile } from "@/lib/profile/use-profile";
import type { SnapshotBundle, SnapshotClient } from "@/lib/snapshot/client";
import { shardsForMatches } from "@/lib/snapshot/plan";
import { type SnapshotRequest, useSnapshotBundle } from "@/lib/snapshot/use-snapshot";

import { displayNumber } from "./display-number";
import { GroupSection, groupHeadingId } from "./group-section";
import { HiddenPrograms } from "./hidden-programs";
import { MatchesLayout } from "./matches-layout";
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

// The plan reads only the credential country and the fields, so the key changes with exactly those.
// It stays in memory: never sent, logged or put in a URL.
function planKey(profile: Profile): string {
  return JSON.stringify([profile.credential.country, [...profile.fields].sort()]);
}

function Loading() {
  return (
    <div aria-busy="true">
      <MatchesSkeleton />
    </div>
  );
}

// Real in-page anchors (the ids hold no profile value): a phone shows the four groups one scroll
// apart, so the counts double as the way to jump to one.
function CountsNav({ view, locale }: { view: OkView; locale: AppLocale }) {
  const t = useTranslations("matches.counts");
  const groups = MATCH_GROUPS.filter((group) => view.counts[group] > 0);
  if (groups.length === 0) return null;
  return (
    <nav aria-label={t("navLabel")}>
      <ul className="flex flex-wrap gap-2">
        {groups.map((group) => (
          <li key={group}>
            <a
              href={`#${groupHeadingId(group)}`}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-base font-medium text-primary hover:bg-muted"
            >
              <span className="underline underline-offset-4">
                {t(group, {
                  n: view.counts[group],
                  count: displayNumber(view.counts[group], locale),
                })}
              </span>
              <ArrowDown aria-hidden="true" className="size-4 shrink-0" />
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Results({ view, profile, locale }: { view: OkView; profile: Profile; locale: AppLocale }) {
  const t = useTranslations("matches.states.allHidden");
  const tPage = useTranslations("matches");
  const shown = MATCH_GROUPS.reduce((sum, group) => sum + view.counts[group], 0);
  const budgetProvided = profile.budget !== null;
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
        <>
          <p className="max-w-prose text-sm text-muted-foreground">{tPage("lead")}</p>
          <CountsNav view={view} locale={locale} />
        </>
      )}
      {MATCH_GROUPS.map((group) =>
        view.groups[group].length === 0 ? null : (
          <GroupSection
            key={group}
            group={group}
            cards={view.groups[group]}
            budgetProvided={budgetProvided}
            locale={locale}
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

  const request: SnapshotRequest | null =
    profile === null
      ? null
      : {
          key: planKey(profile),
          plan: (manifest) => shardsForMatches(profile, manifest),
        };
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
            <Results view={view} profile={profile} locale={locale} />
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
      {node}
    </>
  );
}
