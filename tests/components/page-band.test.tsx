// @vitest-environment jsdom
import { cleanup } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { PageBand } from "@/components/page-band";

import { IntlWrapper, renderIntl } from "./intl";
import { expectNoPhysicalDirection } from "./trust-helpers";

afterEach(cleanup);

const BAND = {
  eyebrow: "Mes résultats",
  title: "Vos options réalistes",
  lead: "Cinq programmes correspondent.",
} as const;

describe("PageBand", () => {
  it("renders the eyebrow, the level-1 title with the given id, and the lead", () => {
    const { container } = renderIntl(<PageBand {...BAND} id="profile-title" />, "fr");
    expect(container.textContent).toContain(BAND.eyebrow);
    const title = container.querySelector("h1");
    expect(title?.textContent).toBe(BAND.title);
    expect(title?.getAttribute("id")).toBe("profile-title");
    expect(container.textContent).toContain(BAND.lead);
    expectNoPhysicalDirection(container);
  });

  it("leaves the optional eyebrow, lead, id and children out when they are not given", () => {
    const { container } = renderIntl(<PageBand title={BAND.title} />, "fr");
    expect(container.textContent).toBe(BAND.title);
    expect(container.querySelector("h1")?.getAttribute("id")).toBeNull();
  });

  it("keeps the full-bleed breakout and renders the children slot", () => {
    const { container } = renderIntl(
      <PageBand title={BAND.title}>
        <p>Deux programmes à vérifier</p>
      </PageBand>,
      "fr",
    );
    const classes = container.querySelector("section")?.getAttribute("class") ?? "";
    expect(classes).toContain("mx-[calc(50%_-_50vw)]");
    expect(classes).toContain("w-screen");
    expect(classes).toContain("max-w-none");
    expect(container.textContent).toContain("Deux programmes à vérifier");
  });

  it("makes no freshness, clock or profile claim under messages={null}", () => {
    const html = renderToString(
      <IntlWrapper locale="fr">
        <PageBand {...BAND} />
      </IntlWrapper>,
    );
    expect(html).toContain(BAND.title);
    expect(html).not.toContain("data-freshness");
    expect(html).not.toContain("<time");
    expect(html).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
    // The band adds no sentence of its own: its text is exactly the strings its consumer passed.
    const document = new DOMParser().parseFromString(html, "text/html");
    expect(document.body.textContent).toBe(`${BAND.eyebrow}${BAND.title}${BAND.lead}`);
  });
});
