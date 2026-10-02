// @vitest-environment jsdom
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SaveProgramButton } from "@/components/save-program-button";
import { SAVED_KEY } from "@/lib/saved/saved";
import { savedStore } from "@/lib/saved/store";

import { renderIntl } from "./intl";
import { catalogs, LOCALES } from "./trust-helpers";

// The code that forgets the ticked steps is loaded when a program is unsaved. If that download
// fails, the program must stay saved (with its ticks) and the student must be told.
vi.mock("@/lib/plan/store", () => {
  throw new Error("chunk failed to load");
});

const VERSION = "0123456789ab";
const PROGRAM = { slug: "xx-test-cs", country: "FR", field: "computer-science" };
const NAME = "Licence Informatique";

beforeEach(() => {
  window.localStorage.setItem(
    SAVED_KEY,
    JSON.stringify({
      schemaVersion: 1,
      items: [{ ...PROGRAM, snapshotVersion: VERSION, savedAt: "2026-01-01" }],
    }),
  );
  savedStore.reload();
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  savedStore.reload();
});

describe.each(LOCALES)("SaveProgramButton when the plan code fails to load (%s)", (locale) => {
  it("keeps the saved list as it was, says so in an alert, and lets the student try again", async () => {
    const { savedProgram } = catalogs[locale];
    const user = userEvent.setup();
    renderIntl(
      <SaveProgramButton
        program={PROGRAM}
        snapshotVersion={VERSION}
        programName={NAME}
        copy={{
          save: savedProgram.save,
          saved: savedProgram.saved,
          announceSaved: savedProgram.announceSaved,
          announceRemoved: savedProgram.announceRemoved,
          full: savedProgram.full,
          failed: savedProgram.failed,
        }}
      />,
      locale,
    );
    const control = () => screen.getByRole("button", { name: `${savedProgram.saved} ${NAME}` });
    await user.click(control());
    expect((await screen.findByRole("alert")).textContent).toBe(savedProgram.failed);
    expect(control()).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem(SAVED_KEY) ?? "null").items).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toBe("");

    // Another try is possible (the button is not stuck busy) and shows a fresh alert.
    const first = screen.getByRole("alert");
    await user.click(control());
    await waitFor(() => expect(first.isConnected).toBe(false));
    expect((await screen.findByRole("alert")).textContent).toBe(savedProgram.failed);
  });
});
