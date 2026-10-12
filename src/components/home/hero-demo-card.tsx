// One illustrative match card in the hero demo: server component, fixed markup. It mirrors the
// Fact pattern of the previous card (label + value in <bdi> + SourceBadge) but runs no matching: the
// programme, the group and the delay are props, and nothing reads the clock.
import type { CSSProperties } from "react";

import { MatchStatusBadge } from "@/components/match-status-badge";
import { SourceBadge } from "@/components/source-badge";
import type { FactMeta, Program } from "@/data-schema/resolved";
import type { AppLocale } from "@/i18n/routing";
import { intlLocale } from "@/lib/format";
import type { MatchGroup } from "@/lib/journey/matches-view";

import { DEMO_INSTITUTIONS } from "./demo-data";
import type { HeroDemoCopy } from "./hero-demo";

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

function Fact({ label, value, meta }: { label: string; value: string; meta: FactMeta }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <bdi className="font-medium text-foreground">{value}</bdi>
      </div>
      <SourceBadge meta={meta} />
    </div>
  );
}

export function HeroDemoCard({
  program,
  group,
  delay,
  copy,
  locale,
}: {
  program: Program;
  group: MatchGroup;
  delay: string;
  copy: HeroDemoCopy;
  locale: AppLocale;
}) {
  const institution = DEMO_INSTITUTIONS.find((entry) => entry.slug === program.institution) ?? null;
  const teaching =
    program.teachingLanguages.value?.map((code) => languageName(code, locale)).join(", ") ?? "";

  return (
    <div
      className="jisr-demo-reveal flex flex-col gap-3.5 rounded-2xl border border-border bg-card p-4"
      style={{ "--d": delay } as CSSProperties}
    >
      <div>
        <p className="text-lg leading-snug font-semibold tracking-tight text-accent-foreground">
          <bdi>{program.name}</bdi>
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          <bdi>
            {institution === null ? program.city : `${institution.name} · ${institution.city.name}`}
          </bdi>
        </p>
      </div>
      <MatchStatusBadge group={group} size="sm" />
      <Fact label={copy.match.teachingLanguage} value={teaching} meta={program.teachingLanguages} />
    </div>
  );
}
