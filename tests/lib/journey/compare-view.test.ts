import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Profile } from "@/data-schema/profile";
import { matchProgram } from "@/domain/match";
import { buildCompareView, COMPARE_ROWS, type CompareProgram } from "@/lib/journey/compare-view";
import { buildMatchesView, type MatchCardModel } from "@/lib/journey/matches-view";
import type { SnapshotBundle } from "@/lib/snapshot/client";

import {
  E2E_FILTERS,
  E2E_NOW,
  E2E_PROFILE,
  E2E_SCHOLARSHIP_SLUGS,
  E2E_SLUGS,
} from "../../fixtures/e2e/profiles";
import { forbidConsole } from "../profile/no-console";
import { buildSnapshot, buildVariant, E2E_DATA_DIR, removeTempDirs } from "../snapshot/fixture";
import { loadMatchesBundle } from "./bundle";

forbidConsole();

const PORTAL = "xx-test-channel-portal";
const DIRECT = "xx-test-channel-direct";

let bundle: SnapshotBundle;
// The private programme given the OK programme's tuition (120000 XTS a year).
let sameTuitionBundle: SnapshotBundle;
// The stale programme with its main source aged: its intake and languages are stale too.
let staleIntakeBundle: SnapshotBundle;
// The private programme on the range 120000-300000 (income based), the OK programme a flat 120000.
let rangeBundle: SnapshotBundle;
// Both programmes on the same income-based range.
let twinRangeBundle: SnapshotBundle;
// The same bounds, with the income basis on one programme only.
let basisOnlyBundle: SnapshotBundle;

beforeAll(async () => {
  const RANGE_WITH_BASIS =
    "{ amountMinor: 120000, maxAmountMinor: 300000, currency: XTS, period: year, basis: income_based }";
  const RANGE_NO_BASIS =
    "{ amountMinor: 120000, maxAmountMinor: 300000, currency: XTS, period: year }";
  const OK_FEE = "{ amountMinor: 120000, currency: XTS, period: year }";
  const PRIVATE_FEE = "{ amountMinor: 450000, currency: XTS, period: year }";
  bundle = await loadMatchesBundle(buildSnapshot(E2E_DATA_DIR), E2E_PROFILE, "fr");
  sameTuitionBundle = await loadMatchesBundle(
    buildVariant([
      {
        file: "programs/xx-test-prog-private.yaml",
        from: "amountMinor: 450000",
        to: "amountMinor: 120000",
      },
    ]),
    E2E_PROFILE,
    "fr",
  );
  rangeBundle = await loadMatchesBundle(
    buildVariant([
      { file: "programs/xx-test-prog-private.yaml", from: PRIVATE_FEE, to: RANGE_WITH_BASIS },
    ]),
    E2E_PROFILE,
    "fr",
  );
  twinRangeBundle = await loadMatchesBundle(
    buildVariant([
      { file: "programs/xx-test-prog-ok.yaml", from: OK_FEE, to: RANGE_WITH_BASIS },
      { file: "programs/xx-test-prog-private.yaml", from: PRIVATE_FEE, to: RANGE_WITH_BASIS },
    ]),
    E2E_PROFILE,
    "fr",
  );
  basisOnlyBundle = await loadMatchesBundle(
    buildVariant([
      { file: "programs/xx-test-prog-ok.yaml", from: OK_FEE, to: RANGE_NO_BASIS },
      { file: "programs/xx-test-prog-private.yaml", from: PRIVATE_FEE, to: RANGE_WITH_BASIS },
    ]),
    E2E_PROFILE,
    "fr",
  );
  staleIntakeBundle = await loadMatchesBundle(
    buildVariant([
      {
        file: "programs/xx-test-prog-stale.yaml",
        from: "last_verified_at: 2026-09-01",
        to: "last_verified_at: 2025-02-07",
      },
    ]),
    E2E_PROFILE,
    "fr",
  );
}, 180_000);

