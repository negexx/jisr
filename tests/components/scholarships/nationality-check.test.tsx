// @vitest-environment jsdom
import { act, cleanup, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { NationalityCheck } from "@/components/scholarships/nationality-check";
import { profileStore } from "@/lib/profile/store";

import { profile } from "../../fixtures/domain/builders";
import { IntlWrapper, renderIntl } from "../intl";

const labels = {
  open: "Ouverte à votre nationalité",
  closed: "Non ouverte à votre nationalité (réservée aux ressortissants de : Maroc)",
  noProfile: "Créez votre profil pour vérifier votre nationalité",
  caveat: "D'après la règle de nationalité publiée seulement.",
};

afterEach(() => {
  cleanup();
  profileStore.clear();
  window.localStorage.clear();
});

describe("NationalityCheck", () => {
  it("renders only a neutral placeholder on the server", () => {
    const html = renderToString(
      <IntlWrapper locale="fr">
        <NationalityCheck eligible={["MA"]} labels={labels} />
      </IntlWrapper>,
    );
    expect(html).toContain('data-state="placeholder"');
    for (const text of Object.values(labels)) expect(html).not.toContain(text);
  });

  it("invites the student to create a profile when none is stored", async () => {
    renderIntl(<NationalityCheck eligible={["MA"]} labels={labels} />);
    const link = await screen.findByRole("link", { name: labels.noProfile });
    expect(link.getAttribute("href")).toBe("/fr/profile");
    expect(screen.getByTestId("nationality-check").getAttribute("data-state")).toBe("none");
  });

  it("says the scholarship is open when the nationality is listed", async () => {
    renderIntl(<NationalityCheck eligible={["MA"]} labels={labels} />);
    act(() => {
      profileStore.save(profile({ nationality: "MA" }));
    });
    expect(await screen.findByText(labels.open)).toBeTruthy();
    expect(screen.getByText(labels.caveat)).toBeTruthy();
    expect(screen.getByTestId("nationality-check").getAttribute("data-state")).toBe("open");
  });

  it("says it is not open when the nationality is not listed", async () => {
    renderIntl(<NationalityCheck eligible={["MA"]} labels={labels} />);
    act(() => {
      profileStore.save(profile({ nationality: "XA" }));
    });
    expect(await screen.findByText(labels.closed)).toBeTruthy();
    expect(screen.getByText(labels.caveat)).toBeTruthy();
    expect(screen.getByTestId("nationality-check").getAttribute("data-state")).toBe("closed");
  });

  it("treats a reset (invalid stored) profile like no profile", async () => {
    window.localStorage.setItem("jisr.profile", "{not json");
    renderIntl(<NationalityCheck eligible={["MA"]} labels={labels} />);
    expect(await screen.findByRole("link", { name: labels.noProfile })).toBeTruthy();
  });
});
