import {
  checkCacheControl,
  checkHeaders,
  checkHtmlPage,
  checkLocaleRedirect,
  checkNotFound,
  checkRobots,
  checkSitemap,
  firstProgramPathInSitemap,
  firstProgramSlugInShard,
  manifestFiles,
} from "@scripts/ops/checks";
import { type Fetcher, runSmoke } from "@scripts/ops/run";
import { describe, expect, it } from "vitest";

const SECURITY_HEADERS: Record<string, string> = {
  "strict-transport-security": "max-age=63072000",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=()",
  "content-security-policy": "frame-ancestors 'none'; base-uri 'self'",
};

function failures(results: ReturnType<typeof checkHeaders>): string[] {
  return results.filter((r) => !r.ok).map((r) => r.name);
}

describe("checkHeaders", () => {
  it("passes a noindex site that sends every security header and noindex", () => {
    const headers = new Headers({ ...SECURITY_HEADERS, "x-robots-tag": "noindex, nofollow" });
    expect(failures(checkHeaders(headers, false))).toEqual([]);
  });

  it("passes an indexable site without x-robots-tag", () => {
    expect(failures(checkHeaders(new Headers(SECURITY_HEADERS), true))).toEqual([]);
  });

  it("fails when HSTS is missing", () => {
    const { "strict-transport-security": _removed, ...rest } = SECURITY_HEADERS;
    expect(failures(checkHeaders(new Headers(rest), true))).toEqual([
      "header strict-transport-security",
    ]);
  });

  it("fails an indexable site that sends noindex", () => {
    const headers = new Headers({ ...SECURITY_HEADERS, "x-robots-tag": "noindex, nofollow" });
    expect(failures(checkHeaders(headers, true))).toEqual(["header x-robots-tag"]);
  });

  it("fails a noindex site that does not send noindex", () => {
    expect(failures(checkHeaders(new Headers(SECURITY_HEADERS), false))).toEqual([
      "header x-robots-tag",
    ]);
  });

  it("fails a CSP without frame-ancestors and a weak nosniff", () => {
    const headers = new Headers({
      ...SECURITY_HEADERS,
      "content-security-policy": "base-uri 'self'",
      "x-content-type-options": "sniff",
      "x-robots-tag": "noindex",
    });
    expect(failures(checkHeaders(headers, false))).toEqual([
      "header x-content-type-options",
      "header content-security-policy",
    ]);
  });

  it("never puts a header value in a result", () => {
    const headers = new Headers({ ...SECURITY_HEADERS, "referrer-policy": "secret-value-xyz" });
    expect(JSON.stringify(checkHeaders(headers, true))).not.toContain("secret-value-xyz");
  });
});

describe("checkCacheControl", () => {
  const immutable = new Headers({ "cache-control": "public, max-age=31536000, immutable" });

  it("matches the required directive on a 200", () => {
    expect(checkCacheControl("c", 200, immutable, "immutable").ok).toBe(true);
    expect(checkCacheControl("c", 200, immutable, "no-cache").ok).toBe(false);
    expect(checkCacheControl("c", 200, new Headers(), "no-cache").ok).toBe(false);
  });

  it("fails any other status even with the right header", () => {
    expect(checkCacheControl("c", 404, immutable, "immutable").ok).toBe(false);
    expect(checkCacheControl("c", 307, immutable, "immutable").ok).toBe(false);
  });
});

describe("checkRobots", () => {
  const closed = "User-Agent: *\nDisallow: /\n";
  const open = "User-Agent: *\nAllow: /\n\nSitemap: https://jisr.example/sitemap.xml\n";

  it("accepts the right shape for each mode", () => {
    expect(checkRobots(200, closed, false).ok).toBe(true);
    expect(checkRobots(200, open, true).ok).toBe(true);
  });

  it("rejects the wrong shape for each mode", () => {
    expect(checkRobots(200, open, false).ok).toBe(false);
    expect(checkRobots(200, closed, true).ok).toBe(false);
    expect(checkRobots(200, "User-Agent: *\nAllow: /\n", true).ok).toBe(false);
    expect(checkRobots(200, "User-Agent: *\nDisallow: /admin\n", false).ok).toBe(false);
  });

  it("fails a non-200 response whatever the body says", () => {
    expect(checkRobots(404, closed, false).ok).toBe(false);
    expect(checkRobots(500, open, true).ok).toBe(false);
    expect(checkRobots(307, closed, false).ok).toBe(false);
  });
});

const ORIGIN = "http://localhost:3101";
const LOCALES = ["fr", "en", "ar"] as const;

