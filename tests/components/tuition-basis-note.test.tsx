// @vitest-environment jsdom
import { cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { TuitionBasisNote } from "@/components/tuition-basis-note";

import { catalogs, LOCALES, renderWithMessages } from "./trust-helpers";

afterEach(cleanup);

const flat = { amountMinor: 120000, currency: "XTS", period: "year" as const };
const range = { ...flat, maxAmountMinor: 300000 };

describe("TuitionBasisNote", () => {
  it.each(
    LOCALES,
  )("says the fee depends on household income only for an income-based range (%s)", (locale) => {
    const shown = renderWithMessages(
      <TuitionBasisNote tuition={{ ...range, basis: "income_based" }} />,
      locale,
    );
    expect(shown.container.querySelector('[data-testid="tuition-basis"]')?.textContent).toBe(
      catalogs[locale].domain.cost.incomeBased,
    );
    cleanup();
    for (const tuition of [flat, range]) {
      const hidden = renderWithMessages(<TuitionBasisNote tuition={tuition} />, locale);
      expect(hidden.container.querySelector('[data-testid="tuition-basis"]')).toBeNull();
      cleanup();
    }
  });
});
