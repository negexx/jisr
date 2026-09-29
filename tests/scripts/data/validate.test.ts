import path from "node:path";
import type { LoadedFile, LoadResult } from "@scripts/data/load-data";
import { loadData } from "@scripts/data/load-data";
import { validateData } from "@scripts/data/validate";
import { describe, expect, it } from "vitest";

const FIXTURES = path.join(process.cwd(), "tests/fixtures/data");
const NOW = "2026-09-29";

function load(name: string): LoadResult {
  return loadData(path.join(FIXTURES, name));
}

function validate(name: string, now = NOW) {
  return validateData(load(name), { now });
}

type Raw = Record<string, unknown>;

function asMap(value: unknown, what: string): Raw {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${what} is not a map`);
  }
  return { ...value };
}

function mutateFile(loaded: LoadResult, file: string, edit: (raw: Raw) => void): LoadResult {
  const files = loaded.files.map((f) => {
    if (f.file !== file) return f;
    const raw = asMap(structuredClone(f.raw), file);
    edit(raw);
    return { ...f, raw };
  });
  return { ...loaded, files };
}

function addFile(loaded: LoadResult, extra: LoadedFile): LoadResult {
  return { ...loaded, files: [...loaded.files, extra].sort((a, b) => (a.file < b.file ? -1 : 1)) };
}

function copyOf(loaded: LoadResult, file: string, as: { file: string; id: string }): LoadedFile {
  const original = loaded.files.find((f) => f.file === file);
  if (!original) throw new Error(`fixture ${file} missing`);
  const raw = asMap(structuredClone(original.raw), file);
  return { ...original, ...as, raw: { ...raw, slug: as.id } };
}

function setRules(raw: Raw, edit: (rules: Raw[]) => Raw[]) {
  const requirements = asMap(raw.requirements, "requirements");
  const rules = requirements.rules;
  if (!Array.isArray(rules)) throw new Error("rules is not a list");
  raw.requirements = { ...requirements, rules: edit(rules.map((r) => asMap(r, "rule"))) };
}

describe("validateData on fixtures", () => {
  it("accepts valid-minimal with no errors and no warnings", () => {
    const result = validate("valid-minimal");
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.recordCount).toBe(16);
    expect(result.freshness.length).toBeGreaterThan(0);
    expect(result.freshness.every((row) => row.freshness === "fresh")).toBe(true);
    expect(result.translations.fr.total).toBeGreaterThan(0);
    expect(result.translations.fr.present).toBe(result.translations.fr.total);
    expect(result.translations.en.present).toBeLessThan(result.translations.en.total);
  });

  it("puts every valid record in the catalog", () => {
    const { catalog } = validate("valid-minimal");
    expect([...catalog.countries.keys()]).toEqual(["XA", "XB", "XC"]);
    expect(catalog.programs.get("xx-test-prog")?.file).toBe("programs/xx-test-prog.yaml");
  });

  it("rejects a source verified after now", () => {
    const { errors } = validate("valid-minimal", "2026-08-01");
    expect(errors).toContainEqual(
      expect.objectContaining({
        path: "sources.main.last_verified_at",
        message: expect.stringContaining("is in the future"),
      }),
    );
  });

  it("rejects unknown source keys and provenance-less records", () => {
    const { errors, catalog } = validate("invalid-missing-source");
    expect(errors).toContainEqual({
      file: "grading-scales/xx-test-scale-a.yaml",
      path: "source",
      message: 'unknown source key "nope"',
    });
    const scaleB = errors.filter((e) => e.file === "grading-scales/xx-test-scale-b.yaml");
    expect(scaleB.map((e) => e.path)).toEqual(expect.arrayContaining(["info_kind", "sources"]));
    expect(catalog["grading-scales"].has("xx-test-scale-b")).toBe(false);
  });

  it("rejects dangling references with file and field path", () => {
    const { errors } = validate("invalid-bad-reference");
    expect(errors).toEqual([
      {
        file: "grade-conversions/xx-test-conv.yaml",
        path: "from",
        message: 'unknown grading-scales "xx-test-scale-nope"',
      },
    ]);
  });

  it("rejects duplicate ids and ids that differ from the file name", () => {
    const { errors, recordCount } = validate("invalid-structure");
    expect(errors).toContainEqual({
      file: "fields/b/xx-test-dup.yaml",
      path: "",
      message: 'duplicate id "xx-test-dup" (also in fields/a/xx-test-dup.yaml)',
    });
    expect(errors).toContainEqual({
      file: "fields/xx-test-renamed.yaml",
      path: "",
      message: 'id "xx-test-other" must equal the file name "xx-test-renamed"',
    });
    expect(recordCount).toBe(3);
  });

  it("carries structural load errors through", () => {
    const { errors } = validate("invalid-structure");
    expect(errors).toContainEqual(
      expect.objectContaining({
        file: "stray.yaml",
        message: expect.stringContaining("collection"),
      }),
    );
  });

  it("classifies freshness per fact with the age in days", () => {
    const { errors, freshness } = validate("stale");
    expect(errors).toEqual([]);
    expect(freshness).toEqual([
      expect.objectContaining({
        file: "grading-scales/xx-test-scale-aging.yaml",
        path: "",
        class: "stable",
        freshness: "aging",
        ageDays: 271,
        lastVerifiedAt: "2026-01-01",
      }),
      expect.objectContaining({
        file: "grading-scales/xx-test-scale-old.yaml",
        freshness: "stale",
        lastVerifiedAt: "2020-01-01",
      }),
    ]);
  });

  it("counts translation coverage per locale", () => {
    expect(validate("missing-translation").translations).toEqual({
      fr: { present: 2, reviewed: 2, total: 2 },
      en: { present: 1, reviewed: 0, total: 2 },
      ar: { present: 0, reviewed: 0, total: 2 },
    });
  });

  it("reports empty data as zero records", () => {
    const result = validateData({ files: [], errors: [] }, { now: NOW });
    expect(result.recordCount).toBe(0);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});

describe("validateData mutations of valid-minimal", () => {
  const base = load("valid-minimal");
  const PROG = "programs/xx-test-prog.yaml";
  const SCHOL = "scholarships/xx-test-schol.yaml";
  const ROUTE = "admission-routes/xx-test-route-xa-xb.yaml";
  const CRED = "credential-types/xx-test-cred.yaml";

  type Case = {
    name: string;
    build: () => LoadResult;
    kind: "errors" | "warnings";
    file: string;
    path: string;
    message: string;
  };

  const cases: Case[] = [
    {
      name: "unused source",
      build: () =>
        mutateFile(base, "grading-scales/xx-test-scale-5.yaml", (raw) => {
          raw.sources = {
            main: { url: "https://example.org/xx-test", last_verified_at: "2026-09-01" },
            extra: { url: "https://example.org/xx-extra", last_verified_at: "2026-09-01" },
          };
        }),
      kind: "warnings",
      file: "grading-scales/xx-test-scale-5.yaml",
      path: "sources.extra",
      message: 'source "extra" is never used',
    },
    {
      name: "complete coverage without rules",
      build: () => mutateFile(base, SCHOL, (raw) => setRules(raw, () => [])),
      kind: "errors",
      file: SCHOL,
      path: "requirements.coverage",
      message:
        "complete coverage needs at least one rule; use partial while requirements are unpublished",
    },
    {
      name: "complete coverage with a manual_check rule",
      build: () =>
        mutateFile(base, SCHOL, (raw) =>
          setRules(raw, (rules) => [
            ...rules,
            {
              id: "xx-test-rule-manual",
              kind: "manual_check",
              source: "main",
              info_kind: "official",
              note: { fr: { text: "A verifier test", status: "draft" } },
            },
          ]),
        ),
      kind: "warnings",
      file: SCHOL,
      path: "requirements",
      message: 'coverage is complete but rule "xx-test-rule-manual" is manual_check',
    },
    {
      name: "program city that differs from its institution",
      build: () =>
        mutateFile(base, PROG, (raw) => {
          raw.city = "xx-test-other";
        }),
      kind: "errors",
      file: PROG,
      path: "city",
      message: "program country/city must match institution xx-test-inst",
    },
    {
      name: "duplicate admission route",
      build: () =>
        addFile(
          base,
          copyOf(base, ROUTE, {
            file: "admission-routes/xx-test-zz-route.yaml",
            id: "xx-test-zz-route",
          }),
        ),
      kind: "errors",
      file: "admission-routes/xx-test-zz-route.yaml",
      path: "",
      message: "duplicate admission route (also admission-routes/xx-test-route-xa-xb.yaml)",
    },
    {
      name: "duplicate cost profile",
      build: () =>
        addFile(
          base,
          copyOf(base, "cost-profiles/xx-test-costs-xb.yaml", {
            file: "cost-profiles/xx-test-zz-costs.yaml",
            id: "xx-test-zz-costs",
          }),
        ),
      kind: "errors",
      file: "cost-profiles/xx-test-zz-costs.yaml",
      path: "",
      message:
        "duplicate cost profile for XB/country-wide (also cost-profiles/xx-test-costs-xb.yaml)",
    },
    {
      name: "duplicate grade conversion",
      build: () =>
        addFile(
          base,
          copyOf(base, "grade-conversions/xx-test-conv-20-to-5.yaml", {
            file: "grade-conversions/xx-test-zz-conv.yaml",
            id: "xx-test-zz-conv",
          }),
        ),
      kind: "errors",
      file: "grade-conversions/xx-test-zz-conv.yaml",
      path: "",
      message: "duplicate grade conversion (also grade-conversions/xx-test-conv-20-to-5.yaml)",
    },
    {
      name: "unknown accepted language test",
      build: () =>
        mutateFile(base, PROG, (raw) =>
          setRules(raw, (rules) =>
            rules.map((r) =>
              r.id === "xx-test-rule-language" ? { ...r, acceptedTests: ["xx-test-nope"] } : r,
            ),
          ),
        ),
      kind: "errors",
      file: PROG,
      path: "requirements.rules.xx-test-rule-language.acceptedTests.0",
      message: 'unknown language-certificates "xx-test-nope"',
    },
    {
      name: "unknown track in a route condition",
      build: () =>
        mutateFile(base, ROUTE, (raw) => {
          raw.conditions = [
            {
              id: "xx-test-cond-track",
              kind: "credential_track_in",
              source: "main",
              info_kind: "official",
              tracks: ["xx-test-nope"],
            },
          ];
        }),
      kind: "errors",
      file: ROUTE,
      path: "conditions.xx-test-cond-track.tracks.0",
      message: 'unknown track "xx-test-nope"',
    },
    {
      name: "unknown scholarship on a program",
      build: () =>
        mutateFile(base, PROG, (raw) => {
          raw.scholarships = ["xx-test-nope"];
        }),
      kind: "errors",
      file: PROG,
      path: "scholarships.0",
      message: 'unknown scholarships "xx-test-nope"',
    },
    {
      name: "unknown grading scale on a credential type",
      build: () =>
        mutateFile(base, CRED, (raw) => {
          raw.gradingScale = "xx-test-nope";
        }),
      kind: "errors",
      file: CRED,
      path: "gradingScale",
      message: 'unknown grading-scales "xx-test-nope"',
    },
    {
      name: "unknown subject on a track",
      build: () =>
        mutateFile(base, CRED, (raw) => {
          raw.tracks = [
            { slug: "xx-test-track", name: "XX Test Track", subjects: ["xx-test-nope"] },
          ];
        }),
      kind: "errors",
      file: CRED,
      path: "tracks.xx-test-track.subjects.0",
      message: 'unknown subjects "xx-test-nope"',
    },
    {
      name: "unknown credential type in a rule",
      build: () =>
        mutateFile(base, SCHOL, (raw) =>
          setRules(raw, (rules) => rules.map((r) => ({ ...r, types: ["xx-test-nope"] }))),
        ),
      kind: "errors",
      file: SCHOL,
      path: "requirements.rules.xx-test-rule-cred.types.0",
      message: 'unknown credential-types "xx-test-nope"',
    },
    {
      name: "unknown country in scholarship destinations",
      build: () =>
        mutateFile(base, SCHOL, (raw) => {
          raw.destinations = ["XZ"];
        }),
      kind: "errors",
      file: SCHOL,
      path: "destinations.0",
      message: 'unknown countries "XZ"',
    },
    {
      name: "unknown country on an institution",
      build: () =>
        mutateFile(base, "institutions/xx-test-inst.yaml", (raw) => {
          raw.country = "XZ";
        }),
      kind: "errors",
      file: "institutions/xx-test-inst.yaml",
      path: "country",
      message: 'unknown countries "XZ"',
    },
    {
      name: "unknown field on a scholarship",
      build: () =>
        mutateFile(base, SCHOL, (raw) => {
          raw.fields = ["xx-test-nope"];
        }),
      kind: "errors",
      file: SCHOL,
      path: "fields.0",
      message: 'unknown fields "xx-test-nope"',
    },
    {
      name: "unknown application channel on a program",
      build: () =>
        mutateFile(base, PROG, (raw) => {
          raw.applicationChannel = { value: "xx-test-nope", source: "main", info_kind: "official" };
        }),
      kind: "errors",
      file: PROG,
      path: "applicationChannel.value",
      message: 'unknown application-channels "xx-test-nope"',
    },
    {
      name: "unknown source key on a rule",
      build: () =>
        mutateFile(base, SCHOL, (raw) =>
          setRules(raw, (rules) => rules.map((r) => ({ ...r, source: "nope" }))),
        ),
      kind: "errors",
      file: SCHOL,
      path: "requirements.rules.xx-test-rule-cred.source",
      message: 'unknown source key "nope"',
    },
    {
      name: "estimate cost line without a basis",
      build: () =>
        mutateFile(base, "cost-profiles/xx-test-costs-xb.yaml", (raw) => {
          raw.lines = {
            housing: {
              value: { min: 40000, max: 70000, currency: "XTS", per: "month" },
              source: "main",
              info_kind: "estimate",
            },
          };
        }),
      kind: "errors",
      file: "cost-profiles/xx-test-costs-xb.yaml",
      path: "lines.housing.basis",
      message: "basis is required when info_kind is estimate",
    },
    {
      name: "unknown key on a record",
      build: () =>
        mutateFile(base, "fields/xx-test-field.yaml", (raw) => {
          raw.extra = 1;
        }),
      kind: "errors",
      file: "fields/xx-test-field.yaml",
      path: "",
      message: "Unrecognized key",
    },
  ];

  it.each(cases)("$name", ({ build, kind, file, path: issuePath, message }) => {
    const result = validateData(build(), { now: NOW });
    expect(result[kind]).toContainEqual({
      file,
      path: issuePath,
      message: expect.stringContaining(message),
    });
  });

  it("leaves the untouched base clean", () => {
    const result = validateData(base, { now: NOW });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});

describe("validateData warnings on suspicious but valid data", () => {
  const base = load("valid-minimal");
  const PROG = "programs/xx-test-prog.yaml";
  const ROUTE = "admission-routes/xx-test-route-xa-xb.yaml";
  const COSTS = "cost-profiles/xx-test-costs-xb.yaml";
  const anyCertificate = (id: string) =>
    `language rule "${id}" requires a certificate but lists no acceptedTests: any certificate would count regardless of language; list the accepted tests`;

  it("warns on a language rule that needs a certificate but lists no accepted tests (program)", () => {
    const result = validateData(
      mutateFile(base, PROG, (raw) =>
        setRules(raw, (rules) =>
          rules.map((r) => (r.id === "xx-test-rule-language" ? { ...r, acceptedTests: [] } : r)),
        ),
      ),
      { now: NOW },
    );
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([
      {
        file: PROG,
        path: "requirements.rules.xx-test-rule-language",
        message: anyCertificate("xx-test-rule-language"),
      },
    ]);
  });

  it("warns on the same language rule in scholarship requirements", () => {
    const SCHOL = "scholarships/xx-test-schol.yaml";
    const result = validateData(
      mutateFile(base, SCHOL, (raw) =>
        setRules(raw, (rules) => [
          ...rules,
          {
            id: "xx-test-rule-language",
            kind: "language_proficiency",
            source: "main",
            info_kind: "official",
            language: "xx",
            minCefr: "B2",
            certificateRequired: true,
            acceptedTests: [],
          },
        ]),
      ),
      { now: NOW },
    );
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([
      {
        file: SCHOL,
        path: "requirements.rules.xx-test-rule-language",
        message: anyCertificate("xx-test-rule-language"),
      },
    ]);
  });

  it("warns on the same language rule in a route condition", () => {
    const result = validateData(
      mutateFile(base, ROUTE, (raw) => {
        raw.conditions = [
          {
            id: "xx-test-cond-language",
            kind: "language_proficiency",
            source: "main",
            info_kind: "official",
            language: "xx",
            minCefr: "B2",
            certificateRequired: true,
            acceptedTests: [],
          },
        ];
      }),
      { now: NOW },
    );
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([
      {
        file: ROUTE,
        path: "conditions.xx-test-cond-language",
        message: anyCertificate("xx-test-cond-language"),
      },
    ]);
  });

  it.each([
    ["certificate not required", { certificateRequired: false, acceptedTests: [] }],
    ["certificate requirement unpublished", { certificateRequired: null, acceptedTests: [] }],
  ])("does not warn when %s", (_n, fields) => {
    const result = validateData(
      mutateFile(base, PROG, (raw) =>
        setRules(raw, (rules) =>
          rules.map((r) => (r.id === "xx-test-rule-language" ? { ...r, ...fields } : r)),
        ),
      ),
      { now: NOW },
    );
    expect(result.warnings).toEqual([]);
  });

  it("warns on a cost profile whose city matches no institution city", () => {
    const result = validateData(
      mutateFile(base, COSTS, (raw) => {
        raw.city = "xx-test-typo-city";
      }),
      { now: NOW },
    );
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([
      {
        file: COSTS,
        path: "city",
        message:
          'cost profile city "xx-test-typo-city" matches no institution city; a typo would silently fall back to country-level costs',
      },
    ]);
  });

  it("does not warn when the cost profile city is an institution city", () => {
    const result = validateData(
      mutateFile(base, COSTS, (raw) => {
        raw.city = "xx-test-city";
      }),
      { now: NOW },
    );
    expect(result.warnings).toEqual([]);
  });
});

describe("validateData referential checks: one failing row per reference", () => {
  const base = load("valid-minimal");
  const PROG = "programs/xx-test-prog.yaml";
  const ROUTE = "admission-routes/xx-test-route-xa-xb.yaml";
  const NOPE = "xx-test-nope";

  const condition = (fields: Raw): Raw => ({
    id: "xx-test-cond-x",
    source: "main",
    info_kind: "official",
    ...fields,
  });
  const withCondition = (fields: Raw) => (raw: Raw) => {
    raw.conditions = [condition(fields)];
  };
  const withProgramRule = (fields: Raw) => (raw: Raw) =>
    setRules(raw, (rules) => [
      ...rules,
      { id: "xx-test-rule-x", source: "main", info_kind: "official", ...fields },
    ]);
  const setKey = (key: string, value: unknown) => (raw: Raw) => {
    raw[key] = value;
  };

  type Row = {
    name: string;
    file: string;
    edit: (raw: Raw) => void;
    path: string;
    message: string;
  };

  const unknown = (collection: string, slug = NOPE) => `unknown ${collection} "${slug}"`;
  const MISMATCH = "program country/city must match institution xx-test-inst";

  const rows: Row[] = [
    {
      name: "program institution",
      file: PROG,
      edit: setKey("institution", NOPE),
      path: "institution",
      message: unknown("institutions"),
    },
    {
      name: "program field",
      file: PROG,
      edit: setKey("field", NOPE),
      path: "field",
      message: unknown("fields"),
    },
    {
      name: "program country differs from institution",
      file: PROG,
      edit: setKey("country", "XA"),
      path: "country",
      message: MISMATCH,
    },
    {
      name: "program city differs from institution",
      file: PROG,
      edit: setKey("city", "xx-test-other"),
      path: "city",
      message: MISMATCH,
    },
    {
      name: "program country",
      file: PROG,
      edit: setKey("country", "XZ"),
      path: "country",
      message: unknown("countries", "XZ"),
    },
    {
      name: "overall_grade_min scale",
      file: PROG,
      edit: (raw) =>
        setRules(raw, (rules) =>
          rules.map((r) => (r.id === "xx-test-rule-grade" ? { ...r, scale: NOPE } : r)),
        ),
      path: "requirements.rules.xx-test-rule-grade.scale",
      message: unknown("grading-scales"),
    },
    {
      name: "subject_grade_min subject",
      file: PROG,
      edit: withProgramRule({
        kind: "subject_grade_min",
        subject: NOPE,
        scale: "xx-test-scale-5",
        threshold: null,
      }),
      path: "requirements.rules.xx-test-rule-x.subject",
      message: unknown("subjects"),
    },
    {
      name: "subject_grade_min scale",
      file: PROG,
      edit: withProgramRule({
        kind: "subject_grade_min",
        subject: "xx-test-subject-math",
        scale: NOPE,
        threshold: null,
      }),
      path: "requirements.rules.xx-test-rule-x.scale",
      message: unknown("grading-scales"),
    },
    {
      name: "subject_taken subjects",
      file: PROG,
      edit: (raw) =>
        setRules(raw, (rules) =>
          rules.map((r) => (r.id === "xx-test-rule-subject" ? { ...r, subjects: [NOPE] } : r)),
        ),
      path: "requirements.rules.xx-test-rule-subject.subjects.0",
      message: unknown("subjects"),
    },
    {
      name: "route credentialType",
      file: ROUTE,
      edit: setKey("credentialType", NOPE),
      path: "credentialType",
      message: unknown("credential-types"),
    },
    {
      name: "route applicationChannels",
      file: ROUTE,
      edit: setKey("applicationChannels", [NOPE]),
      path: "applicationChannels.0",
      message: unknown("application-channels"),
    },
    {
      name: "route origin",
      file: ROUTE,
      edit: setKey("origin", "XZ"),
      path: "origin",
      message: unknown("countries", "XZ"),
    },
    {
      name: "route destination",
      file: ROUTE,
      edit: setKey("destination", "XZ"),
      path: "destination",
      message: unknown("countries", "XZ"),
    },
    {
      name: "route condition overall_grade_min scale",
      file: ROUTE,
      edit: withCondition({ kind: "overall_grade_min", scale: NOPE, threshold: null }),
      path: "conditions.xx-test-cond-x.scale",
      message: unknown("grading-scales"),
    },
    {
      name: "route condition subject_grade_min subject",
      file: ROUTE,
      edit: withCondition({
        kind: "subject_grade_min",
        subject: NOPE,
        scale: "xx-test-scale-5",
        threshold: null,
      }),
      path: "conditions.xx-test-cond-x.subject",
      message: unknown("subjects"),
    },
    {
      name: "route condition subject_grade_min scale",
      file: ROUTE,
      edit: withCondition({
        kind: "subject_grade_min",
        subject: "xx-test-subject-math",
        scale: NOPE,
        threshold: null,
      }),
      path: "conditions.xx-test-cond-x.scale",
      message: unknown("grading-scales"),
    },
    {
      name: "route condition subject_taken subjects",
      file: ROUTE,
      edit: withCondition({ kind: "subject_taken", subjects: [NOPE], mode: "all" }),
      path: "conditions.xx-test-cond-x.subjects.0",
      message: unknown("subjects"),
    },
    {
      name: "route condition credential_type_in types",
      file: ROUTE,
      edit: withCondition({ kind: "credential_type_in", types: [NOPE] }),
      path: "conditions.xx-test-cond-x.types.0",
      message: unknown("credential-types"),
    },
    {
      name: "route condition language_proficiency acceptedTests",
      file: ROUTE,
      edit: withCondition({
        kind: "language_proficiency",
        language: "xx",
        minCefr: null,
        certificateRequired: null,
        acceptedTests: [NOPE],
      }),
      path: "conditions.xx-test-cond-x.acceptedTests.0",
      message: unknown("language-certificates"),
    },
    {
      name: "grade conversion to",
      file: "grade-conversions/xx-test-conv-20-to-5.yaml",
      edit: setKey("to", NOPE),
      path: "to",
      message: unknown("grading-scales"),
    },
    {
      name: "grade conversion from",
      file: "grade-conversions/xx-test-conv-20-to-5.yaml",
      edit: setKey("from", NOPE),
      path: "from",
      message: unknown("grading-scales"),
    },
    {
      name: "application channel country",
      file: "application-channels/xx-test-channel.yaml",
      edit: setKey("country", "XZ"),
      path: "country",
      message: unknown("countries", "XZ"),
    },
    {
      name: "credential type country",
      file: "credential-types/xx-test-cred.yaml",
      edit: setKey("country", "XZ"),
      path: "country",
      message: unknown("countries", "XZ"),
    },
    {
      name: "cost profile country",
      file: "cost-profiles/xx-test-costs-xb.yaml",
      edit: setKey("country", "XZ"),
      path: "country",
      message: unknown("countries", "XZ"),
    },
    {
      name: "grading scale country",
      file: "grading-scales/xx-test-scale-5.yaml",
      edit: setKey("country", "XZ"),
      path: "country",
      message: unknown("countries", "XZ"),
    },
    {
      name: "scholarship eligibleNationalities",
      file: "scholarships/xx-test-schol.yaml",
      edit: setKey("eligibleNationalities", ["XZ"]),
      path: "eligibleNationalities.0",
      message: unknown("countries", "XZ"),
    },
  ];

  it.each(rows)("$name", ({ file, edit, path: issuePath, message }) => {
    const result = validateData(mutateFile(base, file, edit), { now: NOW });
    expect(result.errors).toContainEqual({ file, path: issuePath, message });
  });

  it("rejects an http:// source URL at the schema stage", () => {
    const result = validateData(
      mutateFile(base, "grading-scales/xx-test-scale-5.yaml", (raw) => {
        raw.sources = {
          main: { url: "http://example.org/xx-test", last_verified_at: "2026-09-01" },
        };
      }),
      { now: NOW },
    );
    expect(result.errors).toContainEqual({
      file: "grading-scales/xx-test-scale-5.yaml",
      path: "sources.main.url",
      message: "Expected an https URL",
    });
  });
});

describe("validateData product decisions", () => {
  const base = load("valid-minimal");
  const PROG = "programs/xx-test-prog.yaml";
  const SCHOL = "scholarships/xx-test-schol.yaml";
  const NO_RULES =
    "complete coverage needs at least one rule; use partial while requirements are unpublished";
  const NOT_OFFICIAL =
    "tuition must be an official published fee; leave the value null when it is not published, the app then shows it as to-be-checked";
  const NO_LANGUAGE_RULE = (langs: string) =>
    `program teaches in ${langs} but declares no language requirement; confirm the published requirement or mark coverage partial`;
  const basis = { fr: { text: "Base test", status: "draft" } };
  const tuitionWith = (fields: Raw) => (raw: Raw) => {
    raw.tuition = { ...asMap(raw.tuition, "tuition"), ...fields };
  };
  const setCoverage = (coverage: string) => (raw: Raw) => {
    raw.requirements = { ...asMap(raw.requirements, "requirements"), coverage };
  };
  const dropRules =
    (...ids: string[]) =>
    (raw: Raw) =>
      setRules(raw, (rules) => rules.filter((r) => !ids.includes(String(r.id))));

  describe("tuition must be official", () => {
    it.each([
      ["estimate", { info_kind: "estimate", basis }],
      ["guidance", { info_kind: "guidance" }],
    ])("errors on a non-null %s tuition", (_n, fields) => {
      const result = validateData(mutateFile(base, PROG, tuitionWith(fields)), { now: NOW });
      expect(result.errors).toEqual([
        { file: PROG, path: "tuition.info_kind", message: NOT_OFFICIAL },
      ]);
    });

    it.each([
      ["official", { value: null }],
      ["estimate", { value: null, info_kind: "estimate", basis }],
      ["guidance", { value: null, info_kind: "guidance" }],
    ])("accepts a null tuition with info_kind %s", (_n, fields) => {
      const result = validateData(mutateFile(base, PROG, tuitionWith(fields)), { now: NOW });
      expect(result.errors).toEqual([]);
    });
  });

  describe("complete coverage needs rules", () => {
    it("errors on a program with complete coverage and no rules", () => {
      const result = validateData(
        mutateFile(base, PROG, (raw) => {
          setCoverage("complete")(raw);
          setRules(raw, () => []);
        }),
        { now: NOW },
      );
      expect(result.errors).toEqual([
        { file: PROG, path: "requirements.coverage", message: NO_RULES },
      ]);
    });

    it("errors on a scholarship with complete coverage and no rules", () => {
      const result = validateData(
        mutateFile(base, SCHOL, (raw) => setRules(raw, () => [])),
        { now: NOW },
      );
      expect(result.errors).toEqual([
        { file: SCHOL, path: "requirements.coverage", message: NO_RULES },
      ]);
    });

    it("accepts partial coverage with no rules", () => {
      const result = validateData(
        mutateFile(
          base,
          PROG,
          dropRules(
            "xx-test-rule-grade",
            "xx-test-rule-subject",
            "xx-test-rule-language",
            "xx-test-rule-manual",
          ),
        ),
        { now: NOW },
      );
      expect(result.errors).toEqual([]);
    });
  });

  describe("teaching language without a language rule", () => {
    const complete = (raw: Raw) => {
      setCoverage("complete")(raw);
      dropRules("xx-test-rule-manual")(raw);
    };

    it("warns when coverage is complete and no language rule exists", () => {
      const result = validateData(
        mutateFile(base, PROG, (raw) => {
          complete(raw);
          dropRules("xx-test-rule-language")(raw);
        }),
        { now: NOW },
      );
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([
        { file: PROG, path: "requirements", message: NO_LANGUAGE_RULE("xx") },
      ]);
    });

    it("lists every teaching language", () => {
      const result = validateData(
        mutateFile(base, PROG, (raw) => {
          complete(raw);
          dropRules("xx-test-rule-language")(raw);
          raw.teachingLanguages = {
            ...asMap(raw.teachingLanguages, "teachingLanguages"),
            value: ["xx", "yy"],
          };
        }),
        { now: NOW },
      );
      expect(result.warnings).toEqual([
        { file: PROG, path: "requirements", message: NO_LANGUAGE_RULE("xx, yy") },
      ]);
    });

    it("does not warn when a language rule is present", () => {
      const result = validateData(mutateFile(base, PROG, complete), { now: NOW });
      expect(result.warnings).toEqual([]);
    });

    it("does not warn when teachingLanguages is unpublished", () => {
      const result = validateData(
        mutateFile(base, PROG, (raw) => {
          complete(raw);
          dropRules("xx-test-rule-language")(raw);
          raw.teachingLanguages = {
            ...asMap(raw.teachingLanguages, "teachingLanguages"),
            value: null,
          };
        }),
        { now: NOW },
      );
      expect(result.warnings).toEqual([]);
    });

    it("does not warn when coverage is partial", () => {
      const result = validateData(
        mutateFile(base, PROG, (raw) => {
          dropRules("xx-test-rule-manual", "xx-test-rule-language")(raw);
        }),
        { now: NOW },
      );
      expect(result.warnings).toEqual([]);
    });
  });
});
