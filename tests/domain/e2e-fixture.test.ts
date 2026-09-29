import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatBuildSummary, runBuild } from "@scripts/data/run-build";
import { runCheck } from "@scripts/data/run-check";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Profile } from "@/data-schema/profile";
import type { AdmissionRoute, CostProfile, Program, Scholarship } from "@/data-schema/resolved";
import {
  type CoreShard,
  type CostsShard,
  ManifestSchema,
  type ProgramsShard,
  type RoutesShard,
  type ScholarshipsShard,
  type TextShard,
} from "@/data-schema/snapshot";
import { estimateCost } from "@/domain/costs";
import { filterPrograms } from "@/domain/filter";
import { nextIntake } from "@/domain/intakes";
import { matchProgram } from "@/domain/match";
import { scholarshipsForProgram } from "@/domain/scholarships";
import type { MatchResult } from "@/domain/types";
import {
  E2E_EXPECTED,
  E2E_NOW,
  E2E_PROFILE,
  E2E_PROFILE_WITH_BUDGET,
  E2E_PROFILE_XB_ONLY,
  E2E_SLUGS,
  type E2eGroup,
  type E2eIntakeKind,
} from "../fixtures/e2e/profiles";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const FIXTURE_DIR = path.join(ROOT, "tests", "fixtures", "data", "e2e-journey");

type Built = {
  core: CoreShard;
  routes: AdmissionRoute[];
  programs: Program[];
  costProfiles: CostProfile[];
  scholarships: Scholarship[];
  textEn: Record<string, { text: string; status: string; fallback: boolean }>;
  snapshotSummary: string;
};

let outDir = "";
let built: Built;

beforeAll(() => {
  outDir = mkdtempSync(path.join(os.tmpdir(), "jisr-e2e-fixture-"));
  const manifest = runBuild({
    dataDir: FIXTURE_DIR,
    outDir,
    generatedAt: "2026-09-30T00:00:00.000Z",
    now: E2E_NOW,
  });
  ManifestSchema.parse(manifest);

  const shardNamesWithPrefix = (prefix: string) =>
    Object.keys(manifest.shards).filter((name) => name.startsWith(prefix));
  const read = <T>(name: string): T => {
    const entry = manifest.shards[name];
    if (!entry) throw new Error(`shard ${name} missing from manifest`);
    return JSON.parse(readFileSync(path.join(outDir, entry.file), "utf8")) as T;
  };

  const textEn: Built["textEn"] = {};
  for (const name of shardNamesWithPrefix("text.en.")) {
    Object.assign(textEn, read<TextShard>(name).entries);
  }

  built = {
    core: read<CoreShard>("core"),
    routes: read<RoutesShard>("routes.XA").routes,
    programs: shardNamesWithPrefix("programs.").flatMap((n) => read<ProgramsShard>(n).programs),
    costProfiles: shardNamesWithPrefix("costs.").flatMap((n) => read<CostsShard>(n).profiles),
    scholarships: shardNamesWithPrefix("scholarships.").flatMap(
      (n) => read<ScholarshipsShard>(n).scholarships,
    ),
    textEn,
    snapshotSummary: formatBuildSummary(manifest),
  };
}, 120_000);

afterAll(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true });
});

function program(slug: string): Program {
  const found = built.programs.find((p) => p.slug === slug);
  if (!found) throw new Error(`fixture program ${slug} missing`);
  return found;
}

function match(profile: Profile, slug: string, now = E2E_NOW): MatchResult {
  return matchProgram({
    profile,
    program: program(slug),
    routes: built.routes,
    reference: built.core,
    now,
  });
}

function groupOf(result: MatchResult): E2eGroup {
  if (result.route === "foundation") return "foundation";
  if (result.status === "satisfied") return "ok";
  if (result.status === "check") return "check";
  return "failed";
}

function intakeKindOf(slug: string): E2eIntakeKind {
  const kind = nextIntake(program(slug), E2E_NOW).kind;
  return kind === "unknown" ? "none" : kind;
}

const expectedSlugs = Object.keys(E2E_EXPECTED.programs).sort();
const profiles = [
  ["E2E_PROFILE", E2E_PROFILE],
  ["E2E_PROFILE_WITH_BUDGET", E2E_PROFILE_WITH_BUDGET],
  ["E2E_PROFILE_XB_ONLY", E2E_PROFILE_XB_ONLY],
] as const;

