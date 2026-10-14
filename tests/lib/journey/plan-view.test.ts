import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Profile } from "@/data-schema/profile";
import { CHECKLIST_STEP_IDS } from "@/domain/types";
import { buildPlanView, type PlanProgram } from "@/lib/journey/plan-view";
import type { SnapshotBundle } from "@/lib/snapshot/client";

import {
  E2E_NOW,
  E2E_PROFILE,
  E2E_SCHOLARSHIP_SLUGS,
  E2E_SLUGS,
} from "../../fixtures/e2e/profiles";
import { forbidConsole } from "../profile/no-console";
import { buildSnapshot, buildVariant, E2E_DATA_DIR, removeTempDirs } from "../snapshot/fixture";
import { loadMatchesBundle } from "./bundle";

forbidConsole();

let bundle: SnapshotBundle;
// The same data with the stale program's language rule re-verified at the fixture date.
let freshLanguageBundle: SnapshotBundle;

// The student holds an English certificate at B2, which meets the stale program's English rule (B1,
// any certificate): only the age of the rule decides whether the plan may skip the language exam.
const ENGLISH_CERTIFICATE_PROFILE: Profile = {
  ...E2E_PROFILE,
  languages: [
    { language: "fr", level: "B2", certificate: "xx-test-cert-fr" },
    { language: "en", level: "B2", certificate: "xx-test-cert-en" },
  ],
};

beforeAll(async () => {
  const dir = buildSnapshot(E2E_DATA_DIR);
  bundle = await loadMatchesBundle(dir, E2E_PROFILE, "fr");
  const freshDir = buildVariant([
    {
      file: "programs/xx-test-prog-stale.yaml",
      from: "last_verified_at: 2025-02-07",
      to: `last_verified_at: ${E2E_NOW}`,
    },
  ]);
  freshLanguageBundle = await loadMatchesBundle(freshDir, ENGLISH_CERTIFICATE_PROFILE, "fr");
}, 180_000);

afterAll(removeTempDirs);

function programEntry(
  slug: string,
  profile: Profile = E2E_PROFILE,
  from: SnapshotBundle = bundle,
): PlanProgram {
  const view = buildPlanView({ profile, bundle: from, saved: [{ slug }], now: E2E_NOW });
  const [entry] = view.entries;
  if (entry === undefined || entry.kind !== "program") throw new Error(`no plan entry for ${slug}`);
  return entry;
}

function step(entry: PlanProgram, id: (typeof CHECKLIST_STEP_IDS)[number]) {
  const found = entry.steps.find((s) => s.id === id);
  if (found === undefined) throw new Error(`no step ${id}`);
  return found;
}

