import { describe, expect, expectTypeOf, it } from "vitest";

import type {
  ChecklistReasonCode,
  MatchStatus,
  ReasonCode,
  ReasonKind,
  RuleOutcome,
} from "@/domain/types";
import {
  BUDGET_FITS,
  CHECKLIST_REASON_CODES,
  CHECKLIST_STEP_IDS,
  COST_CATEGORIES,
  COST_PERS,
  COST_SCOPES,
  COVERAGES,
  FRESHNESSES,
  INFO_KINDS,
  INTAKE_KINDS,
  MATCH_STATUSES,
  MESSAGE_ARGS,
  MESSAGE_GROUPS,
  PREFERENCE_MISMATCHES,
  REASON_CODES,
  REASON_KINDS,
  ROUTE_KEYS,
  ROUTE_OUTCOMES,
  RULE_OUTCOMES,
  TEXT_NOTES,
  type TextNote,
} from "@/lib/i18n/vocabulary";
import ar from "../../messages/ar.json";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

type Tree = { [key: string]: string | Tree };
type Locale = "fr" | "en" | "ar";

const catalogs: Record<Locale, Tree> = { fr, en, ar };
const LOCALES: readonly Locale[] = ["fr", "en", "ar"];

function flatten(tree: Tree, prefix: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = `${prefix}.${key}`;
    if (typeof value === "string") out.set(path, value);
    else for (const [k, v] of flatten(value, path)) out.set(k, v);
  }
  return out;
}

function domainOf(locale: Locale): Map<string, string> {
  const subtree = catalogs[locale].domain;
  if (subtree === undefined || typeof subtree === "string") {
    throw new Error(`no domain namespace in ${locale}`);
  }
  return flatten(subtree, "domain");
}

const domain: Record<Locale, Map<string, string>> = {
  fr: domainOf("fr"),
  en: domainOf("en"),
  ar: domainOf("ar"),
};

function expandedKeys(): string[] {
  return MESSAGE_GROUPS.flatMap((group) =>
    group.values.flatMap((value) =>
      group.leaves
        ? group.leaves.map((leaf) => `${group.path}.${value}.${leaf}`)
        : [`${group.path}.${value}`],
    ),
  );
}

// Placeholder names at the top level of each `{...}`; throws when braces are unbalanced.
// intl-messageformat is only a transitive dependency (not importable under pnpm), and no plurals are used.
function placeholders(message: string): string[] {
  const names = new Set<string>();
  let depth = 0;
  for (let i = 0; i < message.length; i++) {
    const char = message[i];
    if (char === "{") {
      if (depth === 0) {
        const name = /^\s*([A-Za-z_]\w*)\s*[,}]/.exec(message.slice(i + 1))?.[1];
        if (name === undefined) throw new Error(`bad placeholder in "${message}"`);
        names.add(name);
      }
      depth++;
    } else if (char === "}") {
      depth--;
      if (depth < 0) throw new Error(`unbalanced braces in "${message}"`);
    }
  }
  if (depth !== 0) throw new Error(`unbalanced braces in "${message}"`);
  return [...names].sort();
}

// Hand-maintained: no type maps a ReasonCode or ChecklistReasonCode to its outcome, so when a code
// is added, decide here whether its message tells the student to check something.
const TO_CHECK_REASON_KEYS = [
  ...(
    [
      "missing_student_value",
      "threshold_unpublished",
      "no_scale_conversion",
      "stale_source",
      "non_official_source",
      "route_foundation",
      "route_check",
      "coverage_partial",
      "manual_check",
    ] as const satisfies readonly ReasonCode[]
  ).map((code) => `domain.reason.code.${code}`),
  ...(
    ["unknown_data", "no_scholarships_listed"] as const satisfies readonly ChecklistReasonCode[]
  ).map((code) => `domain.checklist.reason.${code}`),
];

const CHECK_VERB: Record<Locale, RegExp> = {
  en: /check|confirm|read/i,
  fr: /vérifiez|confirmez|consultez|lisez/i,
  ar: /تحقق|تأكد|اقرأ|راجع/u,
};

