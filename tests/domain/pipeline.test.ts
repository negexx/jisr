import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Profile, ProfileSchema } from "@/data-schema/profile";
import type { AdmissionRoute, CostProfile, Program, Scholarship } from "@/data-schema/resolved";
import {
  type CoreShard,
  type CostsShard,
  ManifestSchema,
  type ProgramsShard,
  type RoutesShard,
  type ScholarshipsShard,
  shardNames,
} from "@/data-schema/snapshot";
import { generateChecklist } from "@/domain/checklist";
import { ACADEMIC_YEAR_MONTHS, estimateCost } from "@/domain/costs";
import { filterPrograms } from "@/domain/filter";
import { nextIntake } from "@/domain/intakes";
import { matchProgram } from "@/domain/match";
import { scholarshipsForProgram } from "@/domain/scholarships";
import { CHECKLIST_STEP_IDS } from "@/domain/types";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const BUILD_SCRIPT = path.join(ROOT, "scripts", "data", "build.ts");
const FIXTURE_DIR = path.join(ROOT, "tests", "fixtures", "data", "valid-minimal");

const FRESH = "2026-09-29";
const STALE = "2100-01-01";

type Built = {
  core: CoreShard;
  routes: AdmissionRoute[];
  program: Program;
  costProfiles: CostProfile[];
  scholarships: Scholarship[];
};

let outDir = "";
let built: Built;
let manifestShards: Record<string, { file: string }> = {};

function readShard<T>(manifestShards: Record<string, { file: string }>, name: string): T {
  const entry = manifestShards[name];
  if (!entry) throw new Error(`shard ${name} missing from manifest`);
  return JSON.parse(readFileSync(path.join(outDir, entry.file), "utf8")) as T;
}

beforeAll(() => {
  outDir = mkdtempSync(path.join(os.tmpdir(), "jisr-pipeline-"));
  const run = spawnSync(
    process.execPath,
    ["--import", "tsx", BUILD_SCRIPT, "--data-dir", FIXTURE_DIR, "--out-dir", outDir],
    { cwd: ROOT, encoding: "utf8", timeout: 120_000 },
  );
  if (run.status !== 0) {
    throw new Error(`data:build failed (status ${run.status})\n${run.stdout}\n${run.stderr}`);
  }

  const manifest = ManifestSchema.parse(
    JSON.parse(readFileSync(path.join(outDir, "manifest.json"), "utf8")),
  );
  const shards = manifest.shards;
  manifestShards = shards;
  const programs = readShard<ProgramsShard>(shards, shardNames.programs("XB", "xx-test-field"));
  const program = programs.programs[0];
  if (!program) throw new Error("fixture must contain a program in programs.XB.xx-test-field");

  built = {
    core: readShard<CoreShard>(shards, shardNames.core()),
    routes: readShard<RoutesShard>(shards, shardNames.routes("XA")).routes,
    program,
    costProfiles: readShard<CostsShard>(shards, shardNames.costs("XB")).profiles,
    scholarships: readShard<ScholarshipsShard>(shards, shardNames.scholarships("XB")).scholarships,
  };
}, 180_000);

afterAll(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true });
});

function makeProfile(overrides: Partial<Profile> = {}, languageLevel: "B2" | "A2" = "B2"): Profile {
  return ProfileSchema.parse({
    schemaVersion: 1,
    nationality: "XA",
    credential: {
      country: "XA",
      type: "xx-test-cred",
      track: "xx-test-track",
      status: "obtained",
      overall: { scale: "xx-test-scale-20", value: 15 },
      subjects: [
        { subject: "xx-test-subject-math", grade: { scale: "xx-test-scale-20", value: 14 } },
      ],
    },
    priorHigherEducationYears: 0,
    languages: [{ language: "xx", level: languageLevel, certificate: "xx-test-cert" }],
    fields: ["xx-test-field"],
    studyLanguages: [],
    destinations: [],
    budget: null,
    institutionType: "any",
    ...overrides,
  });
}

function match(profile: Profile, now: string) {
  return matchProgram({
    profile,
    program: built.program,
    routes: built.routes,
    reference: built.core,
    now,
  });
}

function checklist(profile: Profile, now: string) {
  const result = match(profile, now);
  const channel =
    built.core.applicationChannels.find((c) => c.slug === built.program.applicationChannel.value) ??
    null;
  return generateChecklist({
    profile,
    program: built.program,
    match: result,
    channel,
    scholarships: scholarshipsForProgram(profile, built.program, built.scholarships),
    now,
  });
}

function outcomeOf(result: ReturnType<typeof match>, ruleId: string): string | undefined {
  return result.reasons.find((r) => r.ruleId === ruleId)?.outcome;
}

