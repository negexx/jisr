import type { IsoDate } from "@/data-schema/dates";
import type { Profile } from "@/data-schema/profile";
import type { Program } from "@/data-schema/resolved";
import { generateChecklist } from "@/domain/checklist";
import { nextIntake } from "@/domain/intakes";
import { matchProgram } from "@/domain/match";
import { scholarshipsForProgram } from "@/domain/scholarships";
import type { ChecklistReasonCode, ChecklistStepId, FactRef, IntakeStatus } from "@/domain/types";
import type { SnapshotBundle } from "@/lib/snapshot/client";
import { resolveProgramSlug } from "@/lib/snapshot/resolve-program-slug";
import type { DataText } from "@/lib/snapshot/text";

import { groupOf, type MatchGroup, uniqueFacts } from "./matches-view";

export type PlanChannel = { name: string; url: string; accountRequired: boolean | null };
export type PlanDocument = {
  slug: string;
  name: DataText | null;
  translationRequired: boolean | null;
};
export type PlanStep = {
  id: ChecklistStepId;
  status: "todo" | "skipped";
  reason: ChecklistReasonCode;
  facts: FactRef[];
  deadline: IsoDate | null;
  channel: PlanChannel | null;
  scholarships: Array<{ slug: string; name: string }>;
};
export type PlanProgram = {
  kind: "program";
  slug: string;
  name: string;
  institutionName: string;
  cityName: string;
  group: MatchGroup;
  intake: IntakeStatus;
  documents: PlanDocument[] | null;
  documentsMeta: Program["documents"];
  steps: PlanStep[];
};
export type PlanMissing = { kind: "missing"; slug: string };
export type PlanView = { entries: Array<PlanProgram | PlanMissing> };

export type PlanInput = {
  profile: Profile;
  bundle: SnapshotBundle;
  saved: ReadonlyArray<{ slug: string }>;
  now: IsoDate;
};

// Pure: the same inputs as the program page's personal result, run for each saved program. Nothing
// here logs, because an error could carry profile values.
export function buildPlanView({ profile, bundle, saved, now }: PlanInput): PlanView {
  const core = bundle.core;
  if (core === undefined) throw new Error("buildPlanView: the bundle has no core shard");
  const programs = bundle.programs.flatMap((shard) => shard.programs);
  const routes = bundle.routes?.routes ?? [];
  const institutions = bundle.institutions.flatMap((shard) => shard.institutions);
  const allScholarships = bundle.scholarships.flatMap((shard) => shard.scholarships);

  const channelOf = (slug: string | null | undefined): PlanChannel | null => {
    if (slug === undefined || slug === null) return null;
    const found = core.applicationChannels.find((c) => c.slug === slug);
    return found === undefined
      ? null
      : { name: found.name, url: found.url, accountRequired: found.accountRequired };
  };

  const entries = saved.map((item): PlanProgram | PlanMissing => {
    const program = programs.find((p) => p.slug === resolveProgramSlug(item.slug, bundle));
    if (program === undefined) return { kind: "missing", slug: item.slug };

    const match = matchProgram({ profile, program, routes, reference: core, now });
    const scholarships = scholarshipsForProgram(profile, program, allScholarships);
    const channelSlug = program.applicationChannel.value;
    const programChannel = core.applicationChannels.find((c) => c.slug === channelSlug) ?? null;
    const checklist = generateChecklist({
      profile,
      program,
      match,
      channel: programChannel,
      scholarships,
      now,
    });
    const institution = institutions.find((i) => i.slug === program.institution) ?? null;
    const names = new Map(scholarships.map((s) => [s.slug, s.name]));

    return {
      kind: "program",
      // The saved slug, not the current one: the saved list and the ticked steps are keyed by it.
      slug: item.slug,
      name: program.name,
      institutionName: institution?.name ?? program.institution,
      cityName: institution?.city.name ?? program.city,
      group: groupOf(match),
      intake: nextIntake(program, now),
      documents:
        program.documents.value === null
          ? null
          : program.documents.value.map((doc) => ({
              slug: doc.slug,
              name: bundle.text(doc.name) ?? null,
              translationRequired: doc.translationRequired,
            })),
      documentsMeta: program.documents,
      steps: checklist.steps.map((step) => ({
        id: step.id,
        status: step.status,
        reason: step.reason,
        facts: uniqueFacts(step.facts),
        deadline: step.deadline ?? null,
        channel: channelOf(step.channel),
        scholarships: (step.scholarships ?? []).map((slug) => ({
          slug,
          name: names.get(slug) ?? slug,
        })),
      })),
    };
  });
  return { entries };
}
