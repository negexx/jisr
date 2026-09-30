import { createTranslator } from "next-intl";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FactMeta, ResolvedRule } from "@/data-schema/resolved";
import type { AppLocale } from "@/i18n/routing";
import { MESSAGE_ARGS } from "@/lib/i18n/vocabulary";
import type { DescribeContext, Params } from "@/lib/journey/reasons";
import { describeCoverage, describeRule } from "@/lib/journey/requirements";
import type { SnapshotBundle } from "@/lib/snapshot/client";
import ar from "../../../messages/ar.json";
import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";

import { E2E_PROFILE, E2E_SLUGS } from "../../fixtures/e2e/profiles";
import { forbidConsole } from "../profile/no-console";
import { buildSnapshot, E2E_DATA_DIR, removeTempDirs } from "../snapshot/fixture";
import { allPrograms, loadMatchesBundle, programOf } from "./bundle";

forbidConsole();

const LOCALES = ["fr", "en", "ar"] as const satisfies readonly AppLocale[];
const CATALOGS: Record<AppLocale, unknown> = { fr, en, ar };

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

function ctxFor(locale: AppLocale): DescribeContext {
  const bundle = bundles[locale];
  if (bundle.core === undefined) throw new Error("fixture bundle has no core");
  return { locale, core: bundle.core, text: bundle.text };
}

function ruleOf(slug: string, id: string, locale: AppLocale = "fr"): ResolvedRule {
  const rule = programOf(bundles[locale], slug).requirements.rules.find((r) => r.id === id);
  if (rule === undefined) throw new Error(`no rule ${id} in ${slug}`);
  return rule;
}

const FACT: FactMeta = {
  source_url: "https://example.org/x",
  info_kind: "official",
  last_verified_at: "2026-09-01",
  class: "stable",
};

function shape(rule: ResolvedRule, locale: AppLocale = "fr") {
  const { key, kindKey, params, details } = describeRule(rule, ctxFor(locale));
  return { key, kindKey, params, details };
}

function language(rule: Partial<Extract<ResolvedRule, { kind: "language_proficiency" }>>) {
  return {
    id: "l",
    fact: FACT,
    kind: "language_proficiency",
    language: "fr",
    minCefr: "B2",
    certificateRequired: true,
    acceptedTests: [],
    ...rule,
  } satisfies ResolvedRule;
}

const LANGUAGE_DETAIL = "domain.reason.kindDetail.language_proficiency";

