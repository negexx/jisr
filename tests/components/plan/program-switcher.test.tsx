// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { useLayoutEffect } from "react";
import userEvent from "@testing-library/user-event";
import { createTranslator } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProgramSwitcher, type SwitcherItem } from "@/components/plan/program-switcher";
import type { AppLocale } from "@/i18n/routing";
import { expectNoPhysicalDirection, LOCALES } from "../trust-helpers";
import { catalogs, PlanProviders } from "./helpers";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ITEMS: SwitcherItem[] = [
  {
    kind: "program",
    slug: "xx-a",
    name: "Licence Informatique",
    institutionName: "Université A",
    cityName: "Lyon",
    done: 2,
    total: 8,
  },
  {
    kind: "program",
    slug: "xx-b",
    name: "Bachelor Engineering",
    institutionName: "Hochschule B",
    cityName: "Berlin",
    done: 0,
    total: 9,
  },
  { kind: "missing", slug: "xx-gone" },
];

function renderSwitcher(locale: AppLocale, active = "xx-a", onSelect = vi.fn()) {
  const view = render(
    <PlanProviders locale={locale}>
      <ProgramSwitcher items={ITEMS} activeSlug={active} onSelect={onSelect} />
    </PlanProviders>,
  );
  return { ...view, onSelect };
}

describe.each(LOCALES)("ProgramSwitcher (%s)", (locale) => {
  const t = catalogs[locale].plan.switcher;

  it("is a labelled nav with a details whose summary shows the active program and progress", () => {
    const { container } = renderSwitcher(locale);
    const nav = screen.getByRole("navigation", { name: t.label });
    const details = nav.querySelector("details");
    expect(details).not.toBeNull();
    expect(details?.open).toBe(false);
    const summary = details?.querySelector("summary");
    expect(summary?.textContent).toContain(t.showing);
    expect(summary?.textContent).toContain("Licence Informatique");
    expect(summary?.textContent).toContain(t.change);
    expect(summary?.textContent).toContain(
      createTranslator({ locale, messages: catalogs[locale], namespace: "plan.switcher" })(
        "progress",
        { done: "2", total: "8" },
      ),
    );
    expect(summary?.querySelector("bdi")?.textContent).toBe("Licence Informatique");
    expectNoPhysicalDirection(container);
  });

  it("lists every program once as a button, marks the active one, and flags a missing one", () => {
    renderSwitcher(locale);
    const nav = screen.getByRole("navigation", { name: t.label });
    const list = nav.querySelector("ul");
    const buttons = within(nav).getAllByRole("button", { hidden: true });
    expect(list?.querySelectorAll("li")).toHaveLength(3);
    expect(buttons).toHaveLength(3);
    const current = buttons.filter((b) => b.getAttribute("aria-current") === "true");
    expect(current).toHaveLength(1);
    expect(current[0]?.textContent).toContain("Licence Informatique");
    expect(buttons[1]?.textContent).toContain("Hochschule B");
    expect(buttons[1]?.textContent).toContain("Berlin");
    expect(buttons[2]?.textContent).toContain(t.missing);
    for (const button of buttons) expect(button.getAttribute("type")).toBe("button");
  });

  it("selects another program and closes the disclosure", async () => {
    const user = userEvent.setup();
    const { container, onSelect } = renderSwitcher(locale);
    const details = container.querySelector("details") as HTMLDetailsElement;
    await user.click(details.querySelector("summary") as HTMLElement);
    expect(details.open).toBe(true);
    await user.click(within(details).getByRole("button", { name: /Bachelor Engineering/ }));
    expect(onSelect).toHaveBeenCalledWith("xx-b");
    expect(details.open).toBe(false);
  });

  it("opens the disclosure from lg up in the layout phase, so the rail is never painted empty", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    // A sibling rendered after the switcher runs its layout effect after the switcher's own: it
    // sees the state the browser would paint. A passive effect would not have run yet.
    let openAtLayout: boolean | null = null;
    function Probe() {
      useLayoutEffect(() => {
        openAtLayout = document.querySelector("details")?.open ?? null;
      }, []);
      return null;
    }
    render(
      <PlanProviders locale={locale}>
        <ProgramSwitcher items={ITEMS} activeSlug="xx-a" onSelect={vi.fn()} />
        <Probe />
      </PlanProviders>,
    );
    expect(openAtLayout).toBe(true);
  });

  it("marks a missing slug in the summary as left-to-right", () => {
    const { container } = renderSwitcher(locale, "xx-gone");
    const summaryBdi = container.querySelector("summary bdi");
    expect(summaryBdi?.textContent).toBe("xx-gone");
    expect(summaryBdi?.getAttribute("dir")).toBe("ltr");
  });
});
