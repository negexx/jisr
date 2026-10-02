import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Manifest } from "@/data-schema/snapshot";
import {
  shardsForMatches,
  shardsForPlan,
  shardsForProfileForm,
  shardsForProgram,
} from "@/lib/snapshot/plan";

import { E2E_PROFILE, E2E_PROFILE_XB_ONLY } from "../../fixtures/e2e/profiles";
import { buildSnapshot, E2E_DATA_DIR, readManifest, removeTempDirs } from "./fixture";

let manifest: Manifest;

beforeAll(() => {
  manifest = readManifest(buildSnapshot(E2E_DATA_DIR));
}, 180_000);

afterAll(removeTempDirs);

const sorted = (names: readonly string[]) => [...names].sort();

describe("shardsForProfileForm", () => {
  it("needs only the core shard", () => {
    expect(shardsForProfileForm()).toEqual({ structural: ["core"] });
  });
});

describe("shardsForMatches", () => {
  it("loads every destination x the profile's fields when destinations is empty", () => {
    expect(E2E_PROFILE.destinations).toEqual([]);
    const plan = shardsForMatches(E2E_PROFILE, manifest);
    expect(sorted(plan.structural)).toEqual(
      sorted([
        "core",
        "routes.XA",
        "programs.XB.xx-test-field-cs",
        "programs.XB.xx-test-field-eng",
        "programs.XC.xx-test-field-cs",
        "institutions.XB",
        "institutions.XC",
        "costs.XB",
        "costs.XC",
        "scholarships.XB",
        "scholarships.XC",
      ]),
    );
  });

  it("still loads unchosen destinations so destination mismatches can be counted", () => {
    expect(sorted(shardsForMatches(E2E_PROFILE_XB_ONLY, manifest).structural)).toEqual(
      sorted(shardsForMatches(E2E_PROFILE, manifest).structural),
    );
  });

  it("ignores (destination, field) pairs absent from the manifest", () => {
    const plan = shardsForMatches({ ...E2E_PROFILE, fields: ["xx-test-field-eng"] }, manifest);
    expect(sorted(plan.structural)).toEqual(
      sorted([
        "core",
        "routes.XA",
        "programs.XB.xx-test-field-eng",
        "institutions.XB",
        "costs.XB",
        "scholarships.XB",
      ]),
    );
  });

  it("skips a routes shard the manifest does not list", () => {
    const profile = { ...E2E_PROFILE, credential: { ...E2E_PROFILE.credential, country: "XZ" } };
    expect(shardsForMatches(profile, manifest).structural).not.toContain("routes.XZ");
  });

  it("lists every name once", () => {
    const { structural } = shardsForMatches(E2E_PROFILE, manifest);
    expect(new Set(structural).size).toBe(structural.length);
  });

  it("plans only core on a core-only manifest", () => {
    const coreOnly = { ...manifest, shards: { core: manifest.shards.core } } as Manifest;
    expect(shardsForMatches(E2E_PROFILE, coreOnly)).toEqual({ structural: ["core"] });
  });
});

describe("shardsForProgram", () => {
  const program = { country: "XB", field: "xx-test-field-cs", slug: "xx-test-prog-ok" };

  it("includes the student's routes shard when a profile exists", () => {
    expect(sorted(shardsForProgram(program, "XA", manifest).structural)).toEqual(
      sorted([
        "core",
        "routes.XA",
        "programs.XB.xx-test-field-cs",
        "institutions.XB",
        "costs.XB",
        "scholarships.XB",
      ]),
    );
  });

  it("omits routes without a credential country", () => {
    expect(sorted(shardsForProgram(program, null, manifest).structural)).toEqual(
      sorted([
        "core",
        "programs.XB.xx-test-field-cs",
        "institutions.XB",
        "costs.XB",
        "scholarships.XB",
      ]),
    );
  });
});

describe("shardsForPlan", () => {
  it("unions core, routes and each saved program's shard and destination shards, skipping what the manifest lacks", () => {
    const plan = shardsForPlan(
      [
        { country: "XB", field: "xx-test-field-cs" },
        { country: "XB", field: "xx-test-field-cs" },
        { country: "XB", field: "xx-gone" },
      ],
      "XA",
      manifest,
    );
    expect(sorted(plan.structural)).toEqual(
      sorted([
        "core",
        "routes.XA",
        "programs.XB.xx-test-field-cs",
        "institutions.XB",
        "costs.XB",
        "scholarships.XB",
      ]),
    );
    expect(plan.structural).not.toContain("programs.XB.xx-gone");
    expect(new Set(plan.structural).size).toBe(plan.structural.length);
  });
});
