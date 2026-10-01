// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import GlobalNotFound, { metadata } from "@/app/global-not-found";

import ar from "../../messages/ar.json";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

const catalogs = { fr, en, ar };

// next/font only works under Next's compiler; the class names do not matter here.
vi.mock("@/app/fonts", () => ({ fontVariables: "font-test" }));

function render(): Document {
  return new DOMParser().parseFromString(
    `<!DOCTYPE html>${renderToStaticMarkup(<GlobalNotFound />)}`,
    "text/html",
  );
}

describe("global not-found page (any unknown path, locale unknown)", () => {
  it("is a French document by default with one h1", () => {
    const page = render();
    expect(page.documentElement.getAttribute("lang")).toBe("fr");
    expect(page.documentElement.getAttribute("dir")).toBe("ltr");
    expect(page.querySelectorAll("h1")).toHaveLength(1);
    expect(page.querySelector("h1")?.textContent).toBe(catalogs.fr.notFound.title);
  });

  it("says it in fr, en and ar, each block with its own lang and dir, title and one line", () => {
    const blocks = [...render().querySelectorAll("main section")];
    expect(blocks.map((block) => [block.getAttribute("lang"), block.getAttribute("dir")])).toEqual([
      ["fr", "ltr"],
      ["en", "ltr"],
      ["ar", "rtl"],
    ]);
    for (const [index, locale] of (["fr", "en", "ar"] as const).entries()) {
      const block = blocks[index];
      const messages = catalogs[locale].notFound;
      expect(block?.querySelector("h1, h2")?.textContent).toBe(messages.title);
      expect(block?.querySelector("p")?.textContent).toBe(messages.description);
      const link = block?.querySelector("a");
      expect(link?.getAttribute("href")).toBe(`/${locale}`);
      expect(link?.textContent).toBe(messages.home);
    }
  });

  it("links only to the three home pages", () => {
    const hrefs = [...render().querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/fr", "/en", "/ar"]);
  });

  it("takes nothing from the request, so it cannot repeat the path", () => {
    expect(GlobalNotFound.length).toBe(0);
    expect(renderToStaticMarkup(<GlobalNotFound />)).toBe(renderToStaticMarkup(<GlobalNotFound />));
  });

  it("has a title in the three languages", () => {
    expect(metadata.title).toBe(
      [catalogs.fr, catalogs.en, catalogs.ar].map((c) => c.notFound.title).join(" / "),
    );
  });
});
