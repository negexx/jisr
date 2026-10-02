// @vitest-environment jsdom
import { createTranslator, NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { PROGRAM_CLIENT_NAMESPACES } from "@/components/program/client-namespaces";
import { ProgramPageView } from "@/components/program/program-page-view";
import type { AppLocale } from "@/i18n/routing";
import { formatMoney } from "@/lib/format";
import { pickMessages } from "@/lib/i18n/client-messages";
import { describeRule } from "@/lib/journey/requirements";
import { loadProgramPageData, type ProgramPageData } from "@/lib/snapshot/server";
import {
  buildFixtureSnapshot,
  catalogs,
  EMPTY_DATA_DIR,
  removeFixtureSnapshots,
} from "../components/program/program-fixture";
import { E2E_SCHOLARSHIP_SLUGS, E2E_SLUGS } from "../fixtures/e2e/profiles";

// The page reads public/snapshots; here it reads the fixture snapshot built into a temp dir.
const snapshot = vi.hoisted(() => ({ dir: "", locale: "fr", recurring: false }));

vi.mock("@/lib/snapshot/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/snapshot/server")>();
  return {
    ...actual,
    programStaticParams: () => actual.programStaticParams(snapshot.dir),
    loadProgramPageData: async (slug: string, locale: AppLocale) => {
      const data = await actual.loadProgramPageData(slug, locale, snapshot.dir);
      if (data === null || !snapshot.recurring) return data;
      // Stands in for a program whose source states its deadline without a year.
      const intakes = {
        ...data.program.intakes,
        value: [
          {
            startDate: null,
            applicationOpens: null,
            applicationDeadline: null,
            recurringDeadline: { month: 7, day: 15 },
          },
        ],
      };
      return { ...data, program: { ...data.program, intakes } };
    },
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

// Every client leaf of the page, wrapped to record its props: those are what the static page ships
// to the browser (children excepted: server-rendered children arrive as rendered output).
const clientProps = vi.hoisted(() => ({ sent: [] as Array<{ leaf: string; props: object }> }));

function recorded<P extends object>(leaf: string, render: (props: P) => unknown) {
  return (props: P) => {
    const { children: _children, ...rest } = props as P & { children?: unknown };
    clientProps.sent.push({ leaf, props: rest });
    return render(props);
  };
}

vi.mock("@/components/freshness-mark", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/freshness-mark")>();
  return { FreshnessMark: recorded("FreshnessMark", actual.FreshnessMark) };
});
vi.mock("@/components/program/personal-match", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/program/personal-match")>();
  return { ...actual, PersonalMatch: recorded("PersonalMatch", actual.PersonalMatch) };
});
vi.mock("@/components/program/program-deadline", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/program/program-deadline")>();
  return { ProgramDeadline: recorded("ProgramDeadline", actual.ProgramDeadline) };
});
vi.mock("@/components/program/page-freshness-banner", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/components/program/page-freshness-banner")>();
  return { PageFreshnessBanner: recorded("PageFreshnessBanner", actual.PageFreshnessBanner) };
});

const page = await import("@/app/[locale]/programs/[slug]/page");

const SLUGS = Object.values(E2E_SLUGS);
const LOCALES: readonly AppLocale[] = ["fr", "en", "ar"];
const OFFICIAL_WORD: Record<AppLocale, RegExp> = {
  en: /official/i,
  fr: /officiel/i,
  ar: /رسمي/u,
};

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
  return message(locale, key).split(/[{<]/)[0]?.trim() ?? "";
}

function translator(locale: AppLocale) {
  return createTranslator({ locale, messages: catalogs[locale] }) as unknown as (
    key: string,
    params?: Record<string, string | number>,
  ) => string;
}

function withProvider(locale: AppLocale, element: ReactElement) {
  return renderToString(
    <NextIntlClientProvider locale={locale} messages={catalogs[locale]} timeZone="UTC">
      {element}
    </NextIntlClientProvider>,
  );
}

async function renderPage(slug: string, locale: AppLocale) {
  const element = await page.default({ params: Promise.resolve({ locale, slug }) });
  const html = withProvider(locale, element);
  // A detached document: the static HTML is inspected as a browser without JS would get it.
  const parsed = document.implementation.createHTMLDocument("");
  parsed.body.innerHTML = html;
  return { html, document: parsed };
}

