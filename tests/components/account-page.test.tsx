// @vitest-environment jsdom
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AccountPage } from "@/components/auth/account-page";
import type { AppLocale } from "@/i18n/routing";
import { CURRENT_CONSENT_VERSION } from "@/lib/auth/consent";
import { forgetSession } from "@/lib/auth/session-client";
import { AUTH_HINT_KEY, setSessionHint } from "@/lib/auth/session-hint";

import ar from "../../messages/ar.json";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
import { renderIntl } from "./intl";

type AuthResult = { data: unknown; error: { status: number; code?: string } | null };

const mocks = vi.hoisted(() => ({
  getSession: vi.fn<() => Promise<AuthResult>>(),
  deleteUser: vi.fn<(body: { callbackURL?: string }) => Promise<AuthResult>>(),
}));

vi.mock("@/lib/auth/client", () => ({
  authClient: { getSession: mocks.getSession, deleteUser: mocks.deleteUser },
}));

const CATALOGS = { fr, en, ar } as const;
const EMAIL = "amina@example.com";
// Local noon, so the shown day is 14/10/2026 in whatever time zone the suite runs in.
const CONSENTED_AT = new Date(2026, 9, 14, 12, 0).toISOString();
const fetchSpy = vi.fn<typeof fetch>();
const createObjectURL = vi.fn<(blob: Blob) => string>();
const revokeObjectURL = vi.fn<(url: string) => void>();
const downloads: string[] = [];

function signedIn(consentVersion: string | null, consentedAt: string | null) {
  return {
    data: { session: {}, user: { id: "u1", email: EMAIL, consentVersion, consentedAt } },
    error: null,
  };
}

