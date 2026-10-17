// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AUTOSAVE_DELAY_MS } from "@/components/profile/use-draft-autosave";
import { clearAccountLocalState, setSessionHint } from "@/lib/auth/session-hint";
import { parseDraft } from "@/lib/profile/draft-validate";
import { DRAFT_KEY, PROFILE_KEY } from "@/lib/profile/storage";
import { profileStore } from "@/lib/profile/store";
import { parseProfile } from "@/lib/profile/validate";
import { profile } from "../../fixtures/domain/builders";
import { coreShard } from "../../lib/profile/core-fixture";
import { forbidConsole } from "../../lib/profile/no-console";
import { clientFor, renderProfileForm, withFixtureClient } from "./helpers";

forbidConsole();

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("@/i18n/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/i18n/navigation")>()),
  useRouter: () => ({ push: navigation.push }),
}));

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  profileStore.clear();
  window.localStorage.clear();
  navigation.push.mockClear();
});

type User = ReturnType<typeof userEvent.setup>;

const fixtureClient = withFixtureClient();

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
  await stepHeading("Review");
}

describe("final submit after the device signed out while the form was open", () => {
  it("does not save answers given signed in into the guest's own profile", async () => {
    // The guest's own profile, unclaimed, waits under the guest key while the account is signed in.
    const guest = JSON.stringify(profile());
    window.localStorage.setItem(PROFILE_KEY, guest);
    setSessionHint();
    const { user } = renderProfileForm("en", fixtureClient());
    await completeFixtureForm(user);
    act(() => clearAccountLocalState());

    await user.click(screen.getByRole("button", { name: "See my matches" }));

    expect(
      await screen.findByText("We could not save your profile. Please try again."),
    ).toBeTruthy();
    expect(window.localStorage.getItem(PROFILE_KEY)).toBe(guest);
    expect(navigation.push).not.toHaveBeenCalled();
  });
});

