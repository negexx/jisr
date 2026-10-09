// @vitest-environment jsdom
import { act, cleanup, screen, waitFor } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { profileStore } from "@/lib/profile/store";
import { profile } from "../../fixtures/domain/builders";
import { coreShard } from "../../lib/profile/core-fixture";
import { forbidConsole } from "../../lib/profile/no-console";
import { clientFor, renderProfileForm, withFixtureClient } from "./helpers";

forbidConsole();

const { track } = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ track }));

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("@/i18n/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/i18n/navigation")>()),
  useRouter: () => ({ push: navigation.push }),
}));

afterEach(() => {
  cleanup();
  profileStore.clear();
  window.localStorage.clear();
  navigation.push.mockClear();
  track.mockClear();
  vi.restoreAllMocks();
});

type User = ReturnType<typeof userEvent.setup>;

const fixtureClient = withFixtureClient();

// track() runs from a passive effect: let pending effects run before asserting that it was not called.
const flushEffects = () => act(async () => {});

async function stepHeading(name: string): Promise<HTMLElement> {
  return screen.findByRole("heading", { level: 2, name });
}

async function completeFixtureForm(user: User) {
  await stepHeading("Your Bac");
  await user.selectOptions(screen.getByRole("combobox", { name: /^Diploma/ }), "xx-test-cred");
  await user.selectOptions(screen.getByRole("combobox", { name: /^Track/ }), "xx-test-track-sci");
  await user.click(screen.getByRole("radio", { name: "Yes, I have my result" }));
  await user.type(screen.getByRole("textbox", { name: /^Overall grade/ }), "14,5");
  await user.click(screen.getByRole("button", { name: "Next" }));
  await stepHeading("Languages");
  const levels = screen.getAllByRole("combobox", { name: /^Your level/ });
  await user.selectOptions(levels[0] as HTMLElement, "B2");
  await user.selectOptions(levels[1] as HTMLElement, "unknown");
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(await screen.findByRole("checkbox", { name: "Test computer science" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  await stepHeading("Budget");
  await user.type(screen.getByRole("textbox", { name: /^Amount you can spend/ }), "800");
  await user.click(screen.getByRole("button", { name: "Next" }));
  await stepHeading("Review");
}

describe("profile form analytics: create mode", () => {
  it("counts profile-started once when the empty form opens", async () => {
    renderProfileForm("en", clientFor(coreShard()));
    await stepHeading("Your Bac");
    await waitFor(() => expect(track).toHaveBeenCalledWith("profile-started"));
    expect(track).toHaveBeenCalledTimes(1);
  });

  it("counts profile-completed only after the profile is saved", async () => {
    const { user } = renderProfileForm("en", fixtureClient());
    await completeFixtureForm(user);
    expect(track).not.toHaveBeenCalledWith("profile-completed");
    await user.click(screen.getByRole("button", { name: "See my matches" }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/matches"));
    await waitFor(() => expect(track).toHaveBeenCalledWith("profile-completed"));
    expect(track).toHaveBeenCalledWith("profile-started");
    expect(track).toHaveBeenCalledTimes(2);
  }, 30_000);

  it("does not count profile-completed when the store refuses the profile", async () => {
    vi.spyOn(profileStore, "save").mockReturnValue({ ok: false, reason: "invalid" });
    const { user } = renderProfileForm("en", fixtureClient());
    await completeFixtureForm(user);
    await user.click(screen.getByRole("button", { name: "See my matches" }));
    await screen.findByRole("alert");
    await flushEffects();
    expect(track).not.toHaveBeenCalledWith("profile-completed");
  }, 30_000);
});

describe("profile form analytics: edit mode", () => {
  it("does not count profile-started when a saved profile is opened for editing", async () => {
    profileStore.save(profile());
    renderProfileForm("en", clientFor(coreShard()));
    await screen.findByRole("heading", { level: 1, name: "Edit your profile" });
    await stepHeading("Your Bac");
    await flushEffects();
    expect(track).not.toHaveBeenCalled();
  });

  it("does not count profile-completed when the edit is saved", async () => {
    profileStore.save(profile());
    const { user } = renderProfileForm("en", clientFor(coreShard()));
    await stepHeading("Your Bac");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await stepHeading("Languages");
    const levels = screen.getAllByRole("combobox", { name: /^Your level/ });
    await user.selectOptions(levels[1] as HTMLElement, "unknown");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await stepHeading("Review");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/matches"));
    await flushEffects();
    expect(track).not.toHaveBeenCalled();
  }, 30_000);
});
