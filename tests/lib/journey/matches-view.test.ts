import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Profile } from "@/data-schema/profile";
import type { Intake } from "@/data-schema/records/program";
import type { AdmissionRoute, Program } from "@/data-schema/resolved";
import type { PreferenceMismatch } from "@/domain/filter";
import type { MatchResult, MatchStatus, Reason, RuleOutcome } from "@/domain/types";
import { MATCH_STATUSES, PREFERENCE_MISMATCHES } from "@/lib/i18n/vocabulary";
import {
  buildMatchesView,
  groupOf,
  MATCH_GROUPS,
  type MatchCardModel,
  type MatchesView,
  routeKeyOf,
  topReasons,
} from "@/lib/journey/matches-view";
import type { SnapshotBundle } from "@/lib/snapshot/client";

import {
  E2E_EXPECTED,
  E2E_NOW,
  E2E_PROFILE,
  E2E_PROFILE_WITH_BUDGET,
  E2E_PROFILE_XB_ONLY,
  E2E_SLUGS,
} from "../../fixtures/e2e/profiles";
import { forbidConsole } from "../profile/no-console";
import { buildSnapshot, E2E_DATA_DIR, removeTempDirs } from "../snapshot/fixture";
import { allPrograms, loadMatchesBundle, programOf, withPrograms } from "./bundle";

forbidConsole();

let dir = "";
let frBundle: SnapshotBundle;
let arBundle: SnapshotBundle;

beforeAll(async () => {
  dir = buildSnapshot(E2E_DATA_DIR);
  frBundle = await loadMatchesBundle(dir, E2E_PROFILE, "fr");
  arBundle = await loadMatchesBundle(dir, E2E_PROFILE, "ar");
}, 180_000);

afterAll(removeTempDirs);

function okView(view: MatchesView): Extract<MatchesView, { kind: "ok" }> {
  if (view.kind !== "ok") throw new Error(`expected an ok view, got ${view.kind}`);
  return view;
}

function viewFor(profile: Profile, bundle: SnapshotBundle = frBundle) {
  return okView(buildMatchesView({ profile, bundle, now: E2E_NOW, locale: "fr" }));
}

function cards(view: Extract<MatchesView, { kind: "ok" }>): MatchCardModel[] {
  return MATCH_GROUPS.flatMap((group) => view.groups[group]);
}

function card(view: Extract<MatchesView, { kind: "ok" }>, slug: string): MatchCardModel {
  const found = cards(view).find((c) => c.slug === slug);
  if (found === undefined) throw new Error(`no card for ${slug}`);
  return found;
}

function slugsIn(view: Extract<MatchesView, { kind: "ok" }>, group: (typeof MATCH_GROUPS)[number]) {
  return view.groups[group].map((c) => c.slug);
}

function match(status: MatchStatus, route: MatchResult["route"]): MatchResult {
  return { programSlug: "p", status, route, reasons: [] };
}

describe("groupOf", () => {
  it.each([
    ["satisfied", "direct", "ok"],
    ["check", "direct", "check"],
    ["check", "check", "check"],
    ["check", "missing", "check"],
    // A stale or non-official not_eligible route is downgraded to check by the domain (like direct).
    ["check", "not_eligible", "check"],
    ["check", "foundation", "foundation"],
    ["not_satisfied", "direct", "failed"],
    ["not_satisfied", "check", "failed"],
    ["not_satisfied", "missing", "failed"],
    ["not_satisfied", "not_eligible", "failed"],
  ] as const)("status %s with route %s is in group %s", (status, route, group) => {
    expect(groupOf(match(status, route))).toBe(group);
  });

  it("maps every MatchStatus to a group", () => {
    for (const status of MATCH_STATUSES) {
      expect(MATCH_GROUPS).toContain(groupOf(match(status, "direct")));
    }
  });

  it("lists the groups in page order", () => {
    expect(MATCH_GROUPS).toEqual(["ok", "check", "foundation", "failed"]);
  });
});

function reason(outcome: RuleOutcome, ruleId: string, kind: Reason["kind"] = "subject_taken") {
  const code = outcome === "pass" ? "ok" : outcome === "fail" ? "below_threshold" : "manual_check";
  return { ruleId, kind, outcome, code, facts: [] } satisfies Reason;
}

function withReasons(reasons: Reason[], route: MatchResult["route"] = "direct"): MatchResult {
  return { programSlug: "p", status: "check", route, reasons };
}

