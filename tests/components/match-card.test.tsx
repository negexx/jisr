// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { MatchCard } from "@/components/match-card";
import type { AppLocale } from "@/i18n/routing";
import type { MatchCardModel } from "@/lib/journey/matches-view";
import { formatNumber } from "@/lib/journey/reasons";

import { E2E_SLUGS } from "../fixtures/e2e/profiles";
import { type JourneyFixture, loadJourneyFixture } from "./journey-fixture";
import {
  catalogs,
  expectNoPhysicalDirection,
  LOCALES,
  renderWithMessages,
  watchConsole,
} from "./trust-helpers";

const ARABIC_INDIC_DIGIT = /[٠-٩۰-۹]/u;

let journey: JourneyFixture;
beforeAll(() => {
  journey = loadJourneyFixture();
}, 180_000);

let consoleWatch: ReturnType<typeof watchConsole>;
beforeEach(() => {
  consoleWatch = watchConsole();
});
afterEach(() => {
  cleanup();
  consoleWatch.expectSilent();
  consoleWatch.restore();
});

function renderCard(model: MatchCardModel, locale: AppLocale) {
  const months = formatNumber(model.cost.academicYearMonths, locale) ?? "?";
  return renderWithMessages(<MatchCard model={model} monthsLabel={months} />, locale);
}

const GROUP_PROGRAMS = [
  ["ok", E2E_SLUGS.ok],
  ["check", E2E_SLUGS.check],
  ["foundation", E2E_SLUGS.foundation],
  ["failed", E2E_SLUGS.fail],
] as const;

function statusLabel(locale: AppLocale, group: MatchCardModel["group"]): string {
  const catalog = catalogs[locale];
  return {
    ok: catalog.domain.status.satisfied,
    check: catalog.domain.status.check,
    foundation: catalog.matchStatusBadge.foundation,
    failed: catalog.domain.status.not_satisfied,
  }[group];
}

describe("MatchCard: header and status", () => {
  it.each(
    GROUP_PROGRAMS.flatMap(([group, slug]) =>
      LOCALES.map((locale) => [group, slug, locale] as const),
    ),
  )("shows the %s status badge for %s in %s", (group, slug, locale) => {
    const model = journey.card(locale, slug);
    expect(model.group).toBe(group);
    const { container } = renderCard(model, locale);
    const badge = container.querySelector(`span[data-group="${group}"]`);
    expect(badge?.textContent).toBe(statusLabel(locale, group));
    expect(container.querySelector("article")?.getAttribute("data-group")).toBe(group);
  });

  it.each(LOCALES)("is an article named by its title link (%s)", (locale) => {
    const model = journey.card(locale, E2E_SLUGS.ok);
    renderCard(model, locale);
    const article = screen.getByRole("article", { name: model.name });
    const title = within(article).getByRole("heading", { level: 3 });
    expect(title.textContent).toBe(model.name);
    expect(article.getAttribute("aria-labelledby")).toBe(title.id);
    const link = within(title).getByRole("link");
    expect(link.getAttribute("href")).toBe(`/${locale}/programs/${model.slug}`);
    expect(link.querySelector("bdi")?.textContent).toBe(model.name);
  });

  it("has a second link to the same target, named with the program", () => {
    const model = journey.card("en", E2E_SLUGS.ok);
    renderCard(model, "en");
    const links = screen.getAllByRole("link", { name: /See details/ });
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute("href")).toBe(`/en/programs/${model.slug}`);
    expect(links[0]?.textContent).toContain(model.name);
  });

  it.each(LOCALES)("shows institution, city, level and teaching languages (%s)", (locale) => {
    const model = journey.card(locale, E2E_SLUGS.ok);
    const { container } = renderCard(model, locale);
    const text = container.textContent ?? "";
    expect(text).toContain(model.institutionName);
    expect(text).toContain(model.cityName);
    expect(text).toContain(catalogs[locale].matchCard.level.bachelor);
    expect(text).toContain(catalogs[locale].matchCard.taughtIn);
    expect(container.querySelectorAll("header bdi").length).toBeGreaterThanOrEqual(2);
  });

  it("shows the languages as to be checked, without a badge, when they are not published", () => {
    const model = journey.card("en", E2E_SLUGS.ok);
    const unknown: MatchCardModel = {
      ...model,
      teachingLanguages: { ...model.teachingLanguages, value: null },
    };
    const { container } = renderCard(unknown, "en");
    expect(container.querySelector("header")?.textContent).toContain(
      catalogs.en.matchCard.languagesUnknown,
    );
    expect(container.querySelector("header [data-slot='source-badge']")).toBeNull();
  });

  it("shows the summary text on desktop only, with its text note", () => {
    const model = journey.card("fr", E2E_SLUGS.frOnly);
    const { container } = renderCard(model, "en");
    const summary = container.querySelector("header p.hidden");
    expect(summary?.className).toContain("md:line-clamp-2");
    expect(summary?.textContent).toContain(model.summaryText?.text ?? "missing");
  });
});

