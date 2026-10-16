// Run under plain node by journey-fixture.ts (`node --import tsx`): component tests run in jsdom, where the snapshot fixture (which needs a file: import.meta.url) cannot load. Prints the fixture's match card models and reason views as JSON.
import { resolveRoute } from "@/domain/route";
import type { Reason, RuleOutcome } from "@/domain/types";
import { REASON_CODES, REASON_KINDS } from "@/lib/i18n/vocabulary";
import { buildMatchesView } from "@/lib/journey/matches-view";
import { describeReason, ruleIndex } from "@/lib/journey/reasons";

import {
  E2E_NOW,
  E2E_PROFILE,
  E2E_PROFILE_WITH_BUDGET,
  filtersFromProfile,
} from "../fixtures/e2e/profiles";
import { loadMatchesBundle, programOf } from "../lib/journey/bundle";
import { buildSnapshot, E2E_DATA_DIR, removeTempDirs } from "../lib/snapshot/fixture";

const LOCALES = ["fr", "en", "ar"] as const;
const OUTCOMES: readonly RuleOutcome[] = ["pass", "fail", "unknown"];
const PROFILES = { plain: E2E_PROFILE, budget: E2E_PROFILE_WITH_BUDGET };

async function main() {
  const dir = buildSnapshot(E2E_DATA_DIR);
  const out: Record<string, unknown> = {};
  for (const locale of LOCALES) {
    const bundle = await loadMatchesBundle(dir, E2E_PROFILE, locale);
    const cards: Record<string, unknown> = {};
    for (const [name, profile] of Object.entries(PROFILES)) {
      const view = buildMatchesView({
        profile,
        filters: filtersFromProfile(profile),
        bundle,
        now: E2E_NOW,
        locale,
      });
      if (view.kind !== "ok") throw new Error(`expected an ok view, got ${view.kind}`);
      cards[name] = [
        ...view.groups.ok,
        ...view.groups.check,
        ...view.groups.foundation,
        ...view.groups.failed,
      ];
    }
    const core = bundle.core;
    if (core === undefined) throw new Error("fixture bundle has no core");
    const program = programOf(bundle, "xx-test-prog-ok");
    const context = {
      locale,
      core,
      text: bundle.text,
      rules: ruleIndex(
        program,
        resolveRoute(E2E_PROFILE, program.country, bundle.routes?.routes ?? []),
      ),
    };
    const reasonViews = OUTCOMES.flatMap((outcome) =>
      REASON_KINDS.flatMap((kind) =>
        REASON_CODES.map((code) => {
          const reason: Reason = { ruleId: "x", kind, outcome, code, facts: [] };
          return describeReason(reason, context);
        }),
      ),
    );
    out[locale] = { cards, reasonViews };
  }
  process.stdout.write(JSON.stringify(out));
}

main().finally(removeTempDirs);
