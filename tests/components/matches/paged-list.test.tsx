// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PAGE_SIZE, PagedList } from "@/components/matches/paged-list";
import { IntlWrapper } from "../intl";

const items = (n: number) =>
  Array.from({ length: n }, (_, i) => `card ${i}`).map((label) => <li key={label}>{label}</li>);

function show(n: number, locale: "en" | "fr" | "ar" = "en") {
  return render(
    <IntlWrapper locale={locale} withMessages>
      <PagedList items={items(n)} locale={locale} />
    </IntlWrapper>,
  );
}

describe("PagedList", () => {
  afterEach(cleanup);

  it("renders one page and offers the rest, a page at a time", () => {
    show(45);
    expect(screen.getAllByRole("listitem")).toHaveLength(PAGE_SIZE);
    const more = screen.getByRole("button", { name: /Show more programs \(25 left\)/ });
    fireEvent.click(more);
    expect(screen.getAllByRole("listitem")).toHaveLength(PAGE_SIZE * 2);
    fireEvent.click(screen.getByRole("button", { name: /\(5 left\)/ }));
    expect(screen.getAllByRole("listitem")).toHaveLength(45);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows no button when everything fits on the first page", () => {
    show(PAGE_SIZE);
    expect(screen.getAllByRole("listitem")).toHaveLength(PAGE_SIZE);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it.each(["fr", "ar"] as const)("has the button wording in %s", (locale) => {
    show(30, locale);
    expect(screen.getByRole("button").textContent).toMatch(/10/);
  });
});