function exportFile(filename: string): Response {
  return new Response('{"format":"jisr-account-export"}', {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}

function refusal(status: number, code: string): Response {
  return Response.json({ code }, { status });
}

function renderPage(locale: AppLocale = "fr") {
  return renderIntl(<AccountPage locale={locale} />, locale, { withMessages: true });
}

beforeEach(() => {
  window.localStorage.clear();
  forgetSession();
  mocks.getSession.mockReset();
  mocks.deleteUser.mockReset();
  fetchSpy.mockReset();
  createObjectURL.mockReset().mockReturnValue("blob:jisr-export");
  revokeObjectURL.mockReset();
  downloads.length = 0;
  vi.stubGlobal("fetch", fetchSpy);
  // jsdom has no object URLs and does not navigate on a click; record the name the page asked for.
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloads.push(this.download);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("AccountPage for a visitor with no sign-in hint", () => {
  it.each([
    ["fr", "/fr/sign-in?return=%2Ffr%2Faccount"],
    ["ar", "/ar/sign-in?return=%2Far%2Faccount"],
  ] as const)("shows a sign-in prompt and makes no request (%s)", async (locale, href) => {
    renderPage(locale);
    const link = await screen.findByRole("link", {
      name: CATALOGS[locale].accountPage.signedOut.signIn,
    });
    expect(link.getAttribute("href")).toBe(href);
    expect(screen.queryByRole("button")).toBeNull();
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("falls back to the prompt and clears the hint when the server has no session", async () => {
    setSessionHint();
    mocks.getSession.mockResolvedValue({ data: null, error: null });
    renderPage();
    expect(await screen.findByText(fr.accountPage.signedOut.body)).toBeTruthy();
    expect(window.localStorage.getItem(AUTH_HINT_KEY)).toBeNull();
  });
});

describe("AccountPage while the session cannot be checked", () => {
  it("shows a retry notice and recovers on retry", async () => {
    setSessionHint();
    mocks.getSession.mockRejectedValueOnce(new TypeError("network"));
    renderPage();
    expect((await screen.findByRole("alert")).textContent).toBe(fr.accountPage.unavailable.body);
    mocks.getSession.mockResolvedValue(signedIn(CURRENT_CONSENT_VERSION, CONSENTED_AT));
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: fr.accountPage.unavailable.retry }));
    expect(await screen.findByRole("button", { name: fr.accountPage.export.button })).toBeTruthy();
  });
});

describe.each(["fr", "ar"] as const)("AccountPage signed in (%s)", (locale) => {
  const copy = CATALOGS[locale].accountPage;

  beforeEach(() => {
    setSessionHint();
    mocks.getSession.mockResolvedValue(signedIn(CURRENT_CONSENT_VERSION, CONSENTED_AT));
  });

  it("shows both actions and the consent record with a DD/MM/YYYY date", async () => {
    const { container } = renderPage(locale);
    expect(await screen.findByRole("button", { name: copy.export.button })).toBeTruthy();
    expect(screen.getByRole("button", { name: copy.delete.button })).toBeTruthy();
    expect(screen.getByRole("heading", { name: copy.consent.title })).toBeTruthy();
    expect(container.textContent).toContain(EMAIL);
    expect(container.textContent).toContain(CURRENT_CONSENT_VERSION);
    expect(container.textContent).toContain("14/10/2026");
  });

  it("downloads the export under the server's file name", async () => {
    fetchSpy.mockResolvedValue(exportFile("jisr-export-2026-10-15.json"));
    renderPage(locale);
    await userEvent.setup().click(await screen.findByRole("button", { name: copy.export.button }));
    expect(await screen.findByText(copy.export.done)).toBeTruthy();
    expect(fetchSpy).toHaveBeenCalledExactlyOnceWith("/api/account/export", { cache: "no-store" });
    expect(downloads).toEqual(["jisr-export-2026-10-15.json"]);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    // Released a moment after the click, not during it.
    expect(revokeObjectURL).not.toHaveBeenCalled();
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith("blob:jisr-export"), {
      timeout: 3000,
    });
  });

  it("isolates the address, version and date left-to-right", async () => {
    const { container } = renderPage(locale);
    await screen.findByRole("button", { name: copy.export.button });
    const isolated = [...container.querySelectorAll("bdi")].map((node) => node.textContent);
    expect(isolated).toEqual(
      expect.arrayContaining([EMAIL, CURRENT_CONSENT_VERSION, "14/10/2026"]),
    );
    for (const node of container.querySelectorAll("bdi"))
      expect(node.getAttribute("dir")).toBe("ltr");
  });

  it("asks for the deletion email and shows the check-your-email state without claiming delivery", async () => {
    mocks.deleteUser.mockResolvedValue({ data: { success: true }, error: null });
    renderPage(locale);
    await userEvent.setup().click(await screen.findByRole("button", { name: copy.delete.button }));
    expect(await screen.findByRole("heading", { name: copy.delete.sent.title })).toBeTruthy();
    expect(mocks.deleteUser).toHaveBeenCalledExactlyOnceWith({
      callbackURL: `/${locale}/account/delete`,
    });
    expect(screen.getByRole("button", { name: copy.delete.sent.again })).toBeTruthy();
    expect(screen.queryByRole("button", { name: copy.delete.button })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("announces a repeat request and drops the confirmation when the repeat fails", async () => {
    mocks.deleteUser.mockResolvedValue({ data: { success: true }, error: null });
    renderPage(locale);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: copy.delete.button }));
    const box = (await screen.findByRole("heading", { name: copy.delete.sent.title }))
      .parentElement;
    expect(document.activeElement).toBe(box);
    expect(screen.queryByText(copy.delete.sent.repeated)).toBeNull();

    // Focus moved on, as it would after the student tabbed around.
    (document.activeElement as HTMLElement).blur();
    await user.click(screen.getByRole("button", { name: copy.delete.sent.again }));
    expect(await screen.findByText(copy.delete.sent.repeated)).toBeTruthy();
    expect(document.activeElement).toBe(box);
    expect(mocks.deleteUser).toHaveBeenCalledTimes(2);

    mocks.deleteUser.mockResolvedValue({ data: null, error: { status: 500 } });
    await user.click(screen.getByRole("button", { name: copy.delete.sent.again }));
    expect((await screen.findByRole("alert")).textContent).toBe(copy.delete.errors.failed);
    expect(screen.queryByRole("heading", { name: copy.delete.sent.title })).toBeNull();
    expect(screen.queryByText(copy.delete.sent.repeated)).toBeNull();
  });

  it("clears the download notice while a new download is running", async () => {
    fetchSpy.mockResolvedValueOnce(exportFile("jisr-export-2026-10-15.json"));
    renderPage(locale);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: copy.export.button }));
    expect(await screen.findByText(copy.export.done)).toBeTruthy();

    let finish: (response: Response) => void = () => {};
    fetchSpy.mockReturnValueOnce(new Promise<Response>((resolve) => (finish = resolve)));
    await user.click(screen.getByRole("button", { name: copy.export.button }));
    expect(screen.queryByText(copy.export.done)).toBeNull();
    finish(exportFile("jisr-export-2026-10-15.json"));
    expect(await screen.findByText(copy.export.done)).toBeTruthy();
  });

  it("works from the keyboard", async () => {
    fetchSpy.mockResolvedValue(exportFile("jisr-export-2026-10-15.json"));
    renderPage(locale);
    const user = userEvent.setup();
    const exportButton = await screen.findByRole("button", { name: copy.export.button });
    await user.tab();
    expect(document.activeElement).toBe(exportButton);
    await user.keyboard("{Enter}");
    expect(await screen.findByText(copy.export.done)).toBeTruthy();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: copy.delete.button }));
  });
});

