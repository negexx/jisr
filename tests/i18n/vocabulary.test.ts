import { createTranslator } from "next-intl";
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

// Every argument name in an ICU message, including those inside plural/select branches (`#` is not
// an argument). Throws on unbalanced braces or a malformed argument. intl-messageformat is only a
// transitive dependency (not importable under pnpm), hence this small parser.
function placeholders(message: string): string[] {
  const names = new Set<string>();
  const fail = (why: string): never => {
    throw new Error(`${why} in "${message}"`);
  };

  // Reads text from `start` up to an unmatched "}" (returned) or the end of the message.
  const text = (start: number, nested: boolean): number => {
    let i = start;
    while (i < message.length) {
      if (message[i] === "}") return nested ? i : fail("unbalanced braces");
      i = message[i] === "{" ? argument(i + 1) : i + 1;
    }
    return nested ? fail("unbalanced braces") : i;
  };

  // `start` is just after "{"; returns the index just after the argument's closing "}".
  const argument = (start: number): number => {
    const head = /^\s*([A-Za-z_]\w*)\s*(?:,\s*(\w+)\s*)?/.exec(message.slice(start));
    if (head?.[1] === undefined) return fail("bad placeholder");
    names.add(head[1]);
    let i = start + head[0].length;
    const type = head[2];
    if (type === undefined) return message[i] === "}" ? i + 1 : fail("bad placeholder");
    if (type !== "plural" && type !== "select" && type !== "selectordinal") {
      const close = message.indexOf("}", i);
      return close === -1 ? fail("unbalanced braces") : close + 1;
    }
    if (message[i] !== ",") return fail("bad branches");
    i++;
    for (;;) {
      const branch = /^\s*(?:(=\d+|[A-Za-z_]\w*)\s*(\{))?\s*/.exec(message.slice(i));
      if (branch?.[2] === undefined) {
        i += branch?.[0].length ?? 0;
        return message[i] === "}" ? i + 1 : fail("bad branches");
      }
      i = text(i + branch[0].length, true) + 1;
    }
  };

  text(0, false);
  return [...names].sort();
}

describe("placeholders helper", () => {
  it.each([
    ["{a} and {b}", ["a", "b"]],
    ["{n, plural, one {# x} other {# xs}}", ["n"]],
    [
      "{n, plural, =0 {none} one {{a}} other {{b} {c, select, x {{d}} other {e}}}}",
      ["a", "b", "c", "d", "n"],
    ],
  ] as const)("collects %s", (message, names) => {
    expect(placeholders(message)).toEqual(names);
  });

  it.each([
    "{a",
    "a}",
    "{n, plural, one {x}",
    "{ }",
    "{n, plural, one x}",
  ])("rejects %s", (message) => {
    expect(() => placeholders(message)).toThrow();
  });
});

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
  // Message-only keys picked by the journey view layer.
  "domain.reason.code.below_threshold_converted",
  "domain.route.staleSource",
  "domain.route.nonOfficialSource",
  "domain.rule.manual_check",
  "domain.rule.language_proficiency.anyCertificate",
];

// Imperative check verbs only: "we checked" must not count (Arabic has no word boundary, so the
// verb must start a word: "نتحقق" is not "تحقق").
const CHECK_VERB: Record<Locale, RegExp> = {
  en: /\b(check|confirm|read)\b/i,
  fr: /\b(vérifiez|confirmez|consultez|lisez)\b/i,
  ar: /(^|\s)(تحقق|تأكد|اقرأ|راجع)/u,
};

const NOT_AN_INSTRUCTION: Record<Locale, string[]> = {
  en: ["We already checked the official source", "Confirmed by the official source"],
  fr: ["Nous avons déjà vérifié la source officielle", "Vérifiés par la source officielle"],
  ar: ["لم نتحقق من المصدر الرسمي", "تم التأكد من المصدر الرسمي"],
};

