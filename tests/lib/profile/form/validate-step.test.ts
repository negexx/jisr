import { describe, expect, it } from "vitest";

import type { CoreShard } from "@/data-schema/snapshot";
import { parseLocaleDecimal } from "@/lib/format";
import {
  AMBIGUOUS_THOUSANDS,
  pathStep,
  type StepIssue,
  type StepIssueCode,
  stepOfFirstIssue,
  validateStep,
} from "@/lib/profile/form/validate-step";

import { coreShard } from "../core-fixture";
import { forbidConsole } from "../no-console";
import { at, edited, multiOriginCore, validForm, withRealCore } from "./helpers";

forbidConsole();

const realCore = withRealCore();
const core = coreShard();

const ALL_CODES = [
  "required",
  "not_a_number",
  "ambiguous_number",
  "too_many_decimals",
  "out_of_range",
  "unknown_option",
  "certificate_language_mismatch",
  "duplicate_subject",
  "duplicate_language",
  "too_many_rows",
  "not_a_whole_number",
  "years_out_of_range",
] as const;
const everyCodeListed: [Exclude<StepIssueCode, (typeof ALL_CODES)[number]>] extends [never]
  ? true
  : false = true;

function issuesOf(form = validForm(), step: Parameters<typeof validateStep>[0] = "bac", c = core) {
  return validateStep(step, form, c);
}

function only(code: StepIssueCode, path: string, params?: StepIssue["params"]): StepIssue[] {
  return [params === undefined ? { code, path } : { code, path, params }];
}

const setLevel = (row: { level: string }, level: string) => Object.assign(row, { level });

describe("a valid form", () => {
  it("passes every step and the review, on the synthetic and the real core", () => {
    for (const step of ["bac", "languages", "preferences", "budget", "review"] as const) {
      expect(issuesOf(validForm(), step)).toEqual([]);
    }
  });

  it("passes on the real fixture core", () => {
    const form = edited(validForm(), (f) => {
      f.credential.type = "xx-test-cred";
      f.credential.subjects = [{ subject: "xx-test-subject-math", grade: "14" }];
      f.fields = ["xx-test-field-cs"];
      at(f.languages, 0).certificate = "xx-test-cert-fr";
    });
    expect(issuesOf(form, "review", realCore())).toEqual([]);
  });
});

describe("bac: places and credential", () => {
  it.each([
    ["nationality", "", "required", "nationality"],
    ["nationality", "ZZ", "unknown_option", "nationality"],
    ["country", "", "required", "credential.country"],
    ["country", "ZZ", "unknown_option", "credential.country"],
    ["type", "", "required", "credential.type"],
    ["type", "nope", "unknown_option", "credential.type"],
    ["track", "", "required", "credential.track"],
    ["track", "nope", "unknown_option", "credential.track"],
    ["status", "", "required", "credential.status"],
  ] as const)("%s %j gives %s", (field, value, code, path) => {
    const form = edited(validForm(), (f) => {
      if (field === "nationality") f.nationality = value;
      if (field === "country") f.credential.country = value;
      if (field === "type") f.credential.type = value;
      if (field === "track") f.credential.track = value;
      if (field === "status") f.credential.status = "";
    });
    expect(issuesOf(form)).toContainEqual({ code, path });
  });

  it("rejects a credential type that belongs to another country", () => {
    const multi = multiOriginCore();
    const form = edited(validForm(), (f) => {
      f.credential.country = "XB";
    });
    expect(issuesOf(form, "bac", multi)).toContainEqual({
      code: "unknown_option",
      path: "credential.type",
    });
  });

  it("rejects a track that belongs to another type", () => {
    const multi = multiOriginCore();
    const form = edited(validForm(), (f) => {
      f.credential.track = "xx-test-track-b";
    });
    expect(issuesOf(form, "bac", multi)).toEqual(only("unknown_option", "credential.track"));
  });

  it("accepts a known country that publishes no credential type as the nationality", () => {
    const form = edited(validForm(), (f) => {
      f.nationality = "XB";
    });
    expect(issuesOf(form)).toEqual([]);
  });
});

