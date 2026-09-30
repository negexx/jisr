// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CoreShard } from "@/data-schema/snapshot";
import { profileStore } from "@/lib/profile/store";
import { credentialType } from "../../fixtures/domain/builders";
import { coreShard } from "../../lib/profile/core-fixture";
import { forbidConsole } from "../../lib/profile/no-console";
import { clientFor, renderProfileForm, textFor, withFixtureClient } from "./helpers";

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

async function stepHeading(name: string): Promise<HTMLElement> {
  return screen.findByRole("heading", { level: 2, name });
}

async function fillBac(user: User, overall = "14,5") {
  await user.selectOptions(combobox(/^Diploma/), "xx-test-cred");
  await user.selectOptions(combobox(/^Track/), "xx-test-track-sci");
  await user.click(screen.getByRole("radio", { name: "Yes, I have my result" }));
  await user.type(textbox(/^Overall grade/), overall);
}

async function fillLanguages(user: User) {
  const levels = screen.getAllByRole("combobox", { name: /^Your level/ });
  await user.selectOptions(levels[0] as HTMLElement, "B2");
  await user.selectOptions(levels[1] as HTMLElement, "unknown");
}

async function next(user: User) {
  await user.click(screen.getByRole("button", { name: "Next" }));
}

async function toReview(user: User) {
  await stepHeading("Your Bac");
  await fillBac(user);
  await next(user);
  await stepHeading("Languages");
  await fillLanguages(user);
  await next(user);
  await stepHeading("What you want");
  await user.click(screen.getByRole("checkbox", { name: "Test computer science" }));
  await next(user);
  await stepHeading("Budget");
  await next(user);
  await stepHeading("Review");
}

describe("step navigation", () => {
  it("does not advance on an invalid step: inline errors, a summary, and focus on the summary", async () => {
    const { user } = renderProfileForm("en", fixtureClient());
    await stepHeading("Your Bac");
    await next(user);

    const summary = screen.getByRole("alert");
    expect(within(summary).getByRole("heading", { name: "Please fix these" })).toBeTruthy();
    expect(document.activeElement).toBe(summary);
    expect(screen.getByRole("heading", { level: 2, name: "Your Bac" })).toBeTruthy();

    const diploma = combobox(/^Diploma/);
    expect(diploma.getAttribute("aria-invalid")).toBe("true");
    const describedBy = diploma.getAttribute("aria-describedby") ?? "";
    const errorId = describedBy.split(" ").find((id) => id.endsWith("-error")) ?? "";
    expect(document.getElementById(errorId)?.textContent).toBe("Choose an answer");
  });

  it("links the summary to the offending fields and focuses them", async () => {
    const { user } = renderProfileForm("en", fixtureClient());
    await stepHeading("Your Bac");
    await next(user);
    const links = within(screen.getByRole("alert")).getAllByRole("link");
    expect(links.length).toBeGreaterThanOrEqual(3);
    expect(links.map((link) => link.textContent)).toContain("Diploma: Choose an answer");
    expect(links.map((link) => link.textContent)).toContain("Track: Choose an answer");
    await user.click(links[0] as HTMLElement);
    expect(document.activeElement?.tagName).toBe("SELECT");
    expect(document.activeElement).toBe(combobox(/^Diploma/));
    expect(window.location.hash).toBe("");
  });

  it("shows one message per field even when a field has two issues", async () => {
    const { user } = renderProfileForm("en", fixtureClient());
    await stepHeading("Your Bac");
    await fillBac(user);
    await user.click(screen.getByRole("button", { name: "Add a subject" }));
    await user.click(screen.getByRole("button", { name: "Add a subject" }));
    await next(user);
    const links = within(screen.getByRole("alert")).getAllByRole("link");
    const targets = links.map((link) => link.getAttribute("href"));
    expect(new Set(targets).size).toBe(targets.length);
  });

  it("moves to the next step, focuses its heading and announces the progress", async () => {
    const { user } = renderProfileForm("en", fixtureClient());
    await stepHeading("Your Bac");
    await fillBac(user);
    await next(user);
    const heading = await stepHeading("Languages");
    expect(document.activeElement).toBe(heading);
    expect(screen.getByText("Step 2 of 4: Languages", { selector: "[aria-live]" })).toBeTruthy();
  });

  it("Back never loses data", async () => {
    const { user } = renderProfileForm("en", fixtureClient());
    await stepHeading("Your Bac");
    await fillBac(user);
    await next(user);
    await stepHeading("Languages");
    await fillLanguages(user);
    await user.click(screen.getByRole("button", { name: "Back" }));
    await stepHeading("Your Bac");
    expect(textbox(/^Overall grade/).value).toBe("14,5");
    expect(combobox(/^Track/).value).toBe("xx-test-track-sci");
    await next(user);
    await stepHeading("Languages");
    const levels = screen.getAllByRole("combobox", { name: /^Your level/ }) as HTMLSelectElement[];
    expect(levels.map((level) => level.value)).toEqual(["B2", "unknown"]);
  });

  it("Enter in a field advances a valid step", async () => {
    const { user } = renderProfileForm("en", fixtureClient());
    await stepHeading("Your Bac");
    await user.selectOptions(combobox(/^Diploma/), "xx-test-cred");
    await user.selectOptions(combobox(/^Track/), "xx-test-track-sci");
    await user.click(screen.getByRole("radio", { name: "Yes, I have my result" }));
    await user.type(textbox(/^Overall grade/), "14{Enter}");
    expect(await stepHeading("Languages")).toBeTruthy();
  });

  it("is one form that never submits by GET and has no native validation", async () => {
    renderProfileForm("en", fixtureClient());
    await stepHeading("Your Bac");
    const forms = document.querySelectorAll("form");
    expect(forms).toHaveLength(1);
    expect(forms[0]?.hasAttribute("novalidate")).toBe(true);
    expect(document.querySelector("[method='get' i], [method='GET']")).toBeNull();
    expect(forms[0]?.getAttribute("method")).toBeNull();
    expect(forms[0]?.getAttribute("action")).toBeNull();
  });
});

