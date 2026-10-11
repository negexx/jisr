// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { Fact } from "@/components/mdx/fact";
import { MdxLink, useMDXComponents } from "@/mdx-components";

import { renderWithMessages } from "./trust-helpers";

afterEach(cleanup);

function Mdx({ name, children }: { name: string; children: ReactNode }) {
  const components = useMDXComponents();
  const Component = components[name];
  if (typeof Component !== "function") throw new Error(`missing MDX component: ${name}`);
  return <Component>{children}</Component>;
}

describe("MDX element map", () => {
  it("renders h1 in thin display type, not bold", () => {
    const { container } = renderWithMessages(<Mdx name="h1">Studying in Europe</Mdx>);
    const heading = container.querySelector("h1");
    expect(heading).not.toBeNull();
    expect(heading?.className).toContain("font-light");
    expect(heading?.className).not.toContain("font-bold");
  });

  it("renders paragraphs and lists in the secondary ink token", () => {
    const paragraph = renderWithMessages(<Mdx name="p">Body text</Mdx>);
    expect(paragraph.container.querySelector("p")?.className).toContain(
      "text-secondary-foreground",
    );
    cleanup();
    const list = renderWithMessages(<Mdx name="ul">item</Mdx>);
    expect(list.container.querySelector("ul")?.className).toContain("text-secondary-foreground");
  });
});

describe("MdxLink", () => {
  it("renders an external link for an https url", () => {
    renderWithMessages(<MdxLink href="https://example.org/rules">Read the rules</MdxLink>);
    const link = screen.getByRole("link", { name: /Read the rules/ });
    expect(link.getAttribute("href")).toBe("https://example.org/rules");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("renders a locale-aware internal link for an internal path", () => {
    renderWithMessages(<MdxLink href="/terms">Terms</MdxLink>, "ar");
    expect(screen.getByRole("link", { name: "Terms" }).getAttribute("href")).toBe("/ar/terms");
  });
});

describe("Fact callout", () => {
  it("renders the official kind pill for an official fact", () => {
    const { container } = renderWithMessages(
      <Fact kind="official" source="https://example.org/requirement" verified="2026-10-11">
        A published requirement
      </Fact>,
    );
    expect(container.querySelector('[data-slot="mdx-fact"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="source-kind-icon-official"]')).not.toBeNull();
  });

  it("renders the guidance pill and never the official pill for a guidance fact", () => {
    const { container } = renderWithMessages(
      <Fact kind="guidance" source="https://example.org/tip" verified="2026-10-11">
        General advice
      </Fact>,
    );
    expect(container.querySelector('[data-testid="source-kind-icon-guidance"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="source-kind-icon-official"]')).toBeNull();
  });
});
