// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AUTOSAVE_DELAY_MS } from "@/components/profile/use-draft-autosave";
import { parseDraft } from "@/lib/profile/draft-validate";
import { draftFromForm, emptyFormState } from "@/lib/profile/form/state";
import { DRAFT_KEY, PROFILE_KEY } from "@/lib/profile/storage";
import { profileStore } from "@/lib/profile/store";
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

function combobox(name: RegExp): HTMLSelectElement {
  const element = screen.getByRole("combobox", { name });
  if (!(element instanceof HTMLSelectElement)) throw new Error("not a select");
  return element;
}

function textbox(name: RegExp): HTMLInputElement {
  const element = screen.getByRole("textbox", { name });
  if (!(element instanceof HTMLInputElement)) throw new Error("not an input");
  return element;
}

const stepHeading = (name: string) => screen.findByRole("heading", { level: 2, name });
const settle = () =>
  act(() => new Promise((resolve) => setTimeout(resolve, AUTOSAVE_DELAY_MS + 150)));
const storedDraft = () => parseDraft(JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? "null"));
const overall = () => textbox(/^Overall grade/);

async function next(user: User) {
  await user.click(screen.getByRole("button", { name: "Next" }));
}

describe("Clear my data while the form is open", () => {
  it("empties the form and never writes the old answers back (create mode, write pending)", async () => {
    renderProfileForm("en", clientFor(coreShard()));
    await stepHeading("Your Bac");
    fireEvent.change(overall(), { target: { value: "12" } });
    act(() => profileStore.clear());
    await settle();
    expect(overall().value).toBe("");
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(window.localStorage.getItem(PROFILE_KEY)).toBeNull();
  });

  it("empties the form after a draft was already written", async () => {
    renderProfileForm("en", clientFor(coreShard()));
    await stepHeading("Your Bac");
    fireEvent.change(overall(), { target: { value: "12" } });
    await settle();
    expect(storedDraft()?.credential?.overall?.value).toBe("12");
    act(() => profileStore.clear());
    await settle();
    expect(overall().value).toBe("");
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("goes back to create mode when the saved profile is cleared", async () => {
    profileStore.save(profile());
    renderProfileForm("en", clientFor(coreShard()));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Edit your profile" }),
    ).toBeTruthy();
    await screen.findByRole("heading", { level: 2, name: "Your Bac" });
    fireEvent.change(overall(), { target: { value: "13" } });
    act(() => profileStore.clear());
    await settle();
    expect(
      await screen.findByRole("heading", { level: 1, name: "Create your profile" }),
    ).toBeTruthy();
    expect(overall().value).toBe("");
    expect(window.localStorage.getItem(PROFILE_KEY)).toBeNull();
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("does not reset the form when only the removed-profile notice is dismissed", async () => {
    window.localStorage.setItem(PROFILE_KEY, "{not json");
    const { user } = renderProfileForm("en", clientFor(coreShard()));
    await stepHeading("Your Bac");
    fireEvent.change(overall(), { target: { value: "12" } });
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(overall().value).toBe("12");
  });
});

describe("a draft that returns to its baseline is removed", () => {
  it("create mode: typing then emptying the field leaves no draft", async () => {
    renderProfileForm("en", clientFor(coreShard()));
    await stepHeading("Your Bac");
    fireEvent.change(overall(), { target: { value: "1" } });
    await settle();
    expect(window.localStorage.getItem(DRAFT_KEY)).not.toBeNull();
    fireEvent.change(overall(), { target: { value: "" } });
    await settle();
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("edit mode: changing a value and changing it back leaves no draft", async () => {
    profileStore.save(profile());
    renderProfileForm("en", clientFor(coreShard()));
    await screen.findByRole("heading", { level: 1, name: "Edit your profile" });
    await screen.findByRole("heading", { level: 2, name: "Your Bac" });
    fireEvent.change(overall(), { target: { value: "15" } });
    await settle();
    expect(storedDraft()?.credential?.overall?.value).toBe("15");
    fireEvent.change(overall(), { target: { value: "14" } });
    await settle();
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
  });
});

describe("draft flush when the page is hidden", () => {
  it("writes the pending draft on pagehide", async () => {
    renderProfileForm("en", clientFor(coreShard()));
    await stepHeading("Your Bac");
    fireEvent.change(overall(), { target: { value: "11" } });
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(storedDraft()?.credential?.overall?.value).toBe("11");
  });

  it("writes the pending draft when the tab becomes hidden", async () => {
    renderProfileForm("en", clientFor(coreShard()));
    await stepHeading("Your Bac");
    fireEvent.change(overall(), { target: { value: "10" } });
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(storedDraft()?.credential?.overall?.value).toBe("10");
  });
});

describe("error summary", () => {
  it("is not a live region, holds focus with a heading, and stays as it was at the failed attempt", async () => {
    const { user } = renderProfileForm("en", fixtureClient());
    await stepHeading("Your Bac");
    await next(user);
    const heading = screen.getByRole("heading", { level: 2, name: "Please fix these" });
    const summary = heading.parentElement as HTMLElement;
    expect(summary.getAttribute("role")).toBeNull();
    expect(document.querySelector("[role='alert']")).toBeNull();
    expect(summary.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(summary);

    const before = within(summary)
      .getAllByRole("link")
      .map((link) => link.textContent);
    await user.selectOptions(combobox(/^Diploma/), "xx-test-cred");
    expect(combobox(/^Diploma/).getAttribute("aria-invalid")).toBeNull();
    const after = within(summary)
      .getAllByRole("link")
      .map((link) => link.textContent);
    expect(after).toEqual(before);
  });

  it("names the field once in French, with a single colon", async () => {
    const { user } = renderProfileForm("fr", fixtureClient());
    await screen.findByRole("heading", { level: 2, name: "Votre Bac" });
    await user.click(screen.getByRole("button", { name: "Suivant" }));
    const links = screen.getAllByRole("link").map((link) => link.textContent ?? "");
    expect(links).toContain("Situation du Bac : Choisissez une réponse");
    for (const text of links) expect(text).not.toMatch(/\?\s* ?:/);
  });
});

describe("fact notes describe the text that is shown", () => {
  const MACHINE = /تمت ترجمته تلقائيًا/;

  it("shows a note for the selected country only, and none when nothing is selected", async () => {
    const { user } = renderProfileForm("ar", fixtureClient());
    await screen.findByRole("heading", { level: 2, name: "البكالوريا" });
    const nationality = screen.getByRole("combobox", { name: /^الجنسية/ });
    expect(screen.getAllByText(MACHINE).length).toBeGreaterThan(0);
    await user.selectOptions(nationality, "XB");
    const field = nationality.closest("div") as HTMLElement;
    expect(within(field).queryByText(MACHINE)).toBeNull();
    await user.selectOptions(nationality, "");
    expect(within(field).queryByText(MACHINE)).toBeNull();
  });

  it("has no note element and no dangling aria-describedby when there is nothing to say", async () => {
    renderProfileForm("en", fixtureClient());
    await stepHeading("Your Bac");
    for (const paragraph of document.querySelectorAll("p[id$='-note']")) {
      expect(paragraph.textContent?.trim()).not.toBe("");
    }
    for (const element of document.querySelectorAll("[aria-describedby]")) {
      for (const id of (element.getAttribute("aria-describedby") ?? "").split(" ")) {
        expect(document.getElementById(id), id).not.toBeNull();
      }
    }
  });
});

describe("official names and glosses", () => {
  it("lists only the isolated official name in the diploma select and shows the gloss below", async () => {
    const { user } = renderProfileForm("en", fixtureClient());
    await stepHeading("Your Bac");
    const select = combobox(/^Diploma/);
    const labels = within(select)
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(labels).toEqual(["Choose", "⁨XX Test Credential⁩"]);
    await user.selectOptions(select, "xx-test-cred");
    const field = select.closest("div") as HTMLElement;
    expect(within(field).getByText("XX Test Credential").tagName).toBe("BDI");
    expect(within(field).getByText(/Test diploma/)).toBeTruthy();
  });

  it("wraps official names and glosses in bdi on the review step", async () => {
    const draft = draftFromForm(
      {
        ...emptyFormState(coreShard()),
        credential: {
          country: "XA",
          type: "xx-test-cred",
          track: "xx-test-track-sci",
          status: "expected",
          overall: "",
          subjects: [],
        },
        languages: [
          { language: "fr", level: "B2", certificate: "xx-test-cert-fr" },
          { language: "en", level: "unknown", certificate: "" },
        ],
      },
      4,
    );
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    renderProfileForm("en", clientFor(coreShard()));
    await stepHeading("Review");
    expect(screen.getByText("XX Test Credential").tagName).toBe("BDI");
    expect(screen.getByText(/XX French test/).closest("bdi")).not.toBeNull();
  });
});

describe("review with an old or tampered draft", () => {
  function reviewDraft(change: (form: ReturnType<typeof emptyFormState>) => void) {
    const form = emptyFormState(coreShard());
    change(form);
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draftFromForm(form, 2)));
  }

  it("shows Not given for empty nationality, years and subject", async () => {
    reviewDraft((form) => {
      form.nationality = "";
      form.priorHigherEducationYears = "";
      form.credential.subjects = [{ subject: "", grade: "" }];
    });
    renderProfileForm("en", clientFor(coreShard()));
    await stepHeading("Review");
    const row = (label: string) =>
      screen.getByText(label, { selector: "dt" }).parentElement as HTMLElement;
    expect(within(row("Nationality")).getByText("Not given")).toBeTruthy();
    expect(
      within(row("Years of higher education already done")).getByText("Not given"),
    ).toBeTruthy();
    expect(within(row("Subject grades")).getAllByText("Not given").length).toBeGreaterThan(0);
  });
});

describe("smaller behaviours", () => {
  it("gives the subject group an id that a summary link can focus", async () => {
    renderProfileForm("en", fixtureClient());
    await stepHeading("Your Bac");
    const group = document.getElementById("field-credential-subjects");
    expect(group?.tagName).toBe("FIELDSET");
    expect(group?.getAttribute("tabindex")).toBe("-1");
    expect(document.querySelectorAll("#field-fields, #field-institutionType").length).toBe(0);
  });

  it("closes the draft notice on the first step change", async () => {
    const draft = draftFromForm(
      {
        ...emptyFormState(coreShard()),
        credential: {
          country: "XA",
          type: "xx-test-cred",
          track: "xx-test-track-sci",
          status: "expected",
          overall: "",
          subjects: [],
        },
      },
      0,
    );
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    const { user } = renderProfileForm("en", clientFor(coreShard()));
    await stepHeading("Your Bac");
    expect(screen.getByText(/We kept your unfinished answers/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Next" }));
    await stepHeading("Languages");
    expect(screen.queryByText(/We kept your unfinished answers/)).toBeNull();
  });

  it("draws one segment per step and fills them on the review", async () => {
    const draft = draftFromForm(emptyFormState(coreShard()), 2);
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    renderProfileForm("en", clientFor(coreShard()));
    await stepHeading("Review");
    const segments = document.querySelectorAll("[aria-hidden='true'].flex > span");
    expect(segments).toHaveLength(2);
    expect([...segments].every((segment) => segment.className.includes("bg-primary"))).toBe(true);
  });

  it("saves once when the form is submitted twice in a row", async () => {
    const draft = draftFromForm(
      {
        ...emptyFormState(coreShard()),
        credential: {
          country: "XA",
          type: "xx-test-cred",
          track: "xx-test-track-sci",
          status: "expected",
          overall: "",
          subjects: [],
        },
        languages: [
          { language: "fr", level: "B2", certificate: "" },
          { language: "en", level: "unknown", certificate: "" },
        ],
      },
      2,
    );
    const save = vi.spyOn(profileStore, "save");
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    renderProfileForm("en", clientFor(coreShard()));
    await stepHeading("Review");
    const form = document.querySelector("form") as HTMLFormElement;
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(navigation.push).toHaveBeenCalled());
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(navigation.push).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(1);
  });
});

describe("before hydration", () => {
  it("renders a neutral title and the page grid on the server", async () => {
    const { NextIntlClientProvider } = await import("next-intl");
    const { ProfileForm } = await import("@/components/profile/profile-form");
    const messages = (await import("../../../messages/en.json")).default;
    const html = renderToString(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <ProfileForm locale="en" client={clientFor(coreShard())} />
      </NextIntlClientProvider>,
    );
    expect(html).toContain("Your profile");
    expect(html).not.toContain("Create your profile");
    expect(html).not.toContain("Edit your profile");
    expect(html).toContain("lg:grid-cols-");
  });
});