describe("e2e-journey fixture: dataset guards", () => {
  it("data:check reports 0 errors at the pinned clock", () => {
    const output = runCheck({
      dataDir: FIXTURE_DIR,
      outDir: "unused",
      strict: false,
      now: E2E_NOW,
    });

    expect(output.stderr).toEqual([]);
    expect(output.exitCode).toBe(0);
    expect(output.stdout.some((line) => /, 0 errors, /.test(line))).toBe(true);
  });

  it("the only stale fact is the stale program's rule, and no fact is dated in the future", () => {
    const output = runCheck({
      dataDir: FIXTURE_DIR,
      outDir: "unused",
      strict: false,
      now: E2E_NOW,
    });
    const stale = output.stdout.filter((line) => line.startsWith("STALE "));

    expect(stale).toHaveLength(1);
    expect(stale[0]).toContain(`${E2E_SLUGS.stale}.yaml`);
    expect(stale[0]).toContain("requirements.rules.");
  });

  it("the snapshot build succeeds", () => {
    expect(built.snapshotSummary).toMatch(/^data:build: \d+ shards, snapshot [0-9a-f]{12}/);
  });

  it("contains exactly the programs the expectations describe", () => {
    expect(built.programs.map((p) => p.slug).sort()).toEqual(expectedSlugs);
  });

  it("uses only synthetic identifiers and example.org sources", () => {
    for (const p of built.programs) {
      expect(p.slug.startsWith("xx-test-")).toBe(true);
      expect(p.officialUrl.startsWith("https://example.org/")).toBe(true);
    }
    const countries = built.core.countries.map((c) => c.code).sort();
    expect(countries).toEqual(["XA", "XB", "XC", "XZ"]);
    expect(built.core.countries.every((c) => c.currency === "XTS")).toBe(true);
  });
});

describe.each(profiles)("%s", (profileName, profile) => {
  it.each(expectedSlugs)("matchProgram: %s", (slug) => {
    const expected = E2E_EXPECTED.programs[slug as keyof typeof E2E_EXPECTED.programs];
    const result = match(profile, slug);

    expect({ status: result.status, route: result.route, group: groupOf(result) }).toEqual({
      status: expected.status,
      route: expected.route,
      group: expected.group,
    });
  });

  it("filterPrograms hides exactly the expected programs with the expected mismatches", () => {
    const expectedHidden = E2E_EXPECTED.hidden[profileName];
    const result = filterPrograms(profile, built.programs, E2E_NOW);

    expect(Object.fromEntries(result.excluded.map((e) => [e.programSlug, e.mismatches]))).toEqual(
      expectedHidden,
    );
    expect(result.kept.map((p) => p.slug).sort()).toEqual(
      expectedSlugs.filter((slug) => !(slug in expectedHidden)),
    );
  });
});

describe("next intake kind at the pinned clock", () => {
  it.each(expectedSlugs)("%s", (slug) => {
    const expected = E2E_EXPECTED.programs[slug as keyof typeof E2E_EXPECTED.programs];
    expect(intakeKindOf(slug)).toBe(expected.intake);
  });
});

describe("why each program gets its status (ADR 0005 semantics)", () => {
  const outcomes = (result: MatchResult) =>
    Object.fromEntries(result.reasons.map((r) => [r.ruleId, `${r.outcome}:${r.code}`]));

  it("ok: every reason passes on fresh official facts, the grade rule uses a real conversion", () => {
    const result = match(E2E_PROFILE, E2E_SLUGS.ok);

    expect(result.reasons.length).toBeGreaterThan(3);
    for (const reason of result.reasons) {
      expect(reason.outcome).toBe("pass");
      for (const fact of reason.facts) {
        expect(fact.info_kind).toBe("official");
        expect(fact.freshness).not.toBe("stale");
      }
    }
    expect(result.reasons.some((r) => r.studentConverted !== undefined)).toBe(true);
    expect(program(E2E_SLUGS.ok).requirements.coverage).toBe("complete");
  });

  it("fail: a fresh official grade threshold above the student's grade is a definite failure", () => {
    const result = match(E2E_PROFILE, E2E_SLUGS.fail);
    const reason = result.reasons.find((r) => r.outcome === "fail");

    expect(reason).toMatchObject({ kind: "overall_grade_min", code: "below_threshold" });
    expect(reason?.facts.every((f) => f.info_kind === "official" && f.freshness === "fresh")).toBe(
      true,
    );
  });

  it("check: partial coverage and unpublished thresholds, never satisfied, never failed", () => {
    const result = match(E2E_PROFILE, E2E_SLUGS.check);
    const codes = outcomes(result);

    expect(program(E2E_SLUGS.check).requirements.coverage).toBe("partial");
    expect(codes.coverage).toBe("unknown:coverage_partial");
    expect(Object.values(codes)).toContain("unknown:threshold_unpublished");
    expect(result.reasons.some((r) => r.outcome === "fail")).toBe(false);
  });

  it("stale: a rule that would pass is unknown with stale_source, and passes when the source is fresh", () => {
    const result = match(E2E_PROFILE, E2E_SLUGS.stale);
    const staleReasons = result.reasons.filter((r) => r.code === "stale_source");

    expect(staleReasons.length).toBeGreaterThan(0);
    expect(staleReasons.every((r) => r.outcome === "unknown")).toBe(true);
    expect(program(E2E_SLUGS.stale).requirements.coverage).toBe("complete");

    const whenFresh = match(E2E_PROFILE, E2E_SLUGS.stale, "2025-03-01");
    expect(whenFresh.status).toBe("satisfied");
  });

  it("private: satisfied for the profile, hidden only by the institution type preference", () => {
    expect(match(E2E_PROFILE, E2E_SLUGS.private).status).toBe("satisfied");
    expect(program(E2E_SLUGS.private).institutionType).toBe("private");
    const anyType = { ...E2E_PROFILE, institutionType: "any" } as const;
    expect(filterPrograms(anyType, built.programs, E2E_NOW).excluded).toEqual([]);
  });

  it("foundation: the route reason alone decides, rules are not evaluated", () => {
    const result = match(E2E_PROFILE, E2E_SLUGS.foundation);

    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]).toMatchObject({ kind: "route", code: "route_foundation" });
  });

  it("fr-only: en text falls back to French", () => {
    const summaryKey = `programs/${E2E_SLUGS.frOnly}#summary`;
    expect(built.textEn[summaryKey]?.fallback).toBe(true);
    const okKey = `programs/${E2E_SLUGS.ok}#summary`;
    expect(built.textEn[okKey]?.fallback).toBe(false);
  });

  it("the fixture keeps both draft and reviewed translations", () => {
    const statuses = new Set(Object.values(built.textEn).map((e) => e.status));
    expect(statuses).toEqual(new Set(["draft", "reviewed"]));
  });
});

