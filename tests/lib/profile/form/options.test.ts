import { describe, expect, it } from "vitest";

import {
  certificateOptionsFor,
  countryOptions,
  credentialTypeOptions,
  destinationOptions,
  fieldOptions,
  gradingScaleFor,
  languageRowOptions,
  MAX_SUBJECT_ROWS,
  originCountries,
  studyLanguageOptions,
  subjectOptions,
  trackOptions,
} from "@/lib/profile/form/options";
import { emptyFormState } from "@/lib/profile/form/state";
import { certificatesFor } from "@/lib/profile/reference-checks";

import { coreShard } from "../core-fixture";
import { forbidConsole } from "../no-console";
import { at, edited, multiOriginCore, validForm, withRealCore } from "./helpers";

forbidConsole();

const realCore = withRealCore();

describe("countries", () => {
  it("lists every country as a code and a text key", () => {
    expect(countryOptions(coreShard())).toEqual([
      { code: "XA", name: "countries/XA#name" },
      { code: "XB", name: "countries/XB#name" },
    ]);
  });

  it("finds the single origin of the real fixture and every other country as destination", () => {
    const core = realCore();
    expect(originCountries(core).map((country) => country.code)).toEqual(["XA"]);
    expect(destinationOptions(core).map((country) => country.code)).toEqual(["XB", "XC", "XZ"]);
  });

  it("lists each origin once, even with several credential types", () => {
    const core = multiOriginCore();
    core.credentialTypes.push({ ...at(core.credentialTypes, 0), slug: "xx-test-cred-second" });
    expect(originCountries(core).map((country) => country.code)).toEqual(["XA", "XB"]);
    expect(destinationOptions(core)).toEqual([]);
  });

  it("has no origin and every country as destination without credential types", () => {
    const core = { ...coreShard(), credentialTypes: [] };
    expect(originCountries(core)).toEqual([]);
    expect(destinationOptions(core).map((country) => country.code)).toEqual(["XA", "XB"]);
  });
});

describe("credential types, tracks and scale", () => {
  const core = multiOriginCore();

  it("offers the types of the chosen country only", () => {
    const form = edited(emptyFormState(core), (f) => {
      f.credential.country = "XB";
    });
    expect(credentialTypeOptions(form, core).map((type) => type.slug)).toEqual(["xx-test-cred-b"]);
    expect(credentialTypeOptions(emptyFormState(core), core)).toEqual([]);
  });

  it("offers the tracks of the chosen type only", () => {
    const form = validForm();
    expect(trackOptions(form, core).map((track) => track.slug)).toEqual([
      "xx-test-track-sci",
      "xx-test-track-lit",
    ]);
    expect(
      trackOptions(
        edited(form, (f) => (f.credential.type = "")),
        core,
      ),
    ).toEqual([]);
    expect(
      trackOptions(
        edited(form, (f) => (f.credential.type = "nope")),
        core,
      ),
    ).toEqual([]);
    expect(
      trackOptions(
        edited(form, (f) => (f.credential.country = "XB")),
        core,
      ),
    ).toEqual([]);
  });

  it("takes the grading scale from the chosen credential type", () => {
    expect(gradingScaleFor(validForm(), core)?.max).toBe(20);
    const b = edited(validForm(), (f) => {
      f.credential.country = "XB";
      f.credential.type = "xx-test-cred-b";
    });
    expect(gradingScaleFor(b, core)?.slug).toBe("xx-test-scale-100");
  });

  it("has no scale without a valid type, or when the type points at a missing scale", () => {
    expect(gradingScaleFor(emptyFormState(core), core)).toBeUndefined();
    expect(
      gradingScaleFor(
        edited(validForm(), (f) => (f.credential.type = "nope")),
        core,
      ),
    ).toBe(undefined);
    const broken = { ...core, gradingScales: [] };
    expect(gradingScaleFor(validForm(), broken)).toBeUndefined();
  });
});

