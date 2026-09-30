"use client";

// Client leaf: strings arrive as props from the server-rendered SourceBadge, so it needs no message provider; it renders nothing until mount because "today" is the visitor's clock.
import { Clock, ClockAlert } from "lucide-react";
import { useEffect, useState } from "react";

import type { IsoDate } from "@/data-schema/dates";
import type { FactMeta } from "@/data-schema/resolved";
import type { FactRef } from "@/domain/types";
import { todayIso } from "@/lib/clock";
import { freshnessOfFact } from "@/lib/journey/freshness";

export type FreshnessLabels = { aging: string; stale: string };

export function FreshnessMark({
  meta,
  labels,
}: {
  meta: FactMeta | FactRef;
  labels: FreshnessLabels;
}) {
  const [today, setToday] = useState<IsoDate | null>(null);
  useEffect(() => {
    setToday(todayIso());
  }, []);

  // Nothing before mount: the server cannot know the visitor's today, and a fresh fact shows nothing at all.
  if (today === null) return null;
  const freshness = freshnessOfFact(meta, today);
  if (freshness === "fresh") return null;

  if (freshness === "aging") {
    return (
      <span
        data-freshness="aging"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground"
      >
        <Clock aria-hidden="true" className="size-4 shrink-0 text-status-check" />
        {labels.aging}
      </span>
    );
  }
  return (
    <span
      data-freshness="stale"
      className="inline-flex items-center gap-1.5 rounded-full bg-status-check-bg px-2.5 py-0.5 text-sm font-medium text-status-check-fg"
    >
      <ClockAlert
        aria-hidden="true"
        data-testid="freshness-icon-stale"
        className="size-4 shrink-0"
      />
      {labels.stale}
    </span>
  );
}
