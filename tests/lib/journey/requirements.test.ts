import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FactMeta, ResolvedRule } from "@/data-schema/resolved";
import type { AppLocale } from "@/i18n/routing";
import type { DescribeContext } from "@/lib/journey/reasons";
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

describe("describeRule", () => {
  it("describes every fixture rule with its kind key, fact and plain params", () => {
    for (const locale of LOCALES) {
      for (const program of allPrograms(bundles[locale])) {
        for (const rule of program.requirements.rules) {
          const view = describeRule(rule, ctxFor(locale));
          expect(view.kind).toBe(rule.kind);
          expect(view.key).toBe(`domain.reason.kind.${rule.kind}`);
          expect(typeof messageAt(locale, view.key)).toBe("string");
          expect(view.fact).toEqual(rule.fact);
          for (const value of Object.values(view.params)) {
            expect(["string", "number"]).toContain(typeof value);
          }
          expect(JSON.parse(JSON.stringify(view))).toStrictEqual(view);
        }
      }
    }
  });

  it.each([
    ["xx-test-rule-cred", { types: "XX Test Credential" }],
    ["xx-test-rule-math", { subjects: "Mathematiques test" }],
    ["xx-test-rule-grade", { required: "3 / 5" }],
    ["xx-test-rule-math-grade", { subject: "Mathematiques test", required: "12 / 20" }],
    [
      "xx-test-rule-language-fr",
      { language: "fr", required: "B2", certificates: "XX Test French Certificate" },
    ],
  ])("gives %s its general-terms params", (id, params) => {
    const view = describeRule(ruleOf(E2E_SLUGS.ok, id), ctxFor("fr"));
    expect(view.params).toEqual(params);
    expect(view).not.toHaveProperty("note");
  });

  it("leaves out a threshold or level that is not published", () => {
    expect(
      describeRule(ruleOf(E2E_SLUGS.check, "xx-test-rule-grade"), ctxFor("fr")).params,
    ).toEqual({});
    expect(
      describeRule(ruleOf(E2E_SLUGS.check, "xx-test-rule-language-en"), ctxFor("fr")).params,
    ).toEqual({ language: "en", certificates: "XX Test English Certificate" });
  });

  it("gives a manual check its note text with the locale note", () => {
    const rule = ruleOf(E2E_SLUGS.check, "xx-test-rule-manual");
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

  it("formats years, lists of tracks and 'any' subjects in the locale", () => {
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
    expect(describeRule(years, ctxFor("ar")).params).toEqual({ years: "2" });
    expect(describeRule(tracks, ctxFor("en")).params).toEqual({
      tracks: "XX Test Science Track or XX Test Literary Track",
    });
    expect(describeRule(anyOf, ctxFor("fr")).params).toEqual({
      subjects: "Mathematiques test ou Physique test",
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
      {
        id: "c",
        fact: FACT,
        kind: "language_proficiency",
        language: "de",
        minCefr: "B1",
        certificateRequired: true,
        acceptedTests: ["zz-cert"],
      },
      { id: "d", fact: FACT, kind: "manual_check", note: "programs/zz#nothing" },
    ];
    const [a, b, c, d] = rules.map((rule) => describeRule(rule, ctxFor("fr")));
    expect(a?.params).toEqual({ types: "zz-type" });
    expect(b?.params).toEqual({ subject: "zz-s", required: "9" });
    expect(c?.params).toEqual({ language: "de", required: "B1", certificates: "zz-cert" });
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
