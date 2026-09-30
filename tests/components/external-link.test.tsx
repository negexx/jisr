// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ExternalLink } from "@/components/external-link";

import { catalogs, expectNoPhysicalDirection, LOCALES, renderWithMessages } from "./trust-helpers";

afterEach(cleanup);

describe("ExternalLink", () => {
  it("renders a new-tab anchor with rel noopener noreferrer for an https url", () => {
    renderWithMessages(<ExternalLink href="https://www.campusfrance.org/fr/admission" />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("https://www.campusfrance.org/fr/admission");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("shows the hostname in a left-to-right bdi by default", () => {
    renderWithMessages(<ExternalLink href="https://www.campusfrance.org/fr/admission?x=1" />, "ar");
    const bdi = screen.getByText("www.campusfrance.org");
    expect(bdi.tagName).toBe("BDI");
    expect(bdi.getAttribute("dir")).toBe("ltr");
    expect(screen.getByRole("link").textContent).not.toContain("admission");
  });

  it.each(
    LOCALES,
  )("adds a screen-reader note and a decorative, unmirrored icon in %s", (locale) => {
    const { container } = renderWithMessages(<ExternalLink href="https://example.org/a" />, locale);
    const note = catalogs[locale].externalLink.opensInNewTab;
    const link = screen.getByRole("link", { name: new RegExp(note.replace(/[()]/g, "$&")) });
    const hidden = link.querySelector(".sr-only");
    expect(hidden?.textContent).toBe(note);
    const icon = link.querySelector("svg");
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
    expect(icon?.getAttribute("class")).not.toMatch(/rotate|scale-x/);
    expectNoPhysicalDirection(container);
  });

  it("never claims the destination is official", () => {
    for (const locale of LOCALES) {
      expect(catalogs[locale].externalLink.opensInNewTab).not.toMatch(/official|officiel|رسمي/i);
    }
  });

  it("renders custom children instead of the hostname", () => {
    renderWithMessages(<ExternalLink href="https://example.org/a">Read the rules</ExternalLink>);
    expect(screen.getByRole("link", { name: /Read the rules/ })).toBeTruthy();
    expect(screen.queryByText("example.org")).toBeNull();
  });

  it.each([
    ["http", "http://example.org/a"],
    ["javascript", "javascript:alert(1)"],
    ["data", "data:text/html,<b>x</b>"],
    ["protocol-relative", "//example.org/a"],
    ["empty", ""],
    ["bare https", "https://"],
  ])("renders no anchor for %s urls", (_name, href) => {
    const { container } = renderWithMessages(<ExternalLink href={href}>Text only</ExternalLink>);
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toContain("Text only");
    expect(container.innerHTML).not.toContain("href");
  });

  it("passes the class name to the anchor", () => {
    renderWithMessages(<ExternalLink href="https://example.org/a" className="min-h-11" />);
    expect(screen.getByRole("link").className).toContain("min-h-11");
  });
});
