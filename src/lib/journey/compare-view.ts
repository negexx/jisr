import type { IsoDate } from "@/data-schema/dates";
import type { Profile } from "@/data-schema/profile";
import type { ApplicationChannel, Program } from "@/data-schema/resolved";
import { scholarshipsForProgram } from "@/domain/scholarships";
import type { CostEstimate, FactRef, IntakeStatus } from "@/domain/types";
import type { AppLocale } from "@/i18n/routing";
import type { SnapshotBundle } from "@/lib/snapshot/client";
import type { DataText } from "@/lib/snapshot/text";
import { COMPARE_ROWS, type CompareRowId } from "./compare-rows";
import {
  cardFor,
  type MatchCardModel,
  type MatchGroup,
  type RouteKey,
  reasonContext,
} from "./matches-view";
import { describeReason, type ReasonView } from "./reasons";

// Re-exported so this module's public interface is unchanged; components import the rows from
// ./compare-rows to keep this module out of their initial chunk.
export { COMPARE_ROWS, type CompareRowId };

export type CompareChannel = {
  slug: string;
  name: string;
  kind: ApplicationChannel["kind"];
  url: string;
  accountRequired: boolean | null;
};
export type CompareDocument = {
  slug: string;
  name: DataText | null;
  translationRequired: boolean | null;
};
export type CompareProgram = {
  slug: string;
  name: string;
  institutionName: string;
  cityName: string;
  group: MatchGroup;
  routeKey: RouteKey;
  reasons: ReasonView[]; // every reason, not the card's top three
  tuition: MatchCardModel["tuition"];
  cost: CostEstimate;
  teachingLanguages: MatchCardModel["teachingLanguages"];
  intake: IntakeStatus;
  scholarships: Array<{ slug: string; name: string }>;
  channel: CompareChannel | null;
  channelFact: FactRef | null;
  documents: CompareDocument[] | null;
  documentsMeta: Program["documents"];
};
export type CompareView = {
  programs: CompareProgram[]; // in the order of `slugs`, only those found
  missing: string[]; // slugs not found in the bundle
  differs: Record<CompareRowId, boolean>; // false when fewer than 2 programs
};

export type CompareInput = {
  profile: Profile;
  bundle: SnapshotBundle;
  slugs: readonly string[];
  now: IsoDate;
  locale: AppLocale;
};

// A row's value as comparable text, or null when the program does not know it.
type Signature = (program: CompareProgram) => string | null;

const SIGNATURES: Record<CompareRowId, Signature> = {
  result: (p) => p.group,
  tuition: (p) => {
    const { value } = p.tuition;
    return value === null ? null : `${value.amountMinor}|${value.currency}|${value.period}`;
  },
  cost: (p) => {
    if (p.cost.totals.length === 0) return null;
    const totals = p.cost.totals
      .map((t) => `${t.currency}:${t.min}-${t.max}`)
      .sort()
      .join(",");
    return `${totals}|complete:${p.cost.complete}`;
  },
  language: (p) => {
    const { value } = p.teachingLanguages;
    return value === null ? null : [...value].sort().join(",");
  },
  deadline: (p) => {
    switch (p.intake.kind) {
      case "upcoming":
        return `upcoming:${p.intake.intake.applicationDeadline}`;
      case "closed":
        return "closed";
      case "unknown":
        return null;
      default: {
        const unreachable: never = p.intake;
        return unreachable;
      }
    }
  },
  // An empty list is a known value: the sources list no scholarship.
  scholarships: (p) =>
    p.scholarships
      .map((s) => s.slug)
      .sort()
      .join(","),
  application: (p) => {
    if (p.channel === null || p.documents === null) return null;
    const documents = p.documents
      .map((d) => `${d.slug}:${d.translationRequired}`)
      .sort()
      .join(",");
    return `${p.channel.slug}|${p.channel.accountRequired}|${documents}`;
  },
};

// An unknown value is distinct per program, so two unknowns never read as "the same".
function rowDiffers(row: CompareRowId, programs: readonly CompareProgram[]): boolean {
  if (programs.length < 2) return false;
  const values = programs.map((p) => SIGNATURES[row](p) ?? `unknown:${p.slug}`);
  return new Set(values).size > 1;
}

// Pure: every value comes from the same `cardFor` as the matches page, so the two can never
// disagree. Nothing here logs, because an error could carry profile values.
export function buildCompareView(input: CompareInput): CompareView {
  const { profile, bundle, slugs, now, locale } = input;
  const core = bundle.core;
  if (core === undefined) throw new Error("buildCompareView: the bundle has no core shard");
  const catalogue = bundle.programs.flatMap((shard) => shard.programs);
  const allScholarships = bundle.scholarships.flatMap((shard) => shard.scholarships);

  const programs: CompareProgram[] = [];
  const missing: string[] = [];
  for (const slug of slugs) {
    const program = catalogue.find((p) => p.slug === slug);
    if (program === undefined) {
      missing.push(slug);
      continue;
    }
    const card = cardFor({ profile, bundle, now, locale, core, program });
    const context = reasonContext({ profile, bundle, locale, core, program });
    const channel = core.applicationChannels.find(
      (c) => c.slug === program.applicationChannel.value,
    );
    programs.push({
      slug: program.slug,
      name: card.name,
      institutionName: card.institutionName,
      cityName: card.cityName,
      group: card.group,
      routeKey: card.routeKey,
      reasons: card.match.reasons.map((reason) => describeReason(reason, context)),
      tuition: card.tuition,
      cost: card.cost,
      teachingLanguages: card.teachingLanguages,
      intake: card.intake,
      scholarships: scholarshipsForProgram(profile, program, allScholarships).map(
        ({ slug: scholarshipSlug, name }) => ({ slug: scholarshipSlug, name }),
      ),
      channel:
        channel === undefined
          ? null
          : {
              slug: channel.slug,
              name: channel.name,
              kind: channel.kind,
              url: channel.url,
              accountRequired: channel.accountRequired,
            },
      channelFact:
        card.factRefs.find((fact) => fact.record.startsWith("application-channels/")) ?? null,
      documents:
        program.documents.value === null
          ? null
          : program.documents.value.map((doc) => ({
              slug: doc.slug,
              name: bundle.text(doc.name) ?? null,
              translationRequired: doc.translationRequired,
            })),
      documentsMeta: program.documents,
    });
  }

  const differs: Record<CompareRowId, boolean> = {
    result: rowDiffers("result", programs),
    tuition: rowDiffers("tuition", programs),
    cost: rowDiffers("cost", programs),
    language: rowDiffers("language", programs),
    deadline: rowDiffers("deadline", programs),
    scholarships: rowDiffers("scholarships", programs),
    application: rowDiffers("application", programs),
  };
  return { programs, missing, differs };
}