describe("topReasons", () => {
  it("puts failures first, then unknowns, then passes, keeping domain order in a bucket", () => {
    const reasons = [
      reason("pass", "p1"),
      reason("unknown", "u1"),
      reason("fail", "f1"),
      reason("pass", "p2"),
      reason("fail", "f2"),
      reason("unknown", "u2"),
    ];
    expect(topReasons(withReasons(reasons), 6).map((r) => r.ruleId)).toEqual([
      "f1",
      "f2",
      "u1",
      "u2",
      "p1",
      "p2",
    ]);
  });

  it("truncates to 3 by default and to max when given", () => {
    const reasons = [reason("pass", "p1"), reason("pass", "p2"), reason("unknown", "u1")];
    reasons.push(reason("fail", "f1"));
    expect(topReasons(withReasons(reasons)).map((r) => r.ruleId)).toEqual(["f1", "u1", "p1"]);
    expect(topReasons(withReasons(reasons), 1).map((r) => r.ruleId)).toEqual(["f1"]);
    expect(topReasons(withReasons(reasons), 0)).toEqual([]);
  });

  it("keeps every reason when there are fewer than max", () => {
    expect(topReasons(withReasons([reason("pass", "p1")])).map((r) => r.ruleId)).toEqual(["p1"]);
    expect(topReasons(withReasons([]))).toEqual([]);
  });

  it("always keeps the foundation route reason first, whatever max is", () => {
    const route = { ...reason("unknown", "route", "route"), code: "route_foundation" as const };
    const others = [reason("fail", "f1"), reason("fail", "f2"), reason("fail", "f3")];
    const foundation = withReasons([...others, route], "foundation");
    expect(topReasons(foundation).map((r) => r.ruleId)).toEqual(["route", "f1", "f2"]);
    expect(topReasons(foundation, 0).map((r) => r.ruleId)).toEqual(["route"]);
    expect(topReasons(withReasons([route], "foundation"), 0)).toEqual([route]);
  });

  it("always keeps the coverage reason, last, whatever max is", () => {
    const coverage = {
      ...reason("unknown", "coverage", "coverage"),
      code: "coverage_partial" as const,
    };
    const reasons = [coverage, reason("fail", "f1"), reason("fail", "f2"), reason("fail", "f3")];
    expect(topReasons(withReasons(reasons)).map((r) => r.ruleId)).toEqual(["f1", "f2", "coverage"]);
    expect(topReasons(withReasons(reasons), 0).map((r) => r.ruleId)).toEqual(["coverage"]);
    expect(topReasons(withReasons([coverage, reason("pass", "p1")])).map((r) => r.ruleId)).toEqual([
      "p1",
      "coverage",
    ]);
  });

  it("does not pin the route reason when the route is not foundation", () => {
    const route = { ...reason("pass", "route", "route") };
    const reasons = [route, reason("fail", "f1")];
    expect(topReasons(withReasons(reasons), 1).map((r) => r.ruleId)).toEqual(["f1"]);
  });
});

const PROFILES = [
  ["E2E_PROFILE", E2E_PROFILE],
  ["E2E_PROFILE_WITH_BUDGET", E2E_PROFILE_WITH_BUDGET],
  ["E2E_PROFILE_XB_ONLY", E2E_PROFILE_XB_ONLY],
] as const;

