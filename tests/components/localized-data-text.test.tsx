// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LocalizedDataText } from "@/components/localized-data-text";

import {
  catalogs,
  expectNoPhysicalDirection,
  LOCALES,
  renderWithMessages,
  watchConsole,
} from "./trust-helpers";

let consoleWatch: ReturnType<typeof watchConsole>;
beforeEach(() => {
  consoleWatch = watchConsole();
});
afterEach(() => {
  cleanup();
  consoleWatch.expectSilent();
  consoleWatch.restore();
});

describe("LocalizedDataText", () => {
  it.each(LOCALES)("renders plain text with no note for note none in %s", (locale) => {
    const { container } = renderWithMessages(
      <LocalizedDataText value={{ text: "Licence Informatique", note: "none" }} />,
      locale,
    );
    expect(container.textContent).toBe("Licence Informatique");
    expect(container.querySelector("[lang]")).toBeNull();
  });

  it.each(LOCALES)("marks a French fallback as French and explains it in %s", (locale) => {
    const { container } = renderWithMessages(
      <LocalizedDataText value={{ text: "Licence Informatique", note: "french_fallback" }} />,
      locale,
    );
    const text = screen.getByText("Licence Informatique");
    expect(text.getAttribute("lang")).toBe("fr");
    expect(text.getAttribute("dir")).toBe("ltr");
    expect(container.textContent).toContain(catalogs[locale].domain.textNote.french_fallback);
  });

  it("puts the note right after the text so it is read next", () => {
    renderWithMessages(
      <LocalizedDataText value={{ text: "Texte", note: "french_fallback" }} />,
      "en",
    );
    const note = screen.getByText("Texte").nextElementSibling;
    expect(note?.textContent).toBe(catalogs.en.domain.textNote.french_fallback);
  });

  it.each(LOCALES)("adds the machine translation note without changing lang in %s", (locale) => {
    const { container } = renderWithMessages(
      <LocalizedDataText value={{ text: "Computer science", note: "machine_translated" }} />,
      locale,
    );
    expect(container.textContent).toContain(catalogs[locale].domain.textNote.machine_translated);
    expect(container.querySelector("[lang]")).toBeNull();
    expect(container.textContent).not.toContain(catalogs[locale].domain.textNote.french_fallback);
  });

  it("renders the fallback for null and undefined, and nothing by default", () => {
    const withFallback = renderWithMessages(
      <LocalizedDataText value={null} fallback={<span>Not published</span>} />,
      "en",
    );
    expect(withFallback.container.textContent).toBe("Not published");
    cleanup();
    const undefinedValue = renderWithMessages(
      <LocalizedDataText value={undefined} fallback={<span>Not published</span>} />,
      "en",
    );
    expect(undefinedValue.container.textContent).toBe("Not published");
    cleanup();
    const nothing = renderWithMessages(<LocalizedDataText value={null} />, "en");
    expect(nothing.container.textContent).toBe("");
  });

  it("keeps the note as text, not colour, and uses logical utilities only", () => {
    const { container } = renderWithMessages(
      <LocalizedDataText value={{ text: "Texte", note: "french_fallback" }} />,
      "ar",
    );
    expect(container.textContent).toContain(catalogs.ar.domain.textNote.french_fallback);
    expectNoPhysicalDirection(container);
  });
});
