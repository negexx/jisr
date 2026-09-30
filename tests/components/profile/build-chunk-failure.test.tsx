// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { draftFromForm, emptyFormState } from "@/lib/profile/form/state";
import { DRAFT_KEY } from "@/lib/profile/storage";
import { profileStore } from "@/lib/profile/store";
import { coreShard } from "../../lib/profile/core-fixture";
import { forbidConsole } from "../../lib/profile/no-console";
import { clientFor, renderProfileForm } from "./helpers";

forbidConsole();

const build = vi.hoisted(() => ({ attempts: 0 }));
const navigation = vi.hoisted(() => ({ push: vi.fn() }));

// The profile builder is loaded on demand; a flaky connection can make that chunk fail.
vi.mock("@/lib/profile/form/build", () => {
  build.attempts += 1;
  throw new Error("chunk failed to load");
});
vi.mock("@/i18n/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/i18n/navigation")>()),
  useRouter: () => ({ push: navigation.push }),
}));

afterEach(() => {
  cleanup();
  profileStore.clear();
  window.localStorage.clear();
});

function reviewDraft() {
  const form = {
    ...emptyFormState(coreShard()),
    credential: {
      country: "XA",
      type: "xx-test-cred",
      track: "xx-test-track-sci",
      status: "expected" as const,
      overall: "",
      subjects: [],
    },
    languages: [
      { language: "fr", level: "B2" as const, certificate: "" },
      { language: "en", level: "unknown" as const, certificate: "" },
    ],
    fields: ["xx-test-field"],
  };
  window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draftFromForm(form, 4)));
}

describe("the review step when the builder chunk cannot be loaded", () => {
  it("starts loading the chunk when the review step opens", async () => {
    reviewDraft();
    renderProfileForm("en", clientFor(coreShard()));
    await screen.findByRole("heading", { level: 2, name: "Review" });
    await waitFor(() => expect(build.attempts).toBeGreaterThan(0));
  });

  it("tells the student, does not save or leave, and lets them try again", async () => {
    reviewDraft();
    renderProfileForm("en", clientFor(coreShard()));
    await screen.findByRole("heading", { level: 2, name: "Review" });
    const form = document.querySelector("form") as HTMLFormElement;
    const before = build.attempts;

    fireEvent.submit(form);
    expect((await screen.findByRole("alert")).textContent).toBe(
      "We could not save your profile. Please try again.",
    );
    expect(navigation.push).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("jisr.profile")).toBeNull();
    expect(build.attempts).toBeGreaterThan(before);

    // Not stuck: a second tap tries again instead of doing nothing.
    const afterFirst = build.attempts;
    fireEvent.submit(form);
    await waitFor(() => expect(build.attempts).toBeGreaterThan(afterFirst));
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});
