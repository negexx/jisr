// @vitest-environment jsdom
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ScholarshipsPageView } from "@/components/scholarships/scholarships-page-view";
import type { CoreShard } from "@/data-schema/snapshot";
import { formatMoneyRange } from "@/lib/format";
import { formatList } from "@/lib/journey/reasons";
import type { CountrySection, ProgramScope, ScholarshipEntry } from "@/lib/scholarships/sections";
import type { ScholarshipsPageData } from "@/lib/snapshot/server";
import type { DataText } from "@/lib/snapshot/text";
import ar from "../../../messages/ar.json";
import messages from "../../../messages/fr.json";
import { fact, requirements, rule, scholarship } from "../../fixtures/domain/builders";

const core: CoreShard = {
  kind: "core",
  countries: [
    { code: "XB", name: "countries/xb#name", currency: "XTS" },
    { code: "XA", name: "countries/xa#name", currency: "XTS" },
  ],
  fields: [],
  subjects: [],
  languageCertificates: [],
  gradingScales: [],
  gradeConversions: [],
  credentialTypes: [],
  applicationChannels: [],
};

const translate = createTranslator({ locale: "fr", messages }) as unknown as (
  key: string,
  params?: Record<string, string | number>,
) => string;

// The catalogue's own "Name, City" template (rich tags stripped): the expected text comes from the
// message, not from a literal comma, so ar keeps its Arabic comma.
function institutionCity(locale: "fr" | "ar", institution: string, city: string): string {
  const catalogue = locale === "fr" ? messages : ar;
  return catalogue.program.header.institutionCity
    .replace(/<\/?place>/g, "")
    .replace("{institution}", institution)
    .replace("{city}", city);
}

const NO_PROGRAMMES: ProgramScope = { kind: "institutions", groups: [], without: [] };

function entry(
  overrides: Parameters<typeof scholarship>[0] = {},
  scope: ProgramScope = NO_PROGRAMMES,
): ScholarshipEntry {
  return { scholarship: scholarship(overrides), scope };
}

function dataOf(
  sections: CountrySection[],
  missingText: readonly string[] = [],
): ScholarshipsPageData {
  return {
    snapshotVersion: "xx-test",
    sections,
    core,
    text: (key): DataText | undefined =>
      missingText.some((suffix) => key.endsWith(suffix)) ? undefined : { text: key, note: "none" },
  };
}

function render(entries: ScholarshipEntry[], missingText: readonly string[] = []) {
  return renderData(dataOf([{ country: "XB", entries }], missingText));
}

function renderData(data: ScholarshipsPageData, locale: "fr" | "ar" = "fr") {
  const html = renderToString(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "fr" ? messages : ar}
      timeZone="UTC"
    >
      <ScholarshipsPageView data={data} />
    </NextIntlClientProvider>,
  );
  const parsed = document.implementation.createHTMLDocument("");
  parsed.body.innerHTML = html;
  return parsed;
}

function textOf(element: Element | null): string {
  return (element?.textContent ?? "").replace(/[ \t\r\n]+/g, " ").trim();
}

function only<T extends Element>(elements: ArrayLike<T>): T {
  const [first] = Array.from(elements);
  if (elements.length !== 1 || first === undefined) {
    throw new Error(`expected one element, got ${elements.length}`);
  }
  return first;
}

function card(doc: Document, index = 0): Element {
  const found = doc.querySelectorAll('[data-testid="scholarship-card"]')[index];
  if (found === undefined) throw new Error(`no card ${index}`);
  return found;
}

function inCard(doc: Document, testId: string, index = 0): Element {
  const found = card(doc, index).querySelector(`[data-testid="${testId}"]`);
  if (found === null) throw new Error(`no ${testId}`);
  return found;
}

const BADGE = '[data-slot="source-badge"]';

function detailsSection(doc: Document, headingKey: string): Element {
  const heading = [...card(doc).querySelectorAll("details h4")].find(
    (h) => textOf(h) === translate(headingKey),
  );
  const section = heading?.closest("section");
  if (section === null || section === undefined) throw new Error(`no section ${headingKey}`);
  return section;
}

