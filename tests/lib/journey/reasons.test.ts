import { createTranslator } from "next-intl";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Program } from "@/data-schema/resolved";
import { matchProgram } from "@/domain/match";
import { resolveRoute } from "@/domain/route";
import type { Reason, ReasonValue } from "@/domain/types";
import type { AppLocale } from "@/i18n/routing";
import { MESSAGE_ARGS, REASON_CODES, REASON_KINDS } from "@/lib/i18n/vocabulary";
import {
  describeReason,
  NEUTRAL_PARAM,
  type Params,
  type ReasonContext,
  ruleIndex,
} from "@/lib/journey/reasons";
import type { SnapshotBundle } from "@/lib/snapshot/client";
import ar from "../../../messages/ar.json";
import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";

import { E2E_NOW, E2E_PROFILE, E2E_SLUGS } from "../../fixtures/e2e/profiles";
import { forbidConsole } from "../profile/no-console";
import { buildSnapshot, E2E_DATA_DIR, removeTempDirs } from "../snapshot/fixture";
import { allPrograms, loadMatchesBundle, programOf } from "./bundle";

forbidConsole();

const LOCALES = ["fr", "en", "ar"] as const satisfies readonly AppLocale[];
const CATALOGS: Record<AppLocale, unknown> = { fr, en, ar };
const ARABIC_INDIC_DIGITS = /[٠-٩۰-۹]/;

let bundles: Record<AppLocale, SnapshotBundle>;

beforeAll(async () => {
  const dir = buildSnapshot(E2E_DATA_DIR);
  bundles = {
    fr: await loadMatchesBundle(dir, E2E_PROFILE, "fr"),
    en: await loadMatchesBundle(dir, E2E_PROFILE, "en"),
    ar: await loadMatchesBundle(dir, E2E_PROFILE, "ar"),
  };
}, 180_000);

afterAll(removeTempDirs);

function messageAt(locale: AppLocale, key: string): unknown {
  let node: unknown = CATALOGS[locale];
  for (const part of key.split(".")) {
    node = typeof node === "object" && node !== null ? Reflect.get(node, part) : undefined;
  }
  return node;
}

function routeFor(bundle: SnapshotBundle, program: Program) {
  return resolveRoute(E2E_PROFILE, program.country, bundle.routes?.routes ?? []);
}

function ctxFor(locale: AppLocale, slug: string = E2E_SLUGS.ok): ReasonContext {
  const bundle = bundles[locale];
  const core = bundle.core;
  if (core === undefined) throw new Error("fixture bundle has no core");
  const program = programOf(bundle, slug);
  return { locale, core, text: bundle.text, rules: ruleIndex(program, routeFor(bundle, program)) };
}

function base(kind: Reason["kind"], code: Reason["code"], ruleId = "x"): Reason {
  return { ruleId, kind, outcome: "unknown", code, facts: [] };
}

function expectPlainParams(params: Record<string, unknown>) {
  for (const [name, value] of Object.entries(params)) {
    expect(["string", "number"], name).toContain(typeof value);
  }
}

describe("describeReason: vocabulary coverage", () => {
  it("gives every kind x code the code's message key with its ICU arguments filled", () => {
    for (const locale of LOCALES) {
      const ctx = ctxFor(locale);
      for (const kind of REASON_KINDS) {
        for (const code of REASON_CODES) {
          const view = describeReason(base(kind, code), ctx);
          expect(view.key).toBe(`domain.reason.code.${code}`);
          expect(view.kindKey).toBe(`domain.reason.kind.${kind}`);
          expect(typeof messageAt(locale, view.key), `${locale} ${view.key}`).toBe("string");
          expect(typeof messageAt(locale, view.kindKey), view.kindKey).toBe("string");
          expect(view.kind).toBe(kind);
          expect(view.code).toBe(code);
          for (const arg of MESSAGE_ARGS[view.key] ?? []) {
            expect(view.params, `${kind} ${code} ${arg}`).toHaveProperty(arg);
          }
          expectPlainParams(view.params);
        }
      }
    }
  });
});

type Row = {
  name: string;
  slug?: string;
  reason: Reason;
  expected: Record<AppLocale, Record<string, string>>;
  // Default: the code's key and the plain kind label.
  key?: string;
  kindKey?: string;
};

const FRENCH_NAME = { fr: "français", en: "French", ar: "الفرنسية" } as const;

const same = (params: Record<string, string>) => ({ fr: params, en: params, ar: params });

