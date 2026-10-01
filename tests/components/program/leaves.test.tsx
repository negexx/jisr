// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactElement, useEffect } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PageFreshnessBanner } from "@/components/program/page-freshness-banner";
import { PersonalMatch } from "@/components/program/personal-match";
import { ProgramDeadline } from "@/components/program/program-deadline";
import type { Profile } from "@/data-schema/profile";
import type { FactMeta, Program } from "@/data-schema/resolved";
import { matchProgram } from "@/domain/match";
import type { AppLocale } from "@/i18n/routing";
import { profileStore } from "@/lib/profile/store";
import type { SnapshotBundle, SnapshotClient } from "@/lib/snapshot/client";

import {
  E2E_NOW,
  E2E_PROFILE,
  E2E_PROFILE_WITH_BUDGET,
  E2E_SCHOLARSHIP_SLUGS,
  E2E_SLUGS,
} from "../../fixtures/e2e/profiles";
import { watchConsole } from "../trust-helpers";
import {
  bannerFactsOf,
  buildFixtureSnapshot,
  ClientLeafProvider,
  catalogs,
  fixtureClient,
  loadProgramBundle,
  PROGRAM_REFS,
  removeFixtureSnapshots,
} from "./program-fixture";

const costs = vi.hoisted(() => ({ fail: false }));
vi.mock("@/domain/costs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/domain/costs")>();
  return {
    ...actual,
    estimateCost: (...args: Parameters<typeof actual.estimateCost>) => {
      if (costs.fail) throw new Error("estimateCost failed");
      return actual.estimateCost(...args);
    },
  };
});

type Tree = { [key: string]: string | Tree };
function message(locale: AppLocale, key: string): string {
  let node: string | Tree = catalogs[locale];
  for (const part of key.split(".")) {
    if (typeof node === "string" || node[part] === undefined) throw new Error(`no ${key}`);
    node = node[part];
  }
  if (typeof node !== "string") throw new Error(`${key} is not a message`);
  return node;
}

const OFFICIAL_WORD: Record<AppLocale, RegExp> = { en: /official/i, fr: /officiel/i, ar: /رسمي/u };

let dir = "";
let bundles: Record<string, SnapshotBundle> = {};
beforeAll(async () => {
  dir = buildFixtureSnapshot();
  for (const slug of Object.values(E2E_SLUGS)) {
    bundles[slug] = await loadProgramBundle(dir, slug, "fr");
  }
}, 180_000);
afterAll(() => {
  bundles = {};
  removeFixtureSnapshots();
});