describe("ScholarshipsPageView: amount, covers and deadline", () => {
  it("shows the amount through formatMoneyRange with the period, and a badge per distinct source", () => {
    const support = fact(
      { amount: { min: 30000, max: 30000, currency: "EUR", per: "month" as const }, covers: [] },
      { class: "volatile" },
    );
    const doc = render([
      entry({
        support,
        deadline: fact("2027-03-01", {
          source_url: "https://example.org/other",
          class: "volatile",
        }),
      }),
    ]);
    const amount = inCard(doc, "scholarship-amount");
    expect(textOf(amount)).toContain("300");
    expect(textOf(amount)).toContain(formatMoneyRange(30000, 30000, "EUR", "fr"));
    expect(amount.querySelector("bdi[dir='ltr']")).not.toBeNull();
    expect(amount.querySelectorAll(BADGE)).toHaveLength(1);
    expect(card(doc).querySelectorAll(BADGE)).toHaveLength(2);
  });

  it("says the amount is not published when amount is null, with no badge for it", () => {
    const doc = render([
      entry({ support: fact({ amount: null, covers: [] }, { class: "volatile" }) }),
    ]);
    const amount = inCard(doc, "scholarship-amount");
    expect(textOf(amount)).toBe(messages.scholarshipsPage.amount.unknown);
    expect(amount.querySelector(BADGE)).toBeNull();
    // the deadline is published, so its own badge remains on the card
    expect(inCard(doc, "scholarship-deadline").querySelectorAll(BADGE)).toHaveLength(1);
  });

  it("badges what the support fact publishes even when the amount is not", () => {
    const doc = render([
      entry({ support: fact({ amount: null, covers: ["tuition"] }, { class: "volatile" }) }),
    ]);
    const amount = inCard(doc, "scholarship-amount");
    expect(textOf(amount)).toContain(messages.scholarshipsPage.amount.unknown);
    expect(textOf(amount)).toContain("frais de scolarité");
    expect(amount.querySelectorAll(BADGE)).toHaveLength(1);
    expect(card(doc).querySelectorAll(BADGE)).toHaveLength(1);
  });

  it("says the deadline is not published when the deadline is null", () => {
    const doc = render([entry({ deadline: fact(null, { class: "volatile" }) })]);
    const deadline = inCard(doc, "scholarship-deadline");
    expect(textOf(deadline)).toBe(messages.scholarshipsPage.deadline.unknown);
    expect(deadline.querySelector(BADGE)).toBeNull();
    expect(deadline.querySelector("time")).toBeNull();
  });

  it("shows a published deadline as DD/MM/YYYY in a <time>", () => {
    const doc = render([entry({ deadline: fact("2027-03-01", { class: "volatile" }) })]);
    const deadline = inCard(doc, "scholarship-deadline");
    const time = only(deadline.querySelectorAll("time"));
    expect(time.getAttribute("datetime")).toBe("2027-03-01");
    expect(textOf(time)).toBe(translate("scholarshipsPage.deadline.known", { date: "01/03/2027" }));
  });

  it.each([
    ["fr", messages],
    ["ar", ar],
  ] as const)("shows a recurring-only deadline as usual guidance, never as not published (%s)", (locale, catalog) => {
    const doc = renderData(
      dataOf([
        {
          country: "XB",
          entries: [
            entry({
              deadline: fact(null, { class: "volatile" }),
              recurringDeadline: fact({ month: 6, day: 30 }, { class: "volatile" }),
            }),
          ],
        },
      ]),
      locale,
    );
    const deadline = inCard(doc, "scholarship-deadline");
    expect(textOf(deadline)).toContain(
      catalog.scholarshipsPage.deadline.recurring.replace("{date}", "30/06"),
    );
    expect(textOf(deadline)).not.toContain(catalog.scholarshipsPage.deadline.unknown);
    // no year is published, so no ISO date and no <time> for the deadline
    expect(deadline.querySelector("time")).toBeNull();
  });

  it("prints nothing for an empty covers list", () => {
    const doc = render([
      entry({
        support: fact(
          { amount: { min: 500, max: 900, currency: "EUR", per: "year" as const }, covers: [] },
          { class: "volatile" },
        ),
      }),
    ]);
    const covers = translate("program.scholarships.covers", { items: "" }).split(":")[0] ?? "";
    expect(covers.length).toBeGreaterThan(0);
    expect(textOf(inCard(doc, "scholarship-amount"))).not.toContain(covers.trim());
  });

  it("lists what a scholarship covers with the locale's conjunction", () => {
    const doc = render([
      entry({
        support: fact({ amount: null, covers: ["tuition", "housing"] }, { class: "volatile" }),
      }),
    ]);
    const items = formatList(
      [
        translate("program.scholarships.cover.tuition"),
        translate("program.scholarships.cover.housing"),
      ],
      "conjunction",
      "fr",
    );
    expect(textOf(inCard(doc, "scholarship-amount"))).toContain(
      translate("program.scholarships.covers", { items: items ?? "" }),
    );
  });
});

