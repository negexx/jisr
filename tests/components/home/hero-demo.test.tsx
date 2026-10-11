// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { DEMO_NAMESPACES } from "@/components/home/demo-namespaces";
import { HeroDemo, type HeroDemoCopy } from "@/components/home/hero-demo";
import type { AppLocale } from "@/i18n/routing";
import { type MessageTree, pickMessages } from "@/lib/i18n/client-messages";

import { catalogs, expectNoPhysicalDirection, renderWithMessages } from "../trust-helpers";

afterEach(cleanup);

const ARABIC_INDIC_DIGIT = /[٠-٩۰-۹]/u;
const FR_LICENCE = "Licence - Sciences pour l'ingénieur - Portail Marie Curie";
const DE_SOFTWARE = "Software Design International";
const DIRECT_ROUTE_CLAIM =
  /accès direct|direct access|directement|route officielle|official route/i;

// Collapses ordinary and no-break spaces alike, so a French message with a no-break space before ":"
// compares to the text a Testing Library query normalizes it to.
function norm(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function demoCopy(locale: AppLocale): HeroDemoCopy {
  const demo = catalogs[locale].home.demo;
  return {
    title: demo.title,
    illustrative: demo.illustrative,
    fieldLabel: demo.fieldLabel,
    levelLabel: demo.levelLabel,
    field: { computerScience: demo.field.computerScience, engineering: demo.field.engineering },
    level: { a2: demo.level.a2, b2: demo.level.b2 },
    fact: {
      institution: demo.fact.institution,
      teachingLanguage: demo.fact.teachingLanguage,
      tuition: demo.fact.tuition,
      toCheck: demo.fact.toCheck,
    },
    reason: {
      met: demo.reason.met,
      notMet: demo.reason.notMet,
      nonOfficial: demo.reason.nonOfficial,
      toCheck: demo.reason.toCheck,
    },
  };
}

function renderDemo(locale: AppLocale = "fr") {
  const copy = demoCopy(locale);
  const result = renderWithMessages(<HeroDemo copy={copy} />, locale);
  return { ...result, copy };
}

function fieldButton(copy: HeroDemoCopy, field: "computerScience" | "engineering") {
  return screen.getByRole("button", { name: copy.field[field] });
}

function levelButton(copy: HeroDemoCopy, level: "a2" | "b2") {
  return screen.getByRole("button", { name: copy.level[level] });
}

function groupOf(container: HTMLElement): string | null {
  return container.querySelector("[data-group]")?.getAttribute("data-group") ?? null;
}

describe("hero match demo: controls", () => {
  it("renders a field group and a language-level group with their options", () => {
    const { copy } = renderDemo("fr");
    const fieldGroup = screen.getByRole("group", { name: copy.fieldLabel });
    expect(within(fieldGroup).getByRole("button", { name: copy.field.engineering })).toBeTruthy();
    expect(
      within(fieldGroup).getByRole("button", { name: copy.field.computerScience }),
    ).toBeTruthy();
    const levelGroup = screen.getByRole("group", { name: copy.levelLabel });
    expect(within(levelGroup).getByRole("button", { name: copy.level.b2 })).toBeTruthy();
    expect(within(levelGroup).getByRole("button", { name: copy.level.a2 })).toBeTruthy();
  });

  it("shows the illustrative label before any interaction", () => {
    const { copy, container } = renderDemo("fr");
    expect(norm(container.textContent ?? "")).toContain(norm(copy.illustrative));
  });
});

describe("hero match demo: real matching", () => {
  it("loads the real match on the first interaction and shows the French route as satisfied", async () => {
    const user = userEvent.setup();
    const { copy, container } = renderDemo("fr");
    expect(screen.queryByText(FR_LICENCE)).toBeNull();

    await user.click(fieldButton(copy, "engineering"));

    expect(await screen.findByText(FR_LICENCE)).toBeTruthy();
    expect(groupOf(container)).toBe("ok");
    expect(screen.getByText(catalogs.fr.domain.status.satisfied)).toBeTruthy();
  });

  it("switching the field changes the programme and the status", async () => {
    const user = userEvent.setup();
    const { copy, container } = renderDemo("fr");
    await user.click(fieldButton(copy, "engineering"));
    await screen.findByText(FR_LICENCE);

    await user.click(fieldButton(copy, "computerScience"));

    expect(await screen.findByText(DE_SOFTWARE)).toBeTruthy();
    expect(groupOf(container)).toBe("check");
    expect(screen.getByText(catalogs.fr.domain.status.check)).toBeTruthy();
  });

  it("changing the language level changes the status", async () => {
    const user = userEvent.setup();
    const { copy, container } = renderDemo("fr");
    await user.click(fieldButton(copy, "engineering"));
    await screen.findByText(FR_LICENCE);

    await user.click(levelButton(copy, "a2"));

    await waitFor(() => expect(groupOf(container)).toBe("failed"));
    expect(screen.getByText(catalogs.fr.domain.status.not_satisfied)).toBeTruthy();
  });

  it("reaches satisfied, check and not_satisfied through the real rules", async () => {
    const user = userEvent.setup();
    const { copy, container } = renderDemo("fr");
    await user.click(fieldButton(copy, "engineering"));
    await screen.findByText(FR_LICENCE);
    expect(groupOf(container)).toBe("ok");

    await user.click(fieldButton(copy, "computerScience"));
    await screen.findByText(DE_SOFTWARE);
    expect(groupOf(container)).toBe("check");

    await user.click(levelButton(copy, "a2"));
    await waitFor(() => expect(groupOf(container)).toBe("failed"));
  });

  it("names the status in words, never by colour alone", async () => {
    const user = userEvent.setup();
    const { copy, container } = renderDemo("fr");
    await user.click(fieldButton(copy, "engineering"));
    await screen.findByText(FR_LICENCE);

    const badge = container.querySelector('[data-group="ok"]');
    expect(badge?.textContent?.trim()).toBe(catalogs.fr.domain.status.satisfied);
  });

  it("never reads the German route as official or direct access", async () => {
    const user = userEvent.setup();
    const { copy, container } = renderDemo("fr");
    await user.click(fieldButton(copy, "engineering"));
    await screen.findByText(FR_LICENCE);

    await user.click(fieldButton(copy, "computerScience"));
    await screen.findByText(DE_SOFTWARE);
    const warning = container.querySelector('[data-testid="hero-demo-reason"]')?.textContent ?? "";
    expect(warning).toBe(copy.reason.nonOfficial);
    expect(warning).not.toMatch(DIRECT_ROUTE_CLAIM);

    await user.click(levelButton(copy, "a2"));
    await waitFor(() => expect(groupOf(container)).toBe("failed"));
    const failure = container.querySelector('[data-testid="hero-demo-reason"]')?.textContent ?? "";
    expect(failure).toBe(copy.reason.notMet);
    expect(failure).not.toMatch(DIRECT_ROUTE_CLAIM);
  });
});

describe("hero match demo: direction and digits", () => {
  it("uses no physical direction utility once the card is shown", async () => {
    const user = userEvent.setup();
    const { copy, container } = renderDemo("fr");
    await user.click(fieldButton(copy, "engineering"));
    await screen.findByText(FR_LICENCE);
    expectNoPhysicalDirection(container);
  });

  it("shows Latin digits in Arabic", async () => {
    const user = userEvent.setup();
    const { copy, container } = renderDemo("ar");
    await user.click(fieldButton(copy, "engineering"));
    await screen.findByText(FR_LICENCE);
    expect(container.textContent ?? "").not.toMatch(ARABIC_INDIC_DIGIT);
  });
});

describe("hero match demo: server placeholder", () => {
  it("renders a neutral, height-reserving placeholder with no status claim", () => {
    const copy = demoCopy("fr");
    const html = renderToString(
      <NextIntlClientProvider locale="fr" messages={null} timeZone="UTC">
        <HeroDemo copy={copy} />
      </NextIntlClientProvider>,
    );

    for (const word of [
      catalogs.fr.domain.status.satisfied,
      catalogs.fr.domain.status.check,
      catalogs.fr.domain.status.not_satisfied,
    ]) {
      expect(html).not.toContain(word);
    }
    expect(html).not.toContain("data-group");
    expect(html).not.toContain("data-freshness");
    expect(html).toContain(copy.illustrative);
    expect(html).toContain("min-height");
  });

  it("renders the card with only the exported demo namespaces", async () => {
    const user = userEvent.setup();
    const copy = demoCopy("fr");
    const messages = pickMessages(catalogs.fr as unknown as MessageTree, DEMO_NAMESPACES);
    render(
      <NextIntlClientProvider
        locale="fr"
        messages={messages}
        timeZone="UTC"
        onError={(error) => {
          throw error;
        }}
      >
        <HeroDemo copy={copy} />
      </NextIntlClientProvider>,
    );

    await user.click(fieldButton(copy, "engineering"));
    expect(await screen.findByText(FR_LICENCE)).toBeTruthy();
    expect(screen.getByText(catalogs.fr.domain.status.satisfied)).toBeTruthy();
  });
});
