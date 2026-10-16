// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PersonalMatch } from "@/components/program/personal-match";
import { SaveProgramButton } from "@/components/save-program-button";
import { MAX_SAVED_PROGRAMS } from "@/lib/constants";
import { profileStore } from "@/lib/profile/store";
import { SAVED_KEY } from "@/lib/saved/saved";
import { savedStore } from "@/lib/saved/store";

import { E2E_NOW, E2E_PROFILE, E2E_SLUGS } from "../../fixtures/e2e/profiles";
import { watchConsole } from "../trust-helpers";
import {
  buildFixtureSnapshot,
  ClientLeafProvider,
  catalogs,
  fixtureClient,
  loadProgramBundle,
  PROGRAM_REFS,
  removeFixtureSnapshots,
} from "./program-fixture";

// ADR 0013 decision 13: the snapshot version stored on a saved row is provenance. The program page's
// "published data is newer than this page" notice compares the page with the data the browser loaded
// (personal-match.tsx), never a saved row with anything; and a programme saved against an older
// snapshot is still saved, still computed and never rewritten. The row-level halves (the snapshot
// client, the plan view, export and import) are in tests/lib/server/provenance.test.ts.

const OLDER = "ba9876543210";
const SLUG = E2E_SLUGS.ok;
const REF = PROGRAM_REFS[SLUG] ?? { slug: SLUG, country: "XB", field: "xx-test-field-cs" };

let dir = "";
let current = "";
let programName = "";

beforeAll(async () => {
  dir = buildFixtureSnapshot();
  const bundle = await loadProgramBundle(dir, SLUG, "fr");
  current = bundle.snapshotVersion;
  const found = bundle.programs.flatMap((shard) => shard.programs).find((p) => p.slug === SLUG);
  programName = found?.name ?? SLUG;
}, 180_000);

afterAll(removeFixtureSnapshots);

let consoleWatch: ReturnType<typeof watchConsole>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${E2E_NOW}T12:00:00Z`));
  consoleWatch = watchConsole();
});

afterEach(() => {
  cleanup();
  profileStore.clear();
  window.localStorage.clear();
  savedStore.reload();
  vi.useRealTimers();
  consoleWatch.expectSilent();
  consoleWatch.restore();
});

type Tree = { [key: string]: string | Tree };
function message(key: string): string {
  let node: string | Tree = catalogs.fr;
  for (const part of key.split(".")) {
    if (typeof node === "string" || node[part] === undefined) throw new Error(`no ${key}`);
    node = node[part];
  }
  if (typeof node !== "string") throw new Error(`${key} is not a message`);
  return node;
}

const SAVED_COPY = {
  save: message("savedProgram.save"),
  saved: message("savedProgram.saved"),
  announceSaved: message("savedProgram.announceSaved"),
  announceRemoved: message("savedProgram.announceRemoved"),
  full: message("savedProgram.full").replace("{max}", String(MAX_SAVED_PROGRAMS)),
  failed: message("savedProgram.failed"),
};

// The program page's two client leaves for one programme, with the programme already saved
// against `rowVersion` on this device, on a page built from `pageVersion`.
async function openProgramPage(options: { pageVersion: string; rowVersion: string }) {
  const stored = {
    schemaVersion: 1,
    items: [{ ...REF, snapshotVersion: options.rowVersion, savedAt: "2026-09-01" }],
  };
  window.localStorage.setItem(SAVED_KEY, JSON.stringify(stored));
  savedStore.reload();
  expect(profileStore.save(E2E_PROFILE).ok).toBe(true);

  render(
    <ClientLeafProvider locale="fr">
      <SaveProgramButton
        program={REF}
        snapshotVersion={options.pageVersion}
        programName={programName}
        copy={SAVED_COPY}
      />
      <PersonalMatch
        program={REF}
        snapshotVersion={options.pageVersion}
        scholarshipSlugs={[]}
        locale="fr"
        client={fixtureClient(dir)}
      />
    </ClientLeafProvider>,
  );
  return waitFor(() => {
    const found = document.querySelector<HTMLElement>('[data-slot="personal-result"]');
    if (found === null) throw new Error("no result yet");
    return found;
  });
}

// The programme's personal result is on screen: the status line the result head writes.
function expectResultShown(result: HTMLElement): void {
  expect(result.dataset.group).toBe("ok");
  expect(within(result).getByText(message("domain.status.hint.satisfied"))).toBeTruthy();
}

function storedVersion(): string | undefined {
  const raw = window.localStorage.getItem(SAVED_KEY);
  return raw === null ? undefined : JSON.parse(raw).items[0]?.snapshotVersion;
}

describe("a programme saved against another snapshot", () => {
  it("is set up with a snapshot that is not the one the rows were saved against", () => {
    expect(current).toMatch(/^[0-9a-f]{12}$/);
    expect(current).not.toBe(OLDER);
  });

  it.each([
    "current",
    "older",
  ] as const)("shows no update notice on a page built from the data in use, whatever the row says (row %s)", async (row) => {
    const result = await openProgramPage({
      pageVersion: current,
      rowVersion: row === "current" ? current : OLDER,
    });
    expectResultShown(result);
    expect(within(result).queryByText(message("program.personal.updated.notice"))).toBeNull();
    expect(
      within(result).queryByRole("button", { name: message("program.personal.updated.reload") }),
    ).toBeNull();
  });

  it.each([
    "current",
    "older",
  ] as const)("asks to reload when the page is older than the data, whatever the row says (row %s)", async (row) => {
    const result = await openProgramPage({
      pageVersion: "an-older-build",
      rowVersion: row === "current" ? current : OLDER,
    });
    expectResultShown(result);
    expect(within(result).getByText(message("program.personal.updated.notice"))).toBeTruthy();
    expect(
      within(result).getByRole("button", { name: message("program.personal.updated.reload") }),
    ).toBeTruthy();
  });

  it("still shows as saved and still gets its personal result, and its stored version is left alone", async () => {
    const result = await openProgramPage({ pageVersion: current, rowVersion: OLDER });
    expectResultShown(result);
    expect(screen.getByRole("button", { name: new RegExp(`^${SAVED_COPY.saved} `) })).toBeTruthy();
    expect(screen.queryByRole("button", { name: new RegExp(`^${SAVED_COPY.save} `) })).toBeNull();
    expect(storedVersion()).toBe(OLDER);
  });
});
