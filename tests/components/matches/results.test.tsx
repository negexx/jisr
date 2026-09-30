// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createTranslator } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Profile } from "@/data-schema/profile";
import type { AppLocale } from "@/i18n/routing";
import { formatMoney } from "@/lib/format";
import { buildMatchesView, MATCH_GROUPS, type MatchGroup } from "@/lib/journey/matches-view";
import { profileStore } from "@/lib/profile/store";
import type { SnapshotBundle } from "@/lib/snapshot/client";
import { shardsForMatches } from "@/lib/snapshot/plan";
import {
  E2E_EXPECTED,
  E2E_NOW,
  E2E_PROFILE,
  E2E_PROFILE_WITH_BUDGET,
  E2E_PROFILE_XB_ONLY,
  E2E_SLUGS,
} from "../../fixtures/e2e/profiles";
import { FORBIDDEN } from "../../i18n/forbidden-wording";
import { forbidConsole } from "../../lib/profile/no-console";
import { expectNoPhysicalDirection, LOCALES, reachableText } from "../trust-helpers";
import { catalogs, renderMatches, withFixtureClient } from "./helpers";

forbidConsole();

const fixture = withFixtureClient();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${E2E_NOW}T10:00:00Z`));
});

afterEach(() => {
  cleanup();
  profileStore.clear();
  window.localStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function bundleFor(locale: AppLocale, profile: Profile): Promise<SnapshotBundle> {
  return fixture.client().load((manifest) => shardsForMatches(profile, manifest), locale);
}

async function renderFor(locale: AppLocale, profile: Profile) {
  profileStore.save(profile);
  const view = renderMatches(locale, fixture.client());
  await waitFor(() => expect(screen.getAllByRole("article").length).toBeGreaterThan(0));
  return view;
}

function section(container: HTMLElement, group: MatchGroup): HTMLElement | null {
  return container.querySelector<HTMLElement>(`section[data-group="${group}"]`);
}

function slugsIn(element: HTMLElement | null): string[] {
  return [...(element?.querySelectorAll("article") ?? [])].map(
    (article) => article.getAttribute("data-slug") ?? "",
  );
}

function hiddenDisclosure(container: HTMLElement, locale: AppLocale): HTMLDetailsElement {
  const found = [...container.querySelectorAll<HTMLDetailsElement>("details")].find((element) =>
    element.textContent?.includes(catalogs[locale].matches.hidden.note),
  );
  if (found === undefined) throw new Error("no hidden-programs disclosure");
  return found;
}

function hiddenSummary(locale: AppLocale, count: number): string {
  return createTranslator({ locale, messages: catalogs[locale], namespace: "matches.hidden" })(
    "summary",
    { n: count, count: String(count) },
  );
}

const PUBLISHED = { en: /published/i, fr: /publiées?/i, ar: /المنشورة/u };

const HIDDEN_SLUGS = {
  plain: Object.keys(E2E_EXPECTED.hidden.E2E_PROFILE),
  xb: Object.keys(E2E_EXPECTED.hidden.E2E_PROFILE_XB_ONLY),
};

function expectedSlugs(group: MatchGroup, hidden: readonly string[]): string[] {
  return Object.entries(E2E_EXPECTED.programs)
    .filter(([slug, program]) => program.group === group && !hidden.includes(slug))
    .map(([slug]) => slug)
    .sort();
}

describe.each(LOCALES)("My Matches: the four groups (%s)", (locale) => {
  const t = catalogs[locale];
  const headingOf = {
    ok: t.domain.status.satisfied,
    check: t.domain.status.check,
    foundation: t.matches.groups.foundation.title,
    failed: t.domain.status.not_satisfied,
  } satisfies Record<MatchGroup, string>;

  it("puts exactly the expected programs in each group, in the model's order", async () => {
    const { container } = await renderFor(locale, E2E_PROFILE);
    const view = buildMatchesView({
      profile: E2E_PROFILE,
      bundle: await bundleFor(locale, E2E_PROFILE),
      now: E2E_NOW,
      locale,
    });
    if (view.kind !== "ok") throw new Error("expected an ok view");

    for (const group of MATCH_GROUPS) {
      const rendered = slugsIn(section(container, group));
      expect([...rendered].sort(), group).toEqual(expectedSlugs(group, HIDDEN_SLUGS.plain));
      expect(rendered, `${group} order`).toEqual(view.groups[group].map((card) => card.slug));
    }
  });

  it("renders the groups in the fixed order with a real heading and the count", async () => {
    const { container } = await renderFor(locale, E2E_PROFILE);
    const order = [...container.querySelectorAll("section[data-group]")].map((element) =>
      element.getAttribute("data-group"),
    );
    expect(order).toEqual(["ok", "check", "foundation", "failed"]);

    for (const group of MATCH_GROUPS) {
      const count = expectedSlugs(group, HIDDEN_SLUGS.plain).length;
      const region = section(container, group);
      const heading = within(region as HTMLElement).getByRole("heading", { level: 2 });
      expect(heading.textContent?.replace(/\s+/g, " ").trim()).toBe(
        `${headingOf[group]} (${count})`,
      );
      expect(region?.getAttribute("aria-labelledby")).toBe(heading.id);
    }
  });

  it("keeps the not-met heading outside the disclosure and shows the count in both", async () => {
    const { container } = await renderFor(locale, E2E_PROFILE);
    const failed = section(container, "failed") as HTMLElement;
    const heading = within(failed).getByRole("heading", { level: 2 });
    expect(heading.closest("summary")).toBeNull();
    expect(heading.closest("details")).toBeNull();
    const details = failed.querySelector("details");
    expect(details?.open).toBe(false);
    const summary = details?.querySelector("summary");
    expect(summary?.textContent).toBe(t.matches.groups.failed.show.replace("{count}", "1"));
    expect(heading.textContent).toContain("(1)");
    expect(details?.textContent).toContain(t.matches.groups.failed.note);
    expect(section(container, "ok")?.querySelector("details[open]")).toBeNull();
  });

  it("opens the not-met group and shows its programs", async () => {
    const user = userEvent.setup();
    const { container } = await renderFor(locale, E2E_PROFILE);
    const failed = section(container, "failed") as HTMLElement;
    await user.click(failed.querySelector("summary") as HTMLElement);
    expect(failed.querySelector("details")?.open).toBe(true);
    expect(slugsIn(failed)).toEqual([E2E_SLUGS.fail]);
  });

  it("puts the foundation explanation in the foundation section only, as a bordered tinted box", async () => {
    const { container } = await renderFor(locale, E2E_PROFILE);
    const title = t.matches.groups.foundation.boxTitle;
    expect(screen.getAllByText(title)).toHaveLength(1);
    const foundation = section(container, "foundation") as HTMLElement;
    const box = within(foundation).getByText(title).closest("div.rounded-lg") as HTMLElement;
    expect(box).not.toBeNull();
    expect(box.textContent).toContain(t.domain.route.foundation);
    expect(box.className).toMatch(/\bborder\b/);
    expect(box.className).toContain("border-status-check-border");
    expect(box.className).not.toMatch(/\bborder-[se]\b|\bborder-[se]-/);
    expect(box.querySelector("svg")).not.toBeNull();
    // The box explains it once; the cards keep only the short reason.
    const occurrences = foundation.textContent?.split(t.domain.route.foundation).length ?? 0;
    expect(occurrences - 1).toBe(1);
    for (const group of ["ok", "check", "failed"] as const) {
      expect(section(container, group)?.textContent).not.toContain(title);
    }
  });

  it("shows a status badge with visible text on every card", async () => {
    const { container } = await renderFor(locale, E2E_PROFILE);
    const labels = {
      ok: t.domain.status.satisfied,
      check: t.domain.status.check,
      foundation: t.matchStatusBadge.foundation,
      failed: t.domain.status.not_satisfied,
    } satisfies Record<MatchGroup, string>;
    for (const article of container.querySelectorAll("article")) {
      const group = article.getAttribute("data-group") as MatchGroup;
      expect(article.querySelector(`span[data-group="${group}"]`)?.textContent).toBe(labels[group]);
    }
  });

  it("shows the closed wording for the closed program, and the stale program only under to-check", async () => {
    const { container } = await renderFor(locale, E2E_PROFILE);
    const closed = container.querySelector(`article[data-slug="${E2E_SLUGS.check}"]`);
    expect(closed?.textContent).toContain(t.domain.intake.closed);
    expect(closed?.closest("section")?.getAttribute("data-group")).toBe("check");
    const stale = container.querySelector(`article[data-slug="${E2E_SLUGS.stale}"]`);
    expect(stale?.closest("section")?.getAttribute("data-group")).toBe("check");
  });

  it("words the incomplete cost profile as a partial total", async () => {
    const { container } = await renderFor(locale, E2E_PROFILE);
    const foundation = container.querySelector(`article[data-slug="${E2E_SLUGS.foundation}"]`);
    expect(foundation?.textContent).toContain(t.domain.cost.partialTotal);
    const complete = container.querySelector(`article[data-slug="${E2E_SLUGS.ok}"]`);
    expect(complete?.textContent).not.toContain(t.domain.cost.partialTotal);
  });

  it("keeps the word published in the not-met chip so it never reads as a verdict", async () => {
    await renderFor(locale, E2E_PROFILE);
    const nav = screen.getByRole("navigation", { name: t.matches.counts.navLabel });
    const chip = within(nav).getAllByRole("link").at(-1);
    expect(chip?.textContent).toMatch(PUBLISHED[locale]);
  });

  it("names the counts as jump links to the groups, leaving out the empty ones", async () => {
    const { container } = await renderFor(locale, E2E_PROFILE);
    const translate = createTranslator({
      locale,
      messages: catalogs[locale],
      namespace: "matches.counts",
    });
    const nav = screen.getByRole("navigation", { name: t.matches.counts.navLabel });
    const links = within(nav).getAllByRole("link");
    const wanted = MATCH_GROUPS.map(
      (group) => [group, expectedSlugs(group, HIDDEN_SLUGS.plain).length] as const,
    ).filter(([, count]) => count > 0);
    expect(links.map((link) => link.textContent)).toEqual(
      wanted.map(([group, count]) => translate(group, { n: count, count: String(count) })),
    );
    for (const [index, [group]] of wanted.entries()) {
      const target = section(container, group)?.querySelector("h2");
      expect(links[index]?.getAttribute("href")).toBe(`#${target?.id}`);
      expect(target?.id).toMatch(/^matches-group-/);
      expect(links[index]?.className).toContain("min-h-11");
      // Marked as links, unlike the profile chips: underlined label and a decorative down arrow.
      expect(links[index]?.querySelector("span.underline")).not.toBeNull();
      const arrow = links[index]?.querySelector("svg");
      expect(arrow?.getAttribute("aria-hidden")).toBe("true");
      expect(arrow?.getAttribute("class")).not.toMatch(/rotate/);
    }
    expect(nav.textContent).not.toMatch(/[٠-٩]/u);
  });
});