function sitemap(urls: string[]): string {
  const entries = urls
    .map(
      (url) =>
        `<url><loc>${url}</loc><xhtml:link rel="alternate" hreflang="x-default" href="${url}" /></url>`,
    )
    .join("");
  return `<?xml version="1.0"?><urlset>${entries}</urlset>`;
}

// The shape buildSitemap produces: 3 locale-relative paths plus one URL per programme, per locale.
function siteUrls(slugs: string[]): string[] {
  const paths = ["", "/profile", "/scholarships", ...slugs.map((slug) => `/programs/${slug}`)];
  return paths.flatMap((path) => LOCALES.map((locale) => `${ORIGIN}/${locale}${path}`));
}

function slugs(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `p-${i}`);
}

describe("checkSitemap", () => {
  it("expects no URL on a noindex site", () => {
    expect(checkSitemap(200, sitemap([]), false).ok).toBe(true);
    expect(checkSitemap(200, sitemap(siteUrls([])), false).ok).toBe(false);
  });

  it("accepts a well-formed sitemap of any size above the sanity floor", () => {
    expect(checkSitemap(200, sitemap(siteUrls(slugs(1))), true).ok).toBe(true);
    expect(checkSitemap(200, sitemap(siteUrls(slugs(1125))), true).ok).toBe(true);
  });

  it("fails any status other than 200", () => {
    expect(checkSitemap(404, sitemap(siteUrls(slugs(5))), true).ok).toBe(false);
    expect(checkSitemap(500, sitemap([]), false).ok).toBe(false);
    expect(checkSitemap(307, sitemap(siteUrls(slugs(5))), true).ok).toBe(false);
  });

  it("applies the floor as more than 9 URLs: the bare pages alone fail, one programme passes", () => {
    expect(checkSitemap(200, sitemap(siteUrls([])), true).ok).toBe(false);
    expect(checkSitemap(200, sitemap(siteUrls(slugs(1))), true).ok).toBe(true);
    expect(checkSitemap(200, sitemap([]), true).ok).toBe(false);
  });

  it("requires a count that is a multiple of 3", () => {
    const urls = siteUrls(slugs(4));
    expect(checkSitemap(200, sitemap(urls.slice(0, -1)), true).ok).toBe(false);
  });

  it("requires every programme to exist in all three locales", () => {
    const urls = siteUrls(slugs(4)).filter((url) => url !== `${ORIGIN}/ar/programs/p-2`);
    // Keep the count a multiple of 3 so only the twin rule can fail.
    const padded = [...urls, `${ORIGIN}/ar/programs/p-extra`];
    expect(padded.length % 3).toBe(0);
    expect(checkSitemap(200, sitemap(padded), true).ok).toBe(false);
  });

  it("requires at least one programme in every locale", () => {
    const withoutArabic = siteUrls(slugs(3)).filter((url) => !url.includes("/ar/programs/"));
    expect(withoutArabic.length % 3).toBe(0);
    expect(checkSitemap(200, sitemap(withoutArabic), true).ok).toBe(false);
  });

  it("requires the x-default alternate", () => {
    const xml = sitemap(siteUrls(slugs(3))).replaceAll("x-default", "fr");
    expect(checkSitemap(200, xml, true).ok).toBe(false);
  });

  it("rejects personal-shell pages", () => {
    for (const shell of ["matches", "plan", "compare"]) {
      const urls = [...siteUrls(slugs(3)), ...LOCALES.map((l) => `${ORIGIN}/${l}/${shell}`)];
      expect(checkSitemap(200, sitemap(urls), true).ok).toBe(false);
    }
  });

  it("honours --min-urls on top of the structural floor", () => {
    const xml = sitemap(siteUrls(slugs(3)));
    expect(checkSitemap(200, xml, true, 18).ok).toBe(true);
    expect(checkSitemap(200, xml, true, 19).ok).toBe(false);
  });

  it("accepts the sitemap origin differing from where it was fetched", () => {
    const xml = sitemap(
      siteUrls(slugs(2)).map((url) => url.replace(ORIGIN, "https://jisr.example")),
    );
    expect(checkSitemap(200, xml, true).ok).toBe(true);
  });
});

describe("firstProgramPathInSitemap", () => {
  it("returns the path of the first programme URL whatever its origin", () => {
    const xml = sitemap([
      "https://x.test/fr",
      "https://x.test/fr/programs/a-b",
      "https://x.test/en/programs/a-b",
    ]);
    expect(firstProgramPathInSitemap(xml)).toBe("/fr/programs/a-b");
  });

  it("returns null when there is none", () => {
    expect(firstProgramPathInSitemap(sitemap(["https://x.test/fr"]))).toBeNull();
  });
});

