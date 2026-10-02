// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createTranslator } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ComparePicker, type PickerItem } from "@/components/compare/compare-picker";
import type { AppLocale } from "@/i18n/routing";
import { expectNoPhysicalDirection, LOCALES } from "../trust-helpers";
import { CompareProviders, catalogs } from "./helpers";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const ITEMS: PickerItem[] = [
  { kind: "program", slug: "p-a", name: "Alpha CS", institutionName: "Uni A", cityName: "Lyon" },
  { kind: "program", slug: "p-b", name: "Beta CS", institutionName: "Uni B", cityName: "Paris" },
  { kind: "program", slug: "p-c", name: "Gamma CS", institutionName: "Uni C", cityName: "Nice" },
  { kind: "program", slug: "p-d", name: "Delta CS", institutionName: "Uni D", cityName: "Lille" },
  { kind: "program", slug: "p-e", name: "Epsilon CS", institutionName: "Uni E", cityName: "Metz" },
  { kind: "missing", slug: "p-gone" },
];

function t(locale: AppLocale, key: string, values?: Record<string, string>): string {
  const translate = createTranslator({
    locale,
    messages: catalogs[locale],
    namespace: "compare.picker",
  }) as unknown as (key: string, values?: Record<string, string>) => string;
  return translate(key, values);
}

function renderPicker(
  locale: AppLocale,
  selected: string[],
  onToggle: (slug: string) => void = () => {},
  extra: { forceOpen?: boolean } = {},
) {
  return render(
    <CompareProviders locale={locale}>
      <ComparePicker items={ITEMS} selected={selected} onToggle={onToggle} {...extra} />
    </CompareProviders>,
  );
}

describe.each(LOCALES)("ComparePicker (%s)", (locale) => {
  it("summarises how many saved programs are compared, with preformatted numbers", () => {
    const { container } = renderPicker(locale, ["p-a", "p-b"]);
    const summary = container.querySelector("summary");
    expect(summary?.textContent).toContain(t(locale, "summary", { selected: "2", total: "6" }));
    expect(summary?.textContent).toContain(t(locale, "change"));
    expect(container.textContent).not.toMatch(/[٠-٩]/u);
    expectNoPhysicalDirection(container);
  });

  it("is a native details element, closed by default on a phone", () => {
    const { container } = renderPicker(locale, ["p-a", "p-b"]);
    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    expect(details?.open).toBe(false);
  });

  it("opens before paint from the md breakpoint", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: query === "(min-width: 48rem)",
        addEventListener: () => {},
        removeEventListener: () => {},
      })),
    );
    const { container } = renderPicker(locale, ["p-a", "p-b"]);
    expect(container.querySelector("details")?.open).toBe(true);
  });

  it("forces the list open when asked, even on a phone", () => {
    const { container } = renderPicker(locale, ["p-a"], () => {}, { forceOpen: true });
    expect(container.querySelector("details")?.open).toBe(true);
  });

  it("lists every saved program as a native checkbox named by the program", () => {
    renderPicker(locale, ["p-a", "p-b"]);
    for (const item of ITEMS) {
      if (item.kind !== "program") continue;
      const box = screen.getByRole<HTMLInputElement>("checkbox", { name: new RegExp(item.name) });
      expect(box.type).toBe("checkbox");
      expect(box.checked).toBe(["p-a", "p-b"].includes(item.slug));
    }
    expect(screen.getAllByRole("checkbox")).toHaveLength(6);
  });

  it("calls onToggle with the slug when a free box is clicked", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    renderPicker(locale, ["p-a", "p-b", "p-c"], onToggle);
    await user.click(screen.getByRole("checkbox", { name: /Delta CS/ }));
    expect(onToggle).toHaveBeenCalledWith("p-d");
  });

  it("disables the unticked boxes at the maximum and explains why", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    renderPicker(locale, ["p-a", "p-b", "p-c", "p-d"], onToggle);
    const limit = t(locale, "limit", { max: "4" });
    const blocked = screen.getByRole<HTMLInputElement>("checkbox", { name: /Epsilon CS/ });
    expect(blocked.disabled).toBe(true);
    expect(screen.getByRole<HTMLInputElement>("checkbox", { name: /Alpha CS/ }).disabled).toBe(
      false,
    );
    expect(screen.getByText(limit)).toBeTruthy();
    const described = blocked.getAttribute("aria-describedby");
    expect(described).not.toBeNull();
    expect(document.getElementById(described ?? "")?.textContent).toBe(limit);
    await user.click(blocked);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("disables the ticked boxes at the minimum and explains why", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    renderPicker(locale, ["p-a", "p-b"], onToggle);
    const minimum = t(locale, "minimum", { min: "2" });
    const ticked = screen.getByRole<HTMLInputElement>("checkbox", { name: /Alpha CS/ });
    expect(ticked.disabled).toBe(true);
    expect(
      document.getElementById(ticked.getAttribute("aria-describedby") ?? "")?.textContent,
    ).toBe(minimum);
    expect(screen.getByRole<HTMLInputElement>("checkbox", { name: /Gamma CS/ }).disabled).toBe(
      false,
    );
    await user.click(ticked);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("shows the choose-between hint when nothing is blocked", () => {
    renderPicker(locale, ["p-a", "p-b", "p-c"]);
    expect(screen.getByText(t(locale, "hint", { min: "2", max: "4" }))).toBeTruthy();
    expect(screen.queryByText(t(locale, "limit", { max: "4" }))).toBeNull();
    expect(screen.queryByText(t(locale, "minimum", { min: "2" }))).toBeNull();
  });

  it("greys out a program that is no longer in the data: disabled, unticked, slug isolated", () => {
    const { container } = renderPicker(locale, ["p-a", "p-b", "p-c"]);
    const row = container.querySelector<HTMLElement>('[data-slug="p-gone"]');
    if (row === null) throw new Error("no missing row");
    const box = within(row).getByRole<HTMLInputElement>("checkbox");
    expect(box.disabled).toBe(true);
    expect(box.checked).toBe(false);
    expect(within(row).getByText(t(locale, "missing"))).toBeTruthy();
    expect(row.querySelector('bdi[dir="ltr"]')?.textContent).toBe("p-gone");
  });

  it("makes every row a label at least 44px tall", () => {
    const { container } = renderPicker(locale, ["p-a", "p-b", "p-c"]);
    const labels = container.querySelectorAll("label");
    expect(labels).toHaveLength(6);
    for (const label of labels) expect(label.className).toMatch(/min-h-1[12]/);
  });
});