async function dataOf(slug: string, locale: AppLocale): Promise<ProgramPageData> {
  const data = await loadProgramPageData(slug, locale, snapshot.dir);
  if (data === null) throw new Error(`no data for ${slug}`);
  return data;
}

function textOf(element: Element | null): string {
  return (element?.textContent ?? "").replace(/[ \t\r\n]+/g, " ").trim();
}

let fixtureDir = "";
beforeAll(() => {
  fixtureDir = buildFixtureSnapshot();
  snapshot.dir = fixtureDir;
}, 180_000);
afterAll(removeFixtureSnapshots);

describe("program page: static params and routing", () => {
  it("never renders an unknown slug at request time", () => {
    expect(page.dynamicParams).toBe(false);
  });

  it("returns every fixture slug (the layout adds the locales)", async () => {
    const params = await page.generateStaticParams();
    expect(params.map((p) => p.slug).sort()).toEqual([...SLUGS].sort());
  });

  it("returns no params, without throwing, for an empty catalogue", async () => {
    snapshot.dir = buildFixtureSnapshot(EMPTY_DATA_DIR);
    try {
      await expect(page.generateStaticParams()).resolves.toEqual([]);
    } finally {
      snapshot.dir = fixtureDir;
    }
  }, 120_000);

  it("calls notFound for an unknown slug, in the page and in its metadata", async () => {
    const params = Promise.resolve({ locale: "fr", slug: "xx-test-unknown" });
    await expect(page.default({ params })).rejects.toMatchObject({
      digest: expect.stringContaining("404"),
    });
    await expect(page.generateMetadata({ params })).rejects.toMatchObject({
      digest: expect.stringContaining("404"),
    });
  });

  it.each(LOCALES)("builds a title and description from the program (%s)", async (locale) => {
    const data = await dataOf(E2E_SLUGS.ok, locale);
    const metadata = await page.generateMetadata({
      params: Promise.resolve({ locale, slug: E2E_SLUGS.ok }),
    });
    expect(metadata.title).toContain("XX Test Programme OK");
    expect(metadata.title).toContain("XX Test Public Institution B");
    expect(metadata.description).toBe(data.text(data.program.summary)?.text);
  });
});

