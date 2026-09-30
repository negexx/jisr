import { compareIso, type IsoDate } from "@/data-schema/dates";
import type { Profile } from "@/data-schema/profile";
import type { Tuition } from "@/data-schema/records/program";
import type { ApplicationChannel, Program, ResolvedFact } from "@/data-schema/resolved";
import type { CoreShard } from "@/data-schema/snapshot";
import { estimateCost } from "@/domain/costs";
import { toFactRef } from "@/domain/facts";
import { filterPrograms, type PreferenceMismatch } from "@/domain/filter";
import { nextIntake } from "@/domain/intakes";
import { matchProgram } from "@/domain/match";
import { resolveRoute } from "@/domain/route";
import type { CostEstimate, FactRef, IntakeStatus, MatchResult, Reason } from "@/domain/types";
import type { AppLocale } from "@/i18n/routing";
import type { SnapshotBundle } from "@/lib/snapshot/client";
import type { DataText } from "@/lib/snapshot/text";

import { describeReason, type ReasonView, ruleIndex } from "./reasons";

// The only place a match status meets a page group. Status to icon and colour is MatchStatusBadge's.
export const MATCH_GROUPS = ["ok", "check", "foundation", "failed"] as const;
export type MatchGroup = (typeof MATCH_GROUPS)[number];

export type MatchCardModel = {
  slug: string;
  name: string; // official, untranslated
  institutionName: string;
  cityName: string;
  level: Program["level"];
  teachingLanguages: ResolvedFact<string[]>;
  tuition: ResolvedFact<Tuition>;
  cost: CostEstimate;
  intake: IntakeStatus;
  match: MatchResult;
  group: MatchGroup;
  topReasons: ReasonView[];
  applicationChannel: Pick<ApplicationChannel, "name" | "kind" | "accountRequired"> | null;
  summaryText: DataText | null;
  factRefs: FactRef[];
};

// Hidden programs are not matched: the page lists them with their mismatches only.
export type HiddenProgram = { slug: string; name: string; mismatches: PreferenceMismatch[] };

export type MatchesView =
  | { kind: "no_programs" }
  | {
      kind: "ok";
      groups: Record<MatchGroup, MatchCardModel[]>;
      counts: Record<MatchGroup, number>;
      hidden: HiddenProgram[];
      hiddenByMismatch: Record<PreferenceMismatch, number>;
      hiddenCount: number;
      totalPrograms: number;
    };

export type MatchesViewInput = {
  profile: Profile;
  bundle: SnapshotBundle;
  now: IsoDate;
  locale: AppLocale;
};

export function groupOf(match: Pick<MatchResult, "status" | "route">): MatchGroup {
  if (match.status === "satisfied") return "ok";
  // Foundation results have status "check", so this must come before the check group.
  if (match.route === "foundation") return "foundation";
  switch (match.status) {
    case "check":
      return "check";
    case "not_satisfied":
      return "failed";
    default: {
      const unreachable: never = match.status;
      return unreachable;
    }
  }
}

const OUTCOME_RANK: Record<Reason["outcome"], number> = { fail: 0, unknown: 1, pass: 2 };

export function topReasons(match: MatchResult, max = 3): Reason[] {
  const pinned =
    match.route === "foundation" ? match.reasons.find((r) => r.kind === "route") : undefined;
  const rest = match.reasons
    .filter((r) => r !== pinned)
    .map((reason, index) => ({ reason, index }))
    .sort(
      (a, b) =>
        OUTCOME_RANK[a.reason.outcome] - OUTCOME_RANK[b.reason.outcome] || a.index - b.index,
    )
    .map(({ reason }) => reason);
  if (pinned === undefined) return rest.slice(0, Math.max(0, max));
  return [pinned, ...rest.slice(0, Math.max(0, max - 1))];
}

function emptyGroups<T>(value: () => T): Record<MatchGroup, T> {
  return { ok: value(), check: value(), foundation: value(), failed: value() };
}

function upcomingDeadline(intake: IntakeStatus): IsoDate | null {
  return intake.kind === "upcoming" ? intake.intake.applicationDeadline : null;
}

// Next upcoming deadline first; unknown and closed (no upcoming date) after; ties by slug.
function compareCards(a: MatchCardModel, b: MatchCardModel): number {
  const da = upcomingDeadline(a.intake);
  const db = upcomingDeadline(b.intake);
  if (da !== null && db !== null) {
    const byDate = compareIso(da, db);
    if (byDate !== 0) return byDate;
  } else if (da !== null) {
    return -1;
  } else if (db !== null) {
    return 1;
  }
  return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
}

