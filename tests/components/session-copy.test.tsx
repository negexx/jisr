// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { createTranslator } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  NoProfileState as CompareNoProfile,
  StorageNotice as CompareStorage,
} from "@/components/compare/compare-states";
import {
  NoProfileState as MatchesNoProfile,
  ResetNotice as MatchesReset,
} from "@/components/matches/matches-states";
import {
  NoProfileState as PlanNoProfile,
  ResetNotice as PlanReset,
  StorageNotice as PlanStorage,
} from "@/components/plan/plan-states";
import { SessionText } from "@/components/session-text";
import { SiteFooter } from "@/components/site-footer";
import type { AppLocale } from "@/i18n/routing";
import { clearAccountLocalState, setSessionHint } from "@/lib/auth/session-hint";
import { profileStore } from "@/lib/profile/store";

import ar from "../../messages/ar.json";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
import { coreShard } from "../lib/profile/core-fixture";
import { renderIntl } from "./intl";
import { clientFor, renderProfileForm } from "./profile/helpers";

const CATALOGS = { fr, en, ar };

vi.mock("@/i18n/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/i18n/navigation")>()),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale, namespace }: { locale: AppLocale; namespace: string }) =>
    createTranslator({ locale, messages: CATALOGS[locale], namespace } as never),
}));

const LOCALES: readonly AppLocale[] = ["fr", "ar"];

// Testing Library collapses whitespace, no-break spaces included, in the text it reads.
const plain = (text: string) => text.replace(/\s+/g, " ");
const find = (text: string) => screen.getByText(plain(text));
const absent = (text: string) => screen.queryByText(plain(text));

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  profileStore.clear();
  clearAccountLocalState();
  window.localStorage.clear();
  vi.unstubAllEnvs();
});

function renderWithMessages(ui: React.ReactElement, locale: AppLocale) {
  return renderIntl(ui, locale, { withMessages: true });
}

describe("SessionText", () => {
  it("shows the guest string signed out and the account string with the session hint", () => {
    renderIntl(<SessionText guest="guest line" signedIn="account line" />, "fr");
    expect(find("guest line")).toBeTruthy();
    expect(absent("account line")).toBeNull();
    cleanup();
    setSessionHint();
    renderIntl(<SessionText guest="guest line" signedIn="account line" />, "fr");
    expect(find("account line")).toBeTruthy();
  });
});

describe.each(LOCALES)("journey states: device wording only for guests (%s)", (locale) => {
  const messages = CATALOGS[locale];

  const cases = [
    {
      name: "matches: no profile",
      ui: <MatchesNoProfile />,
      guest: messages.matches.states.none.description,
      account: messages.matches.states.none.descriptionSignedIn,
    },
    {
      name: "matches: unreadable profile",
      ui: <MatchesReset onDismiss={() => undefined} />,
      guest: messages.matches.states.reset.notice,
      account: messages.matches.states.reset.noticeSignedIn,
    },
    {
      name: "plan: no profile",
      ui: <PlanNoProfile />,
      guest: messages.plan.noProfile.description,
      account: messages.plan.noProfile.descriptionSignedIn,
    },
    {
      name: "plan: storage notice",
      ui: <PlanStorage />,
      guest: messages.plan.storage.notice,
      account: messages.plan.storage.noticeSignedIn,
    },
    {
      name: "plan: unreadable profile",
      ui: <PlanReset onDismiss={() => undefined} />,
      guest: messages.plan.reset.notice,
      account: messages.plan.reset.noticeSignedIn,
    },
    {
      name: "compare: no profile",
      ui: <CompareNoProfile />,
      guest: messages.compare.noProfile.description,
      account: messages.compare.noProfile.descriptionSignedIn,
    },
    {
      name: "compare: storage notice",
      ui: <CompareStorage />,
      guest: messages.compare.storage.notice,
      account: messages.compare.storage.noticeSignedIn,
    },
  ];

  it.each(cases)("$name keeps the old wording for a guest", ({ ui, guest, account }) => {
    renderWithMessages(ui, locale);
    expect(find(guest)).toBeTruthy();
    expect(absent(account)).toBeNull();
  });

  it.each(cases)("$name says the account keeps it once signed in", ({ ui, guest, account }) => {
    setSessionHint();
    renderWithMessages(ui, locale);
    const line = find(account);
    expect(absent(guest)).toBeNull();
    // The Arabic copy sits in the page's right-to-left flow, not in an LTR island.
    expect(line.closest("[dir]")?.getAttribute("dir")).toBe(locale === "ar" ? "rtl" : "ltr");
  });
});

describe.each(LOCALES)("profile page (%s)", (locale) => {
  const profile = CATALOGS[locale].profile;

  it("tells a guest the answers stay on this device", async () => {
    renderProfileForm(locale, clientFor(coreShard()));
    expect(await screen.findByText(plain(profile.aside.deviceBody))).toBeTruthy();
    expect(find(profile.ctaNote)).toBeTruthy();
    expect(find(profile.aside.deviceTitle)).toBeTruthy();
    expect(absent(profile.ctaNoteSignedIn)).toBeNull();
  });

  it("tells a signed-in student the account keeps them", async () => {
    setSessionHint();
    renderProfileForm(locale, clientFor(coreShard()));
    const body = await screen.findByText(plain(profile.aside.deviceBodySignedIn));
    expect(body.closest("[dir]")?.getAttribute("dir")).toBe(locale === "ar" ? "rtl" : "ltr");
    expect(find(profile.ctaNoteSignedIn)).toBeTruthy();
    expect(find(profile.aside.deviceTitleSignedIn)).toBeTruthy();
    expect(absent(profile.ctaNote)).toBeNull();
    expect(absent(profile.aside.deviceBody)).toBeNull();
  });
});

describe.each(LOCALES)("footer (%s)", (locale) => {
  const footer = CATALOGS[locale].footer;

  it("with accounts off renders the guest wording whatever the browser remembers", async () => {
    setSessionHint();
    renderIntl(await SiteFooter({ locale }), locale);
    expect(find(footer.privacy)).toBeTruthy();
    expect(find(footer.privacyLogs)).toBeTruthy();
    expect(absent(footer.privacySignedIn)).toBeNull();
  });

  it("with accounts on renders the guest wording signed out", async () => {
    vi.stubEnv("ACCOUNTS_ENABLED", "true");
    renderIntl(await SiteFooter({ locale }), locale);
    expect(find(footer.privacy)).toBeTruthy();
    expect(find(footer.privacyLogs)).toBeTruthy();
  });

  it("with accounts on says the account keeps the data and no tracking cookies once signed in", async () => {
    vi.stubEnv("ACCOUNTS_ENABLED", "true");
    setSessionHint();
    renderIntl(await SiteFooter({ locale }), locale);
    expect(find(footer.privacySignedIn)).toBeTruthy();
    expect(find(footer.privacyLogsSignedIn)).toBeTruthy();
    expect(absent(footer.privacy)).toBeNull();
    expect(absent(footer.privacyLogs)).toBeNull();
  });
});
