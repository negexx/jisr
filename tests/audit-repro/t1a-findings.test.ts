// T1a audit findings: each test asserts the behaviour the documented invariants require, so a RED
// result is the reproduction evidence for a finding. READ-ONLY audit: do not fix src/.
import { describe, expect, it } from "vitest";
import type { MatchFilters } from "@/data-schema/match-filters";
import { preferenceMismatches } from "@/domain/filter";
import { matchProgram } from "@/domain/match";
import {
  fact,
  NOW,
  profile,
  program,
  reference,
  requirements,
  route,
} from "../fixtures/domain/builders";

describe("F1 — complete coverage with zero published rules reads as satisfied", () => {
  it("must be check, not satisfied (ADR 0005 item 10: an empty requirement set must not produce a tick)", () => {
    const result = matchProgram({
      profile: profile(),
      program: program({ requirements: requirements({ coverage: "complete", rules: [] }) }),
      routes: [route()],
      reference: reference(),
      now: NOW,
    });
    expect(result.reasons.map((r) => `${r.ruleId}:${r.outcome}`)).toEqual(["route:pass"]);
    expect(result.status).toBe("check");
  });
});

describe("F2 — empty teachingLanguages hides a program on a study-language preference", () => {
  it("must not hide: unknown teaching-language data never hides a program", () => {
    const filters: MatchFilters = {
      schemaVersion: 1,
      fields: [],
      studyLanguages: ["fr"],
      destinations: [],
      institutionType: "any",
      budget: null,
    };
    const mismatches = preferenceMismatches(
      filters,
      program({ teachingLanguages: fact<string[]>([]) }),
      NOW,
    );
    expect(mismatches).toEqual([]);
  });
});

describe("F3 — an undefined route note leaks a note key onto the reason", () => {
  it("must omit the key, matching evaluateRule's guard", () => {
    const result = matchProgram({
      profile: profile(),
      program: program(),
      routes: [route({ note: undefined as unknown as null })],
      reference: reference(),
      now: NOW,
    });
    expect(result.reasons[0]).not.toHaveProperty("note");
  });
});
