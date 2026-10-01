import { describe, expect, it } from "vitest";

import { DraftSchema } from "@/data-schema/draft";
import type { Profile } from "@/data-schema/profile";
import { parseDraft } from "@/lib/profile/draft-validate";
import {
  draftFromForm,
  emptyFormState,
  type FormState,
  formFromDraft,
  formFromProfile,
  STEPS,
} from "@/lib/profile/form/state";

import {
  E2E_PROFILE,
  E2E_PROFILE_WITH_BUDGET,
  E2E_PROFILE_XB_ONLY,
} from "../../../fixtures/e2e/profiles";
import { coreShard } from "../core-fixture";
import { forbidConsole } from "../no-console";
import { at, edited, multiOriginCore, validForm, withRealCore } from "./helpers";

forbidConsole();

const realCore = withRealCore();

describe("STEPS", () => {
  it("lists the four steps then the review", () => {
    expect(STEPS).toEqual(["bac", "languages", "preferences", "budget", "review"]);
  });
});

describe("emptyFormState", () => {
  it("preselects nationality and credential country when there is a single origin", () => {
    const form = emptyFormState(realCore());
    expect(form.nationality).toBe("XA");
    expect(form.credential.country).toBe("XA");
  });

  it("leaves both empty when there are several origins", () => {
    const form = emptyFormState(multiOriginCore());
    expect(form.nationality).toBe("");
    expect(form.credential.country).toBe("");
  });

  it("leaves both empty when no credential type is published", () => {
    const form = emptyFormState({ ...coreShard(), credentialTypes: [] });
    expect(form.nationality).toBe("");
    expect(form.credential.country).toBe("");
  });

  it("starts with everything else empty or defaulted, and preselects nothing else", () => {
    expect(emptyFormState(realCore())).toEqual({
      nationality: "XA",
      credential: {
        country: "XA",
        type: "",
        track: "",
        status: "",
        overall: "",
        subjects: [],
      },
      priorHigherEducationYears: "0",
      languages: [
        { language: "fr", level: "", certificate: "" },
        { language: "en", level: "", certificate: "" },
      ],
      fields: [],
      studyLanguages: [],
      destinations: [],
      institutionType: "any",
      budget: { amount: "", currency: "EUR", period: "month" },
    });
  });

  it("returns a fresh object each time", () => {
    const a = emptyFormState(coreShard());
    const b = emptyFormState(coreShard());
    a.fields.push("x");
    at(a.languages, 0).level = "B1";
    expect(b.fields).toEqual([]);
    expect(at(b.languages, 0).level).toBe("");
  });
});

describe("formFromProfile", () => {
  it("turns numbers into strings", () => {
    const form = formFromProfile(E2E_PROFILE);
    expect(form.credential.overall).toBe("14");
    expect(form.credential.subjects).toEqual([{ subject: "xx-test-subject-math", grade: "14" }]);
    expect(form.priorHigherEducationYears).toBe("0");
    expect(form.budget).toEqual({ amount: "", currency: "EUR", period: "month" });
  });

  it("writes decimals with a dot", () => {
    const profile: Profile = {
      ...E2E_PROFILE,
      credential: { ...E2E_PROFILE.credential, overall: { scale: "s", value: 14.5 } },
    };
    expect(formFromProfile(profile).credential.overall).toBe("14.5");
  });

  it("writes an expected credential without overall grade as an empty string", () => {
    const profile: Profile = {
      ...E2E_PROFILE,
      credential: { ...E2E_PROFILE.credential, status: "expected", overall: null },
    };
    const form = formFromProfile(profile);
    expect(form.credential.status).toBe("expected");
    expect(form.credential.overall).toBe("");
  });

  it("turns the budget minor units back into a whole amount", () => {
    const profile: Profile = {
      ...E2E_PROFILE,
      budget: { amountMinor: 100_000, currency: "EUR", period: "year" },
    };
    expect(formFromProfile(profile).budget).toEqual({
      amount: "1000",
      currency: "EUR",
      period: "year",
    });
    expect(formFromProfile(E2E_PROFILE_WITH_BUDGET).budget.amount).toBe("900");
  });

  it("uses the currency's own minor unit digits", () => {
    const yen: Profile = {
      ...E2E_PROFILE,
      budget: { amountMinor: 5000, currency: "JPY", period: "month" },
    };
    expect(formFromProfile(yen).budget.amount).toBe("5000");
  });

  it("maps null certificates to empty strings", () => {
    expect(formFromProfile(E2E_PROFILE).languages).toEqual([
      { language: "fr", level: "B2", certificate: "xx-test-cert-fr" },
      { language: "en", level: "B1", certificate: "" },
    ]);
  });

  it("adds missing fr and en rows and appends other languages in profile order", () => {
    const profile: Profile = {
      ...E2E_PROFILE,
      languages: [
        { language: "de", level: "A2", certificate: null },
        { language: "en", level: "C1", certificate: null },
        { language: "es", level: "unknown", certificate: null },
      ],
    };
    expect(formFromProfile(profile).languages).toEqual([
      { language: "fr", level: "", certificate: "" },
      { language: "en", level: "C1", certificate: "" },
      { language: "de", level: "A2", certificate: "" },
      { language: "es", level: "unknown", certificate: "" },
    ]);
  });

  it("does not share arrays with the profile", () => {
    const form = formFromProfile(E2E_PROFILE_XB_ONLY);
    form.destinations.push("XC");
    form.fields.push("x");
    expect(E2E_PROFILE_XB_ONLY.destinations).toEqual(["XB"]);
    expect(E2E_PROFILE_XB_ONLY.fields).toHaveLength(2);
  });
});

