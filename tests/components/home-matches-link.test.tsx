// @vitest-environment jsdom
import { act, cleanup, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { HomeMatchesLink, STORED_PROFILE_KEY } from "@/components/home-matches-link";
import { PROFILE_KEY } from "@/lib/profile/storage";
import { profileStore } from "@/lib/profile/store";

import { profile } from "../fixtures/domain/builders";
import { IntlWrapper, renderIntl } from "./intl";

afterEach(() => {
  cleanup();
  profileStore.clear();
  window.localStorage.clear();
});

describe("HomeMatchesLink", () => {
  it("renders only the empty, height-reserving wrapper on the server (unhydrated)", () => {
    const html = renderToString(
      <IntlWrapper locale="fr">
        <HomeMatchesLink label="Voir mes résultats" />
      </IntlWrapper>,
    );
    expect(html).not.toContain("Voir mes résultats");
    expect(html).not.toContain("<a");
    expect(html).toContain("min-h-12");
  });

  it("shows nothing when no profile is stored", () => {
    renderIntl(<HomeMatchesLink label="Voir mes résultats" />, "fr");
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("shows nothing when the stored profile was reset as invalid", () => {
    window.localStorage.setItem(PROFILE_KEY, "{not json");
    renderIntl(<HomeMatchesLink label="Voir mes résultats" />, "fr");
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("shows a link to the matches page once a profile is saved", async () => {
    profileStore.save(profile());
    renderIntl(<HomeMatchesLink label="Voir mes résultats" />, "fr");
    const link = await screen.findByRole("link", { name: "Voir mes résultats" });
    expect(link.getAttribute("href")).toBe("/fr/matches");
  });

  it("shows nothing when the stored value is present but not a valid profile", async () => {
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify({ schemaVersion: 1 }));
    renderIntl(<HomeMatchesLink label="Voir mes résultats" />, "fr");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("reads the same storage key as the profile store", () => {
    expect(STORED_PROFILE_KEY).toBe(PROFILE_KEY);
  });

  it("appears and disappears as the stored profile changes (storage event, Arabic)", async () => {
    renderIntl(<HomeMatchesLink label="عرض نتائجي" />, "ar");
    expect(screen.queryByRole("link")).toBeNull();
    act(() => {
      profileStore.save(profile());
      window.dispatchEvent(new StorageEvent("storage", { key: PROFILE_KEY }));
    });
    const link = await screen.findByRole("link", { name: "عرض نتائجي" });
    expect(link.getAttribute("href")).toBe("/ar/matches");
    act(() => {
      profileStore.clear();
    });
    await waitFor(() => expect(screen.queryByRole("link")).toBeNull());
  });
});