const ROWS: Row[] = [
  {
    name: "grade on the rule's scale, decimal student value",
    slug: E2E_SLUGS.fail,
    reason: {
      ...base("overall_grade_min", "below_threshold", "xx-test-rule-grade"),
      outcome: "fail",
      student: { scale: "xx-test-scale-20", value: 14.5 },
      required: 16,
    },
    expected: {
      fr: { student: "14,5 / 20", required: "16 / 20" },
      en: { student: "14.5 / 20", required: "16 / 20" },
      ar: { student: "14,5 / 20", required: "16 / 20" },
    },
  },
  {
    name: "converted grade: the threshold is on the rule's scale",
    reason: {
      ...base("overall_grade_min", "ok", "xx-test-rule-grade"),
      outcome: "pass",
      student: { scale: "xx-test-scale-20", value: 14 },
      studentConverted: { scale: "xx-test-scale-5", value: 2.8 },
      required: 3,
    },
    expected: {
      fr: { student: "14 / 20", studentConverted: "2,8 / 5", required: "3 / 5" },
      en: { student: "14 / 20", studentConverted: "2.8 / 5", required: "3 / 5" },
      ar: { student: "14 / 20", studentConverted: "2,8 / 5", required: "3 / 5" },
    },
  },
  {
    name: "a converted grade below the minimum uses the conversion wording",
    reason: {
      ...base("overall_grade_min", "below_threshold", "xx-test-rule-grade"),
      outcome: "fail",
      student: { scale: "xx-test-scale-20", value: 11 },
      studentConverted: { scale: "xx-test-scale-5", value: 4.3 },
      required: 3,
    },
    key: "domain.reason.code.below_threshold_converted",
    expected: {
      fr: { student: "11 / 20", studentConverted: "4,3 / 5", required: "3 / 5" },
      en: { student: "11 / 20", studentConverted: "4.3 / 5", required: "3 / 5" },
      ar: { student: "11 / 20", studentConverted: "4,3 / 5", required: "3 / 5" },
    },
  },
  {
    name: "a converted value on the student's own scale keeps the plain wording",
    slug: E2E_SLUGS.fail,
    reason: {
      ...base("overall_grade_min", "below_threshold", "xx-test-rule-grade"),
      outcome: "fail",
      student: { scale: "xx-test-scale-20", value: 11 },
      studentConverted: { scale: "xx-test-scale-20", value: 11 },
      required: 16,
    },
    expected: same({ student: "11 / 20", studentConverted: "11 / 20", required: "16 / 20" }),
  },
  {
    name: "subject grade names the subject from the text shard",
    reason: {
      ...base("subject_grade_min", "ok", "xx-test-rule-math-grade"),
      outcome: "pass",
      student: { scale: "xx-test-scale-20", value: 14 },
      required: 12,
    },
    kindKey: "domain.reason.kindDetail.subject_grade_min",
    expected: {
      fr: { student: "14 / 20", required: "12 / 20", subject: "Mathematiques test" },
      en: { student: "14 / 20", required: "12 / 20", subject: "Test mathematics" },
      ar: { student: "14 / 20", required: "12 / 20", subject: "رياضيات الاختبار" },
    },
  },
  {
    name: "credential type slugs resolve to the official, untranslated name",
    reason: {
      ...base("credential_type_in", "ok", "xx-test-rule-cred"),
      outcome: "pass",
      student: "xx-test-cred",
      required: ["xx-test-cred"],
    },
    expected: same({ student: "XX Test Credential", required: "XX Test Credential" }),
  },
  {
    name: "accepted tracks read as alternatives",
    reason: {
      ...base("credential_track_in", "track_not_accepted", "route:xx-test-cond-track"),
      outcome: "fail",
      student: "xx-test-track-lit",
      required: ["xx-test-track-sci", "xx-test-track-lit"],
    },
    expected: {
      fr: {
        student: "XX Test Literary Track",
        required: "XX Test Science Track ou XX Test Literary Track",
      },
      en: {
        student: "XX Test Literary Track",
        required: "XX Test Science Track or XX Test Literary Track",
      },
      ar: {
        student: "XX Test Literary Track",
        required: "XX Test Science Track أو XX Test Literary Track",
      },
    },
  },
  {
    name: "subjects taken: names joined, 'all' mode reads as a conjunction",
    reason: {
      ...base("subject_taken", "ok", "xx-test-rule-math"),
      outcome: "pass",
      student: ["xx-test-subject-math", "xx-test-subject-phys"],
      required: ["xx-test-subject-math"],
    },
    expected: {
      fr: { student: "Mathematiques test et Physique test", required: "Mathematiques test" },
      en: { student: "Test mathematics and Physique test", required: "Test mathematics" },
      ar: { student: "رياضيات الاختبار وPhysique test", required: "رياضيات الاختبار" },
    },
  },
  {
    name: "prior study years are plain numbers",
    reason: {
      ...base("prior_study_years_min", "below_threshold"),
      outcome: "fail",
      student: 0,
      required: 1,
    },
    expected: same({ student: "0", required: "1" }),
  },
  {
    name: "CEFR levels are shown as they are, with the language named in the locale",
    reason: {
      ...base("language_proficiency", "below_threshold", "xx-test-rule-language-fr"),
      outcome: "fail",
      student: "B1",
      required: "B2",
    },
    kindKey: "domain.reason.kindDetail.language_proficiency",
    expected: {
      fr: { student: "B1", required: "B2", language: FRENCH_NAME.fr },
      en: { student: "B1", required: "B2", language: FRENCH_NAME.en },
      ar: { student: "B1", required: "B2", language: FRENCH_NAME.ar },
    },
  },
  {
    name: "an unknown language level is not a value",
    reason: {
      ...base("language_proficiency", "missing_student_value", "xx-test-rule-language-fr"),
      student: "unknown",
      required: "B2",
    },
    kindKey: "domain.reason.kindDetail.language_proficiency",
    expected: {
      fr: { required: "B2", language: FRENCH_NAME.fr },
      en: { required: "B2", language: FRENCH_NAME.en },
      ar: { required: "B2", language: FRENCH_NAME.ar },
    },
  },
  {
    name: "an unknown slug is shown as the slug",
    reason: { ...base("credential_type_in", "ok"), outcome: "pass", student: "zz-unknown" },
    expected: same({ student: "zz-unknown" }),
  },
  {
    name: "a threshold whose rule is unknown is a plain number",
    reason: {
      ...base("overall_grade_min", "below_threshold", "no-such-rule"),
      outcome: "fail",
      student: { scale: "zz-unknown-scale", value: 14.5 },
      required: 12.5,
    },
    expected: {
      fr: { student: "14,5", required: "12,5" },
      en: { student: "14.5", required: "12.5" },
      ar: { student: "14,5", required: "12,5" },
    },
  },
  {
    name: "a missing required value on a code that needs it is the neutral param",
    reason: {
      ...base("overall_grade_min", "below_threshold", "xx-test-rule-grade"),
      outcome: "fail",
      student: { scale: "xx-test-scale-20", value: 9 },
    },
    expected: same({ student: "9 / 20", required: NEUTRAL_PARAM }),
  },
  {
    name: "a boolean has no display value",
    reason: { ...base("manual_check", "manual_check"), student: true, required: false },
    expected: same({}),
  },
];

