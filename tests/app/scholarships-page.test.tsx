// @vitest-environment jsdom
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { AppLocale } from "@/i18n/routing";
import { loadScholarshipsPageData } from "@/lib/snapshot/server";

import {
  buildFixtureSnapshot,
  catalogs,
  removeFixtureSnapshots,
} from "../components/program/program-fixture";
import { E2E_SCHOLARSHIP_SLUGS } from "../fixtures/e2e/profiles";

// The page reads public/snapshots; here it reads the fixture snapshot built into a temp dir.
const snapshot = vi.hoisted(() => ({ dir: "", locale: "fr" }));

vi.mock("@/lib/snapshot/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/snapshot/server")>();
  return {
    ...actual,
    loadScholarshipsPageData: (locale: AppLocale) =>
      actual.loadScholarshipsPageData(locale, snapshot.dir),
  };
});

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
      snapshot.locale = locale;
    },
    getMessages: async () => messages[snapshot.locale as AppLocale],
    getTranslations: async ({ locale, namespace }: { locale: AppLocale; namespace: string }) =>
      translator({ locale, messages: messages[locale], namespace: namespace as never }),
  };
});

const page = await import("@/app/[locale]/scholarships/page");

const LOCALES: readonly AppLocale[] = ["fr", "ar"];

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

// The literal part of a message before its first argument or tag: enough to find it in the HTML.
function stem(locale: AppLocale, key: string): string {
  return message(locale, key).split(/[{<(]/)[0]?.trim() ?? "";
}

function withProvider(locale: AppLocale, element: ReactElement) {
  return renderToString(
    <NextIntlClientProvider locale={locale} messages={catalogs[locale]} timeZone="UTC">
      {element}
    </NextIntlClientProvider>,
  );
}

async function renderPage(locale: AppLocale) {
  const element = await page.default({ params: Promise.resolve({ locale }) });
  const html = withProvider(locale, element);
  // A detached document: the static HTML is inspected as a browser without JS would get it.
  const parsed = document.implementation.createHTMLDocument("");
  parsed.body.innerHTML = html;
  return { html, document: parsed };
}

function textOf(element: Element | null): string {
  return (element?.textContent ?? "").replace(/[ \t\r\n]+/g, " ").trim();
}

beforeAll(() => {
  snapshot.dir = buildFixtureSnapshot();
}, 180_000);
afterAll(removeFixtureSnapshots);

describe("scholarships page: routing", () => {
  it("calls notFound for an unknown locale, in the page and in its metadata", async () => {
    const params = Promise.resolve({ locale: "xx" });
    await expect(page.default({ params })).rejects.toMatchObject({
      digest: expect.stringContaining("404"),
    });
    await expect(page.generateMetadata({ params })).rejects.toMatchObject({
      digest: expect.stringContaining("404"),
    });
  });

  it("does not declare its own static params", () => {
    expect("generateStaticParams" in page).toBe(false);
  });
});

describe.each(LOCALES)("scholarships page server render (%s)", (locale) => {
  it("builds a translated title and description", async () => {
    const metadata = await page.generateMetadata({ params: Promise.resolve({ locale }) });
    expect(metadata.title).toBe(message(locale, "scholarshipsPage.meta.title"));
    expect(metadata.description).toBe(message(locale, "scholarshipsPage.meta.description"));
  });

  it("renders the three fixture scholarships under one h1", async () => {
    const { document } = await renderPage(locale);
    const data = await loadScholarshipsPageData(locale);
    const names = data.sections.flatMap((s) => s.entries.map((e) => e.scholarship.name));
    expect(names.sort()).toEqual([
      "XX Test Open Scholarship",
      "XX Test XA Scholarship",
      "XX Test XZ Scholarship",
    ]);
    const text = textOf(document.body);
    for (const name of names) expect(text).toContain(name);
    expect(document.querySelectorAll("h1")).toHaveLength(1);
    expect(textOf(document.querySelector("h1"))).toBe(message(locale, "scholarshipsPage.title"));
    expect(document.querySelectorAll('[data-testid="scholarship-card"]')).toHaveLength(3);
  });

  it("shows a neutral placeholder for each nationality-restricted scholarship only", async () => {
    const { document } = await renderPage(locale);
    const stateOf = (slug: string) =>
      document
        .getElementById(`scholarship-${slug}`)
        ?.querySelector('[data-testid="nationality-check"]')
        ?.getAttribute("data-state");
    expect(stateOf(E2E_SCHOLARSHIP_SLUGS.xaOnly)).toBe("placeholder");
    expect(stateOf(E2E_SCHOLARSHIP_SLUGS.xzOnly)).toBe("placeholder");
    expect(stateOf(E2E_SCHOLARSHIP_SLUGS.open)).toBeUndefined();
    expect(document.querySelectorAll('[data-state="placeholder"]')).toHaveLength(2);
  });

  it("makes no nationality, freshness or clock claim on the server", async () => {
    const { html, document } = await renderPage(locale);
    const text = textOf(document.body);
    const forbidden = [
      ...["open", "closed", "noProfile", "caveat"].map((key) =>
        stem(locale, `scholarshipsPage.nationality.${key}`),
      ),
      message(locale, "domain.freshness.aging"),
      message(locale, "domain.freshness.stale"),
      message(locale, "domain.freshness.fresh"),
      message(locale, "sourceBadge.staleCheckSource"),
    ];
    for (const phrase of forbidden) {
      expect(phrase.length, phrase).toBeGreaterThan(0);
      expect(text, phrase).not.toContain(phrase);
    }
    expect(html).not.toContain("data-freshness");
  });

  it("prints the static part of every SourceBadge and links only to https pages or anchors", async () => {
    const { document } = await renderPage(locale);
    const badges = [...document.querySelectorAll('[data-slot="source-badge"]')];
    expect(badges.length).toBeGreaterThan(0);
    for (const badge of badges) {
      expect(badge.querySelector("[data-kind]")).not.toBeNull();
      expect(badge.querySelector('a[href^="https://"]')).not.toBeNull();
      expect(textOf(badge.querySelector("time"))).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    }
    for (const anchor of document.querySelectorAll("a[href]")) {
      const href = anchor.getAttribute("href") ?? "";
      expect(href).toMatch(new RegExp(`^(https://|#|/${locale}/)`));
    }
  });
});
