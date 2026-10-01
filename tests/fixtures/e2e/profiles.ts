import type { IsoDate } from "@/data-schema/dates";
import { type Profile, ProfileSchema } from "@/data-schema/profile";
import type { RouteOutcome } from "@/data-schema/resolved";
import type { PreferenceMismatch } from "@/domain/filter";
import type { MatchStatus } from "@/domain/types";

// Playwright specs pin the browser clock to this date; data:check and the domain tests take it as `now`.
export const E2E_NOW: IsoDate = "2026-09-30";

export const E2E_SLUGS = {
  ok: "xx-test-prog-ok",
  fail: "xx-test-prog-fail",
  check: "xx-test-prog-check",
  stale: "xx-test-prog-stale",
  private: "xx-test-prog-private",
  foundation: "xx-test-prog-foundation",
  frOnly: "xx-test-prog-fronly",
} as const;

export const E2E_SCHOLARSHIP_SLUGS = {
  open: "xx-test-schol-open",
  xaOnly: "xx-test-schol-xa",
  xzOnly: "xx-test-schol-xz",
} as const;

function baseProfile(overrides: Partial<Profile> = {}): Profile {
  return ProfileSchema.parse({
    schemaVersion: 1,
    nationality: "XA",
    credential: {
      country: "XA",
      type: "xx-test-cred",
      track: "xx-test-track-sci",
      status: "obtained",
      overall: { scale: "xx-test-scale-20", value: 14 },
      subjects: [
        { subject: "xx-test-subject-math", grade: { scale: "xx-test-scale-20", value: 14 } },
      ],
    },
    priorHigherEducationYears: 0,
    languages: [
      { language: "fr", level: "B2", certificate: "xx-test-cert-fr" },
      { language: "en", level: "B1", certificate: null },
    ],
    fields: ["xx-test-field-cs", "xx-test-field-eng"],
    studyLanguages: ["fr", "en"],
    destinations: [],
    budget: null,
    institutionType: "public",
    ...overrides,
  });
}

export const E2E_PROFILE: Profile = baseProfile();

export const E2E_PROFILE_WITH_BUDGET: Profile = baseProfile({
  budget: { amountMinor: 90_000, currency: "XTS", period: "month" },
});

export const E2E_PROFILE_XB_ONLY: Profile = baseProfile({ destinations: ["XB"] });

export type E2eGroup = "ok" | "check" | "foundation" | "failed";
export type E2eIntakeKind = "upcoming" | "closed" | "none";
export type E2eExpectedProgram = {
  status: MatchStatus;
  route: RouteOutcome;
  group: E2eGroup;
  intake: E2eIntakeKind;
};

type ExpectedPrograms = Record<(typeof E2E_SLUGS)[keyof typeof E2E_SLUGS], E2eExpectedProgram>;
type HiddenPrograms = Partial<
  Record<(typeof E2E_SLUGS)[keyof typeof E2E_SLUGS], PreferenceMismatch[]>
>;

const PROGRAMS: ExpectedPrograms = {
  [E2E_SLUGS.ok]: { status: "satisfied", route: "direct", group: "ok", intake: "upcoming" },
  [E2E_SLUGS.fail]: {
    status: "not_satisfied",
    route: "direct",
    group: "failed",
    intake: "upcoming",
  },
  [E2E_SLUGS.check]: { status: "check", route: "direct", group: "check", intake: "closed" },
  [E2E_SLUGS.stale]: { status: "check", route: "direct", group: "check", intake: "upcoming" },
  [E2E_SLUGS.private]: { status: "satisfied", route: "direct", group: "ok", intake: "upcoming" },
  [E2E_SLUGS.foundation]: {
    status: "check",
    route: "foundation",
    group: "foundation",
    intake: "upcoming",
  },
  // Satisfied on purpose: the only oddity is the missing en/ar text (fallback note) and unpublished intakes.
  [E2E_SLUGS.frOnly]: { status: "satisfied", route: "direct", group: "ok", intake: "none" },
};

// Match results do not depend on the profile's preferences or budget, so the three profiles share `programs`.
export const E2E_EXPECTED = {
  programs: PROGRAMS,
  hidden: {
    E2E_PROFILE: { [E2E_SLUGS.private]: ["institution_type"] } satisfies HiddenPrograms,
    E2E_PROFILE_WITH_BUDGET: {
      [E2E_SLUGS.private]: ["institution_type"],
    } satisfies HiddenPrograms,
    E2E_PROFILE_XB_ONLY: {
      [E2E_SLUGS.private]: ["institution_type"],
      [E2E_SLUGS.foundation]: ["destination"],
    } satisfies HiddenPrograms,
  },
  frOnlyProgram: E2E_SLUGS.frOnly,
  scholarships: {
    // For E2E_PROFILE (nationality XA) on the ok program: the XZ-only scholarship is linked but filtered out.
    forOkProgram: [E2E_SCHOLARSHIP_SLUGS.open, E2E_SCHOLARSHIP_SLUGS.xaOnly],
  },
  costs: {
    completeFor: [E2E_SLUGS.ok],
    incompleteFor: [E2E_SLUGS.foundation],
  },
} as const;