describe("grade entry", () => {
  it("names the scale bounds when the grade is out of range", async () => {
    const { user } = renderProfileForm("en", fixtureClient());
    await stepHeading("Your Bac");
    await fillBac(user, "25");
    await next(user);
    expect(screen.getAllByText("Enter a grade between 0 and 20").length).toBeGreaterThan(0);
  });

  it("explains the 1,000 ambiguity and accepts 14,5", async () => {
    const { user } = renderProfileForm("en", fixtureClient());
    await stepHeading("Your Bac");
    await fillBac(user, "1,000");
    await next(user);
    expect(
      screen.getAllByText(/without thousands separators \(for example 14,5\)/).length,
    ).toBeGreaterThan(0);
    await user.clear(textbox(/^Overall grade/));
    await user.type(textbox(/^Overall grade/), "14,5");
    await next(user);
    expect(await stepHeading("Languages")).toBeTruthy();
  });

  it("shows the scale as a /20 suffix and keeps the input left-to-right", async () => {
    const { user } = renderProfileForm("en", fixtureClient());
    await stepHeading("Your Bac");
    const input = textbox(/^Overall grade/);
    expect(input.getAttribute("inputmode")).toBe("decimal");
    expect(input.getAttribute("autocomplete")).toBe("off");
    expect(input.closest("[dir='ltr']")).not.toBeNull();
    await user.selectOptions(combobox(/^Diploma/), "xx-test-cred");
    expect(screen.getByText("/ 20")).toBeTruthy();
  });

  it("makes the overall grade optional while the Bac is expected", async () => {
    const { user } = renderProfileForm("en", fixtureClient());
    await stepHeading("Your Bac");
    const label = () => screen.getByText(/^Overall grade/, { selector: "label" });
    expect(label().textContent).toContain("required");
    await user.click(screen.getByRole("radio", { name: "Not yet, I am taking it this year" }));
    expect(label().textContent).toContain("optional");
    await user.selectOptions(combobox(/^Diploma/), "xx-test-cred");
    await user.selectOptions(combobox(/^Track/), "xx-test-track-sci");
    await next(user);
    expect(await stepHeading("Languages")).toBeTruthy();
  });

  it("tells a student who typed Arabic-Indic digits to use 0 to 9", async () => {
    const { user } = renderProfileForm("ar", fixtureClient());
    await screen.findByRole("heading", { level: 2, name: "البكالوريا" });
    const input = screen.getByRole("textbox", { name: /^المعدل العام/ });
    await user.type(input, "١٤");
    expect(screen.getAllByText(/الأرقام اللاتينية/).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "التالي" }));
    expect(screen.getAllByText(/بالأرقام من 0 إلى 9/).length).toBeGreaterThan(0);
  });
});

function coreWithChemistry(): CoreShard {
  const base = coreShard();
  return {
    ...base,
    subjects: [...base.subjects, { slug: "xx-test-chem", name: "subjects/xx-test-chem#name" }],
    credentialTypes: [
      credentialType({
        tracks: [
          {
            slug: "xx-test-track-sci",
            name: "XX Sci",
            gloss: null,
            subjects: ["xx-test-math", "xx-test-physics"],
          },
          { slug: "xx-test-track-lit", name: "XX Lit", gloss: null, subjects: null },
        ],
      }),
    ],
  };
}

