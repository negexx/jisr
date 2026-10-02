import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import { DirectionProvider } from "@/components/direction-provider";
import { PLAN_MESSAGE_NAMESPACES } from "@/components/plan/namespaces";
import { PlanClient } from "@/components/plan/plan-client";
import type { Profile } from "@/data-schema/profile";
import { localeDirection } from "@/i18n/direction";
import type { AppLocale } from "@/i18n/routing";
import { pickMessages } from "@/lib/i18n/client-messages";
import { buildPlanView, type PlanProgram } from "@/lib/journey/plan-view";
import { profileStore } from "@/lib/profile/store";
import { SAVED_KEY } from "@/lib/saved/saved";
import type { SnapshotBundle, SnapshotClient } from "@/lib/snapshot/client";
import { shardsForPlan } from "@/lib/snapshot/plan";
import { E2E_NOW, E2E_PROFILE, E2E_SLUGS } from "../../fixtures/e2e/profiles";
import { catalogs } from "../matches/helpers";

export { bundleClient, catalogs, withFixtureClient } from "../matches/helpers";

export const VERSION = "0123456789ab";

export const PROGRAMS = {
  ok: { slug: E2E_SLUGS.ok, country: "XB", field: "xx-test-field-cs" },
  stale: { slug: E2E_SLUGS.stale, country: "XB", field: "xx-test-field-eng" },
  foundation: { slug: E2E_SLUGS.foundation, country: "XC", field: "xx-test-field-cs" },
  gone: { slug: "xx-test-gone", country: "XB", field: "xx-test-field-cs" },
} as const;

export type SavedRef = { slug: string; country: string; field: string };

export function seedSaved(...refs: SavedRef[]): void {
  const items = refs.map((ref) => ({ ...ref, snapshotVersion: VERSION, savedAt: "2026-09-01" }));
  window.localStorage.setItem(SAVED_KEY, JSON.stringify({ schemaVersion: 1, items }));
}

export function seedProfile(profile: Profile = E2E_PROFILE): void {
  profileStore.save(profile);
}

export function PlanProviders({
  locale,
  children,
}: {
  locale: AppLocale;
  children: React.ReactNode;
}) {
  const dir = localeDirection(locale);
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={pickMessages(catalogs[locale], PLAN_MESSAGE_NAMESPACES)}
      onError={(error) => {
        throw error;
      }}
      timeZone="UTC"
    >
      <div dir={dir} data-testid="dir-root">
        <DirectionProvider dir={dir}>{children}</DirectionProvider>
      </div>
    </NextIntlClientProvider>
  );
}

export function renderPlan(locale: AppLocale, client: SnapshotClient) {
  return render(
    <PlanProviders locale={locale}>
      <PlanClient locale={locale} client={client} />
    </PlanProviders>,
  );
}

// The same plan view the page builds, for expectations.
export async function planEntries(
  client: SnapshotClient,
  locale: AppLocale,
  refs: SavedRef[],
  profile: Profile = E2E_PROFILE,
): Promise<{ bundle: SnapshotBundle; programs: PlanProgram[] }> {
  const bundle = await client.load(
    (manifest) => shardsForPlan(refs, profile.credential.country, manifest),
    locale,
  );
  const view = buildPlanView({ profile, bundle, saved: refs, now: E2E_NOW });
  return {
    bundle,
    programs: view.entries.flatMap((entry) => (entry.kind === "program" ? [entry] : [])),
  };
}

export function stepTitle(locale: AppLocale, id: PlanProgram["steps"][number]["id"]): string {
  return catalogs[locale].domain.checklist.step[id].title;
}

// A missing fixture program must fail the test loudly, never turn into an empty name that matches
// nothing (or everything).
export function requireProgram(programs: readonly PlanProgram[], index = 0): PlanProgram {
  const program = programs[index];
  if (program === undefined) throw new Error(`the fixture has no plan program at index ${index}`);
  return program;
}