describe("buildMatchesView on the e2e fixture", () => {
  describe.each(PROFILES)("with %s", (name, profile) => {
    const hidden: Partial<Record<string, readonly PreferenceMismatch[]>> =
      E2E_EXPECTED.hidden[name];

    it("puts each kept program in the group E2E_EXPECTED gives", () => {
      const view = viewFor(profile);
      const expected = Object.entries(E2E_EXPECTED.programs).filter(
        ([slug]) => hidden[slug] === undefined,
      );
      for (const [slug, program] of expected) {
        expect(slugsIn(view, program.group), slug).toContain(slug);
        expect(card(view, slug).group, slug).toBe(program.group);
        expect(card(view, slug).match.status, slug).toBe(program.status);
      }
      expect(
        cards(view)
          .map((c) => c.slug)
          .sort(),
      ).toEqual(expected.map(([slug]) => slug).sort());
    });

    it("hides exactly the expected programs with their mismatch kinds, unmatched", () => {
      const view = viewFor(profile);
      const actual = Object.fromEntries(view.hidden.map((h) => [h.slug, h.mismatches]));
      expect(actual).toEqual(hidden);
      for (const program of view.hidden) {
        expect(program.name).toBe(programOf(frBundle, program.slug).name);
        expect(program).not.toHaveProperty("match");
      }
      expect(view.hiddenCount).toBe(Object.keys(hidden).length);
      for (const mismatch of PREFERENCE_MISMATCHES) {
        const expectedCount = Object.values(hidden).filter((m) => m?.includes(mismatch)).length;
        expect(view.hiddenByMismatch[mismatch], mismatch).toBe(expectedCount);
      }
    });

    it("has counts that add up", () => {
      const view = viewFor(profile);
      for (const group of MATCH_GROUPS) {
        expect(view.counts[group]).toBe(view.groups[group].length);
      }
      const kept = MATCH_GROUPS.reduce((sum, group) => sum + view.counts[group], 0);
      expect(view.totalPrograms).toBe(allPrograms(frBundle).length);
      expect(view.totalPrograms).toBe(kept + view.hiddenCount);
    });
  });

  it("puts the stale program in check, never ok or failed", () => {
    const view = viewFor(E2E_PROFILE);
    expect(card(view, E2E_SLUGS.stale).group).toBe("check");
    expect(card(view, E2E_SLUGS.stale).match.reasons.some((r) => r.code === "stale_source")).toBe(
      true,
    );
  });

  it("lets the budget change only the budget fit, never the group", () => {
    const plain = viewFor(E2E_PROFILE);
    const budget = viewFor(E2E_PROFILE_WITH_BUDGET);
    for (const group of MATCH_GROUPS) {
      expect(slugsIn(budget, group)).toEqual(slugsIn(plain, group));
    }
    expect(card(plain, E2E_SLUGS.ok).cost.budgetFit).toBe("unknown");
    expect(card(budget, E2E_SLUGS.ok).cost.budgetFit).not.toBe("unknown");
    expect(card(budget, E2E_SLUGS.ok).cost.complete).toBe(true);
    expect(card(budget, E2E_SLUGS.foundation).cost.budgetFit).toBe("unknown");
  });

  it("each card carries its country, field and the bundle's snapshot version (the save button needs them)", () => {
    const view = viewFor(E2E_PROFILE);
    const c = card(view, E2E_SLUGS.ok);
    const program = programOf(frBundle, E2E_SLUGS.ok);
    expect(c.country).toBe(program.country);
    expect(c.field).toBe(program.field);
    expect(c.snapshotVersion).toBe(frBundle.snapshotVersion);
  });

  it("builds the ok program card from the program, institution, channel and text", () => {
    const view = viewFor(E2E_PROFILE);
    const ok = card(view, E2E_SLUGS.ok);
    const program = programOf(frBundle, E2E_SLUGS.ok);
    expect(ok.name).toBe("XX Test Programme OK");
    expect(ok.institutionName).toBe("XX Test Public Institution B");
    expect(ok.cityName).toBe("XX Test City B");
    expect(ok.level).toBe("bachelor");
    expect(ok.teachingLanguages).toEqual(program.teachingLanguages);
    expect(ok.tuition).toEqual(program.tuition);
    expect(ok.applicationChannel).toEqual({
      name: "XX Test Portal B",
      kind: "national_portal",
      accountRequired: true,
    });
    expect(ok.summaryText).toEqual({ text: "Programme test complet et concordant", note: "none" });
    expect(ok.intake.kind).toBe("upcoming");
    expect(ok.intake.kind === "upcoming" && ok.intake.intake.applicationDeadline).toBe(
      "2027-01-15",
    );
    expect(ok.cost.lines).toHaveLength(7);
    expect(ok.topReasons.length).toBeLessThanOrEqual(3);
    expect(ok.topReasons.length).toBeGreaterThan(0);
    for (const r of ok.topReasons) expect(r.key).toBe(`domain.reason.code.${r.code}`);
  });

  it("lists every fact the card shows, once", () => {
    const ok = card(viewFor(E2E_PROFILE), E2E_SLUGS.ok);
    const ids = ok.factRefs.map((f) => `${f.record}#${f.path}`);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of [
      `programs/${E2E_SLUGS.ok}#teachingLanguages`,
      `programs/${E2E_SLUGS.ok}#tuition`,
      `programs/${E2E_SLUGS.ok}#intakes`,
      `programs/${E2E_SLUGS.ok}#applicationChannel`,
      "application-channels/xx-test-channel-portal#",
      "institutions/xx-test-inst-pub-b#",
      "cost-profiles/xx-test-costs-xb#lines.housing",
      "cost-profiles/xx-test-costs-xb#lines.setup",
    ]) {
      expect(ids, id).toContain(id);
    }
    for (const r of ok.topReasons) {
      for (const f of r.facts) expect(ids).toContain(`${f.record}#${f.path}`);
    }
  });

  it("gives the foundation card its route reason first", () => {
    const foundation = card(viewFor(E2E_PROFILE), E2E_SLUGS.foundation);
    expect(foundation.topReasons[0]?.code).toBe("route_foundation");
    expect(foundation.topReasons[0]?.kind).toBe("route");
  });

  it("carries the text note of the summary in the page locale", () => {
    const view = okView(
      buildMatchesView({ profile: E2E_PROFILE, bundle: arBundle, now: E2E_NOW, locale: "ar" }),
    );
    expect(card(view, E2E_SLUGS.frOnly).summaryText?.note).toBe("french_fallback");
    expect(card(view, E2E_SLUGS.frOnly).intake.kind).toBe("unknown");
  });

  it("falls back to the slugs when institution data is missing, without throwing", () => {
    const bundle: SnapshotBundle = { ...frBundle, institutions: [] };
    const ok = card(viewFor(E2E_PROFILE, bundle), E2E_SLUGS.ok);
    expect(ok.institutionName).toBe("xx-test-inst-pub-b");
    expect(ok.cityName).toBe("xx-test-city-b");
    expect(ok.factRefs.some((f) => f.record.startsWith("institutions/"))).toBe(false);
  });

  it("returns no_programs for an empty catalogue", () => {
    const bundle: SnapshotBundle = { ...frBundle, programs: [], hasPrograms: false };
    expect(buildMatchesView({ profile: E2E_PROFILE, bundle, now: E2E_NOW, locale: "fr" })).toEqual({
      kind: "no_programs",
    });
  });

  it("returns ok with empty groups when every program is hidden", () => {
    const view = viewFor({ ...E2E_PROFILE, destinations: ["XZ"] });
    for (const group of MATCH_GROUPS) expect(view.groups[group]).toEqual([]);
    expect(view.hiddenCount).toBe(view.totalPrograms);
    expect(view.totalPrograms).toBeGreaterThan(0);
    expect(view.hiddenByMismatch.destination).toBe(view.totalPrograms);
  });

  it("counts a field mismatch if a program of another field is present", () => {
    const ok = programOf(frBundle, E2E_SLUGS.ok);
    const other: Program = { ...ok, slug: "xx-test-other-field", field: "xx-test-field-other" };
    const view = viewFor(E2E_PROFILE, withPrograms(frBundle, [ok, other]));
    expect(view.hidden).toEqual([
      { slug: "xx-test-other-field", name: ok.name, mismatches: ["field"] },
    ]);
    expect(view.hiddenByMismatch.field).toBe(1);
    expect(view.totalPrograms).toBe(2);
  });

  it("throws when the core shard is missing: that is a programmer error", () => {
    const bundle: SnapshotBundle = { ...frBundle, core: undefined };
    expect(() =>
      buildMatchesView({ profile: E2E_PROFILE, bundle, now: E2E_NOW, locale: "fr" }),
    ).toThrow();
  });

  it("sorts a group by next upcoming deadline, then unknown and closed, ties by slug", () => {
    const ok = programOf(frBundle, E2E_SLUGS.ok);
    const fail = programOf(frBundle, E2E_SLUGS.fail);
    const intake = (applicationDeadline: string | null): Intake => ({
      startDate: null,
      applicationOpens: null,
      applicationDeadline,
    });
    const variant = (base: Program, slug: string, intakes: Intake[] | null): Program => ({
      ...base,
      slug,
      intakes: { ...base.intakes, value: intakes },
    });
    const programs = [
      variant(ok, "xx-sort-e-late", [intake("2027-03-01")]),
      variant(ok, "xx-sort-a-unknown", null),
      variant(ok, "xx-sort-d-early", [intake("2026-12-01"), intake("2026-01-01")]),
      variant(ok, "xx-sort-b-closed", [intake("2026-06-01")]),
      variant(ok, "xx-sort-f-no-dates", [intake(null)]),
      variant(ok, "xx-sort-c-early", [intake("2026-12-01")]),
      variant(fail, "xx-sort-0-failed-earliest", [intake("2026-10-01")]),
    ];
    const view = viewFor(E2E_PROFILE, withPrograms(frBundle, programs));
    expect(slugsIn(view, "ok")).toEqual([
      "xx-sort-c-early",
      "xx-sort-d-early",
      "xx-sort-e-late",
      "xx-sort-a-unknown",
      "xx-sort-b-closed",
      "xx-sort-f-no-dates",
    ]);
    expect(slugsIn(view, "failed")).toEqual(["xx-sort-0-failed-earliest"]);
    expect(card(view, "xx-sort-b-closed").intake.kind).toBe("closed");
    expect(card(view, "xx-sort-a-unknown").intake.kind).toBe("unknown");
  });

  it("returns no_programs_for_fields when programs exist but none for the student's fields", () => {
    const bundle: SnapshotBundle = { ...frBundle, programs: [] };
    expect(buildMatchesView({ profile: E2E_PROFILE, bundle, now: E2E_NOW, locale: "fr" })).toEqual({
      kind: "no_programs_for_fields",
    });
  });

  it("sorts hidden programs by slug", () => {
    const priv = programOf(frBundle, E2E_SLUGS.private);
    const programs = [
      { ...priv, slug: "xx-z-private" },
      programOf(frBundle, E2E_SLUGS.ok),
      { ...priv, slug: "xx-a-private" },
    ];
    const view = viewFor(E2E_PROFILE, withPrograms(frBundle, programs));
    expect(view.hidden.map((h) => h.slug)).toEqual(["xx-a-private", "xx-z-private"]);
  });

  it("is JSON-serialisable, so it can cross an island boundary", () => {
    for (const [, profile] of PROFILES) {
      const view = viewFor(profile);
      expect(JSON.parse(JSON.stringify(view))).toStrictEqual(view);
    }
  });
});

