// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DISCLOSURE_SUMMARY_CLASS, DisclosureChevron } from "@/components/disclosure-chevron";

import { expectNoPhysicalDirection } from "./trust-helpers";

afterEach(cleanup);

function renderSummary() {
  return render(
    <details>
      <summary className={DISCLOSURE_SUMMARY_CLASS}>
        <DisclosureChevron />
      </summary>
    </details>,
  );
}

describe("DisclosureChevron", () => {
  it("keeps the shared summary class free of physical-direction utilities", () => {
    expect(DISCLOSURE_SUMMARY_CLASS).not.toMatch(/\b(?:ml|mr|pl|pr|left|right)-/);
  });

  it("mirrors its closed chevron under rtl and lets the logical class through", () => {
    const { container } = renderSummary();
    const chevron = container.querySelector("summary svg");
    expect(chevron?.getAttribute("aria-hidden")).toBe("true");
    expect(chevron?.getAttribute("class")).toContain("rtl:rotate-180");
    expectNoPhysicalDirection(container);
  });
});
