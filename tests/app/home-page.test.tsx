// @vitest-environment jsdom
import { NextIntlClientProvider } from "next-intl";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { AppLocale } from "@/i18n/routing";

import ar from "../../messages/ar.json";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

const catalogs = { fr, en, ar } as const;
const request = vi.hoisted(() => ({ locale: "fr" }));

// next-intl's server API needs the RSC request scope; the test stands in for it with the real catalogues.
vi.mock("next-intl/server", async () => {
  const { createTranslator: translator } = await import("next-intl");
  const messages = {
    fr: (await import("../../messages/fr.json")).default,
    en: (await import("../../messages/en.json")).default,
    ar: (await import("../../messages/ar.json")).default,
  };
  return {
    setRequestLocale: (locale: string) => {
      request.locale = locale;
    },
    getTranslations: async (arg: string | { locale: AppLocale; namespace: string }) => {
      const locale = (typeof arg === "string" ? request.locale : arg.locale) as AppLocale;
      const namespace = typeof arg === "string" ? arg : arg.namespace;
      return translator({ locale, messages: messages[locale], namespace: namespace as never });
    },
    getMessages: async () => messages[request.locale as AppLocale],
  };
});

const { default: HomePage } = await import("@/app/[locale]/page");

async function renderHome(locale: AppLocale) {
  const element = await HomePage({ params: Promise.resolve({ locale }) });
  const html = renderToString(
    <NextIntlClientProvider locale={locale} messages={catalogs[locale]} timeZone="UTC">
      {element}
    </NextIntlClientProvider>,
  );
  const parsed = document.implementation.createHTMLDocument("");
  parsed.body.innerHTML = html;
  return { document: parsed, html };
}

// Collapses ordinary and no-break spaces alike, so a rendered message is compared to the
// catalogue value without the French no-break space before ? : ! ; getting in the way.
function norm(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/gu, " ").trim();
}

function text(node: ParentNode | null): string {
  return norm(node?.textContent);
}

const QUESTION_KEYS = ["where", "apply", "cost", "next"] as const;
const FACT_KINDS = ["official", "estimate", "guidance"] as const;

describe("home page", () => {
  it("links to the scholarships page with the French label", async () => {
    const { document: page } = await renderHome("fr");
    const link = page.querySelector('a[href="/fr/scholarships"]');
    expect(link?.textContent?.trim()).toBe("Voir les bourses");
  });

  it.each(["en", "ar"] as const)("links to the scholarships page in %s", async (locale) => {
    const { document: page } = await renderHome(locale);
    const link = page.querySelector(`a[href="/${locale}/scholarships"]`);
    expect(link?.textContent?.trim()).toBe(catalogs[locale].home.scholarshipsCta);
  });
});

describe.each(["fr", "en", "ar"] as const)("home page sections (%s)", (locale) => {
  const home = catalogs[locale].home;

  it("renders the thin hero headline with its lead and eyebrow", async () => {
    const { document: page } = await renderHome(locale);
    const h1 = page.querySelector("h1");
    expect(h1).not.toBeNull();
    const heading = text(h1);
    expect(heading).toContain(norm(home.hero.titleLead));
    expect(heading).toContain(norm(home.hero.titleAccent));
    expect(text(page.body)).toContain(norm(home.hero.eyebrow));
    expect(text(page.body)).toContain(norm(home.lead));
    expect(text(page.body)).toContain(norm(home.ctaNote));
  });

  it("renders the trust band triad: kicker, split title and body", async () => {
    const { document: page } = await renderHome(locale);
    const body = text(page.body);
    expect(body).toContain(norm(home.trust.kicker));
    expect(body).toContain(norm(home.trust.titleLead));
    expect(body).toContain(norm(home.trust.titleAccent));
    expect(body).toContain(norm(home.trust.body));
  });

  it("renders the three fact-kind legend pills with their meanings", async () => {
    const { document: page } = await renderHome(locale);
    const body = text(page.body);
    for (const kind of FACT_KINDS) {
      expect(body, kind).toContain(norm(catalogs[locale].domain.infoKind[kind].label));
      expect(body, kind).toContain(norm(home.trust.legend[kind]));
    }
  });

  it("renders the status legend as three real match-status badges", async () => {
    const { document: page } = await renderHome(locale);
    const trust = page.querySelector('section[aria-labelledby="trust-heading"]');
    const groups = [...(trust?.querySelectorAll("[data-group]") ?? [])].map((el) =>
      el.getAttribute("data-group"),
    );
    expect(groups.sort()).toEqual(["check", "failed", "ok"]);
    const body = text(page.body);
    expect(body).toContain(norm(catalogs[locale].domain.status.satisfied));
    expect(body).toContain(norm(catalogs[locale].domain.status.check));
    expect(body).toContain(norm(catalogs[locale].domain.status.not_satisfied));
  });

  it("renders the four question cards with their titles and bodies", async () => {
    const { document: page } = await renderHome(locale);
    const body = text(page.body);
    for (const key of QUESTION_KEYS) {
      expect(body, key).toContain(norm(home.questions[key].title));
      expect(body, key).toContain(norm(home.questions[key].body));
    }
  });

  it("makes no clock, freshness or profile claim in the static HTML", async () => {
    const { document: page, html } = await renderHome(locale);
    expect(html).not.toContain("data-freshness");
    const body = text(page.body);
    // The profile-dependent "matches" link is a client leaf: its label must not ship in the HTML.
    expect(body).not.toContain(norm(home.matchesCta));
    for (const key of ["aging", "stale", "fresh"] as const) {
      expect(body, key).not.toContain(norm(catalogs[locale].domain.freshness[key]));
    }
  });
});