describe("describeReason: values", () => {
  it.each(ROWS)("$name", ({ slug, reason, expected, key, kindKey }) => {
    for (const locale of LOCALES) {
      const view = describeReason(reason, ctxFor(locale, slug));
      expect(view.params, locale).toEqual(expected[locale]);
      expect(view.key).toBe(key ?? `domain.reason.code.${reason.code}`);
      expect(view.kindKey).toBe(kindKey ?? `domain.reason.kind.${reason.kind}`);
      expect(typeof messageAt(locale, view.key)).toBe("string");
      for (const arg of [
        ...(MESSAGE_ARGS[view.key] ?? []),
        ...(MESSAGE_ARGS[view.kindKey] ?? []),
      ]) {
        expect(view.params, `${locale} ${arg}`).toHaveProperty(arg);
      }
      expect(view.outcome).toBe(reason.outcome);
      expect(view.facts).toEqual(reason.facts);
    }
  });

  it("uses Latin digits in Arabic", () => {
    for (const row of ROWS) {
      const view = describeReason(row.reason, ctxFor("ar", row.slug));
      for (const value of Object.values(view.params)) {
        expect(String(value)).not.toMatch(ARABIC_INDIC_DIGITS);
      }
    }
  });
});

describe("describeReason: notes", () => {
  it("resolves the note text with its locale note", () => {
    const routeNote = bundles.fr.routes?.routes.find((r) => r.destination === "XB")?.note;
    if (routeNote === null || routeNote === undefined) throw new Error("fixture route has no note");
    const note = { ...base("route", "ok", "route"), note: routeNote };
    expect(describeReason(note, ctxFor("fr")).note).toEqual({
      text: "Acces direct test",
      textNote: "none",
    });
    expect(describeReason(note, ctxFor("en")).note).toEqual({
      text: "Test direct access",
      textNote: "machine_translated",
    });
    expect(describeReason(note, ctxFor("ar")).note).toEqual({
      text: "Acces direct test",
      textNote: "french_fallback",
    });
  });

  it("gives null when there is no note or its text is missing", () => {
    expect(describeReason(base("route", "ok"), ctxFor("fr")).note).toBeNull();
    const missing = { ...base("manual_check", "manual_check"), note: "programs/zz#nothing" };
    expect(describeReason(missing, ctxFor("fr")).note).toBeNull();
  });
});