describe("bac: grades", () => {
  const overall = (text: string, status: "obtained" | "expected" = "obtained") =>
    issuesOf(
      edited(validForm(), (f) => {
        f.credential.status = status;
        f.credential.overall = text;
      }),
    );
  const range = { min: "0", max: "20" };

  it("requires an overall grade when the Bac is obtained", () => {
    expect(overall("")).toEqual(only("required", "credential.overall"));
    expect(overall("   ")).toEqual(only("required", "credential.overall"));
  });

  it("lets an expected Bac leave the overall grade empty, but checks it when typed", () => {
    expect(overall("", "expected")).toEqual([]);
    expect(overall("21", "expected")).toEqual(only("out_of_range", "credential.overall", range));
  });

  it.each([
    ["0"],
    ["20"],
    ["20.0"],
    ["14"],
    ["14,5"],
    ["14.5"],
    [" 14 "],
    ["14,"],
    [".5"],
    [",5"],
    ["14.55"],
    ["007"],
  ])("accepts %j", (text) => {
    expect(overall(text)).toEqual([]);
  });

  it("reads 14,5 and 14.5 as the same grade", () => {
    expect(parseLocaleDecimal("14,5")).toBe(parseLocaleDecimal("14.5"));
    expect(overall("14,5")).toEqual(overall("14.5"));
  });

  it.each([
    ["abc", "not_a_number"],
    ["-1", "not_a_number"],
    ["+5", "not_a_number"],
    ["1e1", "not_a_number"],
    ["1.2.3", "not_a_number"],
    ["1 4", "not_a_number"],
    [".", "not_a_number"],
    ["١٤", "not_a_number"],
    ["14٫5", "not_a_number"],
    ["1,000", "ambiguous_number"],
    ["10.000", "ambiguous_number"],
    ["0,000", "ambiguous_number"],
    ["14,555", "too_many_decimals"],
    ["14.500", "too_many_decimals"],
    ["14.5555", "too_many_decimals"],
    ["0.001", "too_many_decimals"],
  ] as const)("rejects %j as %s", (text, code) => {
    expect(overall(text)).toEqual(only(code, "credential.overall"));
  });

  it("checks the scale bounds inclusively and just outside", () => {
    expect(overall("0")).toEqual([]);
    expect(overall("20")).toEqual([]);
    expect(overall("20.01")).toEqual(only("out_of_range", "credential.overall", range));
    expect(overall("21")).toEqual(only("out_of_range", "credential.overall", range));
    expect(overall("999")).toEqual(only("out_of_range", "credential.overall", range));
  });

  it("uses the credential type's scale, including one that does not start at 0", () => {
    const lower: CoreShard = {
      ...coreShard(),
      gradingScales: [
        {
          ...at(coreShard().gradingScales, 0),
          slug: "xx-test-scale-20",
          min: 1,
          max: 5,
          direction: "lower_better",
        },
      ],
    };
    const on = (text: string) =>
      issuesOf(
        edited(validForm(), (f) => {
          f.credential.overall = text;
          f.credential.subjects = [];
        }),
        "bac",
        lower,
      );
    expect(on("1")).toEqual([]);
    expect(on("5")).toEqual([]);
    expect(on("0.9")).toEqual(only("out_of_range", "credential.overall", { min: "1", max: "5" }));
    expect(on("5.1")).toEqual(only("out_of_range", "credential.overall", { min: "1", max: "5" }));
  });

  it("uses the scale of the chosen type when several exist", () => {
    const multi = multiOriginCore();
    const form = edited(validForm(), (f) => {
      f.credential.country = "XB";
      f.credential.type = "xx-test-cred-b";
      f.credential.track = "xx-test-track-b";
      f.credential.overall = "99";
      f.credential.subjects = [];
    });
    expect(issuesOf(form, "bac", multi)).toEqual([]);
  });

  it("reports the type when a grade is typed but no scale is known", () => {
    const noScales: CoreShard = { ...coreShard(), gradingScales: [] };
    expect(issuesOf(validForm(), "bac", noScales)).toEqual(
      only("unknown_option", "credential.type"),
    );
  });

  it("does not repeat an issue on the type that is already reported", () => {
    const form = edited(validForm(), (f) => {
      f.credential.type = "nope";
    });
    const issues = issuesOf(form);
    const onType = issues.filter((issue) => issue.path === "credential.type");
    expect(onType).toEqual(only("unknown_option", "credential.type"));
  });
});