// The XB route (direct in the fixture) with some fields replaced, for the ok program's destination.
function withXbRoute(
  patch: (route: AdmissionRoute) => AdmissionRoute,
  bundle: SnapshotBundle = frBundle,
): SnapshotBundle {
  const routes = bundle.routes;
  if (routes === undefined) throw new Error("fixture bundle has no routes shard");
  return {
    ...bundle,
    routes: {
      ...routes,
      routes: routes.routes.map((r) => (r.destination === "XB" ? patch(r) : r)),
    },
  };
}

const STALE_DATE = "2020-01-01";

describe("route message key", () => {
  function okCard(bundle: SnapshotBundle): MatchCardModel {
    return card(viewFor(E2E_PROFILE, bundle), E2E_SLUGS.ok);
  }

  it("names the route when its fact is decisive, or for foundation / check / missing", () => {
    const view = viewFor(E2E_PROFILE);
    expect(card(view, E2E_SLUGS.ok).routeKey).toBe("domain.route.direct");
    expect(card(view, E2E_SLUGS.foundation).routeKey).toBe("domain.route.foundation");

    const failed = okCard(withXbRoute((r) => ({ ...r, outcome: "not_eligible" })));
    expect(failed.group).toBe("failed");
    expect(failed.routeKey).toBe("domain.route.not_eligible");

    const check = okCard(withXbRoute((r) => ({ ...r, outcome: "check" })));
    expect(check.routeKey).toBe("domain.route.check");

    const missing = okCard({ ...frBundle, routes: undefined });
    expect(missing.match.route).toBe("missing");
    expect(missing.routeKey).toBe("domain.route.missing");
  });

  it.each([
    ["direct", "stale", "domain.route.staleSource"],
    ["not_eligible", "stale", "domain.route.staleSource"],
    ["direct", "guidance", "domain.route.nonOfficialSource"],
    ["not_eligible", "guidance", "domain.route.nonOfficialSource"],
  ] as const)("never states a %s route resting on a %s fact", (outcome, weakness, key) => {
    const bundle = withXbRoute((r) => ({
      ...r,
      outcome,
      fact:
        weakness === "stale"
          ? { ...r.fact, last_verified_at: STALE_DATE }
          : { ...r.fact, info_kind: "guidance" },
    }));
    const ok = okCard(bundle);
    expect(ok.match.route).toBe(outcome);
    expect(ok.match.status).toBe("check");
    expect(ok.group).toBe("check");
    expect(ok.routeKey).toBe(key);
    expect(routeKeyOf(ok.match)).toBe(key);
  });

  it("falls back to the neutral check key, never an outcome, without a source reason", () => {
    const unknownRoute: Reason = {
      ruleId: "route",
      kind: "route",
      outcome: "unknown",
      code: "route_check",
      facts: [],
    };
    for (const route of ["direct", "not_eligible"] as const) {
      expect(routeKeyOf({ route, reasons: [] })).toBe("domain.route.check");
      expect(routeKeyOf({ route, reasons: [unknownRoute] })).toBe("domain.route.check");
    }
  });
});