describe("MatchCard: facts", () => {
  function fact(container: HTMLElement, label: string): HTMLElement {
    const term = [...container.querySelectorAll("dt")].find((dt) => dt.textContent === label);
    const detail = term?.nextElementSibling;
    if (!(detail instanceof HTMLElement)) throw new Error(`no fact ${label}`);
    return detail;
  }

  it.each(
    LOCALES,
  )("shows an official single tuition fee with its period and source (%s)", (locale) => {
    const model = journey.card(locale, E2E_SLUGS.ok);
    const tuition = model.tuition.value;
    if (tuition === null) throw new Error("the ok fixture program publishes its tuition");
    const { container } = renderCard(model, locale);
    const detail = fact(container, catalogs[locale].domain.cost.category.tuition);
    const amount = detail.querySelector("bdi");
    expect(amount?.textContent).toBeTruthy();
    expect(detail.textContent).toContain(catalogs[locale].domain.cost.per[tuition.period]);
    expect(amount?.textContent).not.toContain(catalogs[locale].domain.cost.per[tuition.period]);
    expect(detail.querySelector('[data-slot="source-badge"]')).not.toBeNull();
    expect(detail.textContent).not.toContain(catalogs[locale].domain.cost.missingLine);
  });

  it.each(
    LOCALES,
  )("says tuition is to be checked, with no amount and no badge, when unpublished (%s)", (locale) => {
    const model = journey.card(locale, E2E_SLUGS.ok);
    const unpublished: MatchCardModel = { ...model, tuition: { ...model.tuition, value: null } };
    const { container } = renderCard(unpublished, locale);
    const detail = fact(container, catalogs[locale].domain.cost.category.tuition);
    expect(detail.textContent).toBe(catalogs[locale].domain.cost.missingLine);
    expect(detail.querySelector('[data-slot="source-badge"]')).toBeNull();
    expect(detail.querySelector("bdi")).toBeNull();
  });

  it.each(LOCALES)("shows the deadline states from the intake it is given (%s)", (locale) => {
    const intake = catalogs[locale].domain.intake;
    const label = catalogs[locale].matchCard.facts.deadline;
    const upcoming = renderCard(journey.card(locale, E2E_SLUGS.ok), locale);
    expect(fact(upcoming.container, label).textContent).toContain(
      intake.upcoming.replace("{date}", "15/01/2027"),
    );
    cleanup();
    const closed = renderCard(journey.card(locale, E2E_SLUGS.check), locale);
    expect(fact(closed.container, label).textContent).toContain(intake.closed);
    expect(fact(closed.container, label).textContent).not.toContain(
      intake.upcoming.split("{")[0] ?? "",
    );
    cleanup();
    const unknown = renderCard(journey.card(locale, E2E_SLUGS.frOnly), locale);
    expect(fact(unknown.container, label).textContent).toContain(intake.unknown);
  });

  it.each(
    LOCALES,
  )("shows the cost compact: total range, the note and the lines behind a details (%s)", (locale) => {
    const model = journey.card(locale, E2E_SLUGS.ok);
    const { container } = renderCard(model, locale);
    const detail = fact(container, catalogs[locale].matchCard.facts.estimatedCost);
    expect(detail.querySelector('[data-slot="cost-breakdown"]')?.getAttribute("data-variant")).toBe(
      "compact",
    );
    expect(detail.querySelector('[data-testid="cost-total"]')).not.toBeNull();
    expect(detail.querySelector('[data-testid="cost-partial"]')).toBeNull();
    expect(detail.querySelectorAll("details")).toHaveLength(1);
    expect(detail.textContent).toContain(
      catalogs[locale].domain.cost.tenMonthNote.replace("{months}", "10"),
    );
    expect(container.textContent).not.toMatch(ARABIC_INDIC_DIGIT);
  });

  it.each(LOCALES)("says the total is partial when a cost line is missing (%s)", (locale) => {
    const model = journey.card(locale, E2E_SLUGS.foundation);
    expect(model.cost.complete).toBe(false);
    const { container } = renderCard(model, locale);
    const detail = fact(container, catalogs[locale].matchCard.facts.estimatedCost);
    expect(detail.querySelector('[data-testid="cost-partial"]')?.textContent).toContain(
      catalogs[locale].domain.cost.partialTotal,
    );
    expect(detail.querySelectorAll('[data-testid="cost-row"]')).toHaveLength(7);
  });

  it("shows the budget fit only when the profile has a budget", () => {
    const fit = catalogs.en.domain.budgetFit;
    const plain = renderCard(journey.card("en", E2E_SLUGS.ok), "en");
    for (const sentence of Object.values(fit))
      expect(plain.container.textContent).not.toContain(sentence);
    cleanup();
    const withBudget = journey.card("en", E2E_SLUGS.ok, "budget");
    expect(withBudget.cost.budgetFit).not.toBe("unknown");
    const { container } = renderCard(withBudget, "en");
    expect(container.textContent).toContain(fit[withBudget.cost.budgetFit]);
  });

  it.each(
    LOCALES,
  )("shows the application channel, its kind and whether an account is needed (%s)", (locale) => {
    const model = journey.card(locale, E2E_SLUGS.ok);
    const channel = model.applicationChannel;
    if (channel === null) throw new Error("the ok fixture program has a channel");
    const { container } = renderCard(model, locale);
    const detail = fact(container, catalogs[locale].matchCard.facts.application);
    const messages = catalogs[locale].matchCard.channel;
    expect(detail.textContent).toContain(channel.name);
    expect(detail.textContent).toContain(messages.kind[channel.kind]);
    expect(detail.textContent).toContain(
      channel.accountRequired ? messages.account.required : messages.account.notRequired,
    );
    expect(detail.querySelector('[data-slot="source-badge"]')).not.toBeNull();
  });

  it("words an unknown account and a missing channel as to be checked", () => {
    const model = journey.card("en", E2E_SLUGS.ok);
    const channel = model.applicationChannel;
    if (channel === null) throw new Error("the ok fixture program has a channel");
    const unknownAccount = renderCard(
      { ...model, applicationChannel: { ...channel, accountRequired: null } },
      "en",
    );
    expect(fact(unknownAccount.container, "How to apply").textContent).toContain(
      catalogs.en.matchCard.channel.account.unknown,
    );
    cleanup();
    const none = renderCard({ ...model, applicationChannel: null }, "en");
    expect(fact(none.container, "How to apply").textContent).toBe(
      catalogs.en.domain.cost.missingLine,
    );
  });
});

