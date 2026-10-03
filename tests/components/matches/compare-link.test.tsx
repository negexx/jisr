// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CompareLink } from "@/components/matches/compare-link";
import { Providers } from "./helpers";

const useSaved = vi.hoisted(() => vi.fn());
vi.mock("@/lib/saved/use-saved", () => ({ useSaved }));

afterEach(cleanup);

const ITEMS = ["a", "b", "c"].map((slug) => ({
  slug,
  country: "XB",
  field: "xx-test-field-cs",
  snapshotVersion: "abcdef012345",
  savedAt: "2026-09-30",
}));

describe("CompareLink guards", () => {
  it("renders nothing until the saved list is read, even when it would hold programs", () => {
    useSaved.mockReturnValue({ hydrated: false, items: ITEMS });
    const { container } = render(
      <Providers locale="fr">
        <CompareLink locale="fr" />
      </Providers>,
    );
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toBe("");
  });

  it("renders the link once the list is read and holds two programs", () => {
    useSaved.mockReturnValue({ hydrated: true, items: ITEMS });
    const { container } = render(
      <Providers locale="fr">
        <CompareLink locale="fr" />
      </Providers>,
    );
    expect(container.querySelector('a[href$="/compare"]')?.textContent).toContain("3");
  });
});