afterAll(removeTempDirs);

function view(
  slugs: readonly string[],
  from: SnapshotBundle = bundle,
  profile: Profile = E2E_PROFILE,
) {
  return buildCompareView({
    profile,
    filters: E2E_FILTERS,
    bundle: from,
    slugs,
    now: E2E_NOW,
    locale: "fr",
  });
}

function programOf(slug: string, from: SnapshotBundle = bundle): CompareProgram {
  const found = view([slug], from).programs[0];
  if (found === undefined) throw new Error(`no compare program for ${slug}`);
  return found;
}

function withoutScholarship(from: SnapshotBundle, slug: string): SnapshotBundle {
  return {
    ...from,
    scholarships: from.scholarships.map((shard) => ({
      ...shard,
      scholarships: shard.scholarships.filter((s) => s.slug !== slug),
    })),
  };
}

// Gives programmes a recurring application deadline (no year) in place of their intakes.
function withRecurring(
  from: SnapshotBundle,
  deadlines: Record<string, { month: number; day: number }>,
): SnapshotBundle {
  return {
    ...from,
    programs: from.programs.map((shard) => ({
      ...shard,
      programs: shard.programs.map((program) => {
        const deadline = deadlines[program.slug];
        return deadline === undefined
          ? program
          : {
              ...program,
              intakes: {
                ...program.intakes,
                value: [
                  {
                    startDate: null,
                    applicationOpens: null,
                    applicationDeadline: null,
                    recurringDeadline: deadline,
                  },
                ],
              },
            };
      }),
    })),
  };
}