describe("checkLocaleRedirect", () => {
  const base = "http://localhost:3101";

  it("accepts 307 and 308 to a locale home, absolute or relative", () => {
    expect(checkLocaleRedirect("r", 307, "/fr", base, null).ok).toBe(true);
    expect(checkLocaleRedirect("r", 308, "http://localhost:3101/ar", base, "ar").ok).toBe(true);
  });

  it("rejects other statuses, other targets and a wrong locale", () => {
    expect(checkLocaleRedirect("r", 200, null, base, null).ok).toBe(false);
    expect(checkLocaleRedirect("r", 302, "/fr", base, null).ok).toBe(false);
    expect(checkLocaleRedirect("r", 307, null, base, null).ok).toBe(false);
    expect(checkLocaleRedirect("r", 307, "/fr/profile", base, null).ok).toBe(false);
    expect(checkLocaleRedirect("r", 307, "/fr", base, "ar").ok).toBe(false);
  });

  it("rejects a redirect that leaves the origin being tested", () => {
    expect(checkLocaleRedirect("r", 307, "https://evil.example/fr", base, null).ok).toBe(false);
    expect(checkLocaleRedirect("r", 307, "http://localhost:3999/fr", base, null).ok).toBe(false);
    expect(checkLocaleRedirect("r", 307, "https://localhost:3101/fr", base, null).ok).toBe(false);
    expect(checkLocaleRedirect("r", 307, "//evil.example/fr", base, null).ok).toBe(false);
  });
});

describe("checkHtmlPage and checkNotFound", () => {
  const html = (lang: string, dir: string) =>
    `<!DOCTYPE html><html lang="${lang}" dir="${dir}"><body/>`;

  it("checks status, content type, lang and dir", () => {
    expect(checkHtmlPage("p", 200, "text/html; charset=utf-8", html("ar", "rtl"), "ar").ok).toBe(
      true,
    );
    expect(checkHtmlPage("p", 200, "text/html", html("ar", "ltr"), "ar").ok).toBe(false);
    expect(checkHtmlPage("p", 200, "text/html", html("fr", "ltr"), "ar").ok).toBe(false);
    expect(checkHtmlPage("p", 200, "application/json", html("fr", "ltr"), "fr").ok).toBe(false);
    expect(checkHtmlPage("p", 404, "text/html", html("fr", "ltr"), "fr").ok).toBe(false);
  });

  it("recognises the trilingual 404 only with status 404", () => {
    const body = '<html lang="fr"><section lang="ar" dir="rtl">';
    expect(checkNotFound("n", 404, body).ok).toBe(true);
    expect(checkNotFound("n", 200, body).ok).toBe(false);
    expect(checkNotFound("n", 404, '<html lang="fr">').ok).toBe(false);
  });
});

describe("manifest helpers", () => {
  const manifest = {
    shards: {
      core: { file: "s/core.aaaaaaaaaaaa.json" },
      "costs.FR": { file: "s/costs.FR.bbbbbbbbbbbb.json" },
      "programs.DE.engineering": { file: "s/programs.DE.engineering.cccccccccccc.json" },
    },
  };

  it("finds the core shard and the first programs shard", () => {
    expect(manifestFiles(manifest)).toEqual({
      coreShard: "s/core.aaaaaaaaaaaa.json",
      programsShard: "s/programs.DE.engineering.cccccccccccc.json",
    });
  });

  it("tolerates garbage", () => {
    expect(manifestFiles(null)).toEqual({ coreShard: null, programsShard: null });
    expect(manifestFiles({ shards: [] })).toEqual({ coreShard: null, programsShard: null });
  });

  it("reads the first slug of a programs shard", () => {
    expect(firstProgramSlugInShard({ programs: [{ slug: "a" }, { slug: "b" }] })).toBe("a");
    expect(firstProgramSlugInShard({ programs: [{ slug: 3 }, {}] })).toBeNull();
    expect(firstProgramSlugInShard("nope")).toBeNull();
  });
});

type FakeSite = { indexable: boolean; omit?: string[]; homeLocation?: string };

