// @vitest-environment jsdom
import { cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { StatusSummary } from "@/components/status-summary";

import { catalogs, renderWithMessages } from "./trust-helpers";

afterEach(cleanup);

const CHIP = '[data-slot="status-summary-chip"]';

describe("StatusSummary", () => {
  it("shows one chip per non-zero count: the status badge plus its visible count", () => {
    const { container } = renderWithMessages(
      <StatusSummary counts={{ ok: 2, check: 3, failed: 0 }} />,
      "fr",
    );
    expect(container.querySelectorAll(CHIP)).toHaveLength(2);
    const okChip = container.querySelector('[data-group="ok"]')?.closest(CHIP);
    const checkChip = container.querySelector('[data-group="check"]')?.closest(CHIP);
    expect(okChip).not.toBeNull();
    expect(checkChip).not.toBeNull();
    expect(okChip?.querySelector("bdi")?.textContent).toBe("2");
    expect(checkChip?.querySelector("bdi")?.textContent).toBe("3");
    // The status wording is the badge's, not re-worded here.
    expect(okChip?.textContent).toContain(catalogs.fr.domain.status.satisfied);
    expect(checkChip?.textContent).toContain(catalogs.fr.domain.status.check);
  });

  it("renders no chip for a zero count and nothing at all when every count is zero", () => {
    const none = renderWithMessages(
      <StatusSummary counts={{ ok: 0, check: 0, failed: 0 }} />,
      "fr",
    );
    expect(none.container.querySelectorAll(CHIP)).toHaveLength(0);
    const one = renderWithMessages(<StatusSummary counts={{ ok: 0, check: 1, failed: 0 }} />, "fr");
    const chips = one.container.querySelectorAll(CHIP);
    expect(chips).toHaveLength(1);
    expect(chips[0]?.querySelector('[data-group="check"]')).not.toBeNull();
    expect(chips[0]?.querySelector("bdi")?.textContent).toBe("1");
  });

  it("keeps the count as visible Latin digits inside a bidi isolate, in Arabic too", () => {
    const { container } = renderWithMessages(
      <StatusSummary counts={{ ok: 0, check: 0, failed: 4 }} />,
      "ar",
    );
    const chip = container.querySelector(CHIP);
    const count = chip?.querySelector("bdi");
    expect(count?.textContent).toBe("4");
    expect(count?.closest(".sr-only")).toBeNull();
    expect(chip?.querySelector('[data-group="failed"]')?.textContent).toContain(
      catalogs.ar.domain.status.not_satisfied,
    );
  });
});