describe("ScholarshipsPageView: nationality", () => {
  it("renders the neutral placeholder, no claim, for a restricted scholarship", () => {
    const doc = render([entry({ eligibleNationalities: ["XA"] })]);
    const eligibility = inCard(doc, "scholarship-eligibility");
    expect(textOf(eligibility.querySelector("p"))).toBe(
      translate("program.scholarships.nationals", { countries: "countries/xa#name" }),
    );
    const check = only(eligibility.querySelectorAll('[data-testid="nationality-check"]'));
    expect(check.getAttribute("data-state")).toBe("placeholder");
    expect(textOf(check)).toBe("");
    for (const key of ["open", "closed", "noProfile", "caveat"]) {
      const literal = translate(`scholarshipsPage.nationality.${key}`, { countries: "" });
      expect(doc.body.textContent).not.toContain(literal.split("(")[0]?.trim() ?? literal);
    }
  });

  it("shows the no-restriction line and no check for an unrestricted scholarship", () => {
    const doc = render([entry({ eligibleNationalities: [] })]);
    const eligibility = inCard(doc, "scholarship-eligibility");
    expect(textOf(eligibility)).toBe(messages.program.scholarships.noNationalityRestriction);
    expect(eligibility.querySelector('[data-testid="nationality-check"]')).toBeNull();
  });
});

describe("ScholarshipsPageView: programmes", () => {
  it("lists programmes grouped by institution with links to /fr/programs/<slug>", () => {
    const doc = render([
      entry(
        { institutions: ["xx-test-inst-a", "xx-test-inst-b"] },
        {
          kind: "institutions",
          groups: [
            {
              slug: "xx-test-inst-a",
              name: "Institut A",
              city: "Ville A",
              programs: [
                { slug: "xx-test-prog-1", name: "Programme 1" },
                { slug: "xx-test-prog-2", name: "Programme 2" },
              ],
            },
            {
              slug: "xx-test-inst-b",
              name: null,
              city: null,
              programs: [{ slug: "xx-test-prog-3", name: "Programme 3" }],
            },
          ],
          without: [],
        },
      ),
    ]);
    const block = inCard(doc, "scholarship-programmes");
    const links = [...block.querySelectorAll("a")];
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/fr/programs/xx-test-prog-1",
      "/fr/programs/xx-test-prog-2",
      "/fr/programs/xx-test-prog-3",
    ]);
    expect(links.map(textOf)).toEqual(["Programme 1", "Programme 2", "Programme 3"]);
    const text = textOf(block);
    expect(text).toContain(institutionCity("fr", "Institut A", "Ville A"));
    expect(text).toContain(messages.program.overview.institutionUnknown);
    expect(text).not.toContain("xx-test-inst-b");
  });

  it.each([
    "fr",
    "ar",
  ] as const)("heads campuses of one university with 'Name, City' so the groups differ (%s)", (locale) => {
    const group = (slug: string, city: string | null) => ({
      slug,
      name: "Université Commune",
      city,
      programs: [{ slug: `${slug}-prog`, name: `Programme ${slug}` }],
    });
    const doc = renderData(
      dataOf([
        {
          country: "XB",
          entries: [
            entry(
              { institutions: ["xx-test-inst-a", "xx-test-inst-b", "xx-test-inst-c"] },
              {
                kind: "institutions",
                groups: [
                  group("xx-test-inst-a", "Bologne"),
                  group("xx-test-inst-b", "Rimini"),
                  group("xx-test-inst-c", null),
                ],
                without: [],
              },
            ),
          ],
        },
      ]),
      locale,
    );
    const headings = [
      ...inCard(doc, "scholarship-programmes").querySelectorAll("div > p.font-medium"),
    ].map(textOf);
    expect(headings).toEqual([
      institutionCity(locale, "Université Commune", "Bologne"),
      institutionCity(locale, "Université Commune", "Rimini"),
      "Université Commune",
    ]);
    expect(new Set(headings.slice(0, 2)).size).toBe(2);
  });

  it("shows the count and one link to My matches for a whole-country scholarship, no programme list", () => {
    const doc = render([entry({}, { kind: "country", count: 3 })]);
    const block = inCard(doc, "scholarship-programmes");
    expect(textOf(block)).toContain(
      translate("scholarshipsPage.programmes.country", {
        n: 3,
        count: "3",
        country: "countries/xb#name",
      }),
    );
    const links = [...block.querySelectorAll("a")];
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute("href")).toBe("/fr/matches");
    expect(textOf(links[0] ?? null)).toBe(messages.scholarshipsPage.programmes.matchesLink);
    expect(block.querySelector('a[href*="/programs/"]')).toBeNull();
  });

  it("shows the 'no programme listed yet' line for an institution without programmes", () => {
    const doc = render([entry({ institutions: ["xx-test-inst-a"] }, NO_PROGRAMMES)]);
    const block = inCard(doc, "scholarship-programmes");
    expect(textOf(block)).toContain(messages.scholarshipsPage.programmes.none);
    expect(block.querySelector("a")).toBeNull();
  });

  it("names the institutions that have no programme listed, with the locale's conjunction", () => {
    const doc = render([
      entry(
        { institutions: ["xx-test-inst-a", "xx-test-inst-b"] },
        { kind: "institutions", groups: [], without: ["Institut A", "Institut B"] },
      ),
    ]);
    const block = inCard(doc, "scholarship-programmes");
    expect(textOf(block)).toContain(
      translate("scholarshipsPage.programmes.without", {
        institutions: formatList(["Institut A", "Institut B"], "conjunction", "fr") ?? "",
      }),
    );
    expect(textOf(block)).not.toContain(messages.scholarshipsPage.programmes.none);
  });
});

