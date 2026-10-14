// @vitest-environment jsdom
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReportProvider, ReportSnapshot } from "@/components/report-outdated/report-context";
import { SourceBadge } from "@/components/source-badge";
import type { FactRef } from "@/domain/types";
import type { AppLocale } from "@/i18n/routing";
import { forgetSession } from "@/lib/auth/session-client";
import { AUTH_HINT_KEY, readSessionHint, setSessionHint } from "@/lib/auth/session-hint";

import { catalogs, LOCALES, renderWithMessages } from "./trust-helpers";

const mocks = vi.hoisted(() => ({
  push: vi.fn<(href: string) => void>(),
  prefetch: vi.fn<(href: string) => void>(),
  createFeedbackReport: vi.fn<(input: unknown) => Promise<unknown>>(),
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: mocks.push, prefetch: mocks.prefetch }),
}));
vi.mock("@/lib/server/account-actions", () => ({
  createFeedbackReport: mocks.createFeedbackReport,
}));

const VERSION = "0123456789ab";
const FACT: FactRef = {
  record: "programs/xx-test-prog-ok",
  path: "requirements.rules.r-math",
  source_url: "https://example.org/xx-test-requirements",
  last_verified_at: "2026-09-01",
  info_kind: "official",
  class: "stable",
  freshness: "fresh",
};

function renderButton(locale: AppLocale) {
  window.history.pushState({}, "", `/${locale}/programs/xx-test-prog-ok`);
  return renderWithMessages(
    <ReportProvider
      copy={catalogs[locale].reportOutdated}
      locale={locale}
      snapshotVersion={VERSION}
    >
      <SourceBadge meta={FACT} report />
    </ReportProvider>,
    locale,
  );
}

// The name continues with the source's host, so a label is matched at its start.
function buttonNamed(label: string): HTMLElement {
  return screen.getByRole("button", { name: new RegExp(`^${label}`) });
}

function reportButton(locale: AppLocale): HTMLElement {
  return buttonNamed(catalogs[locale].reportOutdated.button);
}

const fetchSpy = vi.fn<typeof fetch>();

