"use client";

import { useEffect, useMemo, useState } from "react";

import { StatusSummary } from "@/components/status-summary";
import type { IsoDate } from "@/data-schema/dates";
import type { AppLocale } from "@/i18n/routing";
import { todayIso } from "@/lib/clock";
import { buildMatchesView } from "@/lib/journey/matches-view";
import { useProfile } from "@/lib/profile/use-profile";
import type { SnapshotClient } from "@/lib/snapshot/client";
import { useSnapshotBundle } from "@/lib/snapshot/use-snapshot";

import { matchesRequest } from "./matches-request";

type Counts = { ok: number; check: number; failed: number };

// The band's at-a-glance count row, computed from the same profile and snapshot the island reads.
// The foundation year folds into the amber "to check" count (the sections below keep it distinct);
// a failing, empty or not-yet-loaded view renders nothing, so the band never claims a count it
// cannot stand behind, and the server HTML carries no count at all.
// `client` is a test seam: production always uses the shared snapshot client.
export function MatchesSummary({ locale, client }: { locale: AppLocale; client?: SnapshotClient }) {
  const { state: profileState } = useProfile();
  const profile = profileState.status === "ok" ? profileState.profile : null;

  // The browser clock, read once after mount like the island's: the server render holds no date.
  const [now, setNow] = useState<IsoDate | null>(null);
  useEffect(() => {
    setNow(todayIso());
  }, []);

  const { state } = useSnapshotBundle(matchesRequest(profile), locale, client);

  const counts = useMemo<Counts | null>(() => {
    if (profile === null || now === null || state.status !== "ready") return null;
    try {
      const view = buildMatchesView({ profile, bundle: state.bundle, now, locale });
      if (view.kind !== "ok") return null;
      return {
        ok: view.counts.ok,
        check: view.counts.check + view.counts.foundation,
        failed: view.counts.failed,
      };
    } catch {
      // A broken snapshot is the island's error state to show, never a count in the band.
      return null;
    }
  }, [profile, now, state, locale]);

  if (counts === null) return null;
  return <StatusSummary counts={counts} />;
}