let consoleWatch: ReturnType<typeof watchConsole>;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${E2E_NOW}T12:00:00Z`));
  consoleWatch = watchConsole();
});
afterEach(() => {
  cleanup();
  profileStore.clear();
  window.localStorage.clear();
  costs.fail = false;
  vi.useRealTimers();
  consoleWatch.expectSilent();
  consoleWatch.restore();
});

function programOf(slug: string): Program {
  const program = bundles[slug]?.programs.flatMap((s) => s.programs).find((p) => p.slug === slug);
  if (program === undefined) throw new Error(`no program ${slug}`);
  return program;
}

function personal(
  slug: string,
  options: { client?: SnapshotClient; version?: string; locale?: AppLocale } = {},
) {
  const ref = PROGRAM_REFS[slug] ?? { slug, country: "XB", field: "xx-test-field-cs" };
  const bundle = bundles[slug];
  return (
    <PersonalMatch
      program={ref}
      snapshotVersion={options.version ?? bundle?.snapshotVersion ?? "unknown"}
      scholarshipSlugs={(bundle?.scholarships ?? [])
        .flatMap((s) => s.scholarships)
        .filter(
          (s) =>
            programOf(slug).scholarships.includes(s.slug) ||
            s.fields.length === 0 ||
            s.fields.includes(programOf(slug).field),
        )
        .map((s) => s.slug)}
      locale={options.locale ?? "fr"}
      client={options.client ?? fixtureClient(dir)}
    />
  );
}

function renderLeaf(ui: ReactElement, locale: AppLocale = "fr") {
  return render(<ClientLeafProvider locale={locale}>{ui}</ClientLeafProvider>);
}

function saveProfile(profile: Profile) {
  expect(profileStore.save(profile).ok).toBe(true);
}

async function result() {
  return waitFor(() => {
    const found = document.querySelector('[data-slot="personal-result"]');
    if (found === null) throw new Error("no result yet");
    return found as HTMLElement;
  });
}

describe("PageFreshnessBanner", () => {
  const labels = (locale: AppLocale) => ({
    aging: message(locale, "program.banner.aging"),
    stale: message(locale, "program.banner.stale"),
    check: message(locale, "program.banner.check"),
  });
  const fact = (last: string, kind: FactMeta["info_kind"] = "estimate"): FactMeta => ({
    source_url: "https://example.org/x",
    info_kind: kind,
    last_verified_at: last,
    class: "volatile",
  });

  it("renders nothing on the server", () => {
    const html = renderToString(
      <PageFreshnessBanner facts={[fact("2020-01-01")]} labels={labels("fr")} />,
    );
    expect(html).toBe("");
  });

  it("renders nothing when every fact is fresh", () => {
    const { container } = render(
      <PageFreshnessBanner facts={[fact("2026-09-01")]} labels={labels("fr")} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it.each(["fr", "en", "ar"] as const)("says aging or stale in neutral words (%s)", (locale) => {
    const aging = render(
      <PageFreshnessBanner
        facts={[fact("2026-09-01"), fact("2026-04-01")]}
        labels={labels(locale)}
      />,
    );
    const agingStatus = within(aging.container).getByRole("status");
    expect(agingStatus.dataset.freshness).toBe("aging");
    expect(agingStatus.textContent).toBe(
      `${message(locale, "program.banner.aging")} ${message(locale, "program.banner.check")}`,
    );
    expect(agingStatus.querySelector("svg")).not.toBeNull();
    aging.unmount();

    const stale = render(
      <PageFreshnessBanner
        facts={[fact("2026-04-01"), fact("2025-01-01")]}
        labels={labels(locale)}
      />,
    );
    const staleStatus = within(stale.container).getByRole("status");
    expect(staleStatus.dataset.freshness).toBe("stale");
    expect(staleStatus.textContent).toContain(message(locale, "program.banner.stale"));
    for (const status of [agingStatus, staleStatus]) {
      expect(status.textContent).not.toMatch(OFFICIAL_WORD[locale]);
    }
  });

  it("is stale for the fixture's stale program and silent for the fresh one", () => {
    const stale = render(
      <PageFreshnessBanner
        facts={bannerFactsOf(bundles[E2E_SLUGS.stale] as SnapshotBundle, E2E_SLUGS.stale)}
        labels={labels("fr")}
      />,
    );
    expect(within(stale.container).getByRole("status").dataset.freshness).toBe("stale");
    stale.unmount();
    const ok = render(
      <PageFreshnessBanner
        facts={bannerFactsOf(bundles[E2E_SLUGS.ok] as SnapshotBundle, E2E_SLUGS.ok)}
        labels={labels("fr")}
      />,
    );
    expect(ok.container.innerHTML).toBe("");
  });
});

describe("ProgramDeadline", () => {
  it("claims nothing before mount", () => {
    const html = renderToString(
      <ClientLeafProvider locale="fr">
        <ProgramDeadline program={programOf(E2E_SLUGS.ok)} />
      </ClientLeafProvider>,
    );
    expect(html).toContain('data-slot="program-deadline"');
    expect(html).not.toContain(message("fr", "domain.intake.closed"));
    expect(html).not.toContain("15/01/2027");
  });

  it.each([
    [E2E_SLUGS.ok, "upcoming"],
    [E2E_SLUGS.check, "closed"],
    [E2E_SLUGS.frOnly, "unknown"],
  ] as const)("shows %s as %s from today's date", (slug, kind) => {
    const { container } = renderLeaf(<ProgramDeadline program={programOf(slug)} />, "ar");
    expect(container.querySelector("[data-intake]")?.getAttribute("data-intake")).toBe(kind);
    if (kind === "upcoming") expect(container.textContent).toContain("15/01/2027");
    if (kind === "closed") {
      expect(container.textContent).toContain(message("ar", "domain.intake.closed"));
    }
  });
});

describe("PersonalMatch", () => {
  it("renders a fixed-height skeleton on the server, even with a saved profile", () => {
    saveProfile(E2E_PROFILE);
    const html = renderToString(
      <ClientLeafProvider locale="fr">{personal(E2E_SLUGS.ok)}</ClientLeafProvider>,
    );
    expect(html).toContain('data-slot="personal-skeleton"');
    expect(html).not.toContain(message("fr", "domain.status.satisfied"));
    expect(html).not.toContain("XA");
    expect(html).not.toContain("14");
  });

  it.each([
    "fr",
    "ar",
  ] as const)("invites to create a profile when there is none (%s)", (locale) => {
    renderLeaf(personal(E2E_SLUGS.ok, { locale }), locale);
    expect(screen.getByText(message(locale, "program.personal.cta.title"))).toBeTruthy();
    const link = screen.getByRole("link", { name: message(locale, "program.personal.cta.action") });
    expect(link.getAttribute("href")).toBe(`/${locale}/profile`);
  });

  it("shows a busy skeleton and a separate polite status while loading", async () => {
    saveProfile(E2E_PROFILE);
    const pending: SnapshotClient = { load: () => new Promise(() => undefined) };
    const { container } = renderLeaf(personal(E2E_SLUGS.ok, { client: pending }));
    const status = await screen.findByRole("status");
    expect(status.textContent).toBe(message("fr", "program.personal.loading"));
    const busy = container.querySelector('[aria-busy="true"]');
    expect(busy?.contains(status)).toBe(false);
    expect(busy?.querySelector('[data-slot="personal-skeleton"]')).not.toBeNull();
  });

  it("offers a retry when the snapshot cannot be loaded", async () => {
    saveProfile(E2E_PROFILE);
    const load = vi
      .fn<SnapshotClient["load"]>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockImplementation((plan, locale, signal) => fixtureClient(dir).load(plan, locale, signal));
    renderLeaf(personal(E2E_SLUGS.ok, { client: { load } }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(message("fr", "program.personal.error.title"));
    await userEvent.click(within(alert).getByRole("button"));
    await result();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it.each([
    [E2E_SLUGS.ok, "ok", "domain.route.direct"],
    [E2E_SLUGS.fail, "failed", "domain.route.direct"],
    [E2E_SLUGS.check, "check", "domain.route.direct"],
    [E2E_SLUGS.stale, "check", "domain.route.direct"],
    [E2E_SLUGS.foundation, "foundation", "domain.route.foundation"],
  ] as const)("shows %s as %s with its route text and every reason", async (slug, group, routeKey) => {
    saveProfile(E2E_PROFILE);
    renderLeaf(personal(slug));
    const box = await result();
    expect(box.dataset.group).toBe(group);
    expect(box.querySelector(`[data-group="${group}"]`)).not.toBeNull();
    expect(within(box).getByTestId("route-text").textContent).toBe(message("fr", routeKey));

    const bundle = bundles[slug] as SnapshotBundle;
    const match = matchProgram({
      profile: E2E_PROFILE,
      program: programOf(slug),
      routes: bundle.routes?.routes ?? [],
      reference: bundle.core ?? { credentialTypes: [], gradingScales: [], gradeConversions: [] },
      now: E2E_NOW,
    });
    const items = box.querySelectorAll("[data-outcome]");
    expect(items).toHaveLength(match.reasons.length);
    for (const reason of match.reasons.filter((r) => r.facts.length > 0)) {
      const item = box.querySelector(`[data-code="${reason.code}"]`);
      expect(item?.querySelector('[data-slot="source-badge"] a[href^="https://"]')).not.toBeNull();
    }
    if (slug === E2E_SLUGS.stale) {
      expect(box.querySelector('[data-code="stale_source"]')).not.toBeNull();
    }
  });

  it("never states a definite route resting on a stale route fact", async () => {
    saveProfile(E2E_PROFILE);
    const base = fixtureClient(dir);
    const staleRoutes: SnapshotClient = {
      load: async (plan, locale, signal) => {
        const bundle = await base.load(plan, locale, signal);
        const routes = bundle.routes;
        return routes === undefined
          ? bundle
          : {
              ...bundle,
              routes: {
                ...routes,
                routes: routes.routes.map((route) => ({
                  ...route,
                  fact: { ...route.fact, last_verified_at: "2020-01-01" },
                })),
              },
            };
      },
    };
    renderLeaf(personal(E2E_SLUGS.ok, { client: staleRoutes }));
    const box = await result();
    const text = within(box).getByTestId("route-text").textContent;
    expect(text).toBe(message("fr", "domain.route.staleSource"));
    expect(text).not.toBe(message("fr", "domain.route.direct"));
    expect(box.dataset.group).toBe("check");
  });

  it("shows the budget fit only when the profile has a budget", async () => {
    saveProfile(E2E_PROFILE);
    renderLeaf(personal(E2E_SLUGS.ok));
    const plain = await result();
    expect(plain.querySelector('[data-slot="budget-fit"]')).toBeNull();
    cleanup();
    profileStore.clear();

    saveProfile(E2E_PROFILE_WITH_BUDGET);
    renderLeaf(personal(E2E_SLUGS.ok));
    const withBudget = await result();
    const fit = withBudget.querySelector('[data-slot="budget-fit"]');
    expect(fit?.textContent).toContain(message("fr", "program.personal.budgetNote"));
    const fits = ["within", "straddles", "above", "unknown"].map((f) =>
      message("fr", `domain.budgetFit.${f}`),
    );
    expect(fits.some((f) => fit?.textContent?.includes(f))).toBe(true);
  });

  it("marks the scholarships open to the student's nationality", async () => {
    saveProfile(E2E_PROFILE);
    renderLeaf(personal(E2E_SLUGS.ok));
    const box = await result();
    const hrefs = [...box.querySelectorAll('[data-slot="personal-scholarships"] a')].map((a) =>
      a.getAttribute("href"),
    );
    expect(hrefs).toEqual([
      `#scholarship-${E2E_SCHOLARSHIP_SLUGS.open}`,
      `#scholarship-${E2E_SCHOLARSHIP_SLUGS.xaOnly}`,
    ]);
    expect(box.textContent).toContain(message("fr", "program.personal.scholarshipsCaveat"));
    cleanup();
    profileStore.clear();

    saveProfile({ ...E2E_PROFILE, nationality: "XC" });
    renderLeaf(personal(E2E_SLUGS.ok));
    const other = await result();
    const others = [...other.querySelectorAll('[data-slot="personal-scholarships"] a')].map((a) =>
      a.getAttribute("href"),
    );
    expect(others).toEqual([`#scholarship-${E2E_SCHOLARSHIP_SLUGS.open}`]);
  });

  it("asks to reload when the published data is newer than the page", async () => {
    saveProfile(E2E_PROFILE);
    renderLeaf(personal(E2E_SLUGS.ok, { version: "an-older-build" }));
    await result();
    const notice = screen.getByRole("status");
    expect(notice.textContent).toContain(message("fr", "program.personal.updated.notice"));
    expect(
      screen.getByRole("button", {
        name: message("fr", "program.personal.updated.reload"),
      }),
    ).toBeTruthy();
  });

  it("keeps the key facts visible in every state, before the reason list", async () => {
    const withFacts = (
      <PersonalMatch
        program={PROGRAM_REFS[E2E_SLUGS.ok] ?? { slug: "", country: "XB", field: "" }}
        snapshotVersion={bundles[E2E_SLUGS.ok]?.snapshotVersion ?? ""}
        scholarshipSlugs={[]}
        locale="fr"
        client={fixtureClient(dir)}
      >
        <p data-testid="key-facts">deadline and cost</p>
      </PersonalMatch>
    );
    const cta = renderLeaf(withFacts);
    expect(screen.getByTestId("key-facts")).toBeTruthy();
    cta.unmount();

    saveProfile(E2E_PROFILE);
    renderLeaf(withFacts);
    const box = await result();
    const facts = within(box).getByTestId("key-facts");
    const reasons = box.querySelector('[data-slot="reason-list"]');
    expect(reasons).not.toBeNull();
    expect(
      facts.compareDocumentPosition(reasons as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows no reload notice when the versions match", async () => {
    saveProfile(E2E_PROFILE);
    renderLeaf(personal(E2E_SLUGS.ok));
    await result();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("says plainly when the program is no longer in the published data", async () => {
    saveProfile(E2E_PROFILE);
    renderLeaf(personal("xx-test-prog-gone"));
    expect(await screen.findByText(message("fr", "program.personal.missingProgram"))).toBeTruthy();
  });

  it("shows an error, and logs nothing, when the cost estimate throws", async () => {
    saveProfile(E2E_PROFILE);
    costs.fail = true;
    renderLeaf(personal(E2E_SLUGS.ok));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(message("fr", "program.personal.computeError.title"));
    expect(alert.textContent).not.toContain("estimateCost");
    // Retrying would only recompute the same data: no Retry for a computation error.
    expect(within(alert).queryByRole("button")).toBeNull();
  });

  it("keeps the key facts mounted once as the result arrives", async () => {
    saveProfile(E2E_PROFILE);
    const mounts = { count: 0 };
    function Counted() {
      useEffect(() => {
        mounts.count += 1;
      }, []);
      return <p data-testid="counted">key facts</p>;
    }
    renderLeaf(
      <PersonalMatch
        program={PROGRAM_REFS[E2E_SLUGS.ok] ?? { slug: "", country: "XB", field: "" }}
        snapshotVersion={bundles[E2E_SLUGS.ok]?.snapshotVersion ?? ""}
        scholarshipSlugs={[]}
        locale="fr"
        client={fixtureClient(dir)}
      >
        <Counted />
      </PersonalMatch>,
    );
    await result();
    expect(screen.getAllByTestId("counted")).toHaveLength(1);
    expect(mounts.count).toBe(1);
  });

  it("shows a computation error without Retry when the bundle has no core", async () => {
    saveProfile(E2E_PROFILE);
    const base = fixtureClient(dir);
    const noCore: SnapshotClient = {
      load: async (plan, locale, signal) => ({
        ...(await base.load(plan, locale, signal)),
        core: undefined,
      }),
    };
    renderLeaf(personal(E2E_SLUGS.ok, { client: noCore }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(message("fr", "program.personal.computeError.title"));
    expect(within(alert).queryByRole("button")).toBeNull();
  });

  it("shows a computation error, not an unhandled rejection, when a program shard is malformed", async () => {
    saveProfile(E2E_PROFILE);
    const base = fixtureClient(dir);
    const malformed: SnapshotClient = {
      load: async (plan, locale, signal) => ({
        ...(await base.load(plan, locale, signal)),
        programs: [{ kind: "programs" } as unknown as SnapshotBundle["programs"][number]],
      }),
    };
    renderLeaf(personal(E2E_SLUGS.ok, { client: malformed }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(message("fr", "program.personal.computeError.title"));
    expect(within(alert).queryByRole("button")).toBeNull();
  });

  it("shows the network error and imports the matching code again on Retry when its chunk fails to download", async () => {
    saveProfile(E2E_PROFILE);
    const imports = { count: 0 };
    vi.doMock("@/components/program/personal-outcome", async (importOriginal) => {
      imports.count += 1;
      if (imports.count === 1) throw new Error("Loading chunk failed");
      return importOriginal();
    });
    try {
      renderLeaf(personal(E2E_SLUGS.ok));
      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain(message("fr", "program.personal.error.title"));
      expect(imports.count).toBe(1);
      await userEvent.click(
        within(alert).getByRole("button", { name: message("fr", "program.personal.error.retry") }),
      );
      await result();
      expect(imports.count).toBe(2);
    } finally {
      vi.doUnmock("@/components/program/personal-outcome");
    }
  });

  it("keeps the student's values out of the URL and the title", async () => {
    const before = { href: window.location.href, title: document.title };
    saveProfile(E2E_PROFILE_WITH_BUDGET);
    renderLeaf(personal(E2E_SLUGS.ok));
    await result();
    expect(window.location.href).toBe(before.href);
    expect(document.title).toBe(before.title);
  });
});

describe("hydration", () => {
  it.each(["fr", "ar"] as const)("hydrates the leaves without a mismatch (%s)", async (locale) => {
    saveProfile(E2E_PROFILE);
    const tree = (
      <ClientLeafProvider locale={locale}>
        <PageFreshnessBanner
          facts={bannerFactsOf(bundles[E2E_SLUGS.stale] as SnapshotBundle, E2E_SLUGS.stale)}
          labels={{
            aging: message(locale, "program.banner.aging"),
            stale: message(locale, "program.banner.stale"),
            check: message(locale, "program.banner.check"),
          }}
        />
        {personal(E2E_SLUGS.ok, { locale })}
        <ProgramDeadline program={programOf(E2E_SLUGS.ok)} />
      </ClientLeafProvider>
    );
    const container = document.createElement("div");
    container.innerHTML = renderToString(tree);
    document.body.append(container);
    const onRecoverableError = vi.fn();
    const root = await act(async () => hydrateRoot(container, tree, { onRecoverableError }));
    await result();
    expect(container.querySelector('[data-freshness="stale"]')).not.toBeNull();
    expect(container.querySelector('[data-intake="upcoming"]')).not.toBeNull();
    expect(onRecoverableError).not.toHaveBeenCalled();
    act(() => root.unmount());
    container.remove();
  });
});