// One bad sentence per forbidden pattern: proves the pattern list catches the paraphrases.
const BAD_SAMPLES: Record<Locale, string[]> = {
  en: [
    "You'll be fine",
    "You qualify for this program",
    "Qualified students only",
    "You meet the requirements",
    "You are accepted here",
    "You will be accepted",
    "You are ready to apply",
    "This program is safe for you",
    "It is certain that you pass",
    "Certainly a good match",
    "We are sure you pass",
    "Your chances are good",
    "You are eligible",
    "You have been admitted",
    "Admission guaranteed",
    "We guarantee a place",
    "You will get in",
    "You can apply now",
  ],
  fr: [
    "Vous êtes éligible",
    "Un dossier admissible",
    "Vous êtes admis",
    "Admission garantie",
    "Vous serez pris",
    "Vous pouvez candidater",
    "Vous êtes qualifié pour ce programme",
    "Une place assurée",
    "Vous êtes assuré de réussir",
    "C'est certain",
    "Certains étudiants passent",
    "Vous êtes accepté dans ce programme",
    "Vous êtes acceptée en licence",
  ],
  ar: [
    "أنت مؤهل لهذا البرنامج",
    "أنت مقبول",
    "قبولك مضمون",
    "نضمن لك مقعدًا",
    "نحن نضمن ذلك",
    "ضمان القبول",
    "يحق لك التقديم",
    "يمكنك التقديم الآن",
  ],
};

// "accepted" stays allowed where it refers to an accepted language certificate.
const FORBIDDEN: Record<Locale, RegExp[]> = {
  en: [
    /eligib/i,
    /\badmitted\b/i,
    /admission guarantee/i,
    /guarantee/i,
    /\byou will\b/i,
    /you'?ll\b/i,
    /\byou can apply\b/i,
    /\bchances?\b/i,
    /\bqualif/i,
    /\byou meet\b/i,
    /\b(you are|will be) accepted\b/i,
    /\bready to apply\b/i,
    /\bsafe\b/i,
    /\bcertain(ly)?\b/i,
    /\bsure\b/i,
  ],
  fr: [
    /éligib|eligib/i,
    /\badmise?s?\b/i,
    /admissib/i,
    /garanti/i,
    /\bvous serez\b/i,
    /\bvous pouvez candidater\b/i,
    /\bqualifié/i,
    /\bassuré/i,
    /\bcertain/i,
    /accepté(e|s)? (dans|en)\b/i,
  ],
  ar: [/قبول/u, /ضمان|نضمن|تضمن|مضمون/u, /يحق لك/u, /مؤهل/u, /يمكنك التقديم/u],
};

const OFFICIAL_OR_SOURCE: Record<Locale, RegExp> = {
  en: /official|source/i,
  fr: /officiel|source/i,
  ar: /الرسمي|رسمي|المصدر/u,
};

const OFFICIAL_WORD: Record<Locale, RegExp> = {
  en: /official/i,
  fr: /officiel/i,
  ar: /رسمي/u,
};

describe("vocabulary arrays: runtime shape", () => {
  it.each([
    ["MATCH_STATUSES", MATCH_STATUSES, ["satisfied", "check", "not_satisfied"]],
    ["ROUTE_OUTCOMES", ROUTE_OUTCOMES, ["direct", "foundation", "not_eligible", "check"]],
    ["ROUTE_KEYS", ROUTE_KEYS, ["direct", "foundation", "not_eligible", "check", "missing"]],
    ["RULE_OUTCOMES", RULE_OUTCOMES, ["pass", "fail", "unknown"]],
    ["COST_PERS", COST_PERS, ["month", "year", "semester", "once"]],
    ["COST_SCOPES", COST_SCOPES, ["program", "city", "country"]],
    ["INTAKE_KINDS", INTAKE_KINDS, ["upcoming", "closed", "unknown"]],
    ["INFO_KINDS", INFO_KINDS, ["official", "estimate", "guidance"]],
    ["FRESHNESSES", FRESHNESSES, ["fresh", "aging", "stale"]],
    ["COVERAGES", COVERAGES, ["complete", "partial"]],
    ["TEXT_NOTES", TEXT_NOTES, ["french_fallback", "machine_translated"]],
    ["BUDGET_FITS", BUDGET_FITS, ["within", "straddles", "above", "unknown"]],
  ] as const)("%s lists exactly the domain values", (_name, actual, expected) => {
    expect([...actual].sort()).toEqual([...expected].sort());
  });

  it("lists the expected number of codes, kinds, steps and categories", () => {
    expect(REASON_CODES).toHaveLength(13);
    expect(REASON_KINDS).toHaveLength(10);
    expect(CHECKLIST_STEP_IDS).toHaveLength(10);
    expect(CHECKLIST_REASON_CODES).toHaveLength(6);
    expect(COST_CATEGORIES).toHaveLength(7);
    expect(PREFERENCE_MISMATCHES).toHaveLength(4);
  });

  it("has no duplicate values in any group", () => {
    for (const group of MESSAGE_GROUPS) {
      expect(new Set(group.values).size, group.path).toBe(group.values.length);
    }
  });
});