describe("AccountPage export failures", () => {
  beforeEach(() => {
    setSessionHint();
    mocks.getSession.mockResolvedValue(signedIn(CURRENT_CONSENT_VERSION, CONSENTED_AT));
  });

  it.each([
    ["a server error", () => fetchSpy.mockResolvedValue(refusal(500, "INTERNAL"))],
    [
      "a non-JSON error page",
      () => fetchSpy.mockResolvedValue(new Response("<html>", { status: 502 })),
    ],
    ["a network failure", () => fetchSpy.mockRejectedValue(new TypeError("network"))],
  ])("shows a retry notice, not a broken download, on %s", async (_label, arrange) => {
    arrange();
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: fr.accountPage.export.button }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      fr.accountPage.export.errors.failed,
    );
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(downloads).toEqual([]);

    fetchSpy.mockResolvedValue(exportFile("jisr-export-2026-10-15.json"));
    await user.click(screen.getByRole("button", { name: fr.accountPage.export.button }));
    expect(await screen.findByText(fr.accountPage.export.done)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(downloads).toEqual(["jisr-export-2026-10-15.json"]);
  });

  it("shows the sign-in prompt and clears the hint on 401 UNAUTHENTICATED", async () => {
    fetchSpy.mockResolvedValue(refusal(401, "UNAUTHENTICATED"));
    renderPage();
    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: fr.accountPage.export.button }));
    expect(await screen.findByText(fr.accountPage.signedOut.body)).toBeTruthy();
    expect(window.localStorage.getItem(AUTH_HINT_KEY)).toBeNull();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("says accounts are unavailable on 403 ACCOUNTS_DISABLED", async () => {
    fetchSpy.mockResolvedValue(refusal(403, "ACCOUNTS_DISABLED"));
    renderPage();
    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: fr.accountPage.export.button }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      fr.accountPage.export.errors.unavailable,
    );
  });
});

describe("AccountPage deletion failures", () => {
  beforeEach(() => {
    setSessionHint();
    mocks.getSession.mockResolvedValue(signedIn(CURRENT_CONSENT_VERSION, CONSENTED_AT));
  });

  it("keeps the delete button and shows a notice when the request fails", async () => {
    mocks.deleteUser.mockResolvedValue({ data: null, error: { status: 500 } });
    renderPage();
    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: fr.accountPage.delete.button }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      fr.accountPage.delete.errors.failed,
    );
    expect(screen.queryByRole("heading", { name: fr.accountPage.delete.sent.title })).toBeNull();
    expect(screen.getByRole("button", { name: fr.accountPage.delete.button })).toBeTruthy();
  });

  it("shows the sign-in prompt when the session is gone", async () => {
    mocks.deleteUser.mockResolvedValue({
      data: null,
      error: { status: 401, code: "UNAUTHORIZED" },
    });
    renderPage();
    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: fr.accountPage.delete.button }));
    expect(await screen.findByText(fr.accountPage.signedOut.body)).toBeTruthy();
  });

  it("says accounts are unavailable when they are switched off", async () => {
    mocks.deleteUser.mockResolvedValue({
      data: null,
      error: { status: 403, code: "ACCOUNTS_DISABLED" },
    });
    renderPage();
    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: fr.accountPage.delete.button }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      fr.accountPage.delete.errors.unavailable,
    );
  });
});

describe("AccountPage consent record", () => {
  beforeEach(() => setSessionHint());

  it("shows an older version as it was recorded", async () => {
    mocks.getSession.mockResolvedValue(
      signedIn("2026-01-02", new Date(2026, 0, 3, 12, 0).toISOString()),
    );
    const { container } = renderPage("en");
    await waitFor(() => expect(container.textContent).toContain("2026-01-02"));
    expect(container.textContent).toContain("03/01/2026");
  });

  it("shows the day in the browser's own time zone, not UTC's", async () => {
    mocks.getSession.mockResolvedValue(
      signedIn("2026-10-14", new Date(2026, 9, 14, 23, 30).toISOString()),
    );
    const { container } = renderPage("en");
    await waitFor(() => expect(container.textContent).toContain("14/10/2026"));
  });

  it("says so when no consent is recorded", async () => {
    mocks.getSession.mockResolvedValue(signedIn(null, null));
    renderPage();
    expect(await screen.findByText(fr.accountPage.consent.none)).toBeTruthy();
    expect(screen.getByRole("button", { name: fr.accountPage.export.button })).toBeTruthy();
    expect(screen.getByRole("button", { name: fr.accountPage.delete.button })).toBeTruthy();
  });
});