describe("subjectOptions", () => {
  const core = coreShard();

  it("uses the curriculum of the chosen track when it lists subjects", () => {
    const withCurriculum = {
      ...core,
      subjects: [...core.subjects, { slug: "xx-test-art", name: "subjects/xx-test-art#name" }],
    };
    expect(subjectOptions(validForm(), withCurriculum).map((s) => s.slug)).toEqual([
      "xx-test-physics",
    ]);
  });

  it("falls back to every subject when the track has no list or an empty list", () => {
    const literary = edited(validForm(), (f) => {
      f.credential.track = "xx-test-track-lit";
      f.credential.subjects = [];
    });
    expect(subjectOptions(literary, core).map((s) => s.slug)).toEqual([
      "xx-test-math",
      "xx-test-physics",
    ]);
    const emptyList = {
      ...core,
      credentialTypes: [
        {
          ...at(core.credentialTypes, 0),
          tracks: [{ slug: "xx-test-track-sci", name: "Sci", gloss: null, subjects: [] }],
        },
      ],
    };
    expect(
      subjectOptions(
        edited(validForm(), (f) => (f.credential.subjects = [])),
        emptyList,
      ),
    ).toHaveLength(2);
  });

  it("falls back to every subject when no track is chosen", () => {
    expect(subjectOptions(emptyFormState(core), core)).toHaveLength(2);
  });

  it("excludes subjects used in other rows but keeps the row's own choice", () => {
    const form = edited(validForm(), (f) => {
      f.credential.subjects = [
        { subject: "xx-test-math", grade: "1" },
        { subject: "", grade: "" },
      ];
    });
    expect(subjectOptions(form, core, 1).map((s) => s.slug)).toEqual(["xx-test-physics"]);
    expect(subjectOptions(form, core, 0).map((s) => s.slug)).toEqual([
      "xx-test-math",
      "xx-test-physics",
    ]);
    expect(subjectOptions(form, core).map((s) => s.slug)).toEqual(["xx-test-physics"]);
  });

  it("works on the real fixture", () => {
    const form = edited(emptyFormState(realCore()), (f) => {
      f.credential.type = "xx-test-cred";
      f.credential.track = "xx-test-track-sci";
    });
    expect(subjectOptions(form, realCore()).map((s) => s.slug)).toEqual([
      "xx-test-subject-math",
      "xx-test-subject-phys",
    ]);
  });

  it("caps the subject rows at eight", () => {
    expect(MAX_SUBJECT_ROWS).toBe(8);
  });
});

describe("languages and certificates", () => {
  it("offers fr and en first, then any other language with a certificate, once", () => {
    const core = multiOriginCore();
    expect(languageRowOptions(core)).toEqual(["fr", "en", "de"]);
    expect(studyLanguageOptions(core)).toEqual(["fr", "en", "de"]);
  });

  it("offers fr and en even without any certificate", () => {
    const core = { ...coreShard(), languageCertificates: [] };
    expect(languageRowOptions(core)).toEqual(["fr", "en"]);
    expect(studyLanguageOptions(core)).toEqual(["fr", "en"]);
  });

  it("keeps a stable order whatever the certificate order", () => {
    const core = multiOriginCore();
    const reversed = { ...core, languageCertificates: [...core.languageCertificates].reverse() };
    expect(languageRowOptions(reversed)).toEqual(["fr", "en", "de"]);
  });

  it("constrains the certificates to the row's language", () => {
    const core = coreShard();
    expect(certificateOptionsFor("fr", core).map((c) => c.slug)).toEqual(["xx-test-cert-fr"]);
    expect(certificateOptionsFor("en", core).map((c) => c.slug)).toEqual([
      "xx-test-cert-en",
      "xx-test-cert-en-2",
    ]);
    expect(certificateOptionsFor("de", core)).toEqual([]);
    expect(certificateOptionsFor("fr", core)).toEqual(certificatesFor("fr", core));
  });
});

describe("fields", () => {
  it("lists the published fields", () => {
    expect(fieldOptions(realCore()).map((field) => field.slug)).toEqual([
      "xx-test-field-cs",
      "xx-test-field-eng",
      "xx-test-field-health",
    ]);
  });
});