describe("ScholarshipsPageView: details and badges", () => {
  it("shows a single badge when support and deadline share a source", () => {
    const shared = { class: "volatile" as const };
    const doc = render([
      entry({
        support: fact(
          { amount: { min: 500, max: 500, currency: "EUR", per: "month" as const }, covers: [] },
          shared,
        ),
        deadline: fact("2027-03-01", shared),
      }),
    ]);
    expect(card(doc).querySelectorAll(BADGE)).toHaveLength(1);
    expect(inCard(doc, "scholarship-amount").querySelectorAll(BADGE)).toHaveLength(1);
    expect(inCard(doc, "scholarship-deadline").querySelector(BADGE)).toBeNull();
  });

  it("badges the deadline on its own when only the deadline differs in source or class", () => {
    const doc = render([
      entry({
        support: fact({ amount: null, covers: ["tuition"] }, { class: "volatile" }),
        deadline: fact("2027-03-01", { class: "stable" }),
      }),
    ]);
    expect(card(doc).querySelectorAll(BADGE)).toHaveLength(2);
    expect(inCard(doc, "scholarship-deadline").querySelectorAll(BADGE)).toHaveLength(1);
  });

  it("says each missing detail is to be checked, with no badge for it", () => {
    const doc = render(
      [
        entry({
          requirements: requirements({ rules: [] }),
          documents: fact(null),
        }),
      ],
      ["#howToApply"],
    );
    const requirementsSection = detailsSection(doc, "scholarshipsPage.details.requirements");
    expect(textOf(requirementsSection)).toContain(messages.scholarshipsPage.requirements.none);
    expect(requirementsSection.querySelector(BADGE)).toBeNull();
    const documents = detailsSection(doc, "scholarshipsPage.details.documents");
    expect(textOf(documents)).toContain(messages.scholarshipsPage.documents.missing);
    expect(documents.querySelector(BADGE)).toBeNull();
    const howTo = detailsSection(doc, "scholarshipsPage.details.howToApply");
    expect(textOf(howTo)).toContain(messages.scholarshipsPage.howToApply.missing);
    expect(howTo.querySelector(BADGE)).toBeNull();
  });

  it("says an empty document list is empty, with no badge", () => {
    const doc = render([entry({ documents: fact([]) })]);
    const documents = detailsSection(doc, "scholarshipsPage.details.documents");
    expect(textOf(documents)).toContain(messages.scholarshipsPage.documents.none);
    expect(documents.querySelector(BADGE)).toBeNull();
  });

  it("badges published rules and documents, while how-to-apply text carries no badge of its own", () => {
    const doc = render([
      entry({
        requirements: requirements({
          coverage: "partial",
          rules: [rule("prior_study_years_min", { years: 1 })],
        }),
        documents: fact([
          { slug: "xx-test-doc", name: "documents/xx-test-doc#name", translationRequired: null },
        ]),
      }),
    ]);
    const rules = detailsSection(doc, "scholarshipsPage.details.requirements");
    expect(textOf(rules)).toContain(messages.scholarshipsPage.requirements.partial);
    expect(textOf(rules)).not.toContain(messages.domain.coverage.partial);
    expect(rules.querySelectorAll(`li ${BADGE}`)).toHaveLength(1);
    const documents = detailsSection(doc, "scholarshipsPage.details.documents");
    expect(textOf(documents)).toContain("documents/xx-test-doc#name");
    expect(documents.querySelectorAll(BADGE)).toHaveLength(1);
    const howTo = detailsSection(doc, "scholarshipsPage.details.howToApply");
    expect(textOf(howTo)).toContain("scholarships/xx-test-sch-a#howToApply");
    expect(howTo.querySelector(BADGE)).toBeNull();
  });

  it("links to the official page over https with a safe rel", () => {
    const doc = render([entry({ officialUrl: "https://example.org/xx-official" })]);
    const link = only(card(doc).querySelectorAll(`a[href="https://example.org/xx-official"]`));
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(textOf(link)).toContain(messages.program.scholarships.link);
  });
});