describe("subject rows", () => {
  it("adds a row with focus on its subject, removes it, and puts focus somewhere useful", async () => {
    const { user } = renderProfileForm("en", fixtureClient());
    await stepHeading("Your Bac");
    await user.selectOptions(combobox(/^Diploma/), "xx-test-cred");
    await user.selectOptions(combobox(/^Track/), "xx-test-track-sci");
    await user.click(screen.getByRole("button", { name: "Add a subject" }));
    expect(document.activeElement).toBe(combobox(/^Subject/));
    await user.click(screen.getByRole("button", { name: "Remove subject 1" }));
    expect(screen.queryByRole("combobox", { name: /^Subject/ })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Add a subject" }));
  });

  it("stops offering rows at the cap and says so", async () => {
    const subjects = Array.from({ length: 9 }, (_, index) => ({
      slug: `xx-test-s${index}`,
      name: `subjects/xx-test-s${index}#name`,
    }));
    const core: CoreShard = {
      ...coreShard(),
      subjects,
      credentialTypes: [
        credentialType({
          tracks: [{ slug: "xx-test-track-lit", name: "XX Lit", gloss: null, subjects: null }],
        }),
      ],
    };
    const { user } = renderProfileForm("en", clientFor(core));
    await stepHeading("Your Bac");
    await user.selectOptions(combobox(/^Diploma/), "xx-test-cred");
    await user.selectOptions(combobox(/^Track/), "xx-test-track-lit");
    for (let index = 0; index < 8; index += 1) {
      await user.click(screen.getByRole("button", { name: "Add a subject" }));
    }
    expect(screen.queryByRole("button", { name: "Add a subject" })).toBeNull();
    expect(screen.getByText("You can add up to 8 subjects.")).toBeTruthy();
    expect(screen.getAllByRole("combobox", { name: /^Subject/ })).toHaveLength(8);
  });

  it("keeps a chosen subject visible after the track changes and marks it", async () => {
    const { user } = renderProfileForm(
      "en",
      clientFor(coreWithChemistry(), textFor("en", { "subjects/xx-test-chem#name": "Chemistry" })),
    );
    await stepHeading("Your Bac");
    await user.selectOptions(combobox(/^Diploma/), "xx-test-cred");
    await user.selectOptions(combobox(/^Track/), "xx-test-track-lit");
    await user.click(screen.getByRole("button", { name: "Add a subject" }));
    await user.selectOptions(combobox(/^Subject/), "xx-test-chem");
    await user.selectOptions(combobox(/^Track/), "xx-test-track-sci");
    const subject = combobox(/^Subject/);
    expect(subject.value).toBe("xx-test-chem");
    expect(subject.selectedOptions[0]?.textContent).toBe("Chemistry (not in your track)");
  });
});

describe("languages step", () => {
  it("lists only the certificates of the row's language", async () => {
    const { user } = renderProfileForm("en", fixtureClient());
    await stepHeading("Your Bac");
    await fillBac(user);
    await next(user);
    await stepHeading("Languages");
    const certificates = screen.getAllByRole("combobox", { name: /^Certificate/ });
    const optionsOf = (select: HTMLElement) =>
      within(select)
        .getAllByRole("option")
        .map((option) => option.textContent);
    expect(optionsOf(certificates[0] as HTMLElement)).toEqual([
      "No certificate",
      "XX Test French Certificate",
    ]);
    expect(optionsOf(certificates[1] as HTMLElement)).toEqual([
      "No certificate",
      "XX Test English Certificate",
    ]);
  });

  it("offers no extra language when core has no other certificate language", async () => {
    const { user } = renderProfileForm("en", fixtureClient());
    await stepHeading("Your Bac");
    await fillBac(user);
    await next(user);
    await stepHeading("Languages");
    expect(screen.queryByRole("button", { name: "Add another language" })).toBeNull();
  });

  it("adds and removes another language when core has a German certificate", async () => {
    const core: CoreShard = {
      ...coreShard(),
      languageCertificates: [
        ...coreShard().languageCertificates,
        {
          slug: "xx-test-cert-de",
          name: "XX German",
          language: "de",
          url: "https://example.org/de",
        },
      ],
    };
    const { user } = renderProfileForm("en", clientFor(core));
    await stepHeading("Your Bac");
    await user.selectOptions(combobox(/^Diploma/), "xx-test-cred");
    await user.selectOptions(combobox(/^Track/), "xx-test-track-sci");
    await user.click(screen.getByRole("radio", { name: "Not yet, I am taking it this year" }));
    await next(user);
    await stepHeading("Languages");
    await user.click(screen.getByRole("button", { name: "Add another language" }));
    expect(document.activeElement).toBe(combobox(/^Language/));
    expect(screen.getByRole("heading", { level: 3, name: "German" })).toBeTruthy();
    const certificate = screen.getAllByRole("combobox", { name: /^Certificate/ })[2] as HTMLElement;
    expect(
      within(certificate)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["No certificate", "XX German"]);
    await user.click(screen.getByRole("button", { name: "Remove German" }));
    expect(screen.queryByRole("heading", { level: 3, name: "German" })).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Add another language" }),
    );
  });

  it("treats I don't know as a real level", async () => {
    const { user } = renderProfileForm("en", fixtureClient());
    await stepHeading("Your Bac");
    await fillBac(user);
    await next(user);
    await stepHeading("Languages");
    await fillLanguages(user);
    await next(user);
    expect(await stepHeading("What you want")).toBeTruthy();
  });
});