describe("snapshot shards built by the real CLI", () => {
  it("contains the pieces the domain needs", () => {
    expect(built.core.credentialTypes.map((c) => c.slug)).toEqual(["xx-test-cred"]);
    expect(built.routes.map((r) => r.outcome)).toEqual(["direct"]);
    expect(built.program.slug).toBe("xx-test-prog");
    expect(built.costProfiles).toHaveLength(1);
    expect(built.scholarships.map((s) => s.slug)).toEqual(["xx-test-schol"]);
  });
});

describe("manifest and shard identity", () => {
  it("lists the core text shard for the default locale", () => {
    expect(Object.keys(manifestShards)).toContain("text.fr.core");
  });

  it("every shard's kind (and origin or destination) matches its manifest name", () => {
    const names = Object.keys(manifestShards);
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      const shard = readShard<{ kind: string; origin?: string; destination?: string }>(
        manifestShards,
        name,
      );
      const [kind, ...rest] = name.split(".");
      expect(shard.kind, name).toBe(kind);
      if (kind === "routes") expect(shard.origin, name).toBe(rest[0]);
      if (
        kind === "institutions" ||
        kind === "costs" ||
        kind === "programs" ||
        kind === "scholarships"
      ) {
        expect(shard.destination, name).toBe(rest[0]);
      }
    }
  });
});

