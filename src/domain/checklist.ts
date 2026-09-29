import type { IsoDate } from "@/data-schema/dates";
import type { Profile } from "@/data-schema/profile";
import type { ApplicationChannel, Program, Scholarship } from "@/data-schema/resolved";
import { isDecisive, toFactRef } from "./facts";
import { nextIntake } from "./intakes";
import type { Checklist, ChecklistStep, FactRef, MatchResult } from "./types";
import { CHECKLIST_STEP_IDS } from "./types";

export type ChecklistInput = {
  profile: Profile;
  program: Program;
  match: MatchResult;
  channel: ApplicationChannel | null;
  scholarships: readonly Scholarship[];
  now: IsoDate;
};

type StepId = (typeof CHECKLIST_STEP_IDS)[number];
type Outcome = Omit<ChecklistStep, "id">;

const todo = (reason: "applies" | "unknown_data", facts: FactRef[]): Outcome => ({
  status: "todo",
  reason,
  facts,
});

function documentsStep({ program, now }: ChecklistInput): Outcome {
  const ref = toFactRef(`programs/${program.slug}`, "documents", program.documents, now);
  return todo(program.documents.value === null ? "unknown_data" : "applies", [ref]);
}

function translationStep({ program, now }: ChecklistInput): Outcome {
  const docs = program.documents;
  const ref = toFactRef(`programs/${program.slug}`, "documents", docs, now);
  const list = docs.value;
  if (
    list !== null &&
    list.length > 0 &&
    list.every((d) => d.translationRequired === false) &&
    isDecisive(docs, now)
  ) {
    return { status: "skipped", reason: "not_required_by_source", facts: [ref] };
  }
  const someRequired = list?.some((d) => d.translationRequired === true) ?? false;
  return todo(someRequired ? "applies" : "unknown_data", [ref]);
}

function languageExamStep({ profile, program, now }: ChecklistInput): Outcome {
  const record = `programs/${program.slug}`;
  const { requirements } = program;
  const languageRules = requirements.rules.flatMap((r) =>
    r.kind === "language_proficiency" ? [r] : [],
  );
  const facts = [
    ...languageRules.map((r) => toFactRef(record, `requirements.rules.${r.id}`, r.fact, now)),
    toFactRef(record, "requirements", requirements.fact, now),
  ];

  const certificateHeld = (language: string, acceptedTests: readonly string[]): boolean => {
    const certificate = profile.languages.find((l) => l.language === language)?.certificate;
    return (
      certificate !== undefined &&
      certificate !== null &&
      (acceptedTests.length === 0 || acceptedTests.includes(certificate))
    );
  };
  if (
    languageRules.length > 0 &&
    languageRules.every(
      (r) => isDecisive(r.fact, now) && certificateHeld(r.language, r.acceptedTests),
    )
  ) {
    return { status: "skipped", reason: "certificate_held", facts };
  }
  if (
    languageRules.length === 0 &&
    requirements.coverage === "complete" &&
    isDecisive(requirements.fact, now)
  ) {
    return { status: "skipped", reason: "not_required_by_source", facts };
  }
  return todo(languageRules.length > 0 ? "applies" : "unknown_data", facts);
}

function applicationAccountStep({ program, channel, now }: ChecklistInput): Outcome {
  const channelRef = toFactRef(
    `programs/${program.slug}`,
    "applicationChannel",
    program.applicationChannel,
    now,
  );
  if (channel === null) return { ...todo("unknown_data", [channelRef]), channel: null };

  const facts = [
    channelRef,
    toFactRef(`application-channels/${channel.slug}`, "", channel.fact, now),
  ];
  if (channel.accountRequired === false && isDecisive(channel.fact, now)) {
    return { status: "skipped", reason: "no_account_required", facts, channel: channel.slug };
  }
  return {
    ...todo(channel.accountRequired === true ? "applies" : "unknown_data", facts),
    channel: channel.slug,
  };
}

function submitStep({ program, now }: ChecklistInput): Outcome {
  const record = `programs/${program.slug}`;
  const intake = nextIntake(program, now);
  return {
    ...todo(intake.kind === "unknown" ? "unknown_data" : "applies", [
      toFactRef(record, "intakes", program.intakes, now),
      toFactRef(record, "applicationChannel", program.applicationChannel, now),
    ]),
    deadline: intake.kind === "upcoming" ? intake.intake.applicationDeadline : null,
    channel: program.applicationChannel.value,
  };
}

function scholarshipsStep({ scholarships, now }: ChecklistInput): Outcome {
  if (scholarships.length === 0) {
    return { status: "skipped", reason: "no_scholarships_listed", facts: [], scholarships: [] };
  }
  const sorted = [...scholarships].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  return {
    ...todo(
      "applies",
      sorted.map((s) => toFactRef(`scholarships/${s.slug}`, "deadline", s.deadline, now)),
    ),
    scholarships: sorted.map((s) => s.slug),
  };
}

const alwaysApplies = (): Outcome => todo("applies", []);

const BUILDERS: Record<StepId, (input: ChecklistInput) => Outcome> = {
  documents: documentsStep,
  translation: translationStep,
  language_exam: languageExamStep,
  application_account: applicationAccountStep,
  submit: submitStep,
  scholarships: scholarshipsStep,
  financial_documents: alwaysApplies,
  accommodation: alwaysApplies,
  visa: alwaysApplies,
  departure: alwaysApplies,
};

export function generateChecklist(input: ChecklistInput): Checklist {
  return {
    programSlug: input.program.slug,
    steps: CHECKLIST_STEP_IDS.map((id) => ({ id, ...BUILDERS[id](input) })),
  };
}