describe("bac: subject rows", () => {
  const rows = (...entries: Array<[string, string]>) =>
    edited(validForm(), (f) => {
      f.credential.subjects = entries.map(([subject, grade]) => ({ subject, grade }));
    });

  it("accepts no subject rows at all", () => {
    expect(issuesOf(rows())).toEqual([]);
  });

  it("requires a subject and a grade per row", () => {
    expect(issuesOf(rows(["", "14"]))).toEqual(only("required", "credential.subjects.0.subject"));
    expect(issuesOf(rows(["xx-test-math", ""]))).toEqual(
      only("required", "credential.subjects.0.grade"),
    );
  });

  it("rejects an unknown subject", () => {
    expect(issuesOf(rows(["xx-test-math", "14"], ["nope", "14"]))).toEqual(
      only("unknown_option", "credential.subjects.1.subject"),
    );
  });

  it("rejects a duplicate subject on the later row", () => {
    expect(issuesOf(rows(["xx-test-math", "14"], ["xx-test-math", "15"]))).toEqual(
      only("duplicate_subject", "credential.subjects.1.subject"),
    );
  });

  it("applies the grade rules to every row against the credential's scale", () => {
    expect(issuesOf(rows(["xx-test-math", "14,5"], ["xx-test-physics", "21"]))).toEqual(
      only("out_of_range", "credential.subjects.1.grade", { min: "0", max: "20" }),
    );
    expect(issuesOf(rows(["xx-test-math", "1,000"]))).toEqual(
      only("ambiguous_number", "credential.subjects.0.grade"),
    );
    expect(issuesOf(rows(["xx-test-math", "14,555"]))).toEqual(
      only("too_many_decimals", "credential.subjects.0.grade"),
    );
    expect(issuesOf(rows(["xx-test-math", "x"]))).toEqual(
      only("not_a_number", "credential.subjects.0.grade"),
    );
  });

  it("allows eight rows and rejects nine", () => {
    const many: CoreShard = {
      ...coreShard(),
      subjects: Array.from({ length: 9 }, (_unused, index) => ({
        slug: `xx-test-s${index}`,
        name: `subjects/xx-test-s${index}#name`,
      })),
    };
    const build = (count: number) =>
      edited(validForm(), (f) => {
        f.credential.track = "xx-test-track-lit";
        f.credential.subjects = Array.from({ length: count }, (_unused, index) => ({
          subject: `xx-test-s${index}`,
          grade: "10",
        }));
      });
    expect(issuesOf(build(8), "bac", many)).toEqual([]);
    expect(issuesOf(build(9), "bac", many)).toEqual(
      only("too_many_rows", "credential.subjects", { max: "8" }),
    );
  });
});

describe("bac: years of higher education", () => {
  const years = (text: string) =>
    issuesOf(
      edited(validForm(), (f) => {
        f.priorHigherEducationYears = text;
      }),
    );

  it.each([["0"], ["1"], ["2"], ["3"], [" 2 "]])("accepts %j", (text) => {
    expect(years(text)).toEqual([]);
  });

  it("requires a value", () => {
    expect(years("")).toEqual(only("required", "priorHigherEducationYears"));
  });

  it.each([
    ["1.5"],
    ["1,5"],
    ["-1"],
    ["abc"],
    ["1 0"],
    ["١"],
  ])("rejects %j as not a whole number", (text) => {
    expect(years(text)).toEqual(only("not_a_whole_number", "priorHigherEducationYears"));
  });

  it.each([["4"], ["10"], ["99999999999999999999"]])("rejects %j as out of range", (text) => {
    expect(years(text)).toEqual(
      only("years_out_of_range", "priorHigherEducationYears", { min: "0", max: "3" }),
    );
  });
});