function factId(fact: FactRef): string {
  return `${fact.record}#${fact.path}`;
}

function uniqueFacts(facts: ReadonlyArray<FactRef | null>): FactRef[] {
  const seen = new Set<string>();
  const unique: FactRef[] = [];
  for (const fact of facts) {
    if (fact === null || seen.has(factId(fact))) continue;
    seen.add(factId(fact));
    unique.push(fact);
  }
  return unique;
}

type CardInput = MatchesViewInput & { core: CoreShard; program: Program };

function cardFor(input: CardInput): MatchCardModel {
  const { profile, bundle, now, locale, core, program } = input;
  const routes = bundle.routes?.routes ?? [];
  const match = matchProgram({ profile, program, routes, reference: core, now });
  const cost = estimateCost({
    program,
    costProfiles: bundle.costProfiles.flatMap((shard) => shard.profiles),
    budget: profile.budget,
    now,
  });
  const intake = nextIntake(program, now);
  const reasonContext = {
    locale,
    core,
    text: bundle.text,
    rules: ruleIndex(program, resolveRoute(profile, program.country, routes)),
  };
  const reasons = topReasons(match).map((reason) => describeReason(reason, reasonContext));

  // A missing institution is a data-quality gap, not an error: the card shows the slugs.
  const institution =
    bundle.institutions
      .flatMap((shard) => shard.institutions)
      .find((i) => i.slug === program.institution) ?? null;
  const channelSlug = program.applicationChannel.value;
  const channel = core.applicationChannels.find((c) => c.slug === channelSlug) ?? null;
  const record = `programs/${program.slug}`;

  return {
    slug: program.slug,
    name: program.name,
    institutionName: institution?.name ?? program.institution,
    cityName: institution?.city.name ?? program.city,
    level: program.level,
    teachingLanguages: program.teachingLanguages,
    tuition: program.tuition,
    cost,
    intake,
    match,
    group: groupOf(match),
    topReasons: reasons,
    applicationChannel:
      channel === null
        ? null
        : { name: channel.name, kind: channel.kind, accountRequired: channel.accountRequired },
    summaryText: bundle.text(program.summary) ?? null,
    factRefs: uniqueFacts([
      institution === null
        ? null
        : toFactRef(`institutions/${institution.slug}`, "", institution.fact, now),
      toFactRef(record, "teachingLanguages", program.teachingLanguages, now),
      intake.fact,
      ...cost.lines.map((line) => line.fact),
      toFactRef(record, "applicationChannel", program.applicationChannel, now),
      channel === null
        ? null
        : toFactRef(`application-channels/${channel.slug}`, "", channel.fact, now),
      ...reasons.flatMap((reason) => reason.facts),
    ]),
  };
}

export function buildMatchesView(input: MatchesViewInput): MatchesView {
  const { profile, bundle, now } = input;
  if (!bundle.hasPrograms) return { kind: "no_programs" };
  const core = bundle.core;
  if (core === undefined) {
    throw new Error("buildMatchesView: the bundle has programs but no core shard");
  }

  const programs = bundle.programs.flatMap((shard) => shard.programs);
  const { kept, excluded } = filterPrograms(profile, programs, now);

  const groups = emptyGroups<MatchCardModel[]>(() => []);
  for (const program of kept) {
    const card = cardFor({ ...input, core, program });
    groups[card.group].push(card);
  }
  for (const group of MATCH_GROUPS) groups[group].sort(compareCards);

  const names = new Map(programs.map((p) => [p.slug, p.name]));
  const hidden: HiddenProgram[] = excluded.map(({ programSlug, mismatches }) => ({
    slug: programSlug,
    name: names.get(programSlug) ?? programSlug,
    mismatches,
  }));
  const hiddenByMismatch: Record<PreferenceMismatch, number> = {
    destination: 0,
    field: 0,
    institution_type: 0,
    study_language: 0,
  };
  for (const program of hidden) {
    for (const mismatch of new Set(program.mismatches)) hiddenByMismatch[mismatch] += 1;
  }

  return {
    kind: "ok",
    groups,
    counts: {
      ok: groups.ok.length,
      check: groups.check.length,
      foundation: groups.foundation.length,
      failed: groups.failed.length,
    },
    hidden,
    hiddenByMismatch,
    hiddenCount: hidden.length,
    totalPrograms: programs.length,
  };
}