type Format = (key: string, params: Params) => string;

const translatorErrors: unknown[] = [];

// The typed translator only takes literal keys; view keys are runtime strings.
function formatterFor(locale: AppLocale): Format {
  const t = createTranslator({
    locale,
    messages: CATALOGS[locale] as Record<string, unknown>,
    onError: (error) => translatorErrors.push(error),
  });
  return t as unknown as Format;
}

const translators: Record<AppLocale, Format> = {
  fr: formatterFor("fr"),
  en: formatterFor("en"),
  ar: formatterFor("ar"),
};

describe("describeReason: real match results", () => {
  it("describes every reason of every fixture program in every locale", () => {
    for (const locale of LOCALES) {
      const bundle = bundles[locale];
      const core = bundle.core;
      if (core === undefined) throw new Error("no core");
      for (const program of allPrograms(bundle)) {
        const route = routeFor(bundle, program);
        const result = matchProgram({
          profile: E2E_PROFILE,
          program,
          routes: bundle.routes?.routes ?? [],
          reference: core,
          now: E2E_NOW,
        });
        const ctx = { locale, core, text: bundle.text, rules: ruleIndex(program, route) };
        for (const reason of result.reasons) {
          const view = describeReason(reason, ctx);
          expectPlainParams(view.params);
          expect(JSON.parse(JSON.stringify(view))).toStrictEqual(view);
          for (const value of Object.values(view.params)) {
            expect(value).not.toBe(NEUTRAL_PARAM);
          }
          for (const key of [view.key, view.kindKey]) {
            const text = translators[locale](key, view.params);
            expect(text, key).not.toMatch(/[{}]/);
            expect(text, key).not.toBe(key);
          }
        }
      }
    }
    expect(translatorErrors).toEqual([]);
  });

  it("indexes program rules by id and route conditions as route:<id>", () => {
    const bundle = bundles.fr;
    const program = programOf(bundle, E2E_SLUGS.ok);
    const index = ruleIndex(program, routeFor(bundle, program));
    expect(index.get("xx-test-rule-grade")?.kind).toBe("overall_grade_min");
    expect(index.get("route:xx-test-cond-track")?.kind).toBe("credential_track_in");
    expect(ruleIndex(program, null).has("route:xx-test-cond-track")).toBe(false);
  });
});

describe("describeReason: unexpected input never throws", () => {
  const garbage: unknown[] = [
    null,
    undefined,
    { foo: 1 },
    Number.NaN,
    Number.POSITIVE_INFINITY,
    [1, 2],
    [["nested"]],
    [],
    { scale: 1, value: "x" },
    { scale: "xx-test-scale-20", value: Number.NaN },
    Symbol("s"),
  ];

  it.each(garbage.map((value) => [String(value), value]))("value %s", (_label, value) => {
    for (const kind of REASON_KINDS) {
      for (const locale of LOCALES) {
        const reason = {
          ...base(kind, "below_threshold", "xx-test-rule-grade"),
          student: value as ReasonValue,
          required: value as ReasonValue,
          studentConverted: value as { scale: string; value: number },
        };
        const view = describeReason(reason, ctxFor(locale));
        expectPlainParams(view.params);
        expect(view.params.student ?? NEUTRAL_PARAM).toBe(NEUTRAL_PARAM);
        expect(view.params.required).toBe(NEUTRAL_PARAM);
      }
    }
  });

  it("handles an unknown kind and code", () => {
    const reason = {
      ...base("route", "ok"),
      kind: "zz-kind",
      code: "zz-code",
      student: "a",
    } as unknown as Reason;
    const view = describeReason(reason, ctxFor("fr"));
    expect(view.key).toBe("domain.reason.code.zz-code");
    expect(view.params).toEqual({ student: "a" });
  });
});