describe("final submit", () => {
  it("saves the profile in the browser only, then goes to the matches page", async () => {
    const { user } = renderProfileForm("en", fixtureClient());
    await completeFixtureForm(user);
    await user.click(screen.getByRole("button", { name: "See my matches" }));

    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/matches"));
    expect(navigation.push).toHaveBeenCalledTimes(1);
    const stored = parseProfile(JSON.parse(window.localStorage.getItem(PROFILE_KEY) ?? "null"));
    expect(stored?.credential.overall?.value).toBe(14.5);
    expect(stored?.credential.type).toBe("xx-test-cred");
    expect(stored?.languages.map((row) => row.language)).toEqual(["fr", "en"]);
    expect(profileStore.getSnapshot().status).toBe("ok");
  });

  it("puts no answer in the URL, the title or the console", async () => {
    const { user } = renderProfileForm("en", fixtureClient());
    const titleBefore = document.title;
    await completeFixtureForm(user);
    await user.click(screen.getByRole("button", { name: "See my matches" }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/matches"));
    expect(window.location.href).not.toMatch(/14|800|XA|xx-test/);
    expect(window.location.search).toBe("");
    expect(document.title).toBe(titleBefore);
    expect(document.querySelectorAll("[data-value], [data-grade]")).toHaveLength(0);
  });

  it("goes back to the step of a problem instead of saving", async () => {
    const { user } = renderProfileForm("en", fixtureClient());
    await completeFixtureForm(user);
    await user.click(screen.getByRole("button", { name: "Edit: Your Bac" }));
    await stepHeading("Your Bac");
    fireEvent.change(screen.getByRole("textbox", { name: /^Overall grade/ }), {
      target: { value: "99" },
    });
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect((await screen.findAllByText("Enter a grade between 0 and 20")).length).toBeGreaterThan(
      0,
    );
    expect(navigation.push).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(PROFILE_KEY)).toBeNull();
  });

  it("shows a plain message and does not leave when the store refuses the profile", async () => {
    vi.spyOn(profileStore, "save").mockReturnValue({ ok: false, reason: "invalid" });
    const { user } = renderProfileForm("en", fixtureClient());
    await completeFixtureForm(user);
    await user.click(screen.getByRole("button", { name: "See my matches" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "We could not save your profile. Please try again.",
    );
    expect(navigation.push).not.toHaveBeenCalled();
  });
});

describe("edit mode", () => {
  it("prefills the saved profile and reads Save changes on the last step", async () => {
    profileStore.save(profile());
    const { user } = renderProfileForm("en", clientFor(coreShard()));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Edit your profile" }),
    ).toBeTruthy();
    await screen.findByRole("heading", { level: 2, name: "Your Bac" });
    expect(
      (screen.getByRole("textbox", { name: /^Overall grade/ }) as HTMLInputElement).value,
    ).toBe("14");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await stepHeading("Languages");
    const levels = screen.getAllByRole("combobox", { name: /^Your level/ }) as HTMLSelectElement[];
    expect(levels[0]?.value).toBe("B2");
    await user.selectOptions(levels[1] as HTMLElement, "unknown");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await stepHeading("Review");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/matches"));
    const stored = parseProfile(JSON.parse(window.localStorage.getItem(PROFILE_KEY) ?? "null"));
    expect(stored?.languages.map((row) => row.level)).toEqual(["B2", "unknown"]);
  });
});

describe("draft autosave", () => {
  async function ready() {
    const view = renderProfileForm("en", clientFor(coreShard()));
    await stepHeading("Your Bac");
    return view;
  }

  it("writes nothing while the form is untouched", async () => {
    await ready();
    vi.useFakeTimers();
    act(() => vi.advanceTimersByTime(5000));
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("writes a valid draft 400 ms after the last change", async () => {
    await ready();
    vi.useFakeTimers();
    const overall = screen.getByRole("textbox", { name: /^Overall grade/ });
    fireEvent.change(overall, { target: { value: "1" } });
    act(() => vi.advanceTimersByTime(AUTOSAVE_DELAY_MS - 100));
    fireEvent.change(overall, { target: { value: "12,5" } });
    act(() => vi.advanceTimersByTime(AUTOSAVE_DELAY_MS - 100));
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
    act(() => vi.advanceTimersByTime(100));
    const draft = parseDraft(JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? "null"));
    expect(draft?.credential?.overall).toEqual({ scale: "", value: "12,5" });
    expect(draft?.step).toBe(0);
  });

  it("writes at once when the step changes, and the saved profile removes the draft for good", async () => {
    const { user } = await ready();
    fireEvent.change(screen.getByRole("combobox", { name: /^Diploma/ }), {
      target: { value: "xx-test-cred" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: /^Track/ }), {
      target: { value: "xx-test-track-lit" },
    });
    await user.click(screen.getByRole("radio", { name: "Not yet, I am taking it this year" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await stepHeading("Languages");
    expect(parseDraft(JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? "null"))?.step).toBe(1);

    const levels = screen.getAllByRole("combobox", { name: /^Your level/ });
    await user.selectOptions(levels[0] as HTMLElement, "B2");
    await user.selectOptions(levels[1] as HTMLElement, "unknown");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await stepHeading("Review");
    await user.click(screen.getByRole("button", { name: "See my matches" }));

    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/matches"));
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, AUTOSAVE_DELAY_MS + 100));
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("keeps working when the device refuses the write", async () => {
    await ready();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    vi.useFakeTimers();
    fireEvent.change(screen.getByRole("textbox", { name: /^Overall grade/ }), {
      target: { value: "13" },
    });
    act(() => vi.advanceTimersByTime(AUTOSAVE_DELAY_MS));
    expect(
      (screen.getByRole("textbox", { name: /^Overall grade/ }) as HTMLInputElement).value,
    ).toBe("13");
  });
});

describe("Arabic flow", () => {
  it("shows the errors in Arabic with the scale bounds as Latin digits", async () => {
    const { user } = renderProfileForm("ar", fixtureClient());
    await screen.findByRole("heading", { level: 2, name: "البكالوريا" });
    await user.selectOptions(screen.getByRole("combobox", { name: /^الشهادة/ }), "xx-test-cred");
    await user.selectOptions(
      screen.getByRole("combobox", { name: /^المسلك/ }),
      "xx-test-track-sci",
    );
    await user.click(screen.getByRole("radio", { name: "نعم، لدي النتيجة" }));
    await user.type(screen.getByRole("textbox", { name: /^المعدل العام/ }), "25");
    await user.click(screen.getByRole("button", { name: "التالي" }));
    expect(screen.getAllByText("أدخل علامة بين 0 و20").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("heading", { level: 2, name: "يرجى تصحيح ما يلي" }).parentElement
        ?.textContent,
    ).not.toMatch(/[٠-٩]/);
    expect(screen.getByTestId("dir-root").getAttribute("dir")).toBe("rtl");
  });
});
