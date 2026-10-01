// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { useTranslations } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderIntl } from "./intl";

afterEach(cleanup);

function RegressedLeaf() {
  const t = useTranslations("nav");
  return <p>{t("profile")}</p>;
}

describe("renderIntl", () => {
  it("mirrors production (no root catalogue): a leaf that reads messages fails", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderIntl(<RegressedLeaf />, "fr")).toThrow();
    consoleError.mockRestore();
  });

  it("gives a nested-provider component the real catalogue when asked", () => {
    renderIntl(<RegressedLeaf />, "fr", { withMessages: true });
    expect(screen.getByText("Mon profil")).toBeTruthy();
  });
});
