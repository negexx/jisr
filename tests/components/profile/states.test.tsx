// @vitest-environment jsdom
import { act, cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { draftFromForm, emptyFormState, formFromProfile } from "@/lib/profile/form/state";
import { DRAFT_KEY, PROFILE_KEY } from "@/lib/profile/storage";
import { profileStore } from "@/lib/profile/store";
import type { SnapshotBundle, SnapshotClient } from "@/lib/snapshot/client";
import { SnapshotError } from "@/lib/snapshot/errors";
import { profile } from "../../fixtures/domain/builders";
import { coreShard } from "../../lib/profile/core-fixture";
import { forbidConsole } from "../../lib/profile/no-console";
import { clientFor, renderProfileForm } from "./helpers";

forbidConsole();

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("@/i18n/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/i18n/navigation")>()),
  useRouter: () => ({ push: navigation.push }),
}));

afterEach(() => {
  cleanup();
  profileStore.clear();
  window.localStorage.clear();
  vi.restoreAllMocks();
  navigation.push.mockClear();
});

function deferred() {
  const calls: {
    resolve: (bundle: SnapshotBundle) => void;
    reject: (error: unknown) => void;
  }[] = [];
  const load = vi.fn<SnapshotClient["load"]>(
    () =>
      new Promise<SnapshotBundle>((resolve, reject) => {
        calls.push({ resolve, reject });
      }),
  );
  return { client: { load } satisfies SnapshotClient, calls, load };
}

const READY: SnapshotBundle = {
  snapshotVersion: "abcdef012345",
  core: coreShard(),
  routes: undefined,
  programs: [],
  institutions: [],
  costProfiles: [],
  scholarships: [],
  text: () => undefined,
  hasPrograms: false,
};

describe("ProfileForm: reference data states", () => {
  it("shows a busy skeleton while the reference data loads", () => {
    const { client } = deferred();
    renderProfileForm("en", client);
    expect(screen.getByRole("heading", { level: 1, name: "Create your profile" })).toBeTruthy();
    const busy = document.querySelector("[aria-busy='true']");
    expect(busy).not.toBeNull();
    expect(screen.getByText("Loading the form")).toBeTruthy();
    expect(screen.queryByRole("form")).toBeNull();
  });

  it("shows a plain error with Retry, and Retry loads again", async () => {
    const { client, calls, load } = deferred();
    renderProfileForm("en", client);
    await act(async () => calls[0]?.reject(new SnapshotError("network")));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("We could not load the reference data");
    expect(alert.textContent).not.toMatch(/network|SnapshotError|undefined/);

    const retry = screen.getByRole("button", { name: "Try again" });
    await act(async () => retry.click());
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    await act(async () => calls[1]?.resolve(READY));
    expect(await screen.findByRole("heading", { level: 2, name: "Your Bac" })).toBeTruthy();
  });

  it("says data is still being verified when no credential type is published", async () => {
    renderProfileForm("en", clientFor({ ...coreShard(), credentialTypes: [] }));
    expect(await screen.findByText("We are still verifying official data")).toBeTruthy();
    expect(screen.getByText(/This is on our side, not yours/)).toBeTruthy();
    expect(screen.queryByRole("form")).toBeNull();
  });

  it("says the same when the core shard is missing", async () => {
    renderProfileForm("en", clientFor(undefined));
    expect(await screen.findByText("We are still verifying official data")).toBeTruthy();
  });

  it("renders the first step once ready, with one h1 and a focusable step heading", async () => {
    renderProfileForm("en", clientFor(coreShard()));
    const heading = await screen.findByRole("heading", { level: 2, name: "Your Bac" });
    expect(heading.getAttribute("tabindex")).toBe("-1");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByText("Step 1 of 2: Your Bac")).toBeTruthy();
  });
});

describe("ProfileForm: initial state and notices", () => {
  it("waits for the stored profile before showing the form, then prefills it in edit mode", async () => {
    profileStore.save(profile());
    renderProfileForm("en", clientFor(coreShard()));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Edit your profile" }),
    ).toBeTruthy();
    await screen.findByRole("heading", { level: 2, name: "Your Bac" });
    const overall = screen.getByLabelText(/Overall grade/) as HTMLInputElement;
    expect(overall.value).toBe(String(formFromProfile(profile()).credential.overall));
    expect(screen.queryByText(/We kept your unfinished answers/)).toBeNull();
  });

  it("restores a kept draft on its step, with a dismissible status notice", async () => {
    const base = emptyFormState(coreShard());
    const form = {
      ...base,
      languages: base.languages.map((row) =>
        row.language === "fr" ? { ...row, level: "B2" as const } : row,
      ),
    };
    const draft = draftFromForm(form, 1);
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    const { user } = renderProfileForm("en", clientFor(coreShard()));
    expect(await screen.findByRole("heading", { level: 2, name: "Languages" })).toBeTruthy();
    const notice = screen.getByText(/We kept your unfinished answers/);
    expect(notice.closest("output")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText(/We kept your unfinished answers/)).toBeNull();
  });

  it("throws a corrupt draft away and starts on step 1", async () => {
    window.localStorage.setItem(DRAFT_KEY, "{not json");
    renderProfileForm("en", clientFor(coreShard()));
    expect(await screen.findByRole("heading", { level: 2, name: "Your Bac" })).toBeTruthy();
    expect(screen.queryByText(/We kept your unfinished answers/)).toBeNull();
  });

  it("explains a removed invalid profile, and dismissing it calls the store", async () => {
    window.localStorage.setItem(PROFILE_KEY, "{not json");
    const dismiss = vi.spyOn(profileStore, "dismissReset");
    const { user } = renderProfileForm("en", clientFor(coreShard()));
    const notice = await screen.findByText(
      "We could not read your saved profile, so we removed it. You can create it again.",
    );
    expect(notice.closest("output")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(dismiss).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByText(/could not read your saved profile/)).toBeNull());
  });

  it("warns that answers will be lost when this device cannot save", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    renderProfileForm("en", clientFor(coreShard()));
    expect(
      await screen.findByText(
        "We cannot save on this device: your answers will be lost when you close this page.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Your Bac" })).toBeTruthy();
  });

  it("shows no storage warning on a device that can save", async () => {
    renderProfileForm("en", clientFor(coreShard()));
    await screen.findByRole("heading", { level: 2, name: "Your Bac" });
    expect(screen.queryByText(/We cannot save on this device/)).toBeNull();
  });
});

describe("ProfileForm: Arabic", () => {
  it("renders the first step in Arabic under dir=rtl with mirrored arrows", async () => {
    renderProfileForm("ar", clientFor(coreShard()));
    expect(await screen.findByRole("heading", { level: 2, name: "البكالوريا" })).toBeTruthy();
    expect(screen.getByTestId("dir-root").getAttribute("dir")).toBe("rtl");
    expect(screen.getByText("الخطوة 1 من 2: البكالوريا")).toBeTruthy();
    const next = screen.getByRole("button", { name: "التالي" });
    expect(next.querySelector("svg")?.getAttribute("class")).toContain("rtl:rotate-180");
  });
});