describe.each(LOCALES)("My Matches: hidden by preferences (%s)", (locale) => {
  const t = catalogs[locale];

  it("shows a quiet disclosure with the count and the mismatch reasons", async () => {
    const user = userEvent.setup();
    const { container } = await renderFor(locale, E2E_PROFILE);
    const hidden = hiddenDisclosure(container, locale);
    expect(hidden.open).toBe(false);
    expect(hidden.querySelector("summary")?.textContent).toBe(hiddenSummary(locale, 1));
    await user.click(hidden.querySelector("summary") as HTMLElement);
    expect(hidden.open).toBe(true);
    expect(hidden.textContent).toContain(t.domain.mismatch.institution_type);
    // One hidden program: its own line says why, so no per-reason count chips repeat it.
    const chip = createTranslator({
      locale,
      messages: catalogs[locale],
      namespace: "matches.hidden",
    })("reasonCount", { reason: t.domain.mismatch.institution_type, count: "1" });
    expect(hidden.textContent).not.toContain(chip);
    expect(hidden.querySelectorAll("article")).toHaveLength(0);
  });

  it("lists each hidden program with its own reasons when destinations narrow the list", async () => {
    const { container } = await renderFor(locale, E2E_PROFILE_XB_ONLY);
    const hidden = hiddenDisclosure(container, locale);
    expect(hidden.querySelector("summary")?.textContent).toBe(hiddenSummary(locale, 2));
    const text = hidden.textContent ?? "";
    expect(text).toContain(t.domain.mismatch.destination);
    expect(text).toContain(t.domain.mismatch.institution_type);
    const chip = createTranslator({
      locale,
      messages: catalogs[locale],
      namespace: "matches.hidden",
    })("reasonCount", { reason: t.domain.mismatch.destination, count: "1" });
    expect(text).toContain(chip);
    expect(hidden.querySelectorAll("li bdi").length).toBeGreaterThanOrEqual(HIDDEN_SLUGS.xb.length);
    // Hidden programs are never matched: no cards, and the foundation program is not in a group.
    expect(section(container, "foundation")).toBeNull();
    const view = buildMatchesView({
      profile: E2E_PROFILE_XB_ONLY,
      bundle: await bundleFor(locale, E2E_PROFILE_XB_ONLY),
      now: E2E_NOW,
      locale,
    });
    if (view.kind !== "ok") throw new Error("expected an ok view");
    expect(view.hidden.map((program) => program.slug).sort()).toEqual([...HIDDEN_SLUGS.xb].sort());
  });
});