describe("vocabulary arrays: type-level exhaustiveness", () => {
  it("each array covers exactly its domain type", () => {
    expectTypeOf<(typeof MATCH_STATUSES)[number]>().toEqualTypeOf<MatchStatus>();
    expectTypeOf<(typeof RULE_OUTCOMES)[number]>().toEqualTypeOf<RuleOutcome>();
    expectTypeOf<(typeof REASON_CODES)[number]>().toEqualTypeOf<ReasonCode>();
    expectTypeOf<(typeof REASON_KINDS)[number]>().toEqualTypeOf<ReasonKind>();
    expectTypeOf<(typeof ROUTE_KEYS)[number]>().toEqualTypeOf<
      "direct" | "foundation" | "not_eligible" | "check" | "missing"
    >();
    expectTypeOf<(typeof TEXT_NOTES)[number]>().toEqualTypeOf<TextNote>();
  });
});

describe("message groups", () => {
  const expected = expandedKeys();

  it.each(LOCALES)("%s has a non-empty string for every domain value", (locale) => {
    const missing = expected.filter((key) => (domain[locale].get(key) ?? "").trim() === "");
    expect(missing).toEqual([]);
  });

  it.each(LOCALES)("%s has no domain key that no group declares", (locale) => {
    const orphans = [...domain[locale].keys()].filter((key) => !expected.includes(key));
    expect(orphans).toEqual([]);
  });

  it("registers every group under the domain namespace", () => {
    for (const group of MESSAGE_GROUPS) expect(group.path.startsWith("domain.")).toBe(true);
  });

  it("declares a group for every vocabulary array", () => {
    const paths = MESSAGE_GROUPS.map((group) => group.path);
    for (const path of [
      "domain.status",
      "domain.status.short",
      "domain.status.hint",
      "domain.route",
      "domain.reason.kind",
      "domain.reason.code",
      "domain.reason.outcome",
      "domain.checklist.step",
      "domain.checklist.reason",
      "domain.mismatch",
      "domain.cost.category",
      "domain.cost.per",
      "domain.cost.scope",
      "domain.budgetFit",
      "domain.intake",
      "domain.infoKind",
      "domain.freshness",
      "domain.coverage",
      "domain.textNote",
    ]) {
      expect(paths, path).toContain(path);
    }
  });
});

describe("Arabic is translated", () => {
  it("ar differs from fr unless it starts with TODO-translate", () => {
    const untranslated = [...domain.ar]
      .filter(([key, value]) => value === domain.fr.get(key) && !value.startsWith("TODO-translate"))
      .map(([key]) => key);
    expect(untranslated).toEqual([]);
  });

  it("TODO-translate strings carry the French text after the marker", () => {
    for (const [key, value] of domain.ar) {
      if (value.startsWith("TODO-translate")) {
        expect(value, key).toContain(domain.fr.get(key) ?? "<missing>");
      }
    }
  });
});

