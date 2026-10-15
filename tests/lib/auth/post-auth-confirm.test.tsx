// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WELCOME_MESSAGE_NAMESPACES } from "@/components/auth/namespaces";
import { PostAuthLanding } from "@/components/auth/post-auth-landing";
import { localeDirection } from "@/i18n/direction";
import type { AppLocale } from "@/i18n/routing";
import { CURRENT_CONSENT_VERSION } from "@/lib/auth/consent";
import { forgetSession } from "@/lib/auth/session-client";
import { type MessageTree, pickMessages } from "@/lib/i18n/client-messages";
import { PLAN_KEY } from "@/lib/plan/progress";
import { PROFILE_KEY } from "@/lib/profile/storage";
import { SAVED_KEY } from "@/lib/saved/saved";
import type { GuestImportPayload, ImportMode, ImportResult } from "@/lib/server/import";

import ar from "../../../messages/ar.json";
import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";
import { profile } from "../../fixtures/domain/builders";

// Login CSRF (ruling P22): a sign-in link opened in someone else's browser must not move that
// browser's guest data into the link owner's account. The real post-auth step and import client
// run here; only the Server Action, the session request, the sync layer and the snapshot client
// are stood in for.

const mocks = vi.hoisted(() => {
  const replace = vi.fn<(href: string) => void>();
  return {
    replace,
    router: { replace },
    getSession: vi.fn<() => Promise<unknown>>(),
    importGuestData:
      vi.fn<(payload: GuestImportPayload, mode: ImportMode) => Promise<ImportResult>>(),
  };
});

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => mocks.router,
}));
vi.mock("@/lib/auth/client", () => ({ authClient: { getSession: mocks.getSession } }));
vi.mock("@/lib/server/consent", () => ({ acceptCurrentConsent: vi.fn() }));
vi.mock("@/lib/server/import", () => ({ importGuestData: mocks.importGuestData }));
vi.mock("@/lib/account-sync/client", () => ({ hydrateAccountData: async () => undefined }));
vi.mock("@/lib/snapshot/use-snapshot", () => ({
  getSnapshotClient: () => ({ load: async () => ({ aliases: {} }) }),
}));

const CATALOGS = { fr, en, ar };
const GUEST_KEYS = [PROFILE_KEY, SAVED_KEY, PLAN_KEY] as const;

function seedGuest(): Record<string, string | null> {
  window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile()));
  window.localStorage.setItem(
    SAVED_KEY,
    JSON.stringify({
      schemaVersion: 1,
      items: [
        {
          slug: "xx-a",
          country: "FR",
          field: "computer-science",
          snapshotVersion: "0123456789ab",
          savedAt: "2026-10-02",
        },
      ],
    }),
  );
  window.localStorage.setItem(
    PLAN_KEY,
    JSON.stringify({ schemaVersion: 1, done: { "xx-a": ["visa"] } }),
  );
  return guestKeys();
}

function guestKeys(): Record<string, string | null> {
  return Object.fromEntries(GUEST_KEYS.map((key) => [key, window.localStorage.getItem(key)]));
}

function renderLanding(locale: AppLocale) {
  window.history.replaceState(null, "", `/${locale}/welcome?return=%2F${locale}%2Fplan`);
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={pickMessages(CATALOGS[locale] as MessageTree, WELCOME_MESSAGE_NAMESPACES)}
      timeZone="UTC"
    >
      <div dir={localeDirection(locale)}>
        <PostAuthLanding locale={locale} />
      </div>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  forgetSession();
  mocks.replace.mockReset();
  mocks.importGuestData.mockReset();
  mocks.importGuestData.mockResolvedValue({ ok: true, value: undefined });
  mocks.getSession.mockReset();
  // An empty, consented account: before ruling P22 this imported with no question asked.
  mocks.getSession.mockResolvedValue({
    data: {
      session: {},
      user: { id: "u1", email: "owner@example.org", consentVersion: CURRENT_CONSENT_VERSION },
    },
    error: null,
  });
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe.each(["fr", "ar"] as const)("guest data and a signed-in empty account (%s)", (locale) => {
  const copy = CATALOGS[locale].welcome.confirm;

  it("asks first, naming the account, and sends nothing until the student confirms", async () => {
    seedGuest();
    renderLanding(locale);
    expect((await screen.findByRole("heading", { level: 2 })).textContent).toContain(
      "o***@example.org",
    );
    await act(async () => {});
    expect(mocks.importGuestData).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("imports exactly once on confirm, then clears the claimed keys", async () => {
    seedGuest();
    renderLanding(locale);
    await userEvent.setup().click(await screen.findByRole("button", { name: copy.add }));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(`/${locale}/plan`));
    expect(mocks.importGuestData).toHaveBeenCalledTimes(1);
    expect(mocks.importGuestData).toHaveBeenCalledWith(expect.anything(), "auto");
    expect(Object.values(guestKeys())).toEqual([null, null, null]);
  });

  it("sends nothing on Not now and leaves the guest keys byte-identical", async () => {
    const before = seedGuest();
    renderLanding(locale);
    await userEvent.setup().click(await screen.findByRole("button", { name: copy.notNow }));
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(`/${locale}/plan`);
    expect(mocks.importGuestData).not.toHaveBeenCalled();
    expect(guestKeys()).toEqual(before);
  });
});