describe("costs, scholarships and channels", () => {
  it("cost estimates: XB complete, XC incomplete", () => {
    const complete = estimateCost({
      program: program(E2E_SLUGS.ok),
      costProfiles: built.costProfiles,
      budget: E2E_PROFILE_WITH_BUDGET.budget,
      now: E2E_NOW,
    });
    const incomplete = estimateCost({
      program: program(E2E_SLUGS.foundation),
      costProfiles: built.costProfiles,
      budget: E2E_PROFILE_WITH_BUDGET.budget,
      now: E2E_NOW,
    });

    expect(complete.lines).toHaveLength(7);
    expect(complete.complete).toBe(true);
    expect(complete.totals).toHaveLength(1);
    expect(incomplete.complete).toBe(false);
    expect(incomplete.lines.some((l) => l.status === "missing")).toBe(true);
    for (const slug of E2E_EXPECTED.costs.completeFor) {
      expect(
        estimateCost({
          program: program(slug),
          costProfiles: built.costProfiles,
          budget: null,
          now: E2E_NOW,
        }).complete,
      ).toBe(true);
    }
    for (const slug of E2E_EXPECTED.costs.incompleteFor) {
      expect(
        estimateCost({
          program: program(slug),
          costProfiles: built.costProfiles,
          budget: null,
          now: E2E_NOW,
        }).complete,
      ).toBe(false);
    }
  });

  it("scholarships: the nationality filter drops the XZ-only scholarship even when it is linked", () => {
    const ok = program(E2E_SLUGS.ok);
    expect(ok.scholarships).toContain("xx-test-schol-xz");

    const listed = scholarshipsForProgram(E2E_PROFILE, ok, built.scholarships);
    expect(listed.map((s) => s.slug)).toEqual([...E2E_EXPECTED.scholarships.forOkProgram]);

    const forXz = scholarshipsForProgram(
      { ...E2E_PROFILE, nationality: "XZ" },
      ok,
      built.scholarships,
    );
    expect(forXz.map((s) => s.slug)).toEqual(["xx-test-schol-open", "xx-test-schol-xz"]);
  });

  it("application channels: one needs an account, one does not", () => {
    const needs = built.core.applicationChannels.map((c) => c.accountRequired);
    expect(needs).toContain(true);
    expect(needs).toContain(false);
  });

  it("the ok program has a linked scholarship, an account channel and three document kinds", () => {
    const ok = program(E2E_SLUGS.ok);
    const channel = built.core.applicationChannels.find(
      (c) => c.slug === ok.applicationChannel.value,
    );

    expect(ok.scholarships.length).toBeGreaterThan(0);
    expect(channel?.accountRequired).toBe(true);
    expect(ok.tuition.value).not.toBeNull();
    expect(ok.tuition.info_kind).toBe("official");
    expect(new Set((ok.documents.value ?? []).map((d) => d.translationRequired))).toEqual(
      new Set([true, false, null]),
    );
  });
});
