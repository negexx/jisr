// @vitest-environment jsdom
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SaveProgramButton } from "@/components/save-program-button";
import { SAVED_KEY } from "@/lib/saved/saved";
import { savedStore } from "@/lib/saved/store";

import { renderIntl } from "./intl";

// A programme saved before it was renamed is saved under its former slug: the button on the
// current slug's page compares resolved slugs, shows it as saved and unsaves that entry.

const VERSION = "0123456789ab";
const PROGRAM = { slug: "xx-test-cs", country: "FR", field: "computer-science" };
const COPY = {
  save: "Save",
  saved: "Saved",
  announceSaved: "Added.",
  announceRemoved: "Removed.",
  full: "Full.",
  failed: "Failed.",
};

function seed(...slugs: string[]): void {
  const items = slugs.map((slug) => ({
    ...PROGRAM,
    slug,
    snapshotVersion: VERSION,
    savedAt: "2026-01-01",
  }));
  window.localStorage.setItem(SAVED_KEY, JSON.stringify({ schemaVersion: 1, items }));
  savedStore.reload();
}

function storedSlugs(): string[] {
  return JSON.parse(window.localStorage.getItem(SAVED_KEY) ?? '{"items":[]}').items.map(
    (item: { slug: string }) => item.slug,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  savedStore.reload();
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  savedStore.reload();
});

describe("SaveProgramButton with renamed slugs", () => {
  it("shows a save made under a former slug as saved, and unsaves that entry", async () => {
    seed("xx-test-cs-old", "xx-other");
    renderIntl(
      <SaveProgramButton
        program={PROGRAM}
        snapshotVersion={VERSION}
        programName="Licence"
        copy={COPY}
        aliases={{ "xx-test-cs-old": "xx-test-cs" }}
      />,
      "fr",
    );
    const toggle = screen.getByRole("button");
    expect(toggle.textContent).toContain("Saved");
    await userEvent.click(toggle);
    await waitFor(() => expect(storedSlugs()).toEqual(["xx-other"]));
    expect(screen.getByRole("button").textContent).toContain("Save");
  });

  it("without the alias map the former-slug save is a different programme", () => {
    seed("xx-test-cs-old");
    renderIntl(
      <SaveProgramButton
        program={PROGRAM}
        snapshotVersion={VERSION}
        programName="Licence"
        copy={COPY}
      />,
      "fr",
    );
    expect(screen.getByRole("button").textContent).not.toContain("Saved");
  });
});
