// @vitest-environment jsdom
import { cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { HeroDemo, type HeroDemoCopy } from "@/components/home/hero-demo";
import type { AppLocale } from "@/i18n/routing";

import { catalogs, expectNoPhysicalDirection, renderWithMessages } from "../trust-helpers";

afterEach(cleanup);

const ARABIC_INDIC_DIGIT = /[٠-٩۰-۹]/u;
const FR_LICENCE = "Licence - Sciences pour l'ingénieur - Portail Marie Curie";
const DE_SOFTWARE = "Software Design International";

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
    profile: {
      heading: demo.profile.heading,
      nationality: demo.profile.nationality,
      diploma: demo.profile.diploma,
      field: demo.profile.field,
      language: demo.profile.language,
      values: { ...demo.profile.values },
    },
    match: { ...demo.match },
  };
}

function renderDemo(locale: AppLocale = "fr") {
  const copy = demoCopy(locale);
  const result = renderWithMessages(<HeroDemo copy={copy} locale={locale} />, locale);
  return { ...result, copy };
}

describe("hero match demo: the self-running profile reveal", () => {
  it("renders the title and the illustrative label", () => {
    const { copy, container } = renderDemo("fr");
    const text = norm(container.textContent ?? "");
    expect(text).toContain(norm(copy.title));
    expect(text).toContain(norm(copy.illustrative));
  });

  it("renders the four profile rows with their labels and their values", () => {
    const { copy, container } = renderDemo("fr");
    const text = norm(container.textContent ?? "");
    for (const key of ["nationality", "diploma", "field", "language"] as const) {
      expect(text, key).toContain(norm(copy.profile[key]));
      expect(text, key).toContain(norm(copy.profile.values[key]));
    }
  });

  it("renders both illustrative match cards", () => {
    const { container } = renderDemo("fr");
    const text = norm(container.textContent ?? "");
    expect(text).toContain(norm(FR_LICENCE));
    expect(text).toContain(norm(DE_SOFTWARE));
  });

  it("shows exactly one satisfied and one to-check badge, each with a sourced fact", () => {
    const { container } = renderDemo("fr");
    expect(container.querySelectorAll('[data-group="ok"]').length).toBe(1);
    expect(container.querySelectorAll('[data-group="check"]').length).toBe(1);
    expect(container.querySelectorAll('[data-slot="source-badge"]').length).toBeGreaterThan(0);
  });

  it("is non-interactive: it renders no control of any kind", () => {
    const { container } = renderDemo("fr");
    expect(
      container.querySelectorAll("button, input, select, textarea, [role=button]").length,
    ).toBe(0);
  });
});

describe.each([
  "fr",
  "en",
  "ar",
] as const)("hero match demo: direction and digits (%s)", (locale) => {
  it("uses only logical direction utilities", () => {
    const { container } = renderDemo(locale);
    expectNoPhysicalDirection(container);
  });

  it("never prints Arabic-Indic digits, whatever the locale", () => {
    const { container } = renderDemo(locale);
    expect(container.textContent ?? "").not.toMatch(ARABIC_INDIC_DIGIT);
  });
});

describe("hero match demo: server render", () => {
  it("renders the final state with no freshness claim and no control", () => {
    const copy = demoCopy("fr");
    const html = renderToString(
      <NextIntlClientProvider locale="fr" messages={null} timeZone="UTC">
        <HeroDemo copy={copy} locale="fr" />
      </NextIntlClientProvider>,
    );

    expect(html).toContain(copy.illustrative);
    const decoded = html.replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
    expect(decoded).toContain(FR_LICENCE);
    expect(decoded).toContain(DE_SOFTWARE);
    expect(html).not.toContain("data-freshness");
    expect(html).not.toContain("<button");
  });
});
