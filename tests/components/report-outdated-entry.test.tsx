import { createTranslator } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReportProvider } from "@/components/report-outdated/report-context";
import {
  loadReportCopy,
  ReportOutdatedEntry,
} from "@/components/report-outdated/report-outdated-entry";
import { routing } from "@/i18n/routing";

import ar from "../../messages/ar.json";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

const catalogues = { fr, en, ar } as const;

vi.mock("next-intl/server", () => ({
  getTranslations: async ({
    locale,
    namespace,
  }: {
    locale: keyof typeof catalogues;
    namespace: string;
  }) => createTranslator({ locale, messages: catalogues[locale], namespace } as never),
}));

afterEach(() => {
  vi.unstubAllEnvs();
});

const CHILD = <p>page</p>;

describe.each(routing.locales)("report outdated copy and entry (%s)", (locale) => {
  it.each([
    undefined,
    "",
    "false",
    "yes",
  ])("loads no copy while ACCOUNTS_ENABLED is %j", async (value) => {
    vi.stubEnv("ACCOUNTS_ENABLED", value);
    expect(await loadReportCopy(locale)).toBeNull();
  });

  it("loads this locale's copy when accounts are on", async () => {
    vi.stubEnv("ACCOUNTS_ENABLED", "true");
    expect(await loadReportCopy(locale)).toEqual(catalogues[locale].reportOutdated);
  });

  it("hands back the page untouched when there is no copy", () => {
    expect(
      ReportOutdatedEntry({
        copy: null,
        locale,
        snapshotVersion: "0123456789ab",
        children: CHILD,
      }),
    ).toBe(CHILD);
  });

  it("wraps the page in a provider holding the copy and the snapshot version", () => {
    const copy = catalogues[locale].reportOutdated;
    const entry = ReportOutdatedEntry({
      copy,
      locale,
      snapshotVersion: "0123456789ab",
      children: CHILD,
    });
    expect(entry).toMatchObject({
      type: ReportProvider,
      props: { locale, snapshotVersion: "0123456789ab", copy, children: CHILD },
    });
  });

  it("leaves the snapshot version unset for pages that learn it in the browser", () => {
    const entry = ReportOutdatedEntry({
      copy: catalogues[locale].reportOutdated,
      locale,
      children: CHILD,
    });
    expect(entry).toMatchObject({ props: { snapshotVersion: null } });
  });
});
