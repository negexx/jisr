// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";

import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { AppLocale } from "@/i18n/routing";

import ar from "../../messages/ar.json";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

const catalogs = { fr, en, ar } as const;

vi.mock("@/lib/guides/catalog", () => {
  const Doc = (id: string) => () => <h1 data-guide={id}>{id} guide</h1>;
  const guide = {
    slug: "studying-in-europe",
    frontmatter: {
      source_url: "https://www.maroc.campusfrance.org/example",
      info_kind: "guidance",
      last_verified_at: "2026-10-11",
    },
    Documents: { fr: Doc("fr"), en: Doc("en"), ar: Doc("ar") },
  };
  return {
    GUIDES: [guide],
    GUIDE_SLUGS: ["studying-in-europe"],
    guideBySlug: (slug: string) => (slug === "studying-in-europe" ? guide : undefined),
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
    setRequestLocale: () => {},
    getMessages: async () => messages.fr,
    getTranslations: async ({ locale, namespace }: { locale: AppLocale; namespace: string }) =>
      translator({ locale, messages: messages[locale], namespace: namespace as never }),
  };
});

const indexPage = await import("@/app/[locale]/guides/page");
const detailPage = await import("@/app/[locale]/guides/[slug]/page");

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

function textOf(element: Element | Document): string {
  return (element.textContent ?? "").replace(/[ \t\r\n]+/g, " ").trim();
}

function withProvider(locale: AppLocale, element: ReactElement) {
  return renderToString(
    <NextIntlClientProvider locale={locale} messages={catalogs[locale]} timeZone="UTC">
      {element}
    </NextIntlClientProvider>,
  );
}

function parse(html: string): Document {
  const parsed = document.implementation.createHTMLDocument("");
  parsed.body.innerHTML = html;
  return parsed;
}

const LOCALES: readonly AppLocale[] = ["fr", "ar"];

describe("guides pages: routing", () => {
  it("calls notFound for an unknown locale, in each page and its metadata", async () => {
    const params = Promise.resolve({ locale: "xx" });
    await expect(indexPage.default({ params })).rejects.toMatchObject({
      digest: expect.stringContaining("404"),
    });
    await expect(indexPage.generateMetadata({ params })).rejects.toMatchObject({
      digest: expect.stringContaining("404"),
    });
    const slugParams = Promise.resolve({ locale: "xx", slug: "studying-in-europe" });
    await expect(detailPage.default({ params: slugParams })).rejects.toMatchObject({
      digest: expect.stringContaining("404"),
    });
    await expect(detailPage.generateMetadata({ params: slugParams })).rejects.toMatchObject({
      digest: expect.stringContaining("404"),
    });
  });

  it("calls notFound for an unknown guide slug", async () => {
    const params = Promise.resolve({ locale: "fr", slug: "nope" });
    await expect(detailPage.default({ params })).rejects.toMatchObject({
      digest: expect.stringContaining("404"),
    });
    await expect(detailPage.generateMetadata({ params })).rejects.toMatchObject({
      digest: expect.stringContaining("404"),
    });
  });
});

describe.each(LOCALES)("guides index (%s)", (locale) => {
  it("builds a translated title and description", async () => {
    const metadata: Metadata = await indexPage.generateMetadata({
      params: Promise.resolve({ locale }),
    });
    expect(metadata.title).toBe(message(locale, "guides.meta.title"));
    expect(metadata.description).toBe(message(locale, "guides.meta.description"));
  });

  it("renders exactly one h1 and the guide card", async () => {
    const element = await indexPage.default({ params: Promise.resolve({ locale }) });
    const parsed = parse(withProvider(locale, element));
    const headings = parsed.querySelectorAll("h1");
    expect(headings).toHaveLength(1);
    expect(textOf(parsed.body)).toContain(message(locale, "guides.index.title"));
    expect(textOf(parsed.body)).toContain(message(locale, "guides.studying-in-europe.title"));
    expect(textOf(parsed.body)).toContain(message(locale, "guides.read"));
  });
});

describe.each(LOCALES)("guides detail (%s)", (locale) => {
  const params = () => Promise.resolve({ locale, slug: "studying-in-europe" });

  it("builds a translated title and description", async () => {
    const metadata: Metadata = await detailPage.generateMetadata({ params: params() });
    expect(metadata.title).toBe(message(locale, "guides.studying-in-europe.meta.title"));
    expect(metadata.description).toBe(
      message(locale, "guides.studying-in-europe.meta.description"),
    );
  });

  it("renders exactly one guide h1, the source badge and the related links", async () => {
    const element = await detailPage.default({ params: params() });
    const parsed = parse(withProvider(locale, element));
    const headings = parsed.querySelectorAll("h1");
    expect(headings).toHaveLength(1);
    expect(headings[0]?.getAttribute("data-guide")).toBe(locale);
    expect(parsed.querySelector('[data-slot="source-badge"]')).not.toBeNull();
    expect(parsed.querySelector(`a[href="/${locale}/profile"]`)).not.toBeNull();
    expect(parsed.querySelector(`a[href="/${locale}/plan"]`)).not.toBeNull();
    expect(textOf(parsed.body)).toContain(message(locale, "guides.related"));
  });
});

describe("guides pages: no client component", () => {
  const files = [
    "src/app/[locale]/guides/page.tsx",
    "src/app/[locale]/guides/[slug]/page.tsx",
    "src/lib/guides/catalog.ts",
    "src/lib/guides/frontmatter.ts",
  ];

  it.each(files)("%s has no use client directive", (file) => {
    const source = readFileSync(path.resolve(process.cwd(), file), "utf8");
    expect(source).not.toContain('"use client"');
  });
});