describe("draftFromForm and formFromDraft", () => {
  const full: FormState = {
    nationality: "XA",
    credential: {
      country: "XA",
      type: "xx-test-cred",
      track: "xx-test-track-sci",
      status: "expected",
      overall: "14,",
      subjects: [{ subject: "xx-test-math", grade: "15.5" }],
    },
    priorHigherEducationYears: "1",
    languages: [
      { language: "fr", level: "B2", certificate: "xx-test-cert-fr" },
      { language: "en", level: "", certificate: "" },
      { language: "de", level: "unknown", certificate: "" },
    ],
    fields: ["xx-test-field-cs"],
    studyLanguages: ["fr", "en"],
    destinations: ["XB"],
    institutionType: "public",
    budget: { amount: "9000", currency: "MAD", period: "year" },
  };

  it("produces a draft that passes parseDraft and the strict Zod schema", () => {
    const draft = draftFromForm(full, 2);
    expect(parseDraft(draft)).toEqual(draft);
    expect(DraftSchema.parse(draft)).toEqual(draft);
    expect(draft.step).toBe(2);
  });

  it("produces a valid draft from an untouched empty form", () => {
    const draft = draftFromForm(emptyFormState(coreShard()), 0);
    expect(parseDraft(draft)).toEqual(draft);
    expect(DraftSchema.parse(draft)).toEqual(draft);
  });

  it("keeps grades exactly as typed", () => {
    const draft = draftFromForm(full, 0);
    expect(draft.credential?.overall?.value).toBe("14,");
  });

  it("round-trips a form through a draft", () => {
    const { form, step } = formFromDraft(draftFromForm(full, 3), coreShard());
    expect(form).toEqual(full);
    expect(step).toBe(3);
  });

  it("round-trips the empty form through a draft", () => {
    const core = coreShard();
    const empty = emptyFormState(core);
    expect(formFromDraft(draftFromForm(empty, 0), core).form).toEqual(empty);
  });

  it("round-trips the E2E profiles through form and draft", () => {
    for (const profile of [E2E_PROFILE, E2E_PROFILE_WITH_BUDGET, E2E_PROFILE_XB_ONLY]) {
      const form = formFromProfile(profile);
      expect(formFromDraft(draftFromForm(form, 1), realCore()).form).toEqual(form);
    }
  });

  it("survives a JSON round trip", () => {
    const draft = draftFromForm(full, 1);
    expect(formFromDraft(JSON.parse(JSON.stringify(draft)), coreShard()).form).toEqual(full);
  });

  it("truncates every typed string to 200 characters", () => {
    const long = "9".repeat(300);
    const form = edited(full, (f) => {
      f.nationality = long;
      f.credential.type = long;
      f.credential.overall = long;
      f.credential.subjects = [{ subject: long, grade: long }];
      f.languages = [{ language: long, level: "B1", certificate: long }];
      f.fields = [long];
      f.studyLanguages = [long];
      f.destinations = [long];
      f.priorHigherEducationYears = long;
      f.budget = { amount: long, currency: long, period: "month" };
    });
    const draft = draftFromForm(form, 0);
    expect(parseDraft(draft)).not.toBeNull();
    expect(DraftSchema.safeParse(draft).success).toBe(true);
    expect(draft.nationality).toHaveLength(200);
    expect(draft.credential?.overall?.value).toHaveLength(200);
    expect(at(draft.credential?.subjects ?? [], 0).subject).toHaveLength(200);
    expect(at(draft.languages ?? [], 0).certificate).toHaveLength(200);
    expect(draft.fields?.at(0)).toHaveLength(200);
    expect(draft.budget?.amount).toHaveLength(200);
  });

  it("never emits a key the strict draft schema rejects", () => {
    for (const status of ["", "obtained", "expected"] as const) {
      const form = edited(full, (f) => {
        f.credential.status = status;
        f.credential.overall = "";
        at(f.languages, 0).level = "";
        at(f.languages, 0).certificate = "";
      });
      expect(DraftSchema.safeParse(draftFromForm(form, 0)).success).toBe(true);
    }
  });

  it("clamps the step into the range of steps", () => {
    const core = coreShard();
    const stepAt = (step: number) => formFromDraft(draftFromForm(full, step), core).step;
    expect(stepAt(0)).toBe(0);
    expect(stepAt(STEPS.length - 1)).toBe(STEPS.length - 1);
    expect(stepAt(99)).toBe(STEPS.length - 1);
    expect(stepAt(-4)).toBe(0);
  });

  it("overlays only the fields present in the draft", () => {
    const core = coreShard();
    const { form, step } = formFromDraft({ schemaVersion: 1, step: 1, fields: ["a"] }, core);
    expect(form).toEqual({ ...emptyFormState(core), fields: ["a"] });
    expect(step).toBe(1);
  });

  it("keeps a corrupt or unknown draft value as typed instead of trusting or dropping it", () => {
    const core = coreShard();
    const { form } = formFromDraft(
      {
        schemaVersion: 1,
        step: 0,
        nationality: "ZZ",
        credential: {
          type: "not-a-type",
          overall: { scale: "whatever", value: "abc" },
          subjects: [{ subject: "nope", grade: { scale: "s", value: "١٤" } }],
        },
        fields: ["nope"],
        languages: [{ language: "xx", level: "Z9", certificate: "nope" }],
      },
      core,
    );
    expect(form.nationality).toBe("ZZ");
    expect(form.credential.type).toBe("not-a-type");
    expect(form.credential.overall).toBe("abc");
    expect(form.credential.subjects).toEqual([{ subject: "nope", grade: "١٤" }]);
    expect(form.fields).toEqual(["nope"]);
    expect(form.languages.map((row) => row.language)).toEqual(["fr", "en", "xx"]);
    expect(at(form.languages, 2)).toEqual({ language: "xx", level: "", certificate: "nope" });
  });

  it("treats a null overall grade and a null budget as empty", () => {
    const core = coreShard();
    const { form } = formFromDraft(
      { schemaVersion: 1, step: 0, credential: { overall: null }, budget: null },
      core,
    );
    expect(form.credential.overall).toBe("");
    expect(form.budget).toEqual({ amount: "", currency: "EUR", period: "month" });
  });

  it("restores partial budget and language rows", () => {
    const core = coreShard();
    const { form } = formFromDraft(
      {
        schemaVersion: 1,
        step: 0,
        budget: { currency: "MAD" },
        languages: [{ language: "fr" }, { language: "en", certificate: null }],
      },
      core,
    );
    expect(form.budget).toEqual({ amount: "", currency: "MAD", period: "month" });
    expect(form.languages).toEqual([
      { language: "fr", level: "", certificate: "" },
      { language: "en", level: "", certificate: "" },
    ]);
  });

  it("returns a form that shares nothing with the draft", () => {
    const draft = draftFromForm(full, 0);
    const { form } = formFromDraft(draft, coreShard());
    form.fields.push("x");
    at(form.credential.subjects, 0).grade = "0";
    expect(draft.fields).toEqual(["xx-test-field-cs"]);
    expect(at(draft.credential?.subjects ?? [], 0).grade.value).toBe("15.5");
  });

  it("emits a schema-valid draft for a form that passes validation", () => {
    expect(DraftSchema.safeParse(draftFromForm(validForm(), 4)).success).toBe(true);
  });
});
