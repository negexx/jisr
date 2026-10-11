import { describe, expect, it } from "vitest";

import { buildRobots, buildSitemap, INDEXABLE_PATHS, localizedUrl, pageMetadata } from "@/lib/seo";
import type { SiteEnv } from "@/lib/site-env";

const SITE = "https://x.test";

const INDEXABLE: SiteEnv = {
  siteUrl: SITE,
  indexable: true,
  snapshotBaseUrl: null,
  goatCounterUrl: null,
};

const NOT_INDEXABLE: SiteEnv = { ...INDEXABLE, siteUrl: null, indexable: false };

const PREVIEW: SiteEnv = { ...INDEXABLE, indexable: false };

describe("localizedUrl", () => {
  it("prefixes the locale and appends the path", () => {
    expect(localizedUrl(SITE, "ar", "/profile")).toBe("https://x.test/ar/profile");
  });

  it("gives the bare locale URL for the home page", () => {
    expect(localizedUrl(SITE, "ar", "")).toBe("https://x.test/ar");
  });
});

describe("INDEXABLE_PATHS", () => {
  it("lists the home, profile, scholarships, guides, privacy and terms routes", () => {
    expect([...INDEXABLE_PATHS]).toEqual([
      "",
      "/profile",
      "/scholarships",
      "/guides",
      "/privacy",
      "/terms",
    ]);
  });
});

describe("buildRobots", () => {
  it("disallows everything when the build is not indexable", () => {
    expect(buildRobots(NOT_INDEXABLE)).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });

  it("disallows everything on a preview even with a site url", () => {
    expect(buildRobots({ ...INDEXABLE, indexable: false })).toEqual({
      rules: { userAgent: "*", disallow: "/" },
    });
  });

  it("allows everything and names the sitemap when indexable", () => {
    expect(buildRobots(INDEXABLE)).toEqual({
      rules: { userAgent: "*", allow: "/" },
      sitemap: "https://x.test/sitemap.xml",
    });
  });
});

describe("buildSitemap", () => {
  it("is empty when the build is not indexable", () => {
    expect(buildSitemap(NOT_INDEXABLE, ["a", "b"])).toEqual([]);
  });

  it("is empty on a preview, which has a site url but is not indexable", () => {
    expect(buildSitemap(PREVIEW, ["a", "b"])).toEqual([]);
  });

  const sitemap = buildSitemap(INDEXABLE, ["a", "b"]);

  it("has one entry per path and programme in each locale", () => {
    expect(sitemap).toHaveLength((6 + 2) * 3);
    const urls = sitemap.map((entry) => entry.url);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls).toContain("https://x.test/fr");
    expect(urls).toContain("https://x.test/ar/scholarships");
    expect(urls).toContain("https://x.test/en/programs/b");
  });

  it("includes guide paths when provided, in every locale", () => {
    const guidePaths = ["/guides/studying-in-europe"] as const;
    const withGuides = buildSitemap(INDEXABLE, ["a"], guidePaths);
    expect(withGuides).toHaveLength((6 + 1 + 1) * 3);
    const urls = withGuides.map((entry) => entry.url);
    expect(urls).toContain("https://x.test/fr/guides/studying-in-europe");
    expect(urls).toContain("https://x.test/ar/guides/studying-in-europe");
    expect(urls).toContain("https://x.test/en/guides/studying-in-europe");
  });

  it("maps fr, en, ar and x-default on every entry, x-default being the fr URL", () => {
    for (const entry of sitemap) {
      const languages = entry.alternates?.languages ?? {};
      expect(Object.keys(languages).sort()).toEqual(["ar", "en", "fr", "x-default"]);
      expect(languages["x-default"]).toBe(languages.fr);
      expect(Object.values(languages)).toContain(entry.url);
    }
  });

  it("never lists the personal shells or a trailing slash", () => {
    for (const { url } of sitemap) {
      expect(url).not.toMatch(/\/(matches|plan|compare)(\/|$)/);
      expect(url.endsWith("/")).toBe(false);
    }
  });
});

describe("pageMetadata", () => {
  const args = {
    locale: "ar",
    path: "/scholarships",
    title: "T",
    description: "D",
  } as const;

  it("adds canonical, alternates, open graph and twitter when indexable", () => {
    const metadata = pageMetadata({ ...args, env: INDEXABLE });
    expect(metadata.title).toBe("T");
    expect(metadata.description).toBe("D");
    expect(metadata.alternates).toEqual({
      canonical: "https://x.test/ar/scholarships",
      languages: {
        fr: "https://x.test/fr/scholarships",
        en: "https://x.test/en/scholarships",
        ar: "https://x.test/ar/scholarships",
        "x-default": "https://x.test/fr/scholarships",
      },
    });
    expect(metadata.openGraph).toEqual({
      type: "website",
      siteName: "Jisr",
      title: "T",
      description: "D",
      url: "https://x.test/ar/scholarships",
      locale: "ar_MA",
    });
    expect(metadata.twitter).toEqual({ card: "summary", title: "T", description: "D" });
    expect(metadata.robots).toBeUndefined();
  });

  it.each([
    ["fr", "fr_FR"],
    ["en", "en_GB"],
    ["ar", "ar_MA"],
  ] as const)("uses the %s og:locale %s", (locale, ogLocale) => {
    const metadata = pageMetadata({ ...args, locale, env: INDEXABLE });
    expect(metadata.openGraph).toMatchObject({ locale: ogLocale });
  });

  it("returns only title and description when not indexable", () => {
    expect(pageMetadata({ ...args, env: NOT_INDEXABLE })).toEqual({
      title: "T",
      description: "D",
    });
  });

  it("returns only title and description on a preview, which has a site url but is not indexable", () => {
    expect(pageMetadata({ ...args, env: PREVIEW })).toEqual({ title: "T", description: "D" });
  });

  it("marks a personal shell noindex and drops the alternates", () => {
    const metadata = pageMetadata({ ...args, env: INDEXABLE, index: false });
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.alternates).toBeUndefined();
  });

  it("marks a personal shell noindex on a non-indexable build too", () => {
    expect(pageMetadata({ ...args, env: NOT_INDEXABLE, index: false })).toEqual({
      title: "T",
      description: "D",
      robots: { index: false, follow: true },
    });
  });
});
