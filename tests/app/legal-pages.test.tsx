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

vi.mock("@/lib/legal/documents", () => {
  const Doc = (id: string) => () => <h1 data-doc={id}>{id} document</h1>;
  return {
    PRIVACY: { en: Doc("privacy"), fr: Doc("privacy"), ar: Doc("privacy") },
    TERMS: { en: Doc("terms"), fr: Doc("terms"), ar: Doc("terms") },
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

const privacyPage = await import("@/app/[locale]/privacy/page");
const termsPage = await import("@/app/[locale]/terms/page");

type PageModule = {
  generateMetadata: (args: { params: Promise<{ locale: string }> }) => Promise<Metadata>;
  default: (args: { params: Promise<{ locale: string }> }) => Promise<ReactElement>;
};

const CASES: readonly { name: string; ns: string; doc: string; page: PageModule }[] = [
  { name: "privacy", ns: "legal.privacy.meta", doc: "privacy", page: privacyPage },
  { name: "terms", ns: "legal.terms.meta", doc: "terms", page: termsPage },
];

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

describe("legal pages: routing", () => {
  it("calls notFound for an unknown locale, in each page and its metadata", async () => {
    const params = Promise.resolve({ locale: "xx" });
    await expect(privacyPage.default({ params })).rejects.toMatchObject({
      digest: expect.stringContaining("404"),
    });
    await expect(privacyPage.generateMetadata({ params })).rejects.toMatchObject({
      digest: expect.stringContaining("404"),
    });
    await expect(termsPage.default({ params })).rejects.toMatchObject({
      digest: expect.stringContaining("404"),
    });
    await expect(termsPage.generateMetadata({ params })).rejects.toMatchObject({
      digest: expect.stringContaining("404"),
    });
  });
});

describe.each(CASES)("legal page: $name", (pageCase) => {
  describe.each(LOCALES)("locale %s", (locale) => {
    it("builds a translated title and description", async () => {
      const metadata = await pageCase.page.generateMetadata({
        params: Promise.resolve({ locale }),
      });
      expect(metadata.title).toBe(message(locale, `${pageCase.ns}.title`));
      expect(metadata.description).toBe(message(locale, `${pageCase.ns}.description`));
    });

    it("renders exactly one document h1 and the updated line", async () => {
      const element = await pageCase.page.default({ params: Promise.resolve({ locale }) });
      const parsed = parse(withProvider(locale, element));
      const headings = parsed.querySelectorAll("h1");
      expect(headings).toHaveLength(1);
      expect(headings[0]?.getAttribute("data-doc")).toBe(pageCase.doc);
      expect(textOf(parsed.body)).toContain(message(locale, "legal.updated"));
    });

    it("links only to locale-prefixed, https or anchor targets", async () => {
      const element = await pageCase.page.default({ params: Promise.resolve({ locale }) });
      const parsed = parse(withProvider(locale, element));
      for (const anchor of parsed.querySelectorAll("a[href]")) {
        const href = anchor.getAttribute("href") ?? "";
        expect(href).toMatch(new RegExp(`^(https://|#|/${locale}/)`));
      }
    });
  });
});

describe("legal pages: no client component", () => {
  const files = [
    "src/app/[locale]/privacy/page.tsx",
    "src/app/[locale]/terms/page.tsx",
    "src/lib/legal/documents.ts",
    "src/mdx-components.tsx",
  ];

  it.each(files)("%s has no use client directive", (file) => {
    const source = readFileSync(path.resolve(process.cwd(), file), "utf8");
    expect(source).not.toContain('"use client"');
  });
});
