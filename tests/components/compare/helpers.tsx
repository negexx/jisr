import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import { CompareClient } from "@/components/compare/compare-client";
import { COMPARE_MESSAGE_NAMESPACES } from "@/components/compare/namespaces";
import { DirectionProvider } from "@/components/direction-provider";
import type { Profile } from "@/data-schema/profile";
import { localeDirection } from "@/i18n/direction";
import type { AppLocale } from "@/i18n/routing";
import { pickMessages } from "@/lib/i18n/client-messages";
import { buildCompareView, type CompareView } from "@/lib/journey/compare-view";
import type { SnapshotClient } from "@/lib/snapshot/client";
import { shardsForPlan } from "@/lib/snapshot/plan";
import { E2E_NOW, E2E_PROFILE, E2E_SLUGS } from "../../fixtures/e2e/profiles";
import { catalogs } from "../matches/helpers";
import { type SavedRef, seedProfile, seedSaved, VERSION } from "../plan/helpers";

export { bundleClient, catalogs, withFixtureClient } from "../matches/helpers";
export { type SavedRef, seedProfile, seedSaved, VERSION };

// Saved programs of the e2e fixture, with the country and field their shard is keyed by.
export const REFS = {
  ok: { slug: E2E_SLUGS.ok, country: "XB", field: "xx-test-field-cs" },
  fail: { slug: E2E_SLUGS.fail, country: "XB", field: "xx-test-field-cs" },
  check: { slug: E2E_SLUGS.check, country: "XB", field: "xx-test-field-eng" },
  stale: { slug: E2E_SLUGS.stale, country: "XB", field: "xx-test-field-eng" },
  private: { slug: E2E_SLUGS.private, country: "XB", field: "xx-test-field-cs" },
  foundation: { slug: E2E_SLUGS.foundation, country: "XC", field: "xx-test-field-cs" },
  gone: { slug: "xx-test-gone", country: "XB", field: "xx-test-field-cs" },
} as const satisfies Record<string, SavedRef>;

export function CompareProviders({
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
      messages={pickMessages(catalogs[locale], COMPARE_MESSAGE_NAMESPACES)}
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

export function renderCompare(locale: AppLocale, client: SnapshotClient) {
  return render(
    <CompareProviders locale={locale}>
      <CompareClient locale={locale} client={client} />
    </CompareProviders>,
  );
}

// The same view the island builds, for expectations.
export async function compareView(
  client: SnapshotClient,
  locale: AppLocale,
  refs: readonly SavedRef[],
  slugs: readonly string[],
  profile: Profile = E2E_PROFILE,
): Promise<CompareView> {
  const bundle = await client.load(
    (manifest) => shardsForPlan(refs, profile.credential.country, manifest),
    locale,
  );
  return buildCompareView({ profile, bundle, slugs, now: E2E_NOW, locale });
}

export function seedAll(...refs: SavedRef[]): void {
  seedProfile();
  seedSaved(...refs);
}
