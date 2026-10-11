"use client";

// The interactive hero demo: a client leaf that runs the REAL src/domain matching on the Task 6
// fixture. Every shell string arrives as a prop (`copy`); the domain, the fixture and the card (with
// MatchStatusBadge/SourceBadge) are imported only on the first control interaction, so the home's
// initial JS stays in budget. The server renders a neutral, height-reserving placeholder labelled
// "illustrative" that makes no status, freshness, clock or profile claim.
import { useLocale } from "next-intl";
import { type ComponentType, useState } from "react";

import type { AppLocale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

export type DemoField = "computerScience" | "engineering";
export type DemoLevel = "A2" | "B2";

// Every user-facing string the demo shows. The badges (MatchStatusBadge, SourceBadge) read their own
// namespaces through the provider the caller wraps around HeroDemo (see DEMO_NAMESPACES).
export type HeroDemoCopy = {
  title: string;
  illustrative: string;
  fieldLabel: string;
  levelLabel: string;
  field: Record<DemoField, string>;
  level: Record<"a2" | "b2", string>;
  fact: {
    institution: string;
    teachingLanguage: string;
    tuition: string;
    toCheck: string;
  };
  reason: {
    met: string;
    notMet: string;
    nonOfficial: string;
    toCheck: string;
  };
};

export type HeroDemoCardProps = {
  field: DemoField;
  level: DemoLevel;
  copy: HeroDemoCopy;
  locale: AppLocale;
};

type SegmentedOption<T extends string> = { value: T; label: string };

function Segmented<T extends string>({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: readonly SegmentedOption<T>[];
  selected: T;
  onSelect: (value: T) => void;
}) {
  return (
    <fieldset
      aria-label={label}
      className="flex min-w-0 gap-0.5 rounded-full border border-border bg-secondary p-0.5"
    >
      {options.map((option) => {
        const active = option.value === selected;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(option.value)}
            className={cn(
              "flex-1 rounded-full px-3 py-2 text-sm font-medium transition-colors duration-150 ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none",
              active
                ? "bg-card text-accent-foreground shadow-sm"
                : "text-secondary-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </fieldset>
  );
}

function Placeholder() {
  return (
    <div
      aria-hidden="true"
      className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4"
    >
      <span className="h-4 w-3/4 rounded bg-secondary" />
      <span className="h-3 w-1/2 rounded bg-secondary" />
      <span className="h-6 w-40 rounded bg-secondary" />
      <span className="h-3 w-full rounded bg-secondary" />
    </div>
  );
}

export function HeroDemo({ copy }: { copy: HeroDemoCopy }) {
  const locale = useLocale() as AppLocale;
  const [field, setField] = useState<DemoField>("engineering");
  const [level, setLevel] = useState<DemoLevel>("B2");
  const [Card, setCard] = useState<ComponentType<HeroDemoCardProps> | null>(null);

  const loadCard = () => {
    if (Card !== null) return;
    void import("./hero-demo-card").then((module) => {
      setCard(() => module.HeroDemoCard);
    });
  };
  const chooseField = (value: DemoField) => {
    setField(value);
    loadCard();
  };
  const chooseLevel = (value: DemoLevel) => {
    setLevel(value);
    loadCard();
  };

  return (
    <div className="relative rounded-3xl border border-border bg-card p-5 shadow-lg">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold tracking-[0.02em] text-muted-foreground uppercase">
          {copy.title}
        </span>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">{copy.illustrative}</p>
      <div className="mb-4 grid gap-2.5">
        <Segmented
          label={copy.fieldLabel}
          selected={field}
          onSelect={chooseField}
          options={[
            { value: "engineering", label: copy.field.engineering },
            { value: "computerScience", label: copy.field.computerScience },
          ]}
        />
        <Segmented
          label={copy.levelLabel}
          selected={level}
          onSelect={chooseLevel}
          options={[
            { value: "B2", label: copy.level.b2 },
            { value: "A2", label: copy.level.a2 },
          ]}
        />
      </div>
      <div data-testid="hero-demo-slot" style={{ minHeight: "13rem" }}>
        {Card === null ? (
          <Placeholder />
        ) : (
          <Card field={field} level={level} copy={copy} locale={locale} />
        )}
      </div>
    </div>
  );
}
