// The lazy-loaded half of the hero demo: it owns the fixture and src/domain imports (and the shared
// trust components), so nothing here reaches the home's initial bundle. It is imported only when the
// visitor touches a control; before that, HeroDemo renders its neutral placeholder.
import { MatchStatusBadge } from "@/components/match-status-badge";
import { SourceBadge } from "@/components/source-badge";
import type { Profile } from "@/data-schema/profile";
import type { FactMeta, Program } from "@/data-schema/resolved";
import { matchProgram } from "@/domain/match";
import type { ReasonCode } from "@/domain/types";
import type { AppLocale } from "@/i18n/routing";
import { todayIso } from "@/lib/clock";
import { formatTuition, intlLocale } from "@/lib/format";
import { groupOf, topReasons } from "@/lib/journey/matches-view";

import { DEMO_CORE, DEMO_INSTITUTIONS, DEMO_PROGRAMS, DEMO_ROUTES } from "./demo-data";
import type { DemoField, DemoLevel, HeroDemoCardProps, HeroDemoCopy } from "./hero-demo";

// The demo only shows the two fields the fixture publishes a programme for: Computer Science (a
// German programme) and Engineering (the French programme). "Business" has no programme, so it is
// left out rather than shown as an inert pill (controller ruling R8).
function programFor(field: DemoField): Program {
  const program = field === "engineering" ? DEMO_PROGRAMS[2] : DEMO_PROGRAMS[0];
  if (program === undefined) throw new Error("hero demo: the fixture is missing a programme");
  return program;
}

// The one profile the controls build: the language-level control drives the real `language_proficiency`
// rule (en B2 for Germany, fr B2 for France); the certificates are the ones those rules accept.
function buildProfile(field: DemoField, level: DemoLevel): Profile {
  return {
    schemaVersion: 1,
    nationality: "MA",
    credential: {
      country: "MA",
      type: "ma-bac",
      track: "sciences-mathematiques-a",
      status: "obtained",
      overall: null,
      subjects: [],
    },
    priorHigherEducationYears: 0,
    languages: [
      { language: "en", level, certificate: "ielts" },
      { language: "fr", level, certificate: "tcf" },
      { language: "de", level: "A1", certificate: null },
    ],
    fields: [field === "engineering" ? "engineering" : "computer-science"],
    studyLanguages: [],
    destinations: [],
    budget: null,
    institutionType: "any",
  };
}

function reasonLine(code: ReasonCode | undefined, copy: HeroDemoCopy): string {
  switch (code) {
    case "ok":
      return copy.reason.met;
    case "below_threshold":
      return copy.reason.notMet;
    case "non_official_source":
      return copy.reason.nonOfficial;
    default:
      return copy.reason.toCheck;
  }
}

function languageName(code: string, locale: AppLocale): string {
  try {
    return (
      new Intl.DisplayNames(intlLocale(locale), { type: "language", fallback: "code" }).of(code) ??
      code
    );
  } catch {
    return code;
  }
}

function Fact({ label, value, meta }: { label: string; value: string; meta?: FactMeta }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <bdi className="font-medium text-foreground">{value}</bdi>
      </div>
      {meta === undefined ? null : <SourceBadge meta={meta} />}
    </div>
  );
}

export function HeroDemoCard({ field, level, copy, locale }: HeroDemoCardProps) {
  const program = programFor(field);
  const match = matchProgram({
    profile: buildProfile(field, level),
    program,
    routes: DEMO_ROUTES,
    reference: DEMO_CORE,
    now: todayIso(),
  });
  const dominant = topReasons(match, 1)[0];
  const institution = DEMO_INSTITUTIONS.find((entry) => entry.slug === program.institution) ?? null;
  const teaching =
    program.teachingLanguages.value?.map((code) => languageName(code, locale)).join(", ") ?? "";
  const tuition =
    program.tuition.value === null
      ? copy.fact.toCheck
      : formatTuition(program.tuition.value, locale);

  return (
    <div className="flex flex-col gap-3.5 rounded-2xl border border-border bg-card p-4">
      <div>
        <p className="text-lg leading-snug font-semibold tracking-tight text-accent-foreground">
          {program.name}
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {institution === null ? program.city : `${institution.name} · ${institution.city.name}`}
        </p>
      </div>
      <MatchStatusBadge group={groupOf(match)} />
      <div className="grid gap-3">
        <Fact
          label={copy.fact.institution}
          value={institution === null ? program.city : institution.name}
          meta={institution?.fact}
        />
        <Fact
          label={copy.fact.teachingLanguage}
          value={teaching}
          meta={program.teachingLanguages}
        />
        <Fact label={copy.fact.tuition} value={tuition} meta={program.tuition} />
      </div>
      <p className="border-t border-border pt-3 text-sm text-muted-foreground">
        {reasonLine(dominant?.code, copy)}
      </p>
    </div>
  );
}
