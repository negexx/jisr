"use client";

// Client leaf: the page is built once, so only the visitor's clock can say whether its facts have aged. Strings arrive as props; nothing renders on the server or before mount.
import { Clock, ClockAlert } from "lucide-react";
import { useEffect, useState } from "react";

import type { IsoDate } from "@/data-schema/dates";
import type { FactMeta } from "@/data-schema/resolved";
import { todayIso } from "@/lib/clock";
import { worstFreshness } from "@/lib/journey/freshness";

export type PageFreshnessLabels = { aging: string; stale: string; check: string };

export function PageFreshnessBanner({
  facts,
  labels,
}: {
  facts: readonly FactMeta[];
  labels: PageFreshnessLabels;
}) {
  const [today, setToday] = useState<IsoDate | null>(null);
  useEffect(() => {
    setToday(todayIso());
  }, []);

  if (today === null) return null;
  const worst = worstFreshness(facts, today);
  if (worst === "fresh") return null;

  const Icon = worst === "stale" ? ClockAlert : Clock;
  return (
    <div
      role="status"
      data-freshness={worst}
      className="flex items-start gap-3 rounded-lg border border-status-check-border bg-status-check-bg px-4 py-3 text-status-check-fg"
    >
      <Icon aria-hidden="true" className="mt-[0.2rem] size-5 shrink-0 text-status-check" />
      <p className="max-w-prose text-base">
        <span className="font-medium">{worst === "stale" ? labels.stale : labels.aging}</span>{" "}
        {labels.check}
      </p>
    </div>
  );
}
