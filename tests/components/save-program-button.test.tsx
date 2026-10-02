// @vitest-environment jsdom
import { act, cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SaveProgramButton } from "@/components/save-program-button";
import type { AppLocale } from "@/i18n/routing";
import { MAX_SAVED_PROGRAMS } from "@/lib/constants";
import { removeFromPlan } from "@/lib/saved/actions";
import { SAVED_KEY } from "@/lib/saved/saved";
import { savedStore } from "@/lib/saved/store";

import { renderIntl } from "./intl";
import { catalogs, LOCALES } from "./trust-helpers";

const VERSION = "0123456789ab";
const PROGRAM = { slug: "xx-test-cs", country: "FR", field: "computer-science" };
const NAME = "Licence Informatique";
const ARABIC_INDIC_DIGIT = /[٠-٩۰-۹]/u;

beforeEach(() => {
  window.localStorage.clear();
  savedStore.reload();
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  savedStore.reload();
});

function copyOf(locale: AppLocale) {
  const { savedProgram } = catalogs[locale];
  return {
    save: savedProgram.save,
    saved: savedProgram.saved,
    announceSaved: savedProgram.announceSaved,
    announceRemoved: savedProgram.announceRemoved,
    full: savedProgram.full.replace("{max}", String(MAX_SAVED_PROGRAMS)),
  };
}

function button(locale: AppLocale, program = PROGRAM) {
  return (
    <SaveProgramButton
      program={program}
      snapshotVersion={VERSION}
      programName={NAME}
      copy={copyOf(locale)}
    />
  );
}

function storedItems(): {
  slug: string;
  country: string;
  field: string;
  snapshotVersion: string;
}[] {
  const raw = window.localStorage.getItem(SAVED_KEY);
  return raw === null ? [] : JSON.parse(raw).items;
}

function seedOthers(count: number) {
  const items = Array.from({ length: count }, (_, index) => ({
    slug: `xx-other-${index}`,
    country: "DE",
    field: "engineering",
    snapshotVersion: VERSION,
    savedAt: "2026-01-01",
  }));
  window.localStorage.setItem(SAVED_KEY, JSON.stringify({ schemaVersion: 1, items }));
}