describe("languages", () => {
  const languages = (change: (form: ReturnType<typeof validForm>) => void) =>
    issuesOf(edited(validForm(), change), "languages");

  it("requires a level on the fr and en rows, and accepts every CEFR level and unknown", () => {
    expect(
      languages((f) => {
        at(f.languages, 0).level = "";
        at(f.languages, 1).level = "";
      }),
    ).toEqual([...only("required", "languages.0.level"), ...only("required", "languages.1.level")]);
    for (const level of ["A1", "A2", "B1", "B2", "C1", "C2", "unknown"] as const) {
      expect(
        languages((f) => {
          at(f.languages, 1).level = level;
        }),
      ).toEqual([]);
    }
  });

  it("rejects a level outside CEFR and unknown", () => {
    expect(languages((f) => setLevel(at(f.languages, 0), "Z9"))).toEqual(
      only("unknown_option", "languages.0.level"),
    );
    expect(languages((f) => setLevel(at(f.languages, 0), "b2"))).toEqual(
      only("unknown_option", "languages.0.level"),
    );
  });

  it("requires the fr and en rows to be present", () => {
    expect(
      languages((f) => {
        f.languages = f.languages.filter((row) => row.language !== "fr");
      }),
    ).toEqual(only("required", "languages"));
    expect(
      languages((f) => {
        f.languages = [];
      }),
    ).toEqual(only("required", "languages"));
  });

  it("rejects a duplicate language on the later row", () => {
    expect(
      languages((f) => {
        f.languages.push({ language: "fr", level: "A1", certificate: "" });
      }),
    ).toEqual(only("duplicate_language", "languages.2.language"));
  });

  it("rejects an empty or unknown extra language and accepts one that has a certificate", () => {
    const multi = multiOriginCore();
    const withExtra = (language: string) =>
      issuesOf(
        edited(validForm(), (f) => {
          f.languages.push({ language, level: "A2", certificate: "" });
        }),
        "languages",
        multi,
      );
    expect(withExtra("de")).toEqual([]);
    expect(withExtra("")).toEqual(only("required", "languages.2.language"));
    expect(withExtra("xx")).toEqual(only("unknown_option", "languages.2.language"));
  });

  it("accepts a certificate of the row's language and no certificate", () => {
    expect(languages((f) => (at(f.languages, 0).certificate = "xx-test-cert-fr"))).toEqual([]);
    expect(languages((f) => (at(f.languages, 0).certificate = ""))).toEqual([]);
    expect(languages((f) => (at(f.languages, 1).certificate = "xx-test-cert-en-2"))).toEqual([]);
  });

  it("rejects an unknown certificate", () => {
    expect(languages((f) => (at(f.languages, 1).certificate = "nope"))).toEqual(
      only("unknown_option", "languages.1.certificate"),
    );
  });

  it("rejects a certificate of another language on the row", () => {
    expect(languages((f) => (at(f.languages, 0).certificate = "xx-test-cert-en"))).toEqual(
      only("certificate_language_mismatch", "languages.0.certificate"),
    );
    expect(languages((f) => (at(f.languages, 1).certificate = "xx-test-cert-fr"))).toEqual(
      only("certificate_language_mismatch", "languages.1.certificate"),
    );
  });
});

describe("preferences", () => {
  const preferences = (change: (form: ReturnType<typeof validForm>) => void) =>
    issuesOf(edited(validForm(), change), "preferences");

  it("requires at least one field", () => {
    expect(preferences((f) => (f.fields = []))).toEqual(only("required", "fields"));
  });

  it("rejects unknown fields, study languages and destinations at their index", () => {
    expect(preferences((f) => (f.fields = ["xx-test-field", "nope"]))).toEqual(
      only("unknown_option", "fields.1"),
    );
    expect(preferences((f) => (f.studyLanguages = ["fr", "zz"]))).toEqual(
      only("unknown_option", "studyLanguages.1"),
    );
    expect(preferences((f) => (f.destinations = ["ZZ"]))).toEqual(
      only("unknown_option", "destinations.0"),
    );
  });

  it("accepts an empty list of study languages and destinations", () => {
    expect(
      preferences((f) => {
        f.studyLanguages = [];
        f.destinations = [];
      }),
    ).toEqual([]);
  });

  it("accepts known study languages and destinations", () => {
    expect(
      preferences((f) => {
        f.studyLanguages = ["fr", "en"];
        f.destinations = ["XA", "XB"];
      }),
    ).toEqual([]);
  });

  it("checks the institution type against its three values", () => {
    for (const value of ["public", "private", "any"] as const) {
      expect(preferences((f) => (f.institutionType = value))).toEqual([]);
    }
    expect(preferences((f) => Object.assign(f, { institutionType: "state" }))).toEqual(
      only("unknown_option", "institutionType"),
    );
  });
});

