import type { IsoDate } from "@/data-schema/dates";
import type {
  ApplicationChannel,
  CostProfile,
  FactMeta,
  Institution,
  Program,
  Scholarship,
} from "@/data-schema/resolved";
import { estimateCost } from "@/domain/costs";
import type { FactRef } from "@/domain/types";

export const PAGE_SECTIONS = [
  "overview",
  "requirements",
  "tuition",
  "costs",
  "deadline",
  "procedure",
  "documents",
  "scholarships",
  "links",
] as const;
export type PageSection = (typeof PAGE_SECTIONS)[number];

// `label` identifies the fact (`<record>#<path>`, as in FactRef); it is not user-facing text.
// `meta` is the FactMeta of a record field, or for cost lines the FactRef estimateCost gives,
// stamped at `now` (freshnessOfFact recomputes from either shape anyway).
export type PageFact = { section: PageSection; label: string; meta: FactMeta | FactRef };

// The part of ProgramPageData the facts come from. Declared here rather than imported, because
// src/lib/snapshot/server.ts is server-only and this module must stay usable in client code.
export type ProgramFactsSource = {
  program: Program;
  institution: Institution | null;
  costProfiles: readonly CostProfile[];
  scholarships: readonly Scholarship[];
  applicationChannel: ApplicationChannel | null;
};

function metaOf(fact: FactMeta): FactMeta {
  const meta: FactMeta = {
    source_url: fact.source_url,
    info_kind: fact.info_kind,
    last_verified_at: fact.last_verified_at,
    class: fact.class,
  };
  if (fact.basis !== undefined) meta.basis = fact.basis;
  return meta;
}

export function pageFacts(data: ProgramFactsSource, now: IsoDate): PageFact[] {
  const { program, institution, applicationChannel } = data;
  const record = `programs/${program.slug}`;
  const facts: PageFact[] = [];
  const add = (section: PageSection, label: string, fact: FactMeta) => {
    facts.push({ section, label, meta: metaOf(fact) });
  };

  if (institution !== null) add("overview", `institutions/${institution.slug}#`, institution.fact);
  add("overview", `${record}#durationYears`, program.durationYears);
  add("overview", `${record}#teachingLanguages`, program.teachingLanguages);

  add("requirements", `${record}#requirements`, program.requirements.fact);
  for (const rule of program.requirements.rules) {
    add("requirements", `${record}#requirements.rules.${rule.id}`, rule.fact);
  }

  add("tuition", `${record}#tuition`, program.tuition);

  const cost = estimateCost({
    program,
    costProfiles: data.costProfiles,
    budget: null,
    now,
  });
  for (const line of cost.lines) {
    if (line.fact !== null) {
      facts.push({
        section: "costs",
        label: `${line.fact.record}#${line.fact.path}`,
        meta: line.fact,
      });
    }
  }

  add("deadline", `${record}#intakes`, program.intakes);

  add("procedure", `${record}#applicationChannel`, program.applicationChannel);
  if (applicationChannel !== null) {
    add("procedure", `application-channels/${applicationChannel.slug}#`, applicationChannel.fact);
  }

  add("documents", `${record}#documents`, program.documents);

  for (const scholarship of data.scholarships) {
    add("scholarships", `scholarships/${scholarship.slug}#support`, scholarship.support);
    add("scholarships", `scholarships/${scholarship.slug}#deadline`, scholarship.deadline);
  }
  return facts;
}