describe("matchProgram on built shards", () => {
  it("fresh data: direct route, published rules evaluated, never satisfied while rules are unpublished", () => {
    const result = match(makeProfile(), FRESH);

    expect(result.programSlug).toBe("xx-test-prog");
    expect(result.route).toBe("direct");
    expect(result.reasons[0]).toMatchObject({ ruleId: "route", kind: "route", outcome: "pass" });
    expect(outcomeOf(result, "route:xx-test-cond-track")).toBe("pass");
    expect(outcomeOf(result, "xx-test-rule-grade")).toBe("unknown");
    expect(result.reasons.find((r) => r.ruleId === "xx-test-rule-grade")?.code).toBe(
      "threshold_unpublished",
    );
    expect(outcomeOf(result, "xx-test-rule-subject")).toBe("pass");
    expect(outcomeOf(result, "xx-test-rule-language")).toBe("pass");
    expect(outcomeOf(result, "xx-test-rule-manual")).toBe("unknown");
    expect(result.reasons.at(-1)).toMatchObject({ ruleId: "coverage", code: "coverage_partial" });
    expect(result.status).toBe("check");
  });

  it("a fresh, official language failure is a definite fail", () => {
    const result = match(makeProfile({}, "A2"), FRESH);

    expect(outcomeOf(result, "xx-test-rule-language")).toBe("fail");
    expect(result.status).toBe("not_satisfied");
  });

  it("every fact reference carries an https source and a verification date", () => {
    for (const now of [FRESH, STALE]) {
      const facts = match(makeProfile(), now).reasons.flatMap((r) => r.facts);
      expect(facts.length).toBeGreaterThan(0);
      for (const fact of facts) {
        expect(fact.source_url.startsWith("https://")).toBe(true);
        expect(fact.last_verified_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  it("everything stale: no pass or fail survives, status is check", () => {
    for (const profile of [makeProfile(), makeProfile({}, "A2")]) {
      const result = match(profile, STALE);
      expect(result.status).toBe("check");
      for (const reason of result.reasons) expect(reason.outcome).toBe("unknown");
      expect(result.reasons.some((r) => r.code === "stale_source")).toBe(true);
      expect(result.reasons.flatMap((r) => r.facts).every((f) => f.freshness === "stale")).toBe(
        true,
      );
    }
  });

  it("is JSON-serialisable", () => {
    const result = match(makeProfile(), FRESH);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
});

describe("estimateCost on built shards", () => {
  it("fresh data: 7 lines, partial coverage, ten-month year, per-currency totals", () => {
    const estimate = estimateCost({
      program: built.program,
      costProfiles: built.costProfiles,
      budget: { amountMinor: 1_000_000, currency: "XTS", period: "year" },
      now: FRESH,
    });

    expect(estimate.lines.map((l) => l.category)).toEqual([
      "tuition",
      "housing",
      "food",
      "transport",
      "insurance",
      "application_visa",
      "setup",
    ]);
    const byCategory = Object.fromEntries(estimate.lines.map((l) => [l.category, l]));
    expect(ACADEMIC_YEAR_MONTHS).toBe(10);
    expect(estimate.academicYearMonths).toBe(10);
    expect(byCategory.tuition?.firstYear).toEqual({ min: 100000, max: 100000, currency: "XTS" });
    expect(byCategory.housing?.firstYear).toEqual({ min: 400000, max: 700000, currency: "XTS" });
    expect(byCategory.housing?.fact?.info_kind).toBe("estimate");
    expect(byCategory.housing?.fact?.basis).toBeDefined();
    expect(byCategory.application_visa?.firstYear).toEqual({
      min: 10000,
      max: 10000,
      currency: "XTS",
    });
    for (const missing of ["food", "transport", "insurance", "setup"]) {
      expect(byCategory[missing]?.status).toBe("missing");
    }
    expect(estimate.totals).toEqual([{ min: 510000, max: 810000, currency: "XTS" }]);
    expect(estimate.complete).toBe(false);
    expect(estimate.budgetFit).toBe("unknown");
  });

  it("stale data still yields a range but shows its staleness", () => {
    const estimate = estimateCost({
      program: built.program,
      costProfiles: built.costProfiles,
      budget: null,
      now: STALE,
    });

    expect(estimate.totals).toEqual([{ min: 510000, max: 810000, currency: "XTS" }]);
    const facts = estimate.lines.flatMap((l) => (l.fact ? [l.fact] : []));
    expect(facts.length).toBeGreaterThan(0);
    for (const fact of facts) expect(fact.freshness).toBe("stale");
  });
});

describe("nextIntake on built shards", () => {
  it("is upcoming while the deadline is ahead and closed once it has passed", () => {
    expect(nextIntake(built.program, FRESH).kind).toBe("upcoming");
    expect(nextIntake(built.program, STALE).kind).toBe("closed");
  });
});

describe("scholarshipsForProgram on built shards", () => {
  it("lists the linked scholarship for an eligible nationality", () => {
    const listed = scholarshipsForProgram(makeProfile(), built.program, built.scholarships);
    expect(listed.map((s) => s.slug)).toEqual(["xx-test-schol"]);
  });

  it("drops the linked scholarship for an ineligible nationality", () => {
    const listed = scholarshipsForProgram(
      makeProfile({ nationality: "XC" }),
      built.program,
      built.scholarships,
    );
    expect(listed).toEqual([]);
  });
});

describe("generateChecklist on built shards", () => {
  it("fresh data: all ten steps in order, language exam skipped by a held certificate", () => {
    const result = checklist(makeProfile(), FRESH);
    const step = (id: string) => result.steps.find((s) => s.id === id);

    expect(result.steps.map((s) => s.id)).toEqual([...CHECKLIST_STEP_IDS]);
    expect(step("language_exam")).toMatchObject({ status: "skipped", reason: "certificate_held" });
    expect(step("translation")).toMatchObject({ status: "todo", reason: "unknown_data" });
    expect(step("application_account")).toMatchObject({ status: "todo", reason: "applies" });
    expect(step("submit")).toMatchObject({ status: "todo", deadline: "2027-01-15" });
    expect(step("scholarships")).toMatchObject({
      status: "todo",
      scholarships: ["xx-test-schol"],
    });
  });

  it("a certificate below the required level never skips the language exam", () => {
    const result = checklist(makeProfile({}, "A2"), FRESH);
    expect(result.steps.find((s) => s.id === "language_exam")?.status).toBe("todo");
  });

  it("everything stale: nothing is skipped on stale evidence and the deadline is gone", () => {
    const result = checklist(makeProfile(), STALE);

    expect(result.steps.map((s) => s.id)).toEqual([...CHECKLIST_STEP_IDS]);
    expect(result.steps.find((s) => s.id === "language_exam")?.status).toBe("todo");
    expect(result.steps.find((s) => s.id === "translation")?.status).toBe("todo");
    expect(result.steps.find((s) => s.id === "application_account")?.status).toBe("todo");
    expect(result.steps.find((s) => s.id === "submit")?.deadline ?? null).toBeNull();
    const listed = scholarshipsForProgram(makeProfile(), built.program, built.scholarships);
    const skipped = result.steps.filter((s) => s.status === "skipped").map((s) => s.id);
    expect(skipped).toEqual(listed.length === 0 ? ["scholarships"] : []);
  });
});

describe("filterPrograms on built shards", () => {
  it("keeps the program for a matching preference set", () => {
    const profile = makeProfile({ destinations: ["XB"], studyLanguages: ["xx"] });
    expect(filterPrograms(profile, [built.program], FRESH)).toEqual({
      kept: [built.program],
      excluded: [],
    });
  });

  it("hides on a definite mismatch and returns the reasons", () => {
    const profile = makeProfile({
      destinations: ["XC"],
      fields: ["xx-other-field"],
      institutionType: "private",
      studyLanguages: ["yy"],
    });
    const result = filterPrograms(profile, [built.program], FRESH);

    expect(result.kept).toEqual([]);
    expect(result.excluded).toEqual([
      {
        programSlug: "xx-test-prog",
        mismatches: ["destination", "field", "institution_type", "study_language"],
      },
    ]);
  });

  it("stale language data never hides a program", () => {
    const profile = makeProfile({ studyLanguages: ["yy"] });
    expect(filterPrograms(profile, [built.program], FRESH).kept).toEqual([]);
    expect(filterPrograms(profile, [built.program], STALE).kept).toEqual([built.program]);
  });
});