// "some" in French is not a promise: these must stay allowed.
const ALLOWED_SAMPLES: Record<Locale, string[]> = {
  en: ["Some documents may need a translation"],
  fr: [
    "Certains documents peuvent demander une traduction",
    "Certaines informations ont été vérifiées",
  ],
  ar: [],
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
    "C'est certainement possible",
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

// The patterns intentionally over-ban (e.g. "make sure", "qualification", "صفحة القبول"): rephrase
// the string rather than deleting a pattern. "accepted" stays allowed where it refers to an
// accepted language certificate.
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
    /\bcertain(e|ement)?\b/i,
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

  it.each(LOCALES)("%s allows the harmless sample sentences", (locale) => {
    const caught = ALLOWED_SAMPLES[locale].filter((sample) =>
      FORBIDDEN[locale].some((pattern) => pattern.test(sample)),
    );
    expect(caught).toEqual([]);
  });

  it.each(LOCALES)("%s to-check rule needs an instruction, not a report", (locale) => {
    const counted = NOT_AN_INSTRUCTION[locale].filter((sample) => CHECK_VERB[locale].test(sample));
    expect(counted).toEqual([]);
  });

  it("uses الإجازة for the Bachelor's level everywhere in Arabic, never بكالوريوس", () => {
    const offenders = [...flatten(ar, "ar")].filter(([, value]) => value.includes("بكالوريوس"));
    expect(offenders).toEqual([]);
  });

  it("puts 'مرحلة' before الإجازة in the Arabic foundation-year strings", () => {
    for (const key of ["domain.route.foundation", "domain.reason.code.route_foundation"]) {
      expect(domain.ar.get(key), key).toContain("قبل مرحلة الإجازة");
    }
  });

  it.each([
    ["en", "You still need to apply to each program separately."],
    ["fr", "Vous devez tout de même candidater à chaque programme séparément."],
    ["ar", "ومع ذلك، عليك تقديم طلب إلى كل برنامج على حدة."],
  ] as const)("%s says the student still applies to each program on a direct route", (locale, text) => {
    expect(domain[locale].get("domain.route.direct")).toContain(text);
  });

  it.each([
    ["en", "to be checked"],
    ["fr", "à vérifier"],
    ["ar", "يجب التحقق منه"],
  ] as const)("%s keeps the product term for values that are not published", (locale, term) => {
    for (const key of ["domain.cost.missingLine", "domain.intake.unknown"]) {
      expect(domain[locale].get(key), key).toContain(term);
    }
  });

  it("does not use 'a moment ago' wording for aging facts in French", () => {
    for (const key of ["domain.freshness.aging", "domain.freshness.bannerAging"]) {
      expect(domain.fr.get(key), key).toContain("il y a quelque temps");
      expect(domain.fr.get(key), key).not.toContain("un moment");
    }
  });

  it.each(LOCALES)("%s points to the official page for every route except direct", (locale) => {
    for (const route of [
      "foundation",
      "check",
      "missing",
      "not_eligible",
      "staleSource",
      "nonOfficialSource",
    ] as const) {
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

const RULE_PREFIX = "domain.rule.";

// The product term for a value that is not published (same as domain.cost.missingLine).
const TO_BE_CHECKED: Record<Locale, string> = {
  en: "to be checked",
  fr: "à vérifier",
  ar: "يجب التحقق منه",
};

const ESTIMATE_WORD: Record<Locale, RegExp> = {
  en: /estimat/i,
  fr: /estim/i,
  ar: /تقدير|تقديري/u,
};

const SCALE_LOWER_BETTER = "domain.rule.scaleLowerBetter";

const BELOW: Record<Locale, RegExp> = {
  en: /\bbelow\b|\blower than\b/i,
  fr: /inférieur/i,
  ar: /أقل من/u,
};

const BELOW_OR_MINIMUM: Record<Locale, RegExp> = {
  en: new RegExp(`${BELOW.en.source}|minimum`, "i"),
  fr: new RegExp(`${BELOW.fr.source}|minimum|minimal`, "i"),
  ar: new RegExp(`${BELOW.ar.source}|الحد الأدنى`, "u"),
};

describe("trust wording: rules in general terms and journey-only keys", () => {
  const ruleKeys = (locale: Locale) =>
    [...domain[locale].keys()].filter((key) => key.startsWith(RULE_PREFIX));

  it("declares the rule keys the program page needs", () => {
    expect(ruleKeys("fr").length).toBe(18);
  });

  // scaleLowerBetter explains how to read the grade of a rule line that already names the source.
  it.each(LOCALES)("%s says every rule comes from the official source", (locale) => {
    for (const key of ruleKeys(locale)) {
      if (key === SCALE_LOWER_BETTER) continue;
      expect(domain[locale].get(key), key).toMatch(OFFICIAL_OR_SOURCE[locale]);
    }
  });

  it.each([
    ["en", /lower grade is better/, /\{required\} or better/],
    ["fr", /note plus basse est meilleure/, /\{required\} ou mieux/],
    ["ar", /العلامة الأدنى أفضل/u, /\{required\} أو أفضل منها/u],
  ] as const)("%s explains a lower-is-better scale without 'minimum' or 'below'", (locale, lower, needs) => {
    const value = domain[locale].get(SCALE_LOWER_BETTER);
    expect(value).toMatch(lower);
    expect(value).toMatch(needs);
    expect(value).not.toMatch(BELOW_OR_MINIMUM[locale]);
  });

  it.each(
    LOCALES,
  )("%s grade-threshold failures never say 'below', false on lower-is-better scales", (locale) => {
    for (const code of ["below_threshold", "below_threshold_converted"]) {
      const key = `domain.reason.code.${code}`;
      expect(domain[locale].get(key), key).not.toMatch(BELOW[locale]);
    }
  });

  it("uses one Arabic word for a grade (العلامة, never النقطة) in rules and reasons", () => {
    const offenders = [...domain.ar].filter(
      ([key, value]) =>
        (key.startsWith(RULE_PREFIX) || key.startsWith("domain.reason.")) && /نقط/u.test(value),
    );
    expect(offenders).toEqual([]);
  });

  it("never words the Arabic grade conversion as an equivalence (no تعادل / يعادل)", () => {
    expect(domain.ar.get("domain.reason.code.below_threshold_converted")).not.toMatch(
      /تعادل|يعادل/u,
    );
  });

  it("puts a no-break space before French double punctuation", () => {
    const offenders = [...domain.fr].filter(([, value]) => / [:;!?]/.test(value));
    expect(offenders).toEqual([]);
  });

  it.each([
    [
      "fr",
      "domain.reason.code.below_threshold",
      "Votre valeur ({student}) n'atteint pas le minimum publié ({required}). Les conditions peuvent changer : vérifiez la page officielle.",
    ],
    [
      "ar",
      "domain.reason.code.below_threshold",
      "قيمتك ({student}) لا تبلغ الحد الأدنى المنشور ({required}). قد تتغير الشروط، لذا تحقق من الصفحة الرسمية.",
    ],
    [
      "ar",
      "domain.reason.code.below_threshold_converted",
      "بعد التحويل حسب جدول التحويل المنشور، تصبح علامتك ({student}) {studentConverted}، وهي لا تبلغ الحد الأدنى المنشور ({required}). هذا التحويل ليس قرار معادلة رسميًا: تحقق في صفحة الالتحاق الرسمية من كيفية التعامل مع علامتك.",
    ],
    [
      "ar",
      "domain.rule.prior_study_years_min",
      "الدراسة العليا بعد البكالوريا حسب المصدر الرسمي: {years, plural, one {سنة واحدة} two {سنتان} few {# سنوات} other {# سنة}} على الأقل.",
    ],
    [
      "fr",
      SCALE_LOWER_BETTER,
      "Sur cette échelle, une note plus basse est meilleure : il faut {required} ou mieux (une note plus basse).",
    ],
    [
      "ar",
      SCALE_LOWER_BETTER,
      "في هذا السلّم، العلامة الأدنى أفضل: يجب الحصول على {required} أو أفضل منها (أي علامة أدنى).",
    ],
  ] as const)("%s %s has the reviewed wording", (locale, key, text) => {
    expect(domain[locale].get(key)).toBe(text);
  });

  it.each([
    ["ar", 1, "سنة واحدة على الأقل."],
    ["ar", 2, "سنتان على الأقل."],
    ["ar", 3, "3 سنوات على الأقل."],
    ["ar", 11, "11 سنة على الأقل."],
    ["fr", 1, "au moins 1 année."],
    ["fr", 2, "au moins 2 années."],
    ["en", 1, "at least 1 year."],
    ["en", 2, "at least 2 years."],
  ] as const)("%s renders prior_study_years_min for %i years", (locale, years, ending) => {
    const errors: unknown[] = [];
    const t = createTranslator({
      locale,
      messages: catalogs[locale],
      onError: (error) => errors.push(error),
    }) as unknown as (key: string, params: Record<string, number>) => string;
    const text = t("domain.rule.prior_study_years_min", { years });
    expect(errors).toEqual([]);
    expect(text.endsWith(ending), text).toBe(true);
  });

  it.each(LOCALES)("%s never reads an unpublished value as 'none required'", (locale) => {
    const unpublished = ruleKeys(locale).filter(
      (key) => key.endsWith(".unpublished") || key.endsWith(".certificateUnpublished"),
    );
    expect(unpublished).toHaveLength(4);
    for (const key of unpublished) {
      expect(domain[locale].get(key), key).toContain(TO_BE_CHECKED[locale]);
      expect(domain[locale].get(key), key).toMatch(OFFICIAL_WORD[locale]);
    }
  });

  it.each(LOCALES)("%s never words a requirement or its label as an estimate", (locale) => {
    for (const [key, value] of domain[locale]) {
      if (key.startsWith(RULE_PREFIX) || key.startsWith("domain.reason.kindDetail.")) {
        expect(value, key).not.toMatch(ESTIMATE_WORD[locale]);
      }
    }
  });

  it.each([
    ["en", /conversion table/, /not an official equivalence decision/],
    ["fr", /table de conversion/, /pas une décision officielle d'équivalence/],
    ["ar", /جدول التحويل/u, /ليس قرار معادلة رسميًا/u],
  ] as const)("%s says a converted grade is not an official equivalence", (locale, table, notOfficial) => {
    const value = domain[locale].get("domain.reason.code.below_threshold_converted");
    expect(value).toMatch(table);
    expect(value).toMatch(notOfficial);
  });

  it.each([
    ["en", /direct access|does not give access|foundation/i],
    ["fr", /accès direct|ne donne pas accès|préparatoire/i],
    ["ar", /مباشرة|لا تتيح|تأسيسية/u],
  ] as const)("%s route source keys never state a route outcome", (locale, outcome) => {
    for (const key of ["domain.route.staleSource", "domain.route.nonOfficialSource"]) {
      expect(domain[locale].get(key), key).not.toMatch(outcome);
    }
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
    ["domain.cost.missingLine", "Not in the sources we reviewed, to be checked"],
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
    [
      "domain.reason.code.below_threshold",
      "Your value ({student}) does not meet the published minimum ({required}). Requirements can change, so check the official page.",
    ],
    ["domain.rule.credential_track_in", "Bac tracks accepted by the official source: {tracks}."],
    [
      "domain.rule.scaleLowerBetter",
      "On this scale a lower grade is better: you need {required} or better (a lower grade).",
    ],
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