describe("ICU placeholders", () => {
  it.each(LOCALES)("%s messages have balanced braces and no quoted-brace apostrophes", (locale) => {
    for (const [key, value] of domain[locale]) {
      expect(() => placeholders(value), key).not.toThrow();
      expect(value, key).not.toMatch(/'[{}]/);
    }
  });

  it.each(["en", "ar"] as const)("%s uses the same placeholder names as fr", (locale) => {
    for (const [key, value] of domain[locale]) {
      expect(placeholders(value), key).toEqual(placeholders(domain.fr.get(key) ?? ""));
    }
  });

  it("fr placeholders match the documented MESSAGE_ARGS exactly", () => {
    for (const [key, value] of domain.fr) {
      expect(placeholders(value), key).toEqual([...(MESSAGE_ARGS[key] ?? [])].sort());
    }
  });

  it("MESSAGE_ARGS only documents keys that exist", () => {
    for (const key of Object.keys(MESSAGE_ARGS)) expect(domain.fr.has(key), key).toBe(true);
  });
});

describe("trust wording", () => {
  it.each(LOCALES)("%s never promises eligibility, admission or a guarantee", (locale) => {
    for (const [key, value] of domain[locale]) {
      for (const pattern of FORBIDDEN[locale]) {
        expect(value, `${key} ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it.each(LOCALES)("%s has no em or en dashes", (locale) => {
    for (const [key, value] of domain[locale]) expect(value, key).not.toMatch(/[–—]/);
  });

  it.each(LOCALES)("%s says what to check and where for every to-check reason", (locale) => {
    for (const key of TO_CHECK_REASON_KEYS) {
      expect(domain[locale].get(key), key).toMatch(CHECK_VERB[locale]);
      expect(domain[locale].get(key), key).toMatch(OFFICIAL_OR_SOURCE[locale]);
    }
  });

  it.each(LOCALES)("%s forbidden patterns catch every sample bad sentence", (locale) => {
    const uncaught = BAD_SAMPLES[locale].filter(
      (sample) => !FORBIDDEN[locale].some((pattern) => pattern.test(sample)),
    );
    expect(uncaught).toEqual([]);
  });

  it("uses الإجازة for the Bachelor's level in Arabic, never البكالوريوس next to البكالوريا", () => {
    const offenders = [...domain.ar].filter(
      ([, value]) => value.includes("البكالوريوس") || value.includes("بكالوريوس"),
    );
    expect(offenders).toEqual([]);
  });

  it("states that the student applies to each program separately on a direct route", () => {
    expect(domain.en.get("domain.route.direct")).toContain("You still apply to each program.");
  });

  it.each(LOCALES)("%s points to the official page for every route except direct", (locale) => {
    for (const route of ["foundation", "check", "missing", "not_eligible"] as const) {
      const key = `domain.route.${route}`;
      expect(domain[locale].get(key), key).toMatch(OFFICIAL_OR_SOURCE[locale]);
    }
  });

  it.each(
    LOCALES,
  )("%s sends the student to the official page when a result may not hold", (locale) => {
    for (const key of [
      "domain.status.hint.not_satisfied",
      "domain.status.hint.check",
      "domain.freshness.stale",
      "domain.freshness.bannerStale",
      "domain.freshness.bannerAging",
      "domain.coverage.partial",
      "domain.reason.code.below_threshold",
    ]) {
      expect(domain[locale].get(key), key).toMatch(OFFICIAL_OR_SOURCE[locale]);
    }
  });

  it.each(LOCALES)("%s never words an estimate or a cost as official", (locale) => {
    for (const [key, value] of domain[locale]) {
      if (key.startsWith("domain.cost.") || key.startsWith("domain.infoKind.estimate")) {
        expect(value, key).not.toMatch(OFFICIAL_WORD[locale]);
      }
    }
  });

  it.each(LOCALES)("%s keeps official, estimate and guidance verbally distinct", (locale) => {
    const labels = INFO_KINDS.map((kind) => domain[locale].get(`domain.infoKind.${kind}.label`));
    const meanings = INFO_KINDS.map((kind) =>
      domain[locale].get(`domain.infoKind.${kind}.meaning`),
    );
    expect(new Set(labels).size).toBe(INFO_KINDS.length);
    expect(new Set(meanings).size).toBe(INFO_KINDS.length);
  });
});

describe("required wording (en)", () => {
  const enText = (key: string) => domain.en.get(key);

  it.each([
    ["domain.status.satisfied", "Published requirements appear to be met"],
    ["domain.status.check", "Something to check"],
    ["domain.status.not_satisfied", "Published requirements not met"],
    [
      "domain.route.missing",
      "We have not published how your Bac is treated for this country yet: check the official admission page.",
    ],
    ["domain.cost.missingLine", "Not published in the sources we checked, to be confirmed"],
    ["domain.cost.partialTotal", "Partial total: some costs are not included"],
    ["domain.infoKind.official.label", "Official"],
    ["domain.infoKind.estimate.label", "Estimate"],
    ["domain.infoKind.guidance.label", "General guidance"],
    ["domain.intake.closed", "Closed, next dates not yet published"],
    ["domain.intake.unknown", "Deadline not published, to be checked"],
    ["domain.freshness.aging", "Verified a while ago"],
    ["domain.freshness.stale", "May be outdated, check the official page"],
    ["domain.freshness.verifiedOn", "Verified on {date}"],
    [
      "domain.coverage.partial",
      "We have not published all the requirements for this program. Check the official page before you rely on this.",
    ],
    ["domain.textNote.french_fallback", "Shown in French: not translated yet"],
    ["domain.textNote.machine_translated", "Translated automatically, not yet reviewed"],
    [
      "domain.cost.tenMonthNote",
      "Monthly costs are counted for {months} months of study. Housing is often paid for 12 months, so check the rent period.",
    ],
    ["domain.mismatch.destination", "Not in a country you chose"],
  ])("%s", (key, text) => {
    expect(enText(key)).toBe(text);
  });

  it("explains a foundation year concretely, with the German example only inside the sentence", () => {
    const foundation = enText("domain.route.foundation") ?? "";
    expect(foundation).toMatch(/foundation year/i);
    expect(foundation).toMatch(/preparatory/i);
    expect(foundation).toMatch(/Studienkolleg/);
    expect(foundation).toMatch(/official admission page/i);
  });
});