describe("preferences and budget", () => {
  it("needs at least one field of study", async () => {
    const { user } = renderProfileForm("en", fixtureClient());
    await stepHeading("Your Bac");
    await fillBac(user);
    await next(user);
    await stepHeading("Languages");
    await fillLanguages(user);
    await next(user);
    await stepHeading("What you want");
    await next(user);
    expect(screen.getAllByText("Choose at least one field of study").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("checkbox", { name: "Test computer science" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    await next(user);
    expect(await stepHeading("Budget")).toBeTruthy();
  });

  it("rejects 10.000 as a budget with the whole-number message", async () => {
    const { user } = renderProfileForm("en", fixtureClient());
    await stepHeading("Your Bac");
    await fillBac(user);
    await next(user);
    await stepHeading("Languages");
    await fillLanguages(user);
    await next(user);
    await user.click(await screen.findByRole("checkbox", { name: "Test computer science" }));
    await next(user);
    await stepHeading("Budget");
    const amount = textbox(/^Amount you can spend/);
    expect(amount.getAttribute("inputmode")).toBe("numeric");
    await user.type(amount, "10.000");
    await next(user);
    expect(
      screen.getAllByText(/Write the amount as a whole number, without dots or commas/).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { level: 2, name: "Budget" })).toBeTruthy();
  });

  it("says a budget above the cap is too large, not out of a range", async () => {
    const { user } = renderProfileForm("en", fixtureClient());
    await stepHeading("Your Bac");
    await fillBac(user);
    await next(user);
    await stepHeading("Languages");
    await fillLanguages(user);
    await next(user);
    await user.click(await screen.findByRole("checkbox", { name: "Test computer science" }));
    await next(user);
    await stepHeading("Budget");
    await user.type(textbox(/^Amount you can spend/), "12345678");
    await next(user);
    expect(
      screen.getAllByText("Enter an amount of 9999999 at most, as a whole number").length,
    ).toBeGreaterThan(0);
  });

  it("shows the MAD note only for MAD and always says the budget never hides programs", async () => {
    const { user } = renderProfileForm("en", fixtureClient());
    await stepHeading("Your Bac");
    await fillBac(user);
    await next(user);
    await stepHeading("Languages");
    await fillLanguages(user);
    await next(user);
    await user.click(await screen.findByRole("checkbox", { name: "Test computer science" }));
    await next(user);
    await stepHeading("Budget");
    expect(screen.getByText(/Your budget never hides a program/)).toBeTruthy();
    expect(screen.queryByText(/cannot be compared with the costs in euros yet/)).toBeNull();
    await user.selectOptions(combobox(/^Currency/), "MAD");
    expect(screen.getByText(/cannot be compared with the costs in euros yet/)).toBeTruthy();
  });

  it("accepts an empty budget", async () => {
    const { user } = renderProfileForm("en", fixtureClient());
    await toReview(user);
    expect(screen.getAllByText("Not given", { selector: "dd" }).length).toBeGreaterThan(0);
  });
});

describe("review", () => {
  it("lists the answers and sends Edit back to the step with data kept", async () => {
    const { user } = renderProfileForm("en", fixtureClient());
    await toReview(user);
    expect(screen.getByText("14.5 / 20")).toBeTruthy();
    expect(screen.getByText("What is saved")).toBeTruthy();
    expect(screen.getByText(/on this device only/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Edit: Languages" }));
    const heading = await stepHeading("Languages");
    expect(document.activeElement).toBe(heading);
    const levels = screen.getAllByRole("combobox", { name: /^Your level/ }) as HTMLSelectElement[];
    expect(levels[0]?.value).toBe("B2");
    expect(screen.getByRole("button", { name: "Next" })).toBeTruthy();
  });

  it("uses See my matches as the single primary action", async () => {
    const { user } = renderProfileForm("en", fixtureClient());
    await toReview(user);
    expect(screen.getByRole("button", { name: "See my matches" }).getAttribute("type")).toBe(
      "submit",
    );
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
  });
});