describe.each(LOCALES)("program page server render (%s)", (locale) => {
  const t = translator(locale);

  it.each(SLUGS)("renders the facts of %s with one h1 and every section", async (slug) => {
    const { document } = await renderPage(slug, locale);
    const data = await dataOf(slug, locale);
    expect(document.querySelectorAll("h1")).toHaveLength(1);
    expect(textOf(document.querySelector("h1"))).toBe(data.program.name);
    for (const id of [
      "overview",
      "requirements",
      "tuition",
      "costs",
      "deadline",
      "procedure",
      "documents",
      "scholarships",
      "links",
      "verified",
    ]) {
      const section = document.getElementById(id);
      expect(section?.getAttribute("aria-labelledby"), id).toBe(`${id}-heading`);
      expect(document.getElementById(`${id}-heading`)?.tagName, id).toBe("H2");
    }
    expect(document.querySelector("aside")?.getAttribute("aria-label")).toBe(
      message(locale, "program.aside.label"),
    );
    expect(document.querySelectorAll('#costs [data-testid="cost-row"]')).toHaveLength(7);
  });

  it.each(SLUGS)("describes every rule with its details right after it (%s)", async (slug) => {
    const { document } = await renderPage(slug, locale);
    const data = await dataOf(slug, locale);
    const items = [...document.querySelectorAll('[data-testid="rule"]')];
    expect(items).toHaveLength(data.program.requirements.rules.length);
    data.program.requirements.rules.forEach((rule, index) => {
      const view = describeRule(rule, { locale, core: data.core, text: data.text });
      const lines = [...(items[index]?.querySelectorAll(":scope > p") ?? [])].map(textOf);
      expect(lines[1], rule.id).toBe(t(view.key, view.params));
      view.details.forEach((detail, offset) => {
        expect(lines[2 + offset], `${rule.id} detail`).toBe(t(detail.key, detail.params));
      });
      expect(items[index]?.querySelector('[data-slot="source-badge"]')).not.toBeNull();
    });
  });

  it("puts only an inert save placeholder in the header, nothing about saved state", async () => {
    for (const slug of SLUGS) {
      const { document } = await renderPage(slug, locale);
      const placeholders = document.querySelectorAll('header [data-slot="save-placeholder"]');
      expect(placeholders, slug).toHaveLength(1);
      expect(placeholders[0]?.getAttribute("aria-hidden")).toBe("true");
      expect(document.querySelector("header button")).toBeNull();
      // Scoped to the header: the same words may legitimately appear elsewhere on the page.
      const header = document.querySelector("header");
      if (header === null) throw new Error(`no header for ${slug}`);
      expect(header.innerHTML).not.toContain("aria-pressed");
      for (const key of ["save", "saved", "announceSaved", "announceRemoved", "full", "failed"]) {
        const literal = message(locale, `savedProgram.${key}`).split("{")[0] ?? "";
        expect(literal.length, key).toBeGreaterThan(0);
        expect(header.textContent, key).not.toContain(literal);
      }
    }
  });

  it("shows the coverage notice only for partial programs", async () => {
    for (const slug of [E2E_SLUGS.check, E2E_SLUGS.foundation]) {
      const { document } = await renderPage(slug, locale);
      expect(textOf(document.querySelector('[data-testid="coverage-partial"]')), slug).toBe(
        message(locale, "domain.coverage.partial"),
      );
    }
    const { document } = await renderPage(E2E_SLUGS.ok, locale);
    expect(document.querySelector('[data-testid="coverage-partial"]')).toBeNull();
  });

  it("shows the official fee, or says the tuition is to be checked", async () => {
    const ok = await renderPage(E2E_SLUGS.ok, locale);
    expect(textOf(ok.document.querySelector('[data-testid="tuition-amount"]'))).toContain(
      formatMoney(120000, "XTS", locale),
    );
    const stale = await renderPage(E2E_SLUGS.stale, locale);
    expect(textOf(stale.document.getElementById("tuition"))).toContain(
      message(locale, "domain.cost.missingLine"),
    );
  });

  it("badges a published fee in full, and an unpublished one not at all", async () => {
    const ok = await renderPage(E2E_SLUGS.ok, locale);
    const okBadges = ok.document.querySelectorAll('#tuition [data-slot="source-badge"]');
    expect(okBadges).toHaveLength(1);
    expect(okBadges[0]?.getAttribute("data-variant")).toBe("full");
    expect(textOf(ok.document.getElementById("tuition"))).toContain(
      message(locale, "domain.infoKind.official.meaning"),
    );

    const stale = await renderPage(E2E_SLUGS.stale, locale);
    const tuition = stale.document.getElementById("tuition");
    expect(tuition?.querySelector('[data-slot="source-badge"]')).toBeNull();
    expect(textOf(tuition)).not.toContain(message(locale, "domain.infoKind.official.meaning"));
    expect(textOf(tuition)).not.toContain(message(locale, "domain.infoKind.official.label"));
  });

  it("ships no precomputed freshness to any client leaf", async () => {
    for (const slug of SLUGS) {
      clientProps.sent = [];
      await renderPage(slug, locale);
      const leaves = new Set(clientProps.sent.map((entry) => entry.leaf));
      expect([...leaves].sort(), slug).toEqual([
        "FreshnessMark",
        "PageFreshnessBanner",
        "PersonalMatch",
        "ProgramDeadline",
      ]);
      expect(JSON.stringify(clientProps.sent), slug).not.toContain('"freshness"');
    }
  });

  it("sends the deadline leaf only the slug and the intakes, not the whole program", async () => {
    clientProps.sent = [];
    await renderPage(E2E_SLUGS.ok, locale);
    const sent = clientProps.sent.find((entry) => entry.leaf === "ProgramDeadline");
    const data = await dataOf(E2E_SLUGS.ok, locale);
    expect(sent?.props).toEqual({
      program: { slug: data.program.slug, intakes: data.program.intakes },
    });
  });

  it("shows one badge under How to apply when the link and the channel share a source", async () => {
    const { document } = await renderPage(E2E_SLUGS.ok, locale);
    expect(document.querySelectorAll('#procedure [data-slot="source-badge"]')).toHaveLength(1);
  });

  it("writes the institution and city with the locale's punctuation", async () => {
    const { document } = await renderPage(E2E_SLUGS.ok, locale);
    const expected = message(locale, "program.header.institutionCity")
      .replace("{institution}", "XX Test Public Institution B")
      .replace("{city}", "XX Test City B")
      .replace(/<\/?place>/g, "");
    expect(textOf(document.querySelector('[data-testid="overview-institution"]'))).toBe(expected);
  });

  it("says the institution is not listed instead of printing its slug", async () => {
    const data = await dataOf(E2E_SLUGS.ok, locale);
    const element = (
      <ProgramPageView
        data={{ ...data, institution: null }}
        locale={locale}
        clientMessages={pickMessages(catalogs[locale], PROGRAM_CLIENT_NAMESPACES)}
      />
    );
    const parsed = document.implementation.createHTMLDocument("");
    parsed.body.innerHTML = withProvider(locale, element);
    const text = textOf(parsed.body);
    expect(text).toContain(message(locale, "program.overview.institutionUnknown"));
    expect(text).not.toContain(data.program.institution);
  });

  it("lists the intake dates as published, documents with translation, and scholarships", async () => {
    const { document } = await renderPage(E2E_SLUGS.ok, locale);
    const deadline = textOf(document.getElementById("deadline"));
    for (const date of ["01/06/2026", "15/01/2027", "15/01/2026", "01/10/2026", "01/09/2027"]) {
      expect(deadline).toContain(date);
    }
    const documents = [...document.querySelectorAll('[data-testid="document"]')].map(textOf);
    expect(documents).toHaveLength(3);
    expect(documents[0]).toContain(message(locale, "program.documents.translation.yes"));
    expect(documents[1]).toContain(message(locale, "program.documents.translation.no"));
    expect(documents[2]).toContain(message(locale, "program.documents.translation.unknown"));

    const eligibility = (slug: string) =>
      textOf(
        document.querySelector(`#scholarship-${slug} [data-testid="scholarship-eligibility"]`),
      );
    expect(eligibility(E2E_SCHOLARSHIP_SLUGS.open)).toBe(
      message(locale, "program.scholarships.noNationalityRestriction"),
    );
    const data = await dataOf(E2E_SLUGS.ok, locale);
    const countryName = (code: string) => {
      const country = data.core.countries.find((c) => c.code === code);
      return (country === undefined ? undefined : data.text(country.name)?.text) ?? code;
    };
    expect(eligibility(E2E_SCHOLARSHIP_SLUGS.xaOnly)).toBe(
      t("program.scholarships.nationals", { countries: countryName("XA") }),
    );
    expect(eligibility(E2E_SCHOLARSHIP_SLUGS.xzOnly)).toBe(
      t("program.scholarships.nationals", { countries: countryName("XZ") }),
    );
  });

  it("states a recurring deadline as date-independent text, with no deadline status", async () => {
    snapshot.recurring = true;
    try {
      const { document } = await renderPage(E2E_SLUGS.ok, locale);
      const deadline = textOf(document.getElementById("deadline"));
      expect(deadline).toContain(
        message(locale, "program.deadline.recurring").replace("{date}", "15/07"),
      );
      expect(deadline).not.toContain(message(locale, "program.deadline.deadlineUnknown"));
      expect(document.querySelector("[data-intake]")).toBeNull();
      expect(textOf(document.body)).not.toContain(stem(locale, "domain.intake.recurring"));
    } finally {
      snapshot.recurring = false;
    }
  });

  it("links only to https pages or anchors on the page", async () => {
    for (const slug of SLUGS) {
      const { document } = await renderPage(slug, locale);
      for (const anchor of document.querySelectorAll("a[href]")) {
        const href = anchor.getAttribute("href") ?? "";
        expect(href, slug).toMatch(/^(https:\/\/|#)/);
        if (href.startsWith("https://")) {
          expect(anchor.getAttribute("rel")).toBe("noopener noreferrer");
        }
      }
      const links = [...document.querySelectorAll('#links a[target="_blank"]')];
      expect(links.length, slug).toBeGreaterThanOrEqual(2);
    }
  });

  it("prints the static part of every SourceBadge (kind, https link, DD/MM/YYYY)", async () => {
    const { document } = await renderPage(E2E_SLUGS.ok, locale);
    const badges = [...document.querySelectorAll('[data-slot="source-badge"]')];
    expect(badges.length).toBeGreaterThan(10);
    for (const badge of badges) {
      expect(badge.querySelector("[data-kind]")).not.toBeNull();
      expect(badge.querySelector('a[href^="https://"]')).not.toBeNull();
      expect(textOf(badge.querySelector("time"))).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    }
  });

  it("makes no clock, freshness, deadline-status or personal claim on the server", async () => {
    const forbidden = [
      stem(locale, "domain.intake.upcoming"),
      stem(locale, "domain.intake.recurring"),
      message(locale, "domain.intake.closed"),
      message(locale, "domain.intake.unknown"),
      message(locale, "domain.freshness.aging"),
      message(locale, "domain.freshness.stale"),
      message(locale, "domain.freshness.fresh"),
      message(locale, "sourceBadge.staleCheckSource"),
      message(locale, "program.banner.aging"),
      message(locale, "program.banner.stale"),
      message(locale, "program.banner.check"),
      message(locale, "domain.status.satisfied"),
      message(locale, "domain.status.check"),
      message(locale, "domain.status.not_satisfied"),
      message(locale, "matchStatusBadge.foundation"),
      message(locale, "program.personal.cta.title"),
      message(locale, "program.personal.route"),
      message(locale, "program.personal.budgetNote"),
      ...["within", "straddles", "above", "unknown"].map((fit) =>
        message(locale, `domain.budgetFit.${fit}`),
      ),
      ...["direct", "foundation", "not_eligible", "check", "missing"].map((route) =>
        message(locale, `domain.route.${route}`),
      ),
    ];
    for (const slug of SLUGS) {
      const { html, document } = await renderPage(slug, locale);
      const text = textOf(document.body);
      for (const phrase of forbidden) expect(text, `${slug}: ${phrase}`).not.toContain(phrase);
      expect(html).not.toContain("data-freshness");
      expect(document.querySelector('[data-slot="program-deadline"]')?.textContent).toBe("");
      expect(document.querySelector('[data-slot="personal-skeleton"]')).not.toBeNull();
    }
  });

  it("explains how each estimate was made, inside its source badge, without calling it official", async () => {
    const { document } = await renderPage(E2E_SLUGS.ok, locale);
    const data = await dataOf(E2E_SLUGS.ok, locale);
    const housing = document.querySelector('#costs [data-category="housing"]');
    const expected = data.text("cost-profiles/xx-test-costs-xb#lines.housing.basis")?.text;
    expect(expected).toBeTruthy();
    const disclosure = housing?.querySelector('[data-slot="source-badge"] details');
    expect(textOf(disclosure?.querySelector("summary") ?? null)).toBe(
      message(locale, "sourceBadge.howWeEstimated"),
    );
    expect(textOf(disclosure?.querySelector("p") ?? null)).toBe(expected);
    expect(textOf(disclosure ?? null)).not.toMatch(OFFICIAL_WORD[locale]);
    const official = document.querySelector('#costs [data-category="transport"]');
    expect(official?.querySelector("details")).toBeNull();
  });

  it("never words an estimate or guidance part as official", async () => {
    for (const slug of SLUGS) {
      const { document } = await renderPage(slug, locale);
      for (const kind of document.querySelectorAll(
        '[data-kind="estimate"], [data-kind="guidance"]',
      )) {
        const row = kind.closest('[data-testid="cost-row"], li, [data-slot="source-badge"]');
        expect(textOf(row), slug).not.toMatch(OFFICIAL_WORD[locale]);
      }
      expect(
        textOf(document.getElementById("aside-cost-heading")?.parentElement ?? null),
      ).not.toMatch(OFFICIAL_WORD[locale]);
    }
  });
});
