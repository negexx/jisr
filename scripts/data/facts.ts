import type { LocalizedText } from "@/data-schema/localized-text";
import type { CollectionName, RecordOf } from "@/data-schema/records/collections";
import type { RuleRecord } from "@/data-schema/rules";
import type { StalenessClass } from "@/data-schema/staleness";

export type FactUse = { file: string; path: string; sourceKey: string; class: StalenessClass };

type TypedRecord = {
  [C in CollectionName]: { collection: C; record: RecordOf<C> };
}[CollectionName];

type ProvenancedFact = { source: string; class: StalenessClass; basis?: LocalizedText };
type Requirements = { source: string; rules: RuleRecord[] };

// The registry types `record` as the union of all record types; the collection tag is what
// tells us which one it is, so the pairing is re-established here once.
function typed(collection: CollectionName, record: RecordOf<CollectionName>): TypedRecord {
  return { collection, record } as TypedRecord;
}

function fact(file: string, path: string, f: ProvenancedFact): FactUse {
  return { file, path, sourceKey: f.source, class: f.class };
}

function stable(file: string, path: string, sourceKey: string): FactUse {
  return { file, path, sourceKey, class: "stable" };
}

function requirementUses(file: string, req: Requirements): FactUse[] {
  return [
    stable(file, "requirements", req.source),
    ...req.rules.map((rule) => stable(file, `requirements.rules.${rule.id}`, rule.source)),
  ];
}

export function factUses(
  collection: CollectionName,
  record: RecordOf<CollectionName>,
  file: string,
): FactUse[] {
  const t = typed(collection, record);
  switch (t.collection) {
    case "countries":
    case "fields":
    case "subjects":
    case "language-certificates":
      return [];
    case "grading-scales":
    case "grade-conversions":
    case "credential-types":
    case "application-channels":
    case "institutions":
      return [stable(file, "", t.record.source)];
    case "admission-routes":
      return [
        stable(file, "", t.record.source),
        ...t.record.conditions.map((c) => stable(file, `conditions.${c.id}`, c.source)),
      ];
    case "programs": {
      const p = t.record;
      return [
        fact(file, "durationYears", p.durationYears),
        fact(file, "teachingLanguages", p.teachingLanguages),
        fact(file, "tuition", p.tuition),
        fact(file, "intakes", p.intakes),
        fact(file, "applicationChannel", p.applicationChannel),
        fact(file, "documents", p.documents),
        ...requirementUses(file, p.requirements),
      ];
    }
    case "cost-profiles":
      return Object.entries(t.record.lines).flatMap(([category, line]) =>
        line === undefined ? [] : [fact(file, `lines.${category}`, line)],
      );
    case "scholarships": {
      const s = t.record;
      return [
        fact(file, "support", s.support),
        fact(file, "deadline", s.deadline),
        fact(file, "documents", s.documents),
        ...requirementUses(file, s.requirements),
      ];
    }
  }
}

function ruleNotes(rules: readonly RuleRecord[]): LocalizedText[] {
  return rules.flatMap((rule) => (rule.kind === "manual_check" ? [rule.note] : []));
}

function basisOf(facts: readonly (ProvenancedFact | undefined)[]): LocalizedText[] {
  return facts.flatMap((f) => (f?.basis === undefined ? [] : [f.basis]));
}

export function localizedTexts(
  collection: CollectionName,
  record: RecordOf<CollectionName>,
): LocalizedText[] {
  const t = typed(collection, record);
  switch (t.collection) {
    case "countries":
    case "fields":
    case "subjects":
      return [t.record.name];
    case "language-certificates":
    case "grading-scales":
    case "grade-conversions":
    case "institutions":
      return [];
    case "credential-types":
      return [
        t.record.gloss,
        ...t.record.tracks.flatMap((track) => (track.gloss === undefined ? [] : [track.gloss])),
      ];
    case "application-channels":
      return [t.record.summary];
    case "admission-routes":
      return [
        ...(t.record.note === undefined ? [] : [t.record.note]),
        ...ruleNotes(t.record.conditions),
      ];
    case "programs": {
      const p = t.record;
      return [
        p.summary,
        ...basisOf([
          p.durationYears,
          p.teachingLanguages,
          p.tuition,
          p.intakes,
          p.applicationChannel,
          p.documents,
        ]),
        ...(p.documents.value ?? []).map((d) => d.name),
        ...ruleNotes(p.requirements.rules),
      ];
    }
    case "cost-profiles":
      return basisOf(Object.values(t.record.lines));
    case "scholarships": {
      const s = t.record;
      return [
        s.summary,
        s.howToApply,
        ...basisOf([s.support, s.deadline, s.documents]),
        ...(s.documents.value ?? []).map((d) => d.name),
        ...ruleNotes(s.requirements.rules),
      ];
    }
  }
}