describe("buildPlanView", () => {
  it("returns one entry per saved slug in saved order, and 'missing' for a slug not in the bundle", () => {
    const view = buildPlanView({
      profile: E2E_PROFILE,
      bundle,
      saved: [{ slug: E2E_SLUGS.ok }, { slug: "xx-gone" }, { slug: E2E_SLUGS.stale }],
      now: E2E_NOW,
    });
    expect(view.entries.map((e) => [e.kind, e.slug])).toEqual([
      ["program", E2E_SLUGS.ok],
      ["missing", "xx-gone"],
      ["program", E2E_SLUGS.stale],
    ]);
  });

  describe("renamed slugs", () => {
    const FORMER = "xx-test-prog-old-ok";

    it("builds a saved former slug from the programme it was renamed to, keeping the saved slug", () => {
      expect(bundle.aliases).toEqual({ [FORMER]: E2E_SLUGS.ok });
      const former = programEntry(FORMER);
      const canonical = programEntry(E2E_SLUGS.ok);
      expect(former.slug).toBe(FORMER);
      expect({ ...former, slug: canonical.slug }).toEqual(canonical);
    });

    it("still reports a slug that is neither live nor aliased as missing", () => {
      const view = buildPlanView({
        profile: E2E_PROFILE,
        bundle,
        saved: [{ slug: "xx-test-prog-never-existed" }],
        now: E2E_NOW,
      });
      expect(view.entries).toEqual([{ kind: "missing", slug: "xx-test-prog-never-existed" }]);
    });

    it("reports a former slug as missing when the map points at nothing in the bundle", () => {
      const view = buildPlanView({
        profile: E2E_PROFILE,
        bundle: { ...bundle, aliases: { [FORMER]: "xx-test-prog-gone" } },
        saved: [{ slug: FORMER }],
        now: E2E_NOW,
      });
      expect(view.entries).toEqual([{ kind: "missing", slug: FORMER }]);
    });
  });

  it("returns no entries when nothing is saved", () => {
    expect(
      buildPlanView({ profile: E2E_PROFILE, bundle, saved: [], now: E2E_NOW }).entries,
    ).toEqual([]);
  });

  it("builds the ten checklist steps in domain order for a program", () => {
    const entry = programEntry(E2E_SLUGS.ok);
    expect(entry.steps.map((s) => s.id)).toEqual([...CHECKLIST_STEP_IDS]);
    expect(entry.group).toBe("ok");
    expect(entry.name).toBe("XX Test Programme OK");
    expect(entry.institutionName.length).toBeGreaterThan(0);
    expect(entry.cityName.length).toBeGreaterThan(0);
  });

  it("carries unique fact references on each step", () => {
    const entry = programEntry(E2E_SLUGS.ok);
    for (const s of entry.steps) {
      const ids = s.facts.map((f) => `${f.record}#${f.path}`);
      expect(new Set(ids).size).toBe(ids.length);
    }
    expect(step(entry, "documents").facts.map((f) => [f.record, f.path])).toEqual([
      [`programs/${E2E_SLUGS.ok}`, "documents"],
    ]);
  });

  it("resolves the application channel (name and url) on the account and submit steps only", () => {
    const entry = programEntry(E2E_SLUGS.ok);
    const expected = {
      name: "XX Test Portal B",
      url: "https://example.org/portal-b",
      accountRequired: true,
    };
    expect(step(entry, "submit").channel).toEqual(expected);
    expect(step(entry, "application_account").channel).toEqual(expected);
    expect(step(entry, "documents").channel).toBeNull();
    expect(step(entry, "visa").channel).toBeNull();
  });

  it("carries the next deadline as an IntakeStatus and the documents with localized names", () => {
    const entry = programEntry(E2E_SLUGS.ok);
    expect(entry.intake.kind).toBe("upcoming");
    expect(step(entry, "submit").deadline).toBe("2027-01-15");
    expect(step(entry, "documents").deadline).toBeNull();
    expect(entry.documents).toEqual([
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
    expect(entry.documentsMeta.value?.length).toBe(3);
  });

  it("lists scholarships by name on the scholarships step when the student's nationality may apply", () => {
    // Nationality XA: the open scholarship and the XA one apply, the XZ-only one is filtered out.
    const entry = programEntry(E2E_SLUGS.ok);
    const scholarships = step(entry, "scholarships");
    expect(scholarships.status).toBe("todo");
    expect(scholarships.reason).toBe("applies");
    expect(scholarships.scholarships).toEqual([
      { slug: E2E_SCHOLARSHIP_SLUGS.open, name: "XX Test Open Scholarship" },
      { slug: E2E_SCHOLARSHIP_SLUGS.xaOnly, name: "XX Test XA Scholarship" },
    ]);
    expect(step(entry, "visa").scholarships).toEqual([]);
  });

  it("skips the scholarships step with 'no_scholarships_listed' when no scholarship accepts the nationality", () => {
    // Nationality XB is outside the XA-only and XZ-only scholarships; the open one is removed so
    // that nothing is left to list.
    const withoutOpen: SnapshotBundle = {
      ...bundle,
      scholarships: bundle.scholarships.map((shard) => ({
        ...shard,
        scholarships: shard.scholarships.filter((s) => s.slug !== E2E_SCHOLARSHIP_SLUGS.open),
      })),
    };
    const entry = programEntry(E2E_SLUGS.ok, { ...E2E_PROFILE, nationality: "XB" }, withoutOpen);
    const scholarships = step(entry, "scholarships");
    expect(scholarships.status).toBe("skipped");
    expect(scholarships.reason).toBe("no_scholarships_listed");
    expect(scholarships.scholarships).toEqual([]);
  });

  it("never yields a skipped step from stale data: the stale program keeps language_exam and application_account as todo", () => {
    // Control: with the English rule re-verified, this same student does get 'certificate_held'.
    const fresh = programEntry(E2E_SLUGS.stale, ENGLISH_CERTIFICATE_PROFILE, freshLanguageBundle);
    expect(step(fresh, "language_exam").status).toBe("skipped");
    expect(step(fresh, "language_exam").reason).toBe("certificate_held");

    const stale = programEntry(E2E_SLUGS.stale, ENGLISH_CERTIFICATE_PROFILE);
    expect(stale.group).toBe("check");
    expect(step(stale, "language_exam").status).toBe("todo");
    for (const id of ["language_exam", "application_account"] as const) {
      expect(step(stale, id).status).toBe("todo");
    }
  });

  it("throws, without echoing the profile, when the bundle has no core shard", () => {
    const run = () =>
      buildPlanView({
        profile: E2E_PROFILE,
        bundle: { ...bundle, core: undefined },
        saved: [{ slug: E2E_SLUGS.ok }],
        now: E2E_NOW,
      });
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