describe("budget", () => {
  const budget = (amount: string, currency = "EUR", period: "month" | "year" = "month") =>
    issuesOf(
      edited(validForm(), (f) => {
        f.budget = { amount, currency, period };
      }),
      "budget",
    );

  it("is optional as a whole", () => {
    expect(budget("")).toEqual([]);
    expect(budget("   ")).toEqual([]);
    expect(budget("", "not-a-currency")).toEqual([]);
  });

  it.each([["1000"], ["0"], ["7"], [" 1000 "], ["9999999"], ["0500"]])("accepts %j", (amount) => {
    expect(budget(amount)).toEqual([]);
  });

  it.each([
    ["10.000"],
    ["1,000"],
    ["1 000"],
    ["12e3"],
    ["-5"],
    ["+5"],
    ["1.5"],
    ["abc"],
    ["1_000"],
    ["١٠"],
  ])("rejects %j as not a whole number", (amount) => {
    expect(budget(amount)).toEqual(only("not_a_whole_number", "budget.amount"));
  });

  it("rejects a whole amount beyond seven digits as out of range", () => {
    expect(budget("12345678")).toEqual(
      only("out_of_range", "budget.amount", { min: "0", max: "9999999" }),
    );
  });

  it("accepts EUR and MAD only", () => {
    expect(budget("100", "EUR")).toEqual([]);
    expect(budget("100", "MAD")).toEqual([]);
    expect(budget("100", "USD")).toEqual(only("unknown_option", "budget.currency"));
    expect(budget("100", "eur")).toEqual(only("unknown_option", "budget.currency"));
    expect(budget("100", "")).toEqual(only("unknown_option", "budget.currency"));
  });

  it("accepts month and year only", () => {
    expect(budget("100", "EUR", "year")).toEqual([]);
    expect(
      issuesOf(
        edited(validForm(), (f) => {
          f.budget = { amount: "100", currency: "EUR", period: "week" as "month" };
        }),
        "budget",
      ),
    ).toEqual(only("unknown_option", "budget.period"));
  });
});

describe("review", () => {
  it("returns the union of the four steps in step order", () => {
    const form = edited(validForm(), (f) => {
      f.nationality = "";
      at(f.languages, 0).level = "";
      f.fields = [];
      f.budget.amount = "1,5";
    });
    const review = issuesOf(form, "review");
    expect(review).toEqual([
      ...issuesOf(form, "bac"),
      ...issuesOf(form, "languages"),
      ...issuesOf(form, "preferences"),
      ...issuesOf(form, "budget"),
    ]);
    expect(review.map((issue) => issue.path)).toEqual([
      "nationality",
      "languages.0.level",
      "fields",
      "budget.amount",
    ]);
  });
});

describe("issue codes", () => {
  it("are all produced by at least one rule above", () => {
    expect(everyCodeListed).toBe(true);
    const multi = multiOriginCore();
    const produced = new Set<StepIssueCode>();
    const collect = (form: ReturnType<typeof validForm>, c: CoreShard = multi) => {
      for (const issue of issuesOf(form, "review", c)) produced.add(issue.code);
    };
    collect(edited(validForm(), (f) => (f.nationality = "")));
    collect(edited(validForm(), (f) => (f.credential.overall = "abc")));
    collect(edited(validForm(), (f) => (f.credential.overall = "1,000")));
    collect(edited(validForm(), (f) => (f.credential.overall = "14,555")));
    collect(edited(validForm(), (f) => (f.credential.overall = "99")));
    collect(edited(validForm(), (f) => (f.credential.type = "nope")));
    collect(edited(validForm(), (f) => (at(f.languages, 0).certificate = "xx-test-cert-en")));
    collect(
      edited(validForm(), (f) => {
        f.credential.subjects = [
          { subject: "xx-test-math", grade: "1" },
          { subject: "xx-test-math", grade: "1" },
        ];
      }),
    );
    collect(
      edited(validForm(), (f) =>
        f.languages.push({ language: "fr", level: "A1", certificate: "" }),
      ),
    );
    collect(
      edited(validForm(), (f) => {
        f.credential.subjects = Array.from({ length: 9 }, () => ({
          subject: "xx-test-math",
          grade: "1",
        }));
      }),
    );
    collect(edited(validForm(), (f) => (f.budget.amount = "1,5")));
    collect(edited(validForm(), (f) => (f.priorHigherEducationYears = "9")));
    expect([...produced].sort()).toEqual([...ALL_CODES].sort());
  });
});