beforeEach(() => {
  window.localStorage.clear();
  forgetSession();
  mocks.push.mockReset();
  mocks.prefetch.mockReset();
  mocks.createFeedbackReport.mockReset();
  fetchSpy.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe.each(LOCALES)("ReportOutdatedButton click (%s)", (locale) => {
  const copy = catalogs[locale].reportOutdated;

  it("signed out: shows only the label until clicked, and signed in the full button takes over", async () => {
    const { container, unmount } = renderButton(locale);
    expect(container.querySelectorAll('[data-slot="report-outdated"]')).toHaveLength(1);
    expect(container.querySelector("output")).toBeNull();
    unmount();
    setSessionHint();
    const signedIn = renderButton(locale);
    await waitFor(() => expect(signedIn.container.querySelector("output")).not.toBeNull());
  });

  it("signed out: opens the sign-in surface for this page and writes nothing", async () => {
    const user = userEvent.setup();
    renderButton(locale);
    await user.click(reportButton(locale));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledTimes(1));
    expect(mocks.push).toHaveBeenCalledWith(
      `/${locale}/sign-in?return=${encodeURIComponent(`/${locale}/programs/xx-test-prog-ok`)}`,
    );
    expect(mocks.createFeedbackReport).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mocks.prefetch).not.toHaveBeenCalled();
    // Nothing was reported, so nothing reads as reported.
    expect(reportButton(locale).hasAttribute("disabled")).toBe(false);
  });

  it("signed in: sends one report naming the fact and the snapshot, then reads as reported", async () => {
    setSessionHint();
    mocks.createFeedbackReport.mockResolvedValue({ ok: true, value: undefined });
    const user = userEvent.setup();
    renderButton(locale);
    await user.click(reportButton(locale));
    await waitFor(() => expect(buttonNamed(copy.reported)).toBeTruthy());
    expect(mocks.createFeedbackReport).toHaveBeenCalledTimes(1);
    expect(mocks.createFeedbackReport).toHaveBeenCalledWith({
      record: FACT.record,
      path: FACT.path,
      sourceUrl: FACT.source_url,
      snapshotVersion: VERSION,
    });
    expect(buttonNamed(copy.reported).hasAttribute("disabled")).toBe(true);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("signed in: shows the reported state before the server answers", async () => {
    setSessionHint();
    let answer: (value: unknown) => void = () => undefined;
    mocks.createFeedbackReport.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const user = userEvent.setup();
    renderButton(locale);
    await user.click(reportButton(locale));
    expect(buttonNamed(copy.reported)).toBeTruthy();
    answer({ ok: true, value: undefined });
    await waitFor(() => expect(mocks.createFeedbackReport).toHaveBeenCalledTimes(1));
    expect(buttonNamed(copy.reported)).toBeTruthy();
  });

  it("signed in: tells the student when the day's limit is reached and takes the state back", async () => {
    setSessionHint();
    mocks.createFeedbackReport.mockResolvedValue({ ok: false, error: "rate_limited" });
    const user = userEvent.setup();
    renderButton(locale);
    await user.click(reportButton(locale));
    expect(await screen.findByText(copy.rateLimited)).toBeTruthy();
    expect(reportButton(locale).hasAttribute("disabled")).toBe(false);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it.each([
    [
      "an invalid report",
      () => mocks.createFeedbackReport.mockResolvedValue({ ok: false, error: "invalid" }),
    ],
    ["a failed request", () => mocks.createFeedbackReport.mockRejectedValue(new Error("network"))],
  ])("signed in: %s is undone with a visible notice", async (_name, arrange) => {
    setSessionHint();
    arrange();
    const user = userEvent.setup();
    renderButton(locale);
    await user.click(reportButton(locale));
    expect(await screen.findByText(copy.failed)).toBeTruthy();
    expect(reportButton(locale).hasAttribute("disabled")).toBe(false);
  });

  it("signed in, account not finished: goes to the landing that holds the consent gate and returns here", async () => {
    setSessionHint();
    mocks.createFeedbackReport.mockResolvedValue({ ok: false, error: "consent_required" });
    const user = userEvent.setup();
    renderButton(locale);
    await user.click(reportButton(locale));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledTimes(1));
    expect(mocks.push).toHaveBeenCalledWith(
      `/${locale}/welcome?return=${encodeURIComponent(`/${locale}/programs/xx-test-prog-ok`)}`,
    );
    expect(readSessionHint()).toBe(true);
    expect(reportButton(locale).hasAttribute("disabled")).toBe(false);
  });

  it("signed in with a session the server no longer knows: forgets the hint and opens sign-in", async () => {
    setSessionHint();
    mocks.createFeedbackReport.mockResolvedValue({ ok: false, error: "unauthenticated" });
    const user = userEvent.setup();
    renderButton(locale);
    await user.click(reportButton(locale));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledTimes(1));
    expect(mocks.push).toHaveBeenCalledWith(
      `/${locale}/sign-in?return=${encodeURIComponent(`/${locale}/programs/xx-test-prog-ok`)}`,
    );
    expect(window.localStorage.getItem(AUTH_HINT_KEY)).toBeNull();
  });

  it("gives the button an accessible name that says which source it is about", () => {
    renderButton(locale);
    expect(reportButton(locale).textContent).toContain("example.org");
  });
});

describe("ReportOutdatedButton without a snapshot version", () => {
  it("renders nothing, since a report must name the version the student saw", () => {
    const { container } = renderWithMessages(
      <ReportProvider copy={catalogs.fr.reportOutdated} locale="fr" snapshotVersion={null}>
        <SourceBadge meta={FACT} report />
      </ReportProvider>,
      "fr",
    );
    expect(container.querySelector('[data-slot="report-outdated"]')).toBeNull();
  });
});

describe("ReportSnapshot", () => {
  it("supplies the version a client tree learned in the browser", () => {
    const { container } = renderWithMessages(
      <ReportProvider copy={catalogs.fr.reportOutdated} locale="fr" snapshotVersion={null}>
        <ReportSnapshot version={VERSION}>
          <SourceBadge meta={FACT} report />
        </ReportSnapshot>
      </ReportProvider>,
      "fr",
    );
    expect(container.querySelector('[data-slot="report-outdated"]')).not.toBeNull();
  });

  it("renders its children untouched, with no button, when no provider is above it", () => {
    const { container } = renderWithMessages(
      <ReportSnapshot version={VERSION}>
        <SourceBadge meta={FACT} report />
      </ReportSnapshot>,
      "fr",
    );
    expect(container.querySelector('[data-slot="source-badge"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="report-outdated"]')).toBeNull();
  });
});
