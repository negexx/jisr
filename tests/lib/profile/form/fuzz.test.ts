import { describe, expect, it } from "vitest";

import { DraftSchema } from "@/data-schema/draft";
import { ProfileSchema } from "@/data-schema/profile";
import { parseLocaleDecimal } from "@/lib/format";
import { parseDraft } from "@/lib/profile/draft-validate";
import { buildProfile } from "@/lib/profile/form/build";
import * as options from "@/lib/profile/form/options";
import {
  draftFromForm,
  emptyFormState,
  type FormState,
  formFromDraft,
  STEPS,
} from "@/lib/profile/form/state";
import { pathStep, stepOfFirstIssue, validateStep } from "@/lib/profile/form/validate-step";
import { checkProfileAgainstReference } from "@/lib/profile/reference-checks";
import { parseProfile } from "@/lib/profile/validate";

import { coreShard } from "../core-fixture";
import { forbidConsole } from "../no-console";
import { at, edited, multiOriginCore, validForm } from "./helpers";

forbidConsole();

// mulberry32: a tiny seeded generator so a failure can be replayed.
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ALPHABET = [..."0123456789", ...",. -+e_xA/", "١", "٫", " ", "‮", "😀", "\n", "\u0000"];
const KNOWN = [
  "XA",
  "XB",
  "fr",
  "en",
  "de",
  "xx-test-cred",
  "xx-test-track-sci",
  "xx-test-math",
  "xx-test-physics",
  "xx-test-field",
  "xx-test-cert-fr",
  "xx-test-cert-en",
  "EUR",
  "MAD",
  "14",
  "14,5",
  "1000",
  "",
];

function pick<T>(next: () => number, values: readonly T[]): T {
  return values[Math.floor(next() * values.length)] as T;
}

function text(next: () => number): string {
  if (next() < 0.35) return pick(next, KNOWN);
  const length = next() < 0.05 ? 250 : Math.floor(next() * 9);
  let out = "";
  for (let index = 0; index < length; index += 1) out += pick(next, ALPHABET);
  return out;
}

function randomForm(next: () => number): FormState {
  const base = validForm();
  const list = (max: number) => Array.from({ length: Math.floor(next() * max) }, () => text(next));
  return {
    nationality: next() < 0.5 ? base.nationality : text(next),
    credential: {
      country: next() < 0.5 ? base.credential.country : text(next),
      type: next() < 0.5 ? base.credential.type : text(next),
      track: next() < 0.5 ? base.credential.track : text(next),
      status: pick(next, ["", "obtained", "expected"] as const),
      overall: next() < 0.4 ? "14" : text(next),
      subjects: Array.from({ length: Math.floor(next() * 11) }, () => ({
        subject: text(next),
        grade: text(next),
      })),
    },
    priorHigherEducationYears: next() < 0.4 ? "0" : text(next),
    languages: [
      {
        language: "fr",
        level: pick(next, ["", "A1", "B2", "C2", "unknown"] as const),
        certificate: text(next),
      },
      { language: "en", level: pick(next, ["", "B1", "unknown"] as const), certificate: "" },
      ...Array.from({ length: Math.floor(next() * 3) }, () => ({
        language: text(next),
        level: pick(next, ["", "A2"] as const),
        certificate: text(next),
      })),
    ],
    fields: next() < 0.5 ? base.fields : list(4),
    studyLanguages: list(3),
    destinations: list(3),
    institutionType: pick(next, ["public", "private", "any"] as const),
    budget: {
      amount: next() < 0.4 ? "" : text(next),
      currency: next() < 0.6 ? "EUR" : text(next),
      period: pick(next, ["month", "year"] as const),
    },
  };
}

describe("seeded fuzz", () => {
  const primary = coreShard();
  const cores = [primary, multiOriginCore()];

  it("never throws in validation, options, drafts or build, whatever the strings", () => {
    const next = random(20260930);
    for (let round = 0; round < 400; round += 1) {
      const form = randomForm(next);
      const step = Math.floor(next() * 12) - 3;
      for (const core of cores) {
        for (const id of STEPS) {
          const issues = validateStep(id, form, core);
          for (const issue of issues) {
            expect(typeof pathStep(issue.path)).toBe("string");
          }
          expect(STEPS).toContain(stepOfFirstIssue(issues));
        }
        expect(() => buildProfile(form, core)).not.toThrow();
        expect(() => emptyFormState(core)).not.toThrow();
        options.credentialTypeOptions(form, core);
        options.trackOptions(form, core);
        options.gradingScaleFor(form, core);
        options.subjectOptions(form, core);
        options.subjectOptions(form, core, step);
        for (const row of form.languages) options.certificateOptionsFor(row.language, core);
      }
      const draft = draftFromForm(form, step);
      expect(DraftSchema.safeParse(draft).success).toBe(true);
      expect(draft.step).toBe(Math.max(0, step));
      expect(formFromDraft(draft, primary).step).toBeGreaterThanOrEqual(0);
    }
  });

  it("only produces drafts the strict schema and the client parser both accept", () => {
    const next = random(7);
    for (let round = 0; round < 300; round += 1) {
      const draft = draftFromForm(randomForm(next), Math.floor(next() * 5));
      expect(DraftSchema.safeParse(draft).success).toBe(true);
      expect(parseDraft(draft)).toEqual(draft);
    }
  });

  it("never returns ok with a profile the validators would reject", () => {
    const next = random(42);
    let accepted = 0;
    let refused = 0;
    for (let round = 0; round < 600; round += 1) {
      const form = next() < 0.5 ? randomForm(next) : mutateOne(next);
      const result = buildProfile(form, primary);
      if (!result.ok) {
        refused += 1;
        expect(result.issues.length).toBeGreaterThan(0);
        continue;
      }
      accepted += 1;
      expect(parseProfile(result.profile)).toEqual(result.profile);
      expect(ProfileSchema.safeParse(result.profile).success).toBe(true);
      expect(checkProfileAgainstReference(result.profile, primary)).toEqual([]);
    }
    expect(accepted).toBeGreaterThan(20);
    expect(refused).toBeGreaterThan(20);
  });

  it("agrees with parseLocaleDecimal: a grade the model accepts is a number the parser reads", () => {
    const next = random(99);
    for (let round = 0; round < 500; round += 1) {
      const grade = text(next);
      const form = edited(validForm(), (f) => {
        f.credential.overall = grade;
      });
      const issues = validateStep("bac", form, primary);
      if (issues.length === 0) expect(parseLocaleDecimal(grade)).not.toBeNull();
    }
  });
});

function mutateOne(next: () => number): FormState {
  const target = pick(next, [
    "overall",
    "years",
    "amount",
    "grade",
    "nationality",
    "currency",
    "certificate",
  ] as const);
  const value = text(next);
  return edited(validForm(), (form) => {
    if (target === "overall") form.credential.overall = value;
    if (target === "years") form.priorHigherEducationYears = value;
    if (target === "amount") form.budget.amount = value;
    if (target === "grade") at(form.credential.subjects, 0).grade = value;
    if (target === "nationality") form.nationality = value;
    if (target === "currency") form.budget = { amount: "100", currency: value, period: "year" };
    if (target === "certificate") at(form.languages, 0).certificate = value;
  });
}
