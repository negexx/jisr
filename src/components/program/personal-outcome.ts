// The student's result for one program, from the profile and a client snapshot bundle. PersonalMatch
// loads this module with import() once a profile exists, so visitors without one never download the
// matching code. Nothing here logs: an error could carry profile values.
import type { IsoDate } from "@/data-schema/dates";
import type { Profile } from "@/data-schema/profile";
import { estimateCost } from "@/domain/costs";
import { matchProgram } from "@/domain/match";
import { resolveRoute } from "@/domain/route";
import { scholarshipsForProgram } from "@/domain/scholarships";
import type { BudgetFit, MatchStatus } from "@/domain/types";
import type { AppLocale } from "@/i18n/routing";
import { groupOf, type MatchGroup, type RouteKey, routeKeyOf } from "@/lib/journey/matches-view";
import { describeReason, type ReasonView, ruleIndex } from "@/lib/journey/reasons";
import type { SnapshotBundle } from "@/lib/snapshot/client";

export type PersonalResult = {
  group: MatchGroup;
  status: MatchStatus;
  routeKey: RouteKey;
  reasons: ReasonView[];
  budgetFit: BudgetFit;
  scholarships: Array<{ slug: string; name: string }>;
};

// "compute_error": the published data could not be compared with the profile (a missing core, a
// throw in the domain); retrying the same data would fail the same way.
export type Outcome =
  | { kind: "result"; result: PersonalResult }
  | { kind: "missing" }
  | { kind: "compute_error" };

export function personalOutcome(
  profile: Profile,
  bundle: SnapshotBundle,
  slug: string,
  locale: AppLocale,
  now: IsoDate,
): Outcome {
  const program = bundle.programs.flatMap((shard) => shard.programs).find((p) => p.slug === slug);
  if (program === undefined) return { kind: "missing" };
  const core = bundle.core;
  if (core === undefined) return { kind: "compute_error" };
  try {
    const routes = bundle.routes?.routes ?? [];
    const match = matchProgram({ profile, program, routes, reference: core, now });
    const cost = estimateCost({
      program,
      costProfiles: bundle.costProfiles.flatMap((shard) => shard.profiles),
      budget: profile.budget,
      now,
    });
    const context = {
      locale,
      core,
      text: bundle.text,
      rules: ruleIndex(program, resolveRoute(profile, program.country, routes)),
    };
    const scholarships = scholarshipsForProgram(
      profile,
      program,
      bundle.scholarships.flatMap((shard) => shard.scholarships),
    );
    return {
      kind: "result",
      result: {
        group: groupOf(match),
        status: match.status,
        routeKey: routeKeyOf(match),
        reasons: match.reasons.map((reason) => describeReason(reason, context)),
        budgetFit: cost.budgetFit,
        scholarships: scholarships.map((s) => ({ slug: s.slug, name: s.name })),
      },
    };
  } catch {
    return { kind: "compute_error" };
  }
}