describe("MatchCard: reasons and routes", () => {
  it.each(LOCALES)("lists the top reasons under a level 4 heading (%s)", (locale) => {
    const model = journey.card(locale, E2E_SLUGS.check);
    const { container } = renderCard(model, locale);
    expect(container.querySelector("h4")?.textContent).toBe(
      catalogs[locale].matchCard.reasonsHeading,
    );
    expect(container.querySelectorAll("[data-slot='reason-list'] li[data-code]")).toHaveLength(
      model.topReasons.length,
    );
  });

  it.each(LOCALES)("gives the foundation card its route text from routeKey (%s)", (locale) => {
    const model = journey.card(locale, E2E_SLUGS.foundation);
    expect(model.routeKey).toBe("domain.route.foundation");
    const { container } = renderCard(model, locale);
    expect(container.querySelector('[data-testid="route-text"]')?.textContent).toBe(
      catalogs[locale].domain.route.foundation,
    );
  });

  it.each(LOCALES)("shows no route text on the other cards (%s)", (locale) => {
    for (const slug of [E2E_SLUGS.ok, E2E_SLUGS.check, E2E_SLUGS.fail]) {
      const { container } = renderCard(journey.card(locale, slug), locale);
      expect(container.querySelector('[data-testid="route-text"]')).toBeNull();
      cleanup();
    }
  });

  it.each([
    ["staleSource", "domain.route.staleSource"],
    ["nonOfficialSource", "domain.route.nonOfficialSource"],
  ] as const)("shows the neutral %s text, never a definite outcome, for a route resting on weak evidence", (name, routeKey) => {
    for (const locale of LOCALES) {
      const model: MatchCardModel = { ...journey.card(locale, E2E_SLUGS.foundation), routeKey };
      const { container } = renderCard(model, locale);
      const text = container.querySelector('[data-testid="route-text"]')?.textContent;
      expect(text).toBe(catalogs[locale].domain.route[name]);
      expect(text).not.toBe(catalogs[locale].domain.route.foundation);
      expect(text).not.toBe(catalogs[locale].domain.route.direct);
      cleanup();
    }
  });
});

describe("MatchCard: hygiene", () => {
  it.each(
    LOCALES,
  )("has no physical-direction classes and no Arabic-Indic digits (%s)", (locale) => {
    for (const card of journey.cards(locale)) {
      const { container } = renderCard(card, locale);
      expectNoPhysicalDirection(container);
      expect(container.textContent).not.toMatch(ARABIC_INDIC_DIGIT);
      cleanup();
    }
  });

  it("uses one tinted status badge per card and no nested card", () => {
    const { container } = renderCard(journey.card("en", E2E_SLUGS.ok), "en");
    expect(container.querySelectorAll("article")).toHaveLength(1);
    expect(container.querySelectorAll("[data-group][data-size]")).toHaveLength(1);
  });
});
