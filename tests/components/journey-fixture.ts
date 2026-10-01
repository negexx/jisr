import { spawnSync } from "node:child_process";
import path from "node:path";

import type { AppLocale } from "@/i18n/routing";
import type { MatchCardModel } from "@/lib/journey/matches-view";
import type { ReasonView } from "@/lib/journey/reasons";

const BUILD_SCRIPT = path.join("tests", "components", "journey-fixture-build.ts");

type ProfileName = "plain" | "budget";
type LocaleData = {
  cards: Record<ProfileName, MatchCardModel[]>;
  // Every kind x code, for each outcome in turn (pass, fail, unknown).
  reasonViews: ReasonView[];
};

export type JourneyFixture = {
  cards: (locale: AppLocale, profile?: ProfileName) => MatchCardModel[];
  card: (locale: AppLocale, slug: string, profile?: ProfileName) => MatchCardModel;
  reasonViews: (locale: AppLocale) => ReasonView[];
};

// Component tests run in jsdom, so the models are built by a plain node child process from the e2e data fixture through the real journey code.
export function loadJourneyFixture(): JourneyFixture {
  const run = spawnSync(process.execPath, ["--import", "tsx", BUILD_SCRIPT], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 170_000,
    maxBuffer: 256 * 1024 * 1024,
  });
  if (run.status !== 0) {
    throw new Error(`journey fixture failed (status ${run.status})\n${run.stdout}\n${run.stderr}`);
  }
  const data: Record<AppLocale, LocaleData> = JSON.parse(run.stdout);
  const cards = (locale: AppLocale, profile: ProfileName = "plain") => data[locale].cards[profile];

  return {
    cards,
    card: (locale, slug, profile) => {
      const found = cards(locale, profile).find((c) => c.slug === slug);
      if (found === undefined) throw new Error(`no card for ${slug}`);
      return found;
    },
    reasonViews: (locale) => data[locale].reasonViews,
  };
}
