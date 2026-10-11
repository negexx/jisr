// @vitest-environment jsdom
import { createTranslator } from "next-intl";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { AppLocale } from "@/i18n/routing";
import { routing } from "@/i18n/routing";

import ar from "../../messages/ar.json";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

const catalogues = { fr, en, ar } as const;
const state = vi.hoisted(() => ({ locale: "fr" }));

vi.mock("next-intl/server", async () => {
  const { createTranslator: translator } = await import("next-intl");
  const messages = {
    fr: (await import("../../messages/fr.json")).default,
    en: (await import("../../messages/en.json")).default,
    ar: (await import("../../messages/ar.json")).default,
  };
  return {
    setRequestLocale: (locale: string) => {
      state.locale = locale;
    },
    getMessages: async () => messages[state.locale as AppLocale],
    getTranslations: async (arg: string | { locale: AppLocale; namespace: string }) => {
      const locale = typeof arg === "string" ? (state.locale as AppLocale) : arg.locale;
      const namespace = typeof arg === "string" ? arg : arg.namespace;
      return translator({ locale, messages: messages[locale], namespace: namespace as never });
    },
  };
});

const page = await import("@/app/[locale]/plan/page");

const LOCALES = routing.locales;

describe.each(LOCALES)("My plan page (%s)", (locale) => {
  const t = createTranslator({ locale, messages: catalogues[locale], namespace: "plan" });

  it("renders the title and a neutral skeleton, with no student-dependent claim", async () => {
    state.locale = locale;
    const element = await page.default({ params: Promise.resolve({ locale }) });
    const html = renderToString(element);

    expect(html).toContain(t("title"));
    expect(html).toContain('aria-busy="true"');
    // Nothing that depends on the profile, the saved list, the clock or the data.
    for (const text of [
      t("empty.title"),
      t("noProfile.title"),
      t("storage.notice"),
      t("missing.title"),
      t("steps.heading"),
      t("program.nextStep"),
      catalogues[locale].domain.checklist.step.documents.title,
      catalogues[locale].domain.status.satisfied,
      catalogues[locale].domain.status.check,
    ]) {
      expect(html, text).not.toContain(text);
    }
    expect(html).not.toMatch(/<ol|<input|<details|<time/);
    expect(html).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
    expect(html).not.toMatch(/xx-test|jisr\./);
  });

  it("opens with the band: eyebrow, the one h1 and the static lead", async () => {
    state.locale = locale;
    const element = await page.default({ params: Promise.resolve({ locale }) });
    const parsed = document.implementation.createHTMLDocument("");
    parsed.body.innerHTML = renderToString(element);

    const headings = parsed.querySelectorAll("h1");
    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toBe(t("title"));
    expect(headings[0]?.className).toContain("text-display");
    expect(headings[0]?.className).toContain("font-light");
    expect(parsed.body.textContent).toContain(t("eyebrow"));
    expect(parsed.body.textContent).toContain(t("lead"));
  });

  it("cancels only the top padding of the main column and pads the island", async () => {
    state.locale = locale;
    const element = await page.default({ params: Promise.resolve({ locale }) });
    const parsed = document.implementation.createHTMLDocument("");
    parsed.body.innerHTML = renderToString(element);

    const wrapper = parsed.body.firstElementChild;
    expect(wrapper?.className).toContain("-mt-8");
    expect(wrapper?.className).toContain("md:-mt-12");
    expect(wrapper?.querySelector(":scope > div.pt-8")?.className).toContain("pt-8 md:pt-12");
  });

  it("gives its nested provider an explicit locale", async () => {
    state.locale = locale;
    const element = await page.default({ params: Promise.resolve({ locale }) });
    const json = JSON.stringify(element, (_key, value) =>
      typeof value === "function" ? undefined : value,
    );
    expect(json).toContain(`"locale":"${locale}"`);
  });

  it("builds its metadata from the plan.meta messages", async () => {
    state.locale = locale;
    const metadata = await page.generateMetadata({ params: Promise.resolve({ locale }) });
    expect(metadata.title).toBe(t("meta.title"));
    expect(metadata.description).toBe(t("meta.description"));
  });
});
