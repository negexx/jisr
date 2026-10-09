"use client";

import { Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";

import { DeadlineStatus } from "@/components/deadline-status";
import { ExternalLink } from "@/components/external-link";
import { LocalizedDataText } from "@/components/localized-data-text";
import { SourceBadge } from "@/components/source-badge";
import type { FactMeta } from "@/data-schema/resolved";
import type { FactRef } from "@/domain/types";
import { Link } from "@/i18n/navigation";
import type { PlanDocument, PlanProgram, PlanStep } from "@/lib/journey/plan-view";

type SourceMeta = FactMeta | FactRef;

// First-strong isolates keep a Latin portal name from reordering the Arabic sentence around it
// (a message argument cannot hold a <bdi>).
function isolate(text: string): string {
  return `⁨${text}⁩`;
}

function factKey(fact: SourceMeta): string {
  return "record" in fact ? `${fact.record}#${fact.path}` : fact.source_url;
}

// Same look as the guidance kind of SourceBadge (grey outline, info icon, never the official fill):
// a step with no published fact is general advice, and says so.
function GuidanceTag() {
  const t = useTranslations("plan.steps");
  return (
    <span
      data-slot="guidance-tag"
      className="inline-flex w-fit items-start gap-1.5 rounded-full border border-kind-guidance/40 bg-kind-guidance-bg px-2.5 py-0.5 text-sm font-medium text-kind-guidance"
    >
      <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      {t("guidance")}
    </span>
  );
}

// One badge per fact. `covered`: another part of the step already shows a sourced fact (the
// deadline), so the step is not general guidance.
export function StepSources({
  facts,
  covered = false,
}: {
  facts: readonly SourceMeta[];
  covered?: boolean;
}) {
  if (facts.length === 0) return covered ? null : <GuidanceTag />;
  return (
    <div className="flex flex-col gap-2">
      {facts.map((fact) => (
        <SourceBadge key={factKey(fact)} meta={fact} variant="compact" />
      ))}
    </div>
  );
}

function TranslationLine({ document }: { document: PlanDocument }) {
  const t = useTranslations("plan.steps.translation");
  const key =
    document.translationRequired === true
      ? "yes"
      : document.translationRequired === false
        ? "no"
        : "unknown";
  return <span className="text-sm text-muted-foreground">{t(key)}</span>;
}

function Documents({
  documents,
  official,
}: {
  documents: readonly PlanDocument[];
  official: boolean;
}) {
  const t = useTranslations("plan.steps");
  const headingId = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <p id={headingId} className="text-sm font-medium">
        {t(official ? "documents" : "documentsGuidance")}
      </p>
      <ul data-slot="documents" aria-labelledby={headingId} className="flex flex-col gap-2">
        {documents.map((document) => (
          <li key={document.slug} className="flex flex-col">
            <span className="text-base">
              <LocalizedDataText
                value={document.name}
                fallback={<bdi dir="ltr">{document.slug}</bdi>}
              />
            </span>
            <TranslationLine document={document} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Channel({ step }: { step: PlanStep }) {
  const t = useTranslations("plan.steps");
  const channel = step.channel;
  if (channel === null) return null;
  const account =
    channel.accountRequired === true
      ? "accountRequired"
      : channel.accountRequired === false
        ? "accountNotRequired"
        : "accountUnknown";
  return (
    <div className="flex flex-col">
      <ExternalLink href={channel.url} className="min-h-11 w-fit text-base md:min-h-8">
        {t("applyOn", { name: isolate(channel.name) })}
      </ExternalLink>
      {step.id === "application_account" ? (
        <p className="text-sm text-muted-foreground">{t(account)}</p>
      ) : null}
    </div>
  );
}

function Scholarships({ program, step }: { program: PlanProgram; step: PlanStep }) {
  const t = useTranslations("plan.steps");
  const headingId = useId();
  if (step.scholarships.length === 0) return null;
  return (
    <div className="flex flex-col">
      <p id={headingId} className="text-sm font-medium">
        {t("scholarships")}
      </p>
      <ul aria-labelledby={headingId}>
        {step.scholarships.map((scholarship) => (
          <li key={scholarship.slug}>
            <Link
              href={`/programs/${program.slug}#scholarship-${scholarship.slug}`}
              prefetch={false}
              className="inline-flex min-h-11 items-center text-base text-primary underline underline-offset-4 md:min-h-8"
            >
              <bdi>{scholarship.name}</bdi>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// A todo step: a native checkbox whose label is the step title (the whole row is the 44px target),
// the meaning and reason as its description, then the step's own facts and their sources. A ticked
// step keeps its text readable: the checked box is the state, not colour or strike-through.
export function StepRow({
  program,
  step,
  done,
  onToggle,
}: {
  program: PlanProgram;
  step: PlanStep;
  done: boolean;
  onToggle: (done: boolean) => void;
}) {
  const t = useTranslations("domain.checklist");
  const descriptionId = useId();

  // DeadlineStatus brings the badge of the intake it shows, so that fact is not repeated below it.
  const deadlineFact =
    step.id === "submit" && program.intake.kind !== "unknown" ? program.intake.fact : null;
  const deadlineKey = deadlineFact === null ? null : factKey(deadlineFact);
  const documents = step.id === "documents" ? program.documents : null;
  const own = step.facts.filter((fact) => factKey(fact) !== deadlineKey);
  const facts: SourceMeta[] =
    own.length === 0 && documents !== null && deadlineFact === null ? [program.documentsMeta] : own;

  return (
    <li
      data-step={step.id}
      className="flex flex-col gap-2 border-t border-border py-4 first:border-t-0 first:pt-0"
    >
      <label className="flex min-h-11 cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={done}
          aria-describedby={descriptionId}
          onChange={(event) => onToggle(event.currentTarget.checked)}
          className="mt-2.5 size-6 shrink-0 cursor-pointer accent-primary"
        />
        <span className="pt-2.5 text-lg font-semibold">{t(`step.${step.id}.title`)}</span>
      </label>
      <div className="flex flex-col gap-3 ps-9">
        <div id={descriptionId} className="flex flex-col gap-1">
          <p className="text-base text-muted-foreground">{t(`step.${step.id}.meaning`)}</p>
          <p className="text-sm text-muted-foreground">{t(`reason.${step.reason}`)}</p>
        </div>
        {documents === null ? null : (
          <Documents
            documents={documents}
            official={program.documentsMeta.info_kind === "official"}
          />
        )}
        {step.id === "application_account" || step.id === "submit" ? <Channel step={step} /> : null}
        {step.id === "submit" ? <DeadlineStatus intake={program.intake} /> : null}
        {step.id === "scholarships" ? <Scholarships program={program} step={step} /> : null}
        <StepSources facts={facts} covered={deadlineFact !== null} />
      </div>
    </li>
  );
}
