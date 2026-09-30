// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { EmptyState } from "@/components/empty-state";

import { renderIntl } from "./intl";
import { expectNoPhysicalDirection, LOCALES, watchConsole } from "./trust-helpers";

let consoleWatch: ReturnType<typeof watchConsole>;
beforeEach(() => {
  consoleWatch = watchConsole();
});
afterEach(() => {
  cleanup();
  consoleWatch.expectSilent();
  consoleWatch.restore();
});

describe("EmptyState", () => {
  it("is a polite status region by default, with an h2 title", () => {
    renderIntl(<EmptyState title="No profile yet" />);
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "No profile yet" })).toBeTruthy();
  });

  it("is a status region for the loading tone and an alert for the error tone", () => {
    const loading = renderIntl(<EmptyState title="Loading" tone="loading" />);
    expect(loading.container.querySelector('[role="status"]')).not.toBeNull();
    expect(loading.container.querySelector('[aria-busy="true"]')).not.toBeNull();
    cleanup();
    const error = renderIntl(<EmptyState title="Could not load" tone="error" />);
    expect(error.container.querySelector('[role="alert"]')).not.toBeNull();
    expect(error.container.querySelector('[role="status"]')).toBeNull();
  });

  it("uses the requested heading level", () => {
    renderIntl(<EmptyState title="Nothing here" headingLevel={3} />);
    expect(screen.getByRole("heading", { level: 3, name: "Nothing here" })).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
  });

  it("renders the description and one action slot", () => {
    renderIntl(
      <EmptyState
        title="No match"
        description={<p>Try another country.</p>}
        action={<a href="/profile">Edit my profile</a>}
      />,
    );
    expect(screen.getByText("Try another country.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Edit my profile" })).toBeTruthy();
  });

  it("shows a default icon per tone, hidden from screen readers, and a custom icon when given", () => {
    const neutral = renderIntl(<EmptyState title="A" />);
    expect(neutral.container.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    cleanup();
    const custom = renderIntl(<EmptyState title="A" icon={<i data-testid="mine" />} />);
    expect(screen.getByTestId("mine")).toBeTruthy();
    expect(custom.container.querySelector("svg")).toBeNull();
  });

  it.each(LOCALES)("uses logical utilities only in %s", (locale) => {
    const { container } = renderIntl(
      <EmptyState title="A" description="B" action={<button type="button">C</button>} />,
      locale,
    );
    expectNoPhysicalDirection(container);
  });
});