describe("the ambiguous-thousands rule", () => {
  it("is the rule parseLocaleDecimal applies", () => {
    expect(parseLocaleDecimal("1,000")).toBeNull();
    const corpus: string[] = [];
    for (const integer of ["0", "1", "10", "100", "1000", "12345"]) {
      for (const separator of [".", ","]) {
        for (const fraction of ["", "0", "5", "50", "000", "500", "555", "5555"]) {
          corpus.push(`${integer}${separator}${fraction}`, ` ${integer}${separator}${fraction} `);
        }
      }
      corpus.push(integer);
    }
    for (const text of corpus) {
      const shape = AMBIGUOUS_THOUSANDS.test(text.trim());
      expect(parseLocaleDecimal(text) === null, JSON.stringify(text)).toBe(shape);
    }
  });
});

describe("pathStep and stepOfFirstIssue", () => {
  it.each([
    ["nationality", "bac"],
    ["credential", "bac"],
    ["credential.country", "bac"],
    ["credential.subjects.2.grade", "bac"],
    ["priorHigherEducationYears", "bac"],
    ["languages", "languages"],
    ["languages.1.certificate", "languages"],
    ["fields", "preferences"],
    ["fields.0", "preferences"],
    ["studyLanguages.1", "preferences"],
    ["destinations.0", "preferences"],
    ["institutionType", "preferences"],
    ["budget", "budget"],
    ["budget.amount", "budget"],
    ["", "review"],
    ["something.else", "review"],
    ["credentialX", "review"],
    ["fieldsX", "review"],
  ] as const)("puts %j on step %s", (path, step) => {
    expect(pathStep(path)).toBe(step);
  });

  it("names the step of the first issue, and the review for none", () => {
    expect(stepOfFirstIssue([])).toBe("review");
    expect(
      stepOfFirstIssue([
        { code: "required", path: "fields" },
        { code: "required", path: "nationality" },
      ]),
    ).toBe("preferences");
  });

  it("agrees with validateStep: every issue of a step lies on that step", () => {
    const broken = edited(validForm(), (f) => {
      f.nationality = "";
      f.credential.subjects = [{ subject: "x", grade: "y" }];
      at(f.languages, 0).level = "";
      at(f.languages, 1).certificate = "nope";
      f.fields = [];
      f.destinations = ["ZZ"];
      f.budget.amount = "x";
    });
    for (const step of ["bac", "languages", "preferences", "budget"] as const) {
      const issues = issuesOf(broken, step);
      expect(issues.length).toBeGreaterThan(0);
      for (const issue of issues) expect(pathStep(issue.path)).toBe(step);
    }
  });
});

describe("totality", () => {
  it("never throws on odd strings", () => {
    const odd = ["", " ", "\u0000", "\uD800", "‮14", "9".repeat(10_000), "__proto__", "1e999"];
    for (const text of odd) {
      const form = edited(validForm(), (f) => {
        f.nationality = text;
        f.credential.overall = text;
        f.credential.subjects = [{ subject: text, grade: text }];
        f.priorHigherEducationYears = text;
        f.budget = { amount: text, currency: text, period: "month" };
        f.languages.push({ language: text, level: "A1", certificate: text });
        f.fields = [text];
      });
      expect(() => issuesOf(form, "review")).not.toThrow();
    }
  });
});