describe("buildCompareView", () => {
  it("returns the found programs in the order of the slugs and lists the missing ones", () => {
    const result = view([E2E_SLUGS.ok, "xx-gone", E2E_SLUGS.check]);
    expect(result.programs.map((p) => p.slug)).toEqual([E2E_SLUGS.ok, E2E_SLUGS.check]);
    expect(result.missing).toEqual(["xx-gone"]);
  });

  describe("renamed slugs", () => {
    const FORMER = "xx-test-prog-old-ok";

    it("compares a former slug as the programme it was renamed to, keeping the requested slug", () => {
      const former = programOf(FORMER);
      const canonical = programOf(E2E_SLUGS.ok);
      expect(former.slug).toBe(FORMER);
      expect({ ...former, slug: canonical.slug }).toEqual(canonical);
      expect(view([FORMER, E2E_SLUGS.check]).missing).toEqual([]);
    });

    it("still lists a slug that is neither live nor aliased as missing", () => {
      expect(view([E2E_SLUGS.ok, "xx-test-prog-never-existed"]).missing).toEqual([
        "xx-test-prog-never-existed",
      ]);
    });
  });

  it("returns nothing, with every row equal, when no slug is given", () => {
    const result = view([]);
    expect(result.programs).toEqual([]);
    expect(result.missing).toEqual([]);
    expect(Object.values(result.differs).every((value) => !value)).toBe(true);
  });

  it("carries every reason of the match, not the card's top three", () => {
    const program = programOf(E2E_SLUGS.ok);
    const core = bundle.core;
    if (core === undefined) throw new Error("fixture bundle has no core shard");
    const source = bundle.programs.flatMap((s) => s.programs).find((p) => p.slug === E2E_SLUGS.ok);
    if (source === undefined) throw new Error("fixture program missing");
    const match = matchProgram({
      profile: E2E_PROFILE,
      program: source,
      routes: bundle.routes?.routes ?? [],
      reference: core,
      now: E2E_NOW,
    });
    expect(match.reasons.length).toBeGreaterThan(3);
    expect(program.reasons).toHaveLength(match.reasons.length);
    expect(program.reasons.map((r) => r.kind)).toEqual(match.reasons.map((r) => r.kind));
  });

  it("gives the same tuition, cost, languages, deadline, group and route as the matches page", () => {
    const matches = buildMatchesView({
      profile: E2E_PROFILE,
      filters: E2E_FILTERS,
      bundle,
      now: E2E_NOW,
      locale: "fr",
    });
    if (matches.kind !== "ok") throw new Error("expected an ok matches view");
    const cards: MatchCardModel[] = Object.values(matches.groups).flat();
    expect(cards.length).toBeGreaterThanOrEqual(5);

    const result = view(cards.map((card) => card.slug));
    expect(result.programs.map((p) => p.slug)).toEqual(cards.map((card) => card.slug));
    for (const card of cards) {
      const program = result.programs.find((p) => p.slug === card.slug);
      if (program === undefined) throw new Error(`no compare program for ${card.slug}`);
      expect(program.tuition).toEqual(card.tuition);
      expect(program.cost).toEqual(card.cost);
      expect(program.teachingLanguages).toEqual(card.teachingLanguages);
      expect(program.intake).toEqual(card.intake);
      expect(program.group).toBe(card.group);
      expect(program.routeKey).toBe(card.routeKey);
      expect(program.name).toBe(card.name);
      expect(program.institutionName).toBe(card.institutionName);
      expect(program.cityName).toBe(card.cityName);
    }
  });

  it("lists the scholarships the student's nationality may apply to, by name", () => {
    // Nationality XA: the open and the XA scholarships apply, the XZ-only one is filtered out.
    expect(programOf(E2E_SLUGS.ok).scholarships).toEqual([
      { slug: E2E_SCHOLARSHIP_SLUGS.open, name: "XX Test Open Scholarship" },
      { slug: E2E_SCHOLARSHIP_SLUGS.xaOnly, name: "XX Test XA Scholarship" },
    ]);
  });

  it("lists no scholarship when the nationality is outside every scholarship that remains", () => {
    const profile: Profile = { ...E2E_PROFILE, nationality: "XB" };
    expect(programOf(E2E_SLUGS.ok, bundle).scholarships.length).toBe(2);
    const open = view([E2E_SLUGS.ok], bundle, profile).programs[0];
    expect(open?.scholarships).toEqual([
      { slug: E2E_SCHOLARSHIP_SLUGS.open, name: "XX Test Open Scholarship" },
    ]);
    const none = view(
      [E2E_SLUGS.ok],
      withoutScholarship(bundle, E2E_SCHOLARSHIP_SLUGS.open),
      profile,
    ).programs[0];
    expect(none?.scholarships).toEqual([]);
  });

  it("resolves the application channel and its fact, and the documents with localized names", () => {
    const program = programOf(E2E_SLUGS.ok);
    expect(program.channel).toEqual({
      slug: PORTAL,
      name: "XX Test Portal B",
      kind: "national_portal",
      url: "https://example.org/portal-b",
      accountRequired: true,
    });
    expect(program.channelFact?.record).toBe(`application-channels/${PORTAL}`);
    expect(program.documents).toEqual([
      {
        slug: "xx-test-doc-transcript",
        name: { text: "Releve de notes test", note: "none" },
        translationRequired: true,
      },
      {
        slug: "xx-test-doc-identity",
        name: { text: "Piece d identite test", note: "none" },
        translationRequired: false,
      },
      {
        slug: "xx-test-doc-motivation",
        name: { text: "Lettre de motivation test", note: "none" },
        translationRequired: null,
      },
    ]);
    expect(program.documentsMeta.value?.length).toBe(3);

    const direct = programOf(E2E_SLUGS.check);
    expect(direct.channel?.slug).toBe(DIRECT);
    expect(direct.channel?.kind).toBe("direct");
    expect(direct.channel?.accountRequired).toBe(false);
  });

  it("marks a row as different when two programs hold different values", () => {
    const result = view([E2E_SLUGS.ok, E2E_SLUGS.foundation]);
    expect(result.differs.tuition).toBe(true);
    expect(result.differs.result).toBe(true);
    expect(result.differs.language).toBe(false);
  });

  it("marks a row as the same when two programs hold equal values", () => {
    const result = view([E2E_SLUGS.ok, E2E_SLUGS.private], sameTuitionBundle);
    expect(result.differs.tuition).toBe(false);
    expect(result.differs.language).toBe(false);
    expect(result.differs.scholarships).toBe(false);
    expect(result.differs.deadline).toBe(false);
    expect(result.differs.result).toBe(false);
    // One uses the portal, the other a direct application.
    expect(result.differs.application).toBe(true);
  });

  it("treats a range as different from a flat fee with the same minimum", () => {
    // ok is flat 120000; private is now the range 120000-300000
    const result = view([E2E_SLUGS.ok, E2E_SLUGS.private], rangeBundle);
    expect(result.differs.tuition).toBe(true);
  });

  it("treats two identical ranges as the same", () => {
    expect(view([E2E_SLUGS.ok, E2E_SLUGS.private], twinRangeBundle).differs.tuition).toBe(false);
  });

  it("treats the same bounds with and without an income basis as different", () => {
    expect(view([E2E_SLUGS.ok, E2E_SLUGS.private], basisOnlyBundle).differs.tuition).toBe(true);
  });

  it("marks the cost row as different when two programs have different totals", () => {
    const result = view([E2E_SLUGS.ok, E2E_SLUGS.foundation]);
    const [a, b] = result.programs.map((p) => JSON.stringify(p.cost.totals));
    expect(a).not.toBeUndefined();
    expect(a).not.toBe("[]");
    expect(a).not.toBe(b);
    expect(result.differs.cost).toBe(true);
  });

  it("marks the cost row as the same when two programs have identical totals", () => {
    const result = view([E2E_SLUGS.fail, E2E_SLUGS.check]);
    const [a, b] = result.programs.map((p) => p.cost);
    if (a === undefined || b === undefined) throw new Error("need both programs");
    expect(a.totals.length).toBeGreaterThan(0);
    expect(a.totals).toEqual(b.totals);
    expect(a.complete).toBe(b.complete);
    expect(result.differs.cost).toBe(false);
  });

  it("marks the language row as different when the teaching languages differ, and the same when equal", () => {
    const different = view([E2E_SLUGS.fail, E2E_SLUGS.check]);
    expect(different.programs.map((p) => p.teachingLanguages.value)).toEqual([["fr"], ["en"]]);
    expect(different.differs.language).toBe(true);
    const same = view([E2E_SLUGS.ok, E2E_SLUGS.fail]);
    expect(same.programs.map((p) => p.teachingLanguages.value)).toEqual([["fr"], ["fr"]]);
    expect(same.differs.language).toBe(false);
  });

  it("treats an empty scholarship list as a value, so two empty lists are the same", () => {
    let none = withoutScholarship(sameTuitionBundle, E2E_SCHOLARSHIP_SLUGS.open);
    none = withoutScholarship(none, E2E_SCHOLARSHIP_SLUGS.xaOnly);
    const result = view([E2E_SLUGS.ok, E2E_SLUGS.private], none);
    expect(result.programs.every((p) => p.scholarships.length === 0)).toBe(true);
    expect(result.differs.scholarships).toBe(false);
  });

  it("has no difference on any row with fewer than two programs", () => {
    for (const slugs of [[E2E_SLUGS.check], [E2E_SLUGS.ok, "xx-gone"]]) {
      const { differs } = view(slugs);
      for (const row of COMPARE_ROWS) expect(differs[row]).toBe(false);
    }
  });

  it("never counts an unknown value as the same: two unknown tuitions still differ", () => {
    const result = view([E2E_SLUGS.check, E2E_SLUGS.stale]);
    expect(result.programs.map((p) => p.tuition.value)).toEqual([null, null]);
    expect(result.differs.tuition).toBe(true);
  });

  it("never counts an unknown application as the same: two missing channels still differ", () => {
    const core = bundle.core;
    if (core === undefined) throw new Error("fixture bundle has no core shard");
    const noDirect: SnapshotBundle = {
      ...bundle,
      core: {
        ...core,
        applicationChannels: core.applicationChannels.filter((c) => c.slug !== DIRECT),
      },
    };
    const result = view([E2E_SLUGS.check, E2E_SLUGS.private], noDirect);
    expect(result.programs.map((p) => p.channel)).toEqual([null, null]);
    expect(result.programs.map((p) => p.channelFact)).toEqual([null, null]);
    expect(result.differs.application).toBe(true);
  });

  it("never counts two programs to check as the same result", () => {
    const result = view([E2E_SLUGS.check, E2E_SLUGS.stale]);
    expect(result.programs.map((p) => p.group)).toEqual(["check", "check"]);
    expect(result.differs.result).toBe(true);
  });

  describe("a recurring deadline", () => {
    const usually = (month: number, day: number) => ({ month, day });

    it("is a known value: the same usual date reads as the same, another one differs", () => {
      const same = withRecurring(bundle, {
        [E2E_SLUGS.ok]: usually(7, 15),
        [E2E_SLUGS.check]: usually(7, 15),
      });
      const equal = view([E2E_SLUGS.ok, E2E_SLUGS.check], same);
      expect(equal.programs.map((p) => p.intake.kind)).toEqual(["recurring", "recurring"]);
      expect(equal.differs.deadline).toBe(false);

      const other = withRecurring(bundle, {
        [E2E_SLUGS.ok]: usually(7, 15),
        [E2E_SLUGS.check]: usually(5, 1),
      });
      expect(view([E2E_SLUGS.ok, E2E_SLUGS.check], other).differs.deadline).toBe(true);
    });

    it("never counts a recurring deadline as the same as an unknown or a closed one", () => {
      const recurring = withRecurring(bundle, { [E2E_SLUGS.ok]: usually(7, 15) });
      const withUnknown = view([E2E_SLUGS.ok, E2E_SLUGS.frOnly], recurring);
      expect(withUnknown.programs.map((p) => p.intake.kind)).toEqual(["recurring", "unknown"]);
      expect(withUnknown.differs.deadline).toBe(true);
      const withClosed = view([E2E_SLUGS.ok, E2E_SLUGS.check], recurring);
      expect(withClosed.programs.map((p) => p.intake.kind)).toEqual(["recurring", "closed"]);
      expect(withClosed.differs.deadline).toBe(true);
    });
  });

  it("never counts an unknown deadline as the same as a closed one", () => {
    const result = view([E2E_SLUGS.frOnly, E2E_SLUGS.check]);
    expect(result.programs.map((p) => p.intake.kind)).toEqual(["unknown", "closed"]);
    expect(result.differs.deadline).toBe(true);
  });

  it("keeps the stale programme in 'check' and carries the stale freshness to its cells", () => {
    const stale = programOf(E2E_SLUGS.stale);
    expect(stale.group).toBe("check");
    const reasonFreshness = stale.reasons.flatMap((r) => r.facts.map((f) => f.freshness));
    expect(reasonFreshness).toContain("stale");

    const aged = programOf(E2E_SLUGS.stale, staleIntakeBundle);
    expect(aged.group).toBe("check");
    expect(aged.intake.fact?.freshness).toBe("stale");
    expect(aged.teachingLanguages.last_verified_at).toBe("2025-02-07");
  });

  it("throws, without echoing the profile, when the bundle has no core shard", () => {
    const run = () => view([E2E_SLUGS.ok], { ...bundle, core: undefined });
    expect(run).toThrow(/no core shard/);
    try {
      run();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain(E2E_PROFILE.nationality);
      expect(message).not.toContain(E2E_PROFILE.credential.type);
    }
  });
});