describe("SaveProgramButton: static output", () => {
  it("renders only an inert placeholder on the server", () => {
    const html = renderToString(button("fr"));
    expect(html).toContain('data-slot="save-placeholder"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("aria-pressed");
    expect(html).not.toContain("<button");
    for (const locale of LOCALES) {
      const { save, saved } = copyOf(locale);
      expect(html).not.toContain(save);
      expect(html).not.toContain(saved);
    }
  });
});

describe.each(LOCALES)("SaveProgramButton (%s)", (locale) => {
  const copy = copyOf(locale);

  it("shows the save label and the program name for screen readers, without aria-pressed", () => {
    renderIntl(button(locale), locale);
    const control = screen.getByRole("button", { name: `${copy.save} ${NAME}` });
    expect(control.getAttribute("aria-pressed")).toBeNull();
    expect(control.textContent).toContain(copy.save);
    const name = control.querySelector("span.sr-only bdi");
    expect(name?.textContent).toBe(NAME);
    expect(control.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("saves on click, then removes on the next click, announcing each", async () => {
    const user = userEvent.setup();
    renderIntl(button(locale), locale);
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("");

    await user.click(screen.getByRole("button", { name: `${copy.save} ${NAME}` }));
    const savedControl = screen.getByRole("button", { name: `${copy.saved} ${NAME}` });
    expect(savedControl.getAttribute("aria-pressed")).toBeNull();
    expect(storedItems()).toEqual([
      expect.objectContaining({ ...PROGRAM, snapshotVersion: VERSION }),
    ]);
    expect(screen.getByRole("status")).toBe(status);
    expect(status.textContent).toBe(copy.announceSaved);

    await user.click(savedControl);
    expect(screen.getByRole("button", { name: `${copy.save} ${NAME}` })).toBeTruthy();
    expect(storedItems()).toEqual([]);
    expect(status.textContent).toBe(copy.announceRemoved);
  });

  it("says the list is full in an alert and saves nothing", async () => {
    const user = userEvent.setup();
    seedOthers(MAX_SAVED_PROGRAMS);
    renderIntl(button(locale), locale);
    await user.click(screen.getByRole("button", { name: `${copy.save} ${NAME}` }));
    expect(screen.getByRole("alert").textContent).toBe(copy.full);
    expect(screen.getByRole("button", { name: `${copy.save} ${NAME}` })).toBeTruthy();
    expect(storedItems().some((item) => item.slug === PROGRAM.slug)).toBe(false);
    expect(storedItems()).toHaveLength(MAX_SAVED_PROGRAMS);
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("announces the full list again on every click, as a fresh alert", async () => {
    const user = userEvent.setup();
    seedOthers(MAX_SAVED_PROGRAMS);
    renderIntl(button(locale), locale);
    const control = () => screen.getByRole("button", { name: `${copy.save} ${NAME}` });
    await user.click(control());
    const first = screen.getByRole("alert");
    await user.click(control());
    const second = screen.getByRole("alert");
    // Same text in the same node is not announced twice: each click must insert a new alert.
    expect(second).not.toBe(first);
    expect(first.isConnected).toBe(false);
    expect(second.textContent).toBe(copy.full);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("drops the full alert once the list has room again", async () => {
    const user = userEvent.setup();
    seedOthers(MAX_SAVED_PROGRAMS);
    renderIntl(button(locale), locale);
    await user.click(screen.getByRole("button", { name: `${copy.save} ${NAME}` }));
    expect(screen.getByRole("alert")).toBeTruthy();
    act(() => removeFromPlan("xx-other-0"));
    expect(screen.queryByRole("alert")).toBeNull();
    // Full again: the old complaint must not come back by itself.
    act(() => {
      window.localStorage.setItem(
        SAVED_KEY,
        JSON.stringify({
          schemaVersion: 1,
          items: Array.from({ length: MAX_SAVED_PROGRAMS }, (_, index) => ({
            slug: `xx-other-${index}`,
            country: "DE",
            field: "engineering",
            snapshotVersion: VERSION,
            savedAt: "2026-01-01",
          })),
        }),
      );
      savedStore.reload();
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("clears the alert when a toggle succeeds", async () => {
    const user = userEvent.setup();
    seedOthers(MAX_SAVED_PROGRAMS);
    renderIntl(button(locale), locale);
    await user.click(screen.getByRole("button", { name: `${copy.save} ${NAME}` }));
    expect(screen.getByRole("alert")).toBeTruthy();
    act(() => removeFromPlan("xx-other-0"));
    await user.click(screen.getByRole("button", { name: `${copy.save} ${NAME}` }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe(copy.announceSaved);
  });

  it("keeps two buttons for the same program in sync", async () => {
    const user = userEvent.setup();
    renderIntl(
      <>
        <div data-testid="a">{button(locale)}</div>
        <div data-testid="b">{button(locale)}</div>
      </>,
      locale,
    );
    await user.click(within(screen.getByTestId("a")).getByRole("button"));
    expect(within(screen.getByTestId("a")).getByRole("button").textContent).toContain(copy.saved);
    expect(within(screen.getByTestId("b")).getByRole("button").textContent).toContain(copy.saved);
    await user.click(within(screen.getByTestId("b")).getByRole("button"));
    expect(within(screen.getByTestId("a")).getByRole("button").textContent).toContain(copy.save);
    expect(within(screen.getByTestId("a")).getByRole("button").textContent).not.toContain(
      copy.saved,
    );
  });
});

describe("SaveProgramButton: Arabic", () => {
  it("renders under dir=rtl with no Arabic-Indic digits", async () => {
    const user = userEvent.setup();
    seedOthers(MAX_SAVED_PROGRAMS);
    renderIntl(button("ar"), "ar");
    expect(screen.getByTestId("dir-root").getAttribute("dir")).toBe("rtl");
    await user.click(screen.getByRole("button"));
    expect(screen.getByRole("alert").textContent).not.toMatch(ARABIC_INDIC_DIGIT);
  });
});
