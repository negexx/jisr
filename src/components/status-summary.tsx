import { MatchStatusBadge } from "@/components/match-status-badge";

// Groups in display order. `foundation` is not part of this interface: the caller folds it into
// `check` (both render as the amber "to check" status elsewhere), so the summary never invents a
// second mapping.
const GROUPS = ["ok", "check", "failed"] as const;

type StatusCounts = { ok: number; check: number; failed: number };

// Presentational server component. The status wording, icon and colour come from MatchStatusBadge
// (the One Mapping Rule); the count is visible Latin digits isolated in a <bdi> for Arabic.
export function StatusSummary({ counts }: { counts: StatusCounts }) {
  if (counts.ok + counts.check + counts.failed === 0) return null;
  return (
    <ul data-slot="status-summary" className="flex flex-wrap items-center gap-2">
      {GROUPS.map((group) =>
        counts[group] === 0 ? null : (
          <li
            key={group}
            data-slot="status-summary-chip"
            className="inline-flex items-center gap-2"
          >
            <MatchStatusBadge group={group} size="sm" />
            <bdi className="text-sm font-medium text-foreground tabular-nums">{counts[group]}</bdi>
          </li>
        ),
      )}
    </ul>
  );
}
