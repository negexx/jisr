// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LocaleSwitcher } from "@/components/locale-switcher";
import type { AppLocale } from "@/i18n/routing";

import { renderIntl } from "./intl";

type StubLinkProps = { href: string; locale?: string; prefetch?: boolean } & ComponentProps<"a">;

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/programs/xx-test-prog-ok",
  Link: ({ href, locale, prefetch, children }: StubLinkProps) => (
    <a href={`/${locale}${href}`} data-prefetch={String(prefetch)}>
      {children}
    </a>
  ),
}));

const NAMES: Record<AppLocale, string> = { fr: "Français", en: "English", ar: "العربية" };

afterEach(cleanup);

describe("LocaleSwitcher prefetching", () => {
  it("does not prefetch the page the visitor is already on", () => {
    renderIntl(<LocaleSwitcher current="en" label="Language" names={NAMES} />, "en");
    expect(screen.getByRole("link", { name: "English" }).getAttribute("data-prefetch")).toBe(
      "false",
    );
  });

  it("leaves the other languages at Next's default", () => {
    renderIntl(<LocaleSwitcher current="en" label="Language" names={NAMES} />, "en");
    expect(screen.getByRole("link", { name: "Français" }).getAttribute("data-prefetch")).toBe(
      "undefined",
    );
    expect(screen.getByRole("link", { name: "العربية" }).getAttribute("data-prefetch")).toBe(
      "undefined",
    );
  });
});
