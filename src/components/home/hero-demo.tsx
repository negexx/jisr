// The self-running hero demo: a server component that plays a profile -> matches reveal once on load
// and holds the final state. No client JS: the only client leaf below is FreshnessMark, which
// SourceBadge renders and which handles its own mount. Every string arrives as a prop (`copy`), and
// the match statuses are fixed, illustrative markup (the trust-band precedent), never a computed
// result: nothing here runs src/domain or reads the clock.
import type { CSSProperties } from "react";

import type { Program } from "@/data-schema/resolved";
import type { AppLocale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

import { DEMO_PROGRAMS } from "./demo-data";
import { HeroDemoCard } from "./hero-demo-card";

// The fixture ships one engineering programme (shown as appears-met) and one computer-science
// programme (shown as to-check); bind by field so a fixture reorder cannot silently swap the two.
function demoProgram(field: string): Program {
  const program = DEMO_PROGRAMS.find((candidate) => candidate.field === field);
  if (program === undefined) throw new Error("hero demo: the fixture is missing a programme");
  return program;
}

// Every user-facing string the demo shows. The shared trust components (MatchStatusBadge, SourceBadge)
// resolve their own namespaces server-side from the request locale, so this island needs no provider.
export type HeroDemoCopy = {
  title: string;
  illustrative: string;
  profile: {
    heading: string;
    nationality: string;
    diploma: string;
    field: string;
    language: string;
    values: { nationality: string; diploma: string; field: string; language: string };
  };
  match: { teachingLanguage: string };
};

// Component-scoped keyframes, like hero.tsx's mesh CSS. All animation sits behind
// prefers-reduced-motion: no-preference, so the plain base state is the visible end state: the rows
// and cards are opaque and the bar is full before the first painted frame, with or without JS. The
// reveal plays exactly once (no `infinite`) and finishes well under the 5s WCAG 2.2.2 budget.
const DEMO_CSS = `
.jisr-demo-bar{transform-origin:left center}
[dir="rtl"] .jisr-demo-bar{transform-origin:right center}
@keyframes jisr-reveal{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes jisr-bar{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@media (prefers-reduced-motion: no-preference){
  .jisr-demo-reveal{animation:jisr-reveal .45s cubic-bezier(.2,.8,.2,1) both;animation-delay:var(--d)}
  .jisr-demo-bar{animation:jisr-bar .95s cubic-bezier(.2,.8,.2,1) both;animation-delay:var(--d)}
}
`;

export function HeroDemo({ copy, locale }: { copy: HeroDemoCopy; locale: AppLocale }) {
  const rows = [
    { label: copy.profile.nationality, value: copy.profile.values.nationality, delay: "0s" },
    { label: copy.profile.diploma, value: copy.profile.values.diploma, delay: ".16s" },
    { label: copy.profile.field, value: copy.profile.values.field, delay: ".32s" },
    { label: copy.profile.language, value: copy.profile.values.language, delay: ".48s" },
  ];

  return (
    <div className="relative rounded-3xl border border-border bg-card p-5 shadow-lg">
      <style>{DEMO_CSS}</style>
      <span className="text-sm font-semibold tracking-[0.02em] text-muted-foreground uppercase">
        {copy.title}
      </span>
      <p className="mb-4 text-sm text-muted-foreground">{copy.illustrative}</p>
      <div className="rounded-2xl border border-border bg-secondary p-4">
        <p className="mb-2 text-xs font-semibold tracking-[0.04em] text-muted-foreground uppercase">
          {copy.profile.heading}
        </p>
        <div className="flex flex-col">
          {rows.map((row, index) => (
            <div
              key={row.label}
              className={cn(
                "jisr-demo-reveal flex items-center justify-between gap-3 py-1.5 text-sm",
                index > 0 && "border-t border-border/70",
              )}
              style={{ "--d": row.delay } as CSSProperties}
            >
              <span className="text-muted-foreground">{row.label}</span>
              <bdi className="font-medium text-foreground">{row.value}</bdi>
            </div>
          ))}
        </div>
        <div aria-hidden="true" className="mt-2.5 h-1 overflow-hidden rounded-full bg-primary/15">
          <span
            className="jisr-demo-bar block h-full w-full rounded-full bg-linear-to-r from-primary to-accent-foreground"
            style={{ "--d": ".10s" } as CSSProperties}
          />
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-3">
        <HeroDemoCard
          program={demoProgram("engineering")}
          group="ok"
          delay="1.15s"
          copy={copy}
          locale={locale}
        />
        <HeroDemoCard
          program={demoProgram("computer-science")}
          group="check"
          delay="1.40s"
          copy={copy}
          locale={locale}
        />
      </div>
    </div>
  );
}
