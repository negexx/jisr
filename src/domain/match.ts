import type { IsoDate } from "@/data-schema/dates";
import type { Profile } from "@/data-schema/profile";
import type { AdmissionRoute, Program } from "@/data-schema/resolved";
import type { CoreShard } from "@/data-schema/snapshot";
import { downgrade, isDecisive, toFactRef } from "./facts";
import { resolveRoute } from "./route";
import { evaluateRules } from "./rules";
import type { FactRef, MatchResult, MatchStatus, Reason } from "./types";

export type MatchReference = Pick<
  CoreShard,
  "credentialTypes" | "gradingScales" | "gradeConversions"
>;

export type MatchInput = {
  profile: Profile;
  program: Program;
  routes: readonly AdmissionRoute[];
  reference: MatchReference;
  now: IsoDate;
};

export function aggregateMatchStatus(reasons: readonly Reason[]): MatchStatus {
  if (reasons.some((r) => r.outcome === "fail")) return "not_satisfied";
  if (reasons.length === 0 || reasons.some((r) => r.outcome === "unknown")) return "check";
  return "satisfied";
}

function routeReason(route: AdmissionRoute | null, now: IsoDate): Reason {
  if (!route) {
    return { ruleId: "route", kind: "route", outcome: "unknown", code: "route_check", facts: [] };
  }
  const ref = toFactRef(`admission-routes/${route.slug}`, "", route.fact, now);
  const base = { ruleId: "route", kind: "route", facts: [ref] } satisfies Pick<
    Reason,
    "ruleId" | "kind" | "facts"
  >;
  const reason: Reason = (() => {
    switch (route.outcome) {
      case "check":
        return { ...base, outcome: "unknown", code: "route_check" };
      case "foundation":
        return { ...base, outcome: "unknown", code: "route_foundation" };
      case "not_eligible":
        return { ...base, ...downgrade("fail", "route_not_eligible", [ref]) };
      case "direct":
        return { ...base, ...downgrade("pass", "ok", [ref]) };
      default: {
        const unreachable: never = route.outcome;
        return unreachable;
      }
    }
  })();
  if (route.note != null) reason.note = route.note;
  return reason;
}

function coverageReason(program: Program, now: IsoDate): Reason | null {
  const { coverage, fact } = program.requirements;
  // `complete` with zero published rules never proves anything was evaluated (ADR 0005 item 10),
  // so the vacuous case is unknown, never satisfied: fail closed at the domain boundary.
  const vacuous = coverage === "complete" && program.requirements.rules.length === 0;
  if (coverage === "complete" && !vacuous && isDecisive(fact, now)) return null;
  const ref: FactRef = toFactRef(`programs/${program.slug}`, "requirements", fact, now);
  const code =
    coverage === "partial" || (vacuous && isDecisive(fact, now))
      ? "coverage_partial"
      : ref.freshness === "stale"
        ? "stale_source"
        : "non_official_source";
  return { ruleId: "coverage", kind: "coverage", outcome: "unknown", code, facts: [ref] };
}

export function matchProgram(input: MatchInput): MatchResult {
  const { profile, program, routes, reference, now } = input;
  const route = resolveRoute(profile, program.country, routes);
  const first = routeReason(route, now);
  const result = (reasons: Reason[]): MatchResult => ({
    programSlug: program.slug,
    status: aggregateMatchStatus(reasons),
    route: route?.outcome ?? "missing",
    reasons,
  });

  if (route && (route.outcome === "foundation" || route.outcome === "not_eligible")) {
    return result([first]);
  }

  const reasons: Reason[] = [first];
  if (route) {
    const conditions = evaluateRules(route.conditions, {
      ...reference,
      profile,
      record: `admission-routes/${route.slug}`,
      pathPrefix: "conditions",
      now,
    });
    for (const c of conditions) reasons.push({ ...c, ruleId: `route:${c.ruleId}` });
  }
  reasons.push(
    ...evaluateRules(program.requirements.rules, {
      ...reference,
      profile,
      record: `programs/${program.slug}`,
      pathPrefix: "requirements.rules",
      now,
    }),
  );
  const coverage = coverageReason(program, now);
  if (coverage) reasons.push(coverage);
  return result(reasons);
}
