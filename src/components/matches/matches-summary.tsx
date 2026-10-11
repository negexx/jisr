"use client";

import { StatusSummary } from "@/components/status-summary";

import { useMatchesCounts } from "./matches-counts";

// The band's at-a-glance count row. The matches island publishes the counts (one snapshot load on the
// page), so the band never triggers a second load; before the island computes them, and on a failing
// or empty view, the band renders nothing and the static HTML carries no count.
export function MatchesSummary() {
  const counts = useMatchesCounts();
  return counts === null ? null : <StatusSummary counts={counts} />;
}
