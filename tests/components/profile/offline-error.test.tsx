// @vitest-environment jsdom
import { act, cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SnapshotBundle, SnapshotClient } from "@/lib/snapshot/client";
import { SnapshotError } from "@/lib/snapshot/errors";
import { coreShard } from "../../lib/profile/core-fixture";
import { forbidConsole } from "../../lib/profile/no-console";
import { renderProfileForm } from "./helpers";

forbidConsole();

// The error panel shows when the network failed, which is exactly when a second chunk would fail
// to load too: its module is made to fail to load here, and the panel must not depend on it.
vi.mock("@/components/empty-state", () => {
  throw new Error("chunk failed to load");
});

vi.mock("@/i18n/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/i18n/navigation")>()),
  useRouter: () => ({ push: vi.fn() }),
}));

afterEach(cleanup);

describe("ProfileForm error state while offline", () => {
  it("renders the message and Retry without loading any other chunk, and Retry still works", async () => {
    const calls: { reject: (error: unknown) => void; resolve: (bundle: SnapshotBundle) => void }[] =
      [];
    const load = vi.fn<SnapshotClient["load"]>(
      () =>
        new Promise<SnapshotBundle>((resolve, reject) => {
          calls.push({ resolve, reject });
        }),
    );
    renderProfileForm("en", { load });
    await act(async () => calls[0]?.reject(new SnapshotError("network")));

    expect(await screen.findByText("We could not load the reference data")).toBeTruthy();
    expect(screen.getByText("Check your connection, then try again.")).toBeTruthy();
    const retry = screen.getByRole("button", { name: "Try again" });
    await act(async () => retry.click());
    expect(load).toHaveBeenCalledTimes(2);
    await act(async () =>
      calls[1]?.resolve({
        snapshotVersion: "abcdef012345",
        core: coreShard(),
        routes: undefined,
        programs: [],
        institutions: [],
        costProfiles: [],
        scholarships: [],
        text: () => undefined,
        hasPrograms: false,
      }),
    );
    expect(await screen.findByRole("heading", { level: 2, name: "Your Bac" })).toBeTruthy();
  });
});
