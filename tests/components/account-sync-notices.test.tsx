// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createTranslator } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AccountSyncEntry } from "@/components/auth/account-sync-entry";
import { AccountSyncLoader } from "@/components/auth/account-sync-loader";
import { AccountSyncNotices } from "@/components/auth/account-sync-notices";
import type { Profile } from "@/data-schema/profile";
import type { SyncStatus } from "@/lib/account-sync/sync";
import { withAccountSync } from "@/lib/account-sync-runner";
import { clearAccountLocalState, setSessionHint } from "@/lib/auth/session-hint";

import ar from "../../messages/ar.json";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
import { renderIntl } from "./intl";

const catalogues = { fr, en, ar } as const;

const sync = vi.hoisted(() => {
  let status: SyncStatus = { notice: null, conflict: null };
  const listeners = new Set<() => void>();
  return {
    set(next: SyncStatus) {
      status = next;
      for (const listener of listeners) listener();
    },
    getStatus: () => status,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    hydrate: vi.fn(async () => undefined),
    resolveConflict: vi.fn(),
    dismissNotice: vi.fn(),
  };
});

vi.mock("@/lib/account-sync/client", () => ({ accountSync: sync }));
const navigation = vi.hoisted(() => ({ push: vi.fn<(href: string) => void>(), pathname: "/plan" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: navigation.push }) }));
vi.mock("@/i18n/navigation", () => ({ usePathname: () => navigation.pathname }));
// The runner's path to the chunk: here it never loads.
vi.mock("@/lib/account-cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/account-cache")>()),
  loadAccountSync: async () => {
    throw new Error("chunk failed to load");
  },
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async ({
    locale,
    namespace,
  }: {
    locale: keyof typeof catalogues;
    namespace: string;
  }) => createTranslator({ locale, messages: catalogues[locale], namespace } as never),
}));

async function labelsFor(locale: keyof typeof catalogues) {
  vi.stubEnv("ACCOUNTS_ENABLED", "true");
  const entry = await AccountSyncEntry({ locale });
  vi.unstubAllEnvs();
  if (entry === null) throw new Error("entry rendered nothing");
  return entry.props.labels;
}

const SERVER = { schemaVersion: 1 } as Profile;

beforeEach(() => {
  window.localStorage.clear();
  setSessionHint();
  sync.set({ notice: null, conflict: null });
  sync.hydrate.mockClear();
  sync.resolveConflict.mockClear();
  sync.dismissNotice.mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("account sync entry", () => {
  it.each([
    undefined,
    "",
    "false",
  ])("renders nothing while ACCOUNTS_ENABLED is %j", async (value) => {
    vi.stubEnv("ACCOUNTS_ENABLED", value);
    expect(await AccountSyncEntry({ locale: "fr" })).toBeNull();
    vi.unstubAllEnvs();
  });
});

describe.each(["fr", "ar"] as const)("account sync notices (%s)", (locale) => {
  it("renders the rollback notice in this locale and lets it be dismissed", async () => {
    const labels = await labelsFor(locale);
    render(<AccountSyncNotices labels={labels} />);
    act(() => sync.set({ notice: { id: 1, kind: "savedLimit" }, conflict: null }));
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe(
      catalogues[locale].accountSync.savedLimit.replace("{max}", "12"),
    );
    await userEvent.click(
      screen.getByRole("button", { name: catalogues[locale].accountSync.dismiss }),
    );
    expect(sync.dismissNotice).toHaveBeenCalledTimes(1);
  });

  it("renders the conflict with both choices", async () => {
    const labels = await labelsFor(locale);
    render(<AccountSyncNotices labels={labels} />);
    act(() => sync.set({ notice: null, conflict: { server: SERVER, revision: 2 } }));
    const copy = catalogues[locale].accountSync;
    expect(screen.getByRole("alert").textContent).toContain(copy.conflictTitle);
    await userEvent.click(screen.getByRole("button", { name: copy.useOther }));
    await userEvent.click(screen.getByRole("button", { name: copy.keepMine }));
    expect(sync.resolveConflict.mock.calls).toEqual([["server"], ["mine"]]);
  });
});

describe.each(["fr", "ar"] as const)("an account that needs finishing (%s)", (locale) => {
  const copy = catalogues[locale].accountSync;

  beforeEach(() => {
    navigation.push.mockReset();
    navigation.pathname = "/plan";
  });

  it.each([
    "consentRequired",
    "consentPending",
  ] as const)("offers to finish setting up with the %s notice, and goes to the landing", async (kind) => {
    const labels = await labelsFor(locale);
    renderIntl(<AccountSyncNotices labels={labels} />, locale);
    act(() => sync.set({ notice: { id: 3, kind }, conflict: null }));
    expect(screen.getByRole("alert").textContent).toBe(copy[kind]);
    await userEvent.click(screen.getByRole("button", { name: copy.finishSetup }));
    expect(navigation.push).toHaveBeenCalledExactlyOnceWith(
      `/${locale}/welcome?return=%2F${locale}%2Fplan`,
    );
    expect(sync.dismissNotice).toHaveBeenCalledTimes(1);
  });

  it("offers nothing more with another notice", async () => {
    const labels = await labelsFor(locale);
    renderIntl(<AccountSyncNotices labels={labels} />, locale);
    act(() => sync.set({ notice: { id: 4, kind: "failed" }, conflict: null }));
    expect(screen.queryByRole("button", { name: copy.finishSetup })).toBeNull();
  });
});

describe("hydration triggers", () => {
  it("reads the account on mount while signed in, and not after sign-out", async () => {
    const labels = await labelsFor("fr");
    render(<AccountSyncNotices labels={labels} />);
    expect(sync.hydrate).toHaveBeenCalledTimes(1);
    act(() => clearAccountLocalState());
    expect(sync.hydrate).toHaveBeenCalledTimes(1);
    act(() => sync.set({ notice: { id: 2, kind: "signedOut" }, conflict: null }));
    expect(screen.getByRole("alert").textContent).toBe(fr.accountSync.signedOut);
  });

  it("reads it again when the tab returns after more than a minute hidden, not sooner", async () => {
    const labels = await labelsFor("fr");
    vi.useFakeTimers({ toFake: ["Date"] });
    render(<AccountSyncNotices labels={labels} />);
    let visibility: DocumentVisibilityState = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
    const flip = (next: DocumentVisibilityState) => {
      visibility = next;
      document.dispatchEvent(new Event("visibilitychange"));
    };
    flip("hidden");
    vi.advanceTimersByTime(30_000);
    flip("visible");
    expect(sync.hydrate).toHaveBeenCalledTimes(1);
    flip("hidden");
    vi.advanceTimersByTime(61_000);
    flip("visible");
    expect(sync.hydrate).toHaveBeenCalledTimes(2);
  });
});

describe("a change dropped because the sync chunk did not load", () => {
  it.each([
    "fr",
    "ar",
  ] as const)("is told by the eager loader in %s, and can be dismissed", async (locale) => {
    const labels = await labelsFor(locale);
    clearAccountLocalState();
    render(<AccountSyncLoader labels={labels} />);
    expect(screen.queryByRole("alert")).toBeNull();
    await act(async () => {
      withAccountSync(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const copy = catalogues[locale].accountSync;
    expect(screen.getByRole("alert").textContent).toBe(copy.failed);
    await userEvent.click(screen.getByRole("button", { name: copy.dismiss }));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