describe("ScholarshipsPageView: page structure", () => {
  it("anchors each card at #scholarship-<slug> and the jump row links to each country section", () => {
    const doc = renderData(
      dataOf([
        {
          country: "XA",
          entries: [entry({ slug: "xx-test-sch-a" })],
        },
        {
          country: "XB",
          entries: [entry({ slug: "xx-test-sch-b" }), entry({ slug: "xx-test-sch-c" })],
        },
      ]),
    );
    expect(doc.getElementById("scholarship-xx-test-sch-a")?.getAttribute("data-testid")).toBe(
      "scholarship-card",
    );
    expect(doc.getElementById("scholarship-xx-test-sch-c")?.getAttribute("data-testid")).toBe(
      "scholarship-card",
    );
    const jump = only(
      doc.querySelectorAll(`nav[aria-label="${messages.scholarshipsPage.jump.label}"]`),
    );
    const hrefs = [...jump.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["#country-XA", "#country-XB"]);
    const sections = [...doc.querySelectorAll('[data-testid="scholarship-section"]')];
    expect(sections.map((s) => s.id)).toEqual(["country-XA", "country-XB"]);
    expect(textOf(jump)).toContain(
      translate("scholarshipsPage.sectionCount", { n: 2, count: "2" }),
    );
    expect(textOf(sections[0]?.querySelector("h2") ?? null)).toContain(
      translate("scholarshipsPage.sectionCount", { n: 1, count: "1" }),
    );
    expect(sections[1]?.querySelectorAll('[data-testid="scholarship-card"]')).toHaveLength(2);
    expect(doc.querySelectorAll("h1")).toHaveLength(1);
  });

  it("renders the empty message when there is no section", () => {
    const doc = renderData(dataOf([]));
    expect(textOf(doc.body)).toContain(messages.scholarshipsPage.empty);
    expect(doc.querySelector("nav")).toBeNull();
    expect(doc.querySelector('[data-testid="scholarship-section"]')).toBeNull();
    expect(doc.querySelectorAll("h1")).toHaveLength(1);
  });

  it("uses summary elements that are tall enough to tap", () => {
    const doc = render([entry()]);
    const summaries = [...card(doc).querySelectorAll("summary")];
    expect(summaries).toHaveLength(2);
    for (const summary of summaries) expect(summary.className).toContain("min-h-11");
  });
});