function fakeFetcher({ indexable, omit = [], homeLocation }: FakeSite): Fetcher {
  const secure = Object.fromEntries(
    Object.entries(SECURITY_HEADERS).filter(([key]) => !omit.includes(key)),
  );
  const page = (lang: string, dir: string, status = 200) =>
    new Response(`<html lang="${lang}" dir="${dir}">`, {
      status,
      headers: {
        "content-type": "text/html",
        ...secure,
        ...(indexable ? {} : { "x-robots-tag": "noindex, nofollow" }),
      },
    });
  const slug = "some-programme";
  const urls = indexable ? siteUrls([slug, ...slugs(5)]) : [];
  const json = (value: unknown, cache: string) =>
    new Response(JSON.stringify(value), { headers: { "cache-control": cache } });

  return async (url, init) => {
    const { pathname } = new URL(url);
    const accept = new Headers(init.headers).get("accept-language");
    if (pathname === "/") {
      return new Response(null, {
        status: 307,
        headers: { location: homeLocation ?? (accept === "ar" ? "/ar" : "/fr") },
      });
    }
    if (pathname === "/fr" || pathname === "/fr/programs/some-programme") return page("fr", "ltr");
    if (pathname === "/ar") return page("ar", "rtl");
    if (pathname === "/en/scholarships") return page("en", "ltr");
    if (pathname.startsWith("/fr/")) {
      return new Response('<section lang="ar">', { status: 404 });
    }
    if (pathname === "/robots.txt") {
      return new Response(
        indexable
          ? "User-Agent: *\nAllow: /\n\nSitemap: http://localhost:3101/sitemap.xml\n"
          : "User-Agent: *\nDisallow: /\n",
      );
    }
    if (pathname === "/sitemap.xml") return new Response(sitemap(urls));
    if (pathname === "/snapshots/manifest.json") {
      return json(
        {
          shards: {
            core: { file: "s/core.aaaaaaaaaaaa.json" },
            "programs.DE.engineering": { file: "s/programs.DE.engineering.cccccccccccc.json" },
          },
        },
        "no-cache",
      );
    }
    if (pathname === "/snapshots/s/programs.DE.engineering.cccccccccccc.json") {
      return json({ programs: [{ slug }] }, "public, max-age=31536000, immutable");
    }
    if (pathname === "/snapshots/s/core.aaaaaaaaaaaa.json") {
      return json({}, "public, max-age=31536000, immutable");
    }
    return new Response("missing", { status: 404 });
  };
}

describe("runSmoke against a fake site", () => {
  it("passes a correct noindex site", async () => {
    const results = await runSmoke("http://localhost:3101", false, {
      fetcher: fakeFetcher({ indexable: false }),
    });
    expect(results.filter((r) => !r.ok)).toEqual([]);
    expect(results.length).toBeGreaterThan(15);
  });

  it("passes a correct indexable site, fetching the programme page from the sitemap path", async () => {
    const results = await runSmoke("http://localhost:3101", true, {
      fetcher: fakeFetcher({ indexable: true }),
    });
    expect(results.filter((r) => !r.ok)).toEqual([]);
  });

  it("fails when the site is indexable but a noindex site was expected", async () => {
    const results = await runSmoke("http://localhost:3101", false, {
      fetcher: fakeFetcher({ indexable: true }),
    });
    expect(results.filter((r) => !r.ok).map((r) => r.name)).toEqual(
      expect.arrayContaining(["header x-robots-tag", "robots.txt", "sitemap.xml"]),
    );
  });

  it("fails a site that lost HSTS", async () => {
    const results = await runSmoke("http://localhost:3101", false, {
      fetcher: fakeFetcher({ indexable: false, omit: ["strict-transport-security"] }),
    });
    expect(results.filter((r) => !r.ok).map((r) => r.name)).toEqual([
      "header strict-transport-security",
    ]);
  });

  it("fails when the sitemap is below --min-urls", async () => {
    const fetcher = fakeFetcher({ indexable: true });
    const ok = await runSmoke("http://localhost:3101", true, { fetcher, minUrls: 18 });
    expect(ok.filter((r) => !r.ok)).toEqual([]);
    const tooFew = await runSmoke("http://localhost:3101", true, { fetcher, minUrls: 100000 });
    expect(tooFew.filter((r) => !r.ok).map((r) => r.name)).toEqual(["sitemap.xml"]);
  });

  it("fails when / redirects to another origin", async () => {
    const results = await runSmoke("http://localhost:3101", false, {
      fetcher: fakeFetcher({ indexable: false, homeLocation: "https://evil.example/fr" }),
    });
    expect(results.filter((r) => !r.ok).map((r) => r.name)).toEqual([
      "GET / redirects to a locale",
      "GET / with Accept-Language ar redirects to /ar",
    ]);
  });

  it("reports an unreachable host as failures without leaking the error", async () => {
    const down: Fetcher = async () => {
      throw new Error("connect ECONNREFUSED secret-host.internal");
    };
    const results = await runSmoke("http://localhost:3101", false, { fetcher: down });
    expect(results.every((r) => !r.ok)).toBe(true);
    expect(JSON.stringify(results)).not.toContain("secret-host");
  });
});