describe("describeRule", () => {
  it("describes every fixture rule with existing keys, its fact and the keys' ICU arguments", () => {
    for (const locale of LOCALES) {
      for (const program of allPrograms(bundles[locale])) {
        for (const rule of program.requirements.rules) {
          const view = describeRule(rule, ctxFor(locale));
          expect(view.kind).toBe(rule.kind);
          expect(view.fact).toEqual(rule.fact);
          for (const line of [{ key: view.key, params: view.params }, ...view.details]) {
            expect(line.key.startsWith("domain.rule.")).toBe(true);
            expect(typeof messageAt(locale, line.key), line.key).toBe("string");
            for (const arg of MESSAGE_ARGS[line.key] ?? []) {
              expect(line.params, `${line.key} ${arg}`).toHaveProperty(arg);
            }
            for (const value of Object.values(line.params)) {
              expect(["string", "number"]).toContain(typeof value);
            }
          }
          expect(typeof messageAt(locale, view.kindKey), view.kindKey).toBe("string");
          for (const arg of MESSAGE_ARGS[view.kindKey] ?? []) {
            expect(view.params, `${view.kindKey} ${arg}`).toHaveProperty(arg);
          }
          expect(JSON.parse(JSON.stringify(view))).toStrictEqual(view);
        }
      }
    }
  });

  it("formats every line with next-intl in every locale (plurals included)", () => {
    const years: ResolvedRule = { id: "y", fact: FACT, kind: "prior_study_years_min", years: 3 };
    for (const locale of LOCALES) {
      const errors: unknown[] = [];
      // The typed translator only takes literal keys; view keys are runtime strings.
      const format = createTranslator({
        locale,
        messages: CATALOGS[locale] as Record<string, unknown>,
        onError: (error) => errors.push(error),
      }) as unknown as (key: string, params: Params) => string;
      const rules = [...allPrograms(bundles[locale]).flatMap((p) => p.requirements.rules), years];
      for (const rule of rules) {
        const view = describeRule(rule, ctxFor(locale));
        for (const { key, params } of [
          view,
          ...view.details,
          { key: view.kindKey, params: view.params },
        ]) {
          const text = format(key, params);
          expect(text, key).not.toMatch(/[{}]/);
          expect(text, key).not.toBe(key);
        }
      }
      expect(errors).toEqual([]);
    }
  });

  it.each([
    [
      "xx-test-rule-cred",
      {
        key: "domain.rule.credential_type_in",
        kindKey: "domain.reason.kind.credential_type_in",
        params: { types: "XX Test Credential" },
        details: [],
      },
    ],
    [
      "xx-test-rule-math",
      {
        key: "domain.rule.subject_taken.all",
        kindKey: "domain.reason.kind.subject_taken",
        params: { subjects: "Mathematiques test" },
        details: [],
      },
    ],
    [
      "xx-test-rule-grade",
      {
        key: "domain.rule.overall_grade_min.published",
        kindKey: "domain.reason.kind.overall_grade_min",
        params: { required: "3 / 5" },
        details: [],
      },
    ],
    [
      "xx-test-rule-math-grade",
      {
        key: "domain.rule.subject_grade_min.published",
        kindKey: "domain.reason.kindDetail.subject_grade_min",
        params: { subject: "Mathematiques test", required: "12 / 20" },
        details: [],
      },
    ],
    [
      "xx-test-rule-language-fr",
      {
        key: "domain.rule.language_proficiency.published",
        kindKey: LANGUAGE_DETAIL,
        params: { language: "français", required: "B2" },
        details: [
          { key: "domain.rule.language_proficiency.certificateRequired", params: {} },
          {
            key: "domain.rule.language_proficiency.certificates",
            params: { certificates: "XX Test French Certificate" },
          },
        ],
      },
    ],
  ])("describes %s in general terms", (id, expected) => {
    expect(shape(ruleOf(E2E_SLUGS.ok, id))).toEqual(expected);
    expect(describeRule(ruleOf(E2E_SLUGS.ok, id), ctxFor("fr"))).not.toHaveProperty("note");
  });

  it("says an unpublished threshold or level is not published, never that none is required", () => {
    expect(shape(ruleOf(E2E_SLUGS.check, "xx-test-rule-grade"))).toEqual({
      key: "domain.rule.overall_grade_min.unpublished",
      kindKey: "domain.reason.kind.overall_grade_min",
      params: {},
      details: [],
    });
    expect(shape(ruleOf(E2E_SLUGS.check, "xx-test-rule-language-en"))).toEqual({
      key: "domain.rule.language_proficiency.unpublished",
      kindKey: LANGUAGE_DETAIL,
      params: { language: "anglais" },
      details: [
        { key: "domain.rule.language_proficiency.certificateUnpublished", params: {} },
        {
          key: "domain.rule.language_proficiency.certificates",
          params: { certificates: "XX Test English Certificate" },
        },
      ],
    });
    const subject: ResolvedRule = {
      id: "g",
      fact: FACT,
      kind: "subject_grade_min",
      subject: "xx-test-subject-math",
      scale: "xx-test-scale-20",
      threshold: null,
    };
    expect(shape(subject, "en")).toMatchObject({
      key: "domain.rule.subject_grade_min.unpublished",
      params: { subject: "Test mathematics" },
    });
  });

  it.each([
    [
      "a required certificate with no list: any recognised certificate",
      language({ certificateRequired: true, acceptedTests: [] }),
      ["certificateRequired", "anyCertificate"],
    ],
    [
      "no certificate required by the source",
      language({ certificateRequired: false, acceptedTests: ["xx-test-cert-fr"] }),
      ["certificateNotRequired"],
    ],
    [
      "certificate requirement unpublished, no list",
      language({ certificateRequired: null, acceptedTests: [] }),
      ["certificateUnpublished"],
    ],
  ])("reads the certificate requirement: %s", (_label, rule, details) => {
    expect(shape(rule).details.map((d) => d.key)).toEqual(
      details.map((d) => `domain.rule.language_proficiency.${d}`),
    );
  });

  it("names languages in the page locale", () => {
    const rule = language({ language: "de" });
    expect(shape(rule, "fr").params.language).toBe("allemand");
    expect(shape(rule, "en").params.language).toBe("German");
    expect(shape(rule, "ar").params.language).toBe("الألمانية");
  });

  it("gives a manual check its note text with the locale note", () => {
    const rule = ruleOf(E2E_SLUGS.check, "xx-test-rule-manual");
    expect(describeRule(rule, ctxFor("fr")).key).toBe("domain.rule.manual_check");
    expect(describeRule(rule, ctxFor("fr")).note).toEqual({
      text: "Seuil de note et niveau d anglais non publies par l etablissement",
      textNote: "none",
    });
    expect(describeRule(rule, ctxFor("en")).note).toEqual({
      text: "Grade threshold and English level not published by the institution",
      textNote: "machine_translated",
    });
    expect(describeRule(rule, ctxFor("ar")).note?.textNote).toBe("french_fallback");
  });

  it("formats years (plural selector plus formatted count), tracks and 'any' subjects", () => {
    const years: ResolvedRule = { id: "y", fact: FACT, kind: "prior_study_years_min", years: 2 };
    const tracks: ResolvedRule = {
      id: "t",
      fact: FACT,
      kind: "credential_track_in",
      tracks: ["xx-test-track-sci", "xx-test-track-lit"],
    };
    const anyOf: ResolvedRule = {
      id: "s",
      fact: FACT,
      kind: "subject_taken",
      subjects: ["xx-test-subject-math", "xx-test-subject-phys"],
      mode: "any",
    };
    expect(shape(years, "ar")).toMatchObject({
      key: "domain.rule.prior_study_years_min",
      params: { count: "2", years: 2 },
    });
    expect(shape(tracks, "en")).toMatchObject({
      key: "domain.rule.credential_track_in",
      params: { tracks: "XX Test Science Track or XX Test Literary Track" },
    });
    expect(shape(anyOf, "fr")).toMatchObject({
      key: "domain.rule.subject_taken.any",
      params: { subjects: "Mathematiques test ou Physique test" },
    });
  });

  it("falls back to slugs for unknown reference data and never throws", () => {
    const rules: ResolvedRule[] = [
      { id: "a", fact: FACT, kind: "credential_type_in", types: ["zz-type"] },
      {
        id: "b",
        fact: FACT,
        kind: "subject_grade_min",
        subject: "zz-s",
        scale: "zz",
        threshold: 9,
      },
      language({ language: "de", minCefr: "B1", acceptedTests: ["zz-cert"] }),
      { id: "d", fact: FACT, kind: "manual_check", note: "programs/zz#nothing" },
    ];
    const [a, b, c, d] = rules.map((rule) => describeRule(rule, ctxFor("fr")));
    expect(a?.params).toEqual({ types: "zz-type" });
    expect(b?.params).toEqual({ subject: "zz-s", required: "9" });
    expect(c?.params).toEqual({ language: "allemand", required: "B1" });
    expect(c?.details[1]).toEqual({
      key: "domain.rule.language_proficiency.certificates",
      params: { certificates: "zz-cert" },
    });
    expect(d?.params).toEqual({});
    expect(d).not.toHaveProperty("note");
  });
});

describe("describeCoverage", () => {
  it.each(["complete", "partial"] as const)("maps %s to its key", (coverage) => {
    expect(describeCoverage({ coverage, fact: FACT, rules: [] })).toEqual({
      key: `domain.coverage.${coverage}`,
    });
    for (const locale of LOCALES) {
      expect(typeof messageAt(locale, `domain.coverage.${coverage}`)).toBe("string");
    }
  });
});