describe.each(LOCALES)("My Matches: profile summary (%s)", (locale) => {
  const t = catalogs[locale];

  it("shows the chosen fields, all countries, no budget and an edit link", async () => {
    const { container } = await renderFor(locale, E2E_PROFILE);
    const bundle = await bundleFor(locale, E2E_PROFILE);
    const aside = container.querySelector("aside") as HTMLElement;
    expect(within(aside).getByRole("heading", { level: 2 }).textContent).toBe(
      t.matches.summary.title,
    );
    for (const slug of E2E_PROFILE.fields) {
      const key = bundle.core?.fields.find((field) => field.slug === slug)?.name;
      const name = key === undefined ? slug : (bundle.text(key)?.text ?? slug);
      expect(within(aside).getByText(name).closest("li")).not.toBeNull();
    }
    expect(within(aside).getByText(t.matches.summary.allCountries)).toBeTruthy();
    expect(within(aside).getByText(t.matches.summary.budgetNotSet)).toBeTruthy();
    const edit = within(aside).getByRole("link", { name: t.matches.summary.edit });
    expect(edit.getAttribute("href")).toBe(`/${locale}/profile`);
  });

  it("shows a budget with its currency and lists the chosen destinations", async () => {
    const { container } = await renderFor(locale, {
      ...E2E_PROFILE_WITH_BUDGET,
      destinations: ["XB"],
    });
    const aside = container.querySelector("aside") as HTMLElement;
    const amount = formatMoney(90_000, "XTS", locale);
    expect(aside.textContent).toContain(amount);
    expect(aside.textContent).not.toContain(t.matches.summary.budgetNotSet);
    expect(aside.textContent).not.toContain(t.matches.summary.allCountries);
    expect(aside.querySelector("bdi[dir='ltr']")?.textContent).toBe(amount);
  });

  it("does not change the groups when a budget is set", async () => {
    const plain = await renderFor(locale, E2E_PROFILE);
    const before = MATCH_GROUPS.map((group) => slugsIn(section(plain.container, group)));
    cleanup();
    const withBudget = await renderFor(locale, E2E_PROFILE_WITH_BUDGET);
    const after = MATCH_GROUPS.map((group) => slugsIn(section(withBudget.container, group)));
    expect(after).toEqual(before);
    expect(withBudget.container.textContent).toMatch(
      new RegExp(
        [
          t.domain.budgetFit.within,
          t.domain.budgetFit.straddles,
          t.domain.budgetFit.above,
          t.domain.budgetFit.unknown,
        ]
          .map((line) => line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
          .join("|"),
      ),
    );
  });
});

describe.each(LOCALES)("My Matches: page chrome (%s)", (locale) => {
  const t = catalogs[locale];

  it("shows the trust lead with the results and keeps a permanent, empty polite status", async () => {
    const { container } = await renderFor(locale, E2E_PROFILE);
    expect(screen.getByText(t.matches.lead)).toBeTruthy();
    const status = container.querySelector("output.sr-only");
    expect(status).not.toBeNull();
    expect(status?.textContent).toBe("");
  });

  it("renders the profile summary as one chip strip on phones: labels are screen-reader-only", async () => {
    const { container } = await renderFor(locale, E2E_PROFILE);
    const aside = container.querySelector("aside") as HTMLElement;
    const labels = [...aside.querySelectorAll("dt")];
    expect(labels).toHaveLength(3);
    for (const label of labels) {
      expect(label.classList.contains("sr-only")).toBe(true);
      expect(label.classList.contains("lg:not-sr-only")).toBe(true);
    }
    expect(aside.querySelectorAll("li").length).toBeGreaterThanOrEqual(4);
  });
});

describe("My Matches: text notes", () => {
  it("says a program is shown in French when its text has no translation", async () => {
    const { container } = await renderFor("en", E2E_PROFILE);
    const card = container.querySelector(`article[data-slug="${E2E_EXPECTED.frOnlyProgram}"]`);
    expect(card?.textContent).toContain(catalogs.en.domain.textNote.french_fallback);
  });
});

describe.each(LOCALES)("My Matches: trust, direction and privacy (%s)", (locale) => {
  it("never says eligible or admitted anywhere the student can reach", async () => {
    const { container } = await renderFor(locale, E2E_PROFILE);
    const text = reachableText(container);
    for (const pattern of FORBIDDEN[locale]) expect(text, String(pattern)).not.toMatch(pattern);
    expect(text).not.toMatch(/\d\s?%/);
  });

  it("uses no physical direction utility and keeps Latin digits", async () => {
    const { container, getByTestId } = await renderFor(locale, E2E_PROFILE);
    expectNoPhysicalDirection(container);
    expect(getByTestId("dir-root").getAttribute("dir")).toBe(locale === "ar" ? "rtl" : "ltr");
    expect(container.textContent).not.toMatch(/[٠-٩۰-۹]/u);
    expect(container.querySelectorAll("h1")).toHaveLength(0);
  });

  it("keeps every profile value out of the URL, the title, attributes and the network", async () => {
    const { container } = await renderFor(locale, E2E_PROFILE_WITH_BUDGET);
    expect(window.location.href).toBe("http://localhost:3000/");
    expect(document.title).toBe("");
    const secrets = ["xx-test-cred", "xx-test-track", "xx-test-subject-math", "90000"];
    for (const element of container.querySelectorAll("*")) {
      for (const attribute of element.getAttributeNames()) {
        if (attribute === "class") continue;
        const value = `${attribute}=${element.getAttribute(attribute)}`;
        for (const secret of secrets)
          expect(value, `${element.tagName} ${attribute}`).not.toContain(secret);
      }
    }
    // The client caches shards for the session, so only the whole run is asked here: every request is a shard URL.
    expect(fixture.requests.length).toBeGreaterThan(0);
    for (const url of fixture.requests)
      expect(url).toMatch(/^\/snap\/(manifest\.json|s\/[\w.-]+\.json)$/);
  });
});
