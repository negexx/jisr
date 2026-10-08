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
  it("matches the required directive", () => {
    const immutable = new Headers({ "cache-control": "public, max-age=31536000, immutable" });
    expect(checkCacheControl("c", immutable, "immutable").ok).toBe(true);
    expect(checkCacheControl("c", immutable, "no-cache").ok).toBe(false);
    expect(checkCacheControl("c", new Headers(), "no-cache").ok).toBe(false);
  });
});

describe("checkRobots", () => {
  const closed = "User-Agent: *\nDisallow: /\n";
  const open = "User-Agent: *\nAllow: /\n\nSitemap: https://jisr.example/sitemap.xml\n";

  it("accepts the right shape for each mode", () => {
    expect(checkRobots(closed, false).ok).toBe(true);
    expect(checkRobots(open, true).ok).toBe(true);
  });

  it("rejects the wrong shape for each mode", () => {
    expect(checkRobots(open, false).ok).toBe(false);
    expect(checkRobots(closed, true).ok).toBe(false);
    expect(checkRobots("User-Agent: *\nAllow: /\n", true).ok).toBe(false);
    expect(checkRobots("User-Agent: *\nDisallow: /admin\n", false).ok).toBe(false);
  });
});

function sitemap(urls: string[], extra = ""): string {
  const entries = urls
    .map(
      (url) =>
        `<url><loc>${url}</loc><xhtml:link rel="alternate" hreflang="x-default" href="${url}" /></url>`,
    )
    .join("");
  return `<?xml version="1.0"?><urlset>${entries}${extra}</urlset>`;
}

function manyUrls(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `http://localhost:3101/fr/programs/p-${i}`);
}

describe("checkSitemap", () => {
  it("expects no URL on a noindex site", () => {
    expect(checkSitemap(sitemap([]), false).ok).toBe(true);
    expect(checkSitemap(sitemap(manyUrls(5)), false).ok).toBe(false);
  });

  it("accepts a large sitemap with x-default and no personal shells", () => {
    expect(checkSitemap(sitemap(manyUrls(3400)), true).ok).toBe(true);
  });

  it("rejects an empty, short, hreflang-less or personal-shell sitemap", () => {
    expect(checkSitemap(sitemap([]), true).ok).toBe(false);
    expect(checkSitemap(sitemap(manyUrls(10)), true).ok).toBe(false);
    expect(checkSitemap(sitemap(manyUrls(3400)).replaceAll("x-default", "fr"), true).ok).toBe(
      false,
    );
    expect(
      checkSitemap(sitemap([...manyUrls(3400), "http://localhost:3101/fr/matches"]), true).ok,
    ).toBe(false);
    expect(
      checkSitemap(sitemap([...manyUrls(3400), "http://localhost:3101/ar/compare"]), true).ok,
    ).toBe(false);
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

type FakeSite = { indexable: boolean; omit?: string[] };

function fakeFetcher({ indexable, omit = [] }: FakeSite): Fetcher {
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
  const urls = indexable ? [`http://localhost:3101/fr/programs/${slug}`, ...manyUrls(3400)] : [];
  const json = (value: unknown, cache: string) =>
    new Response(JSON.stringify(value), { headers: { "cache-control": cache } });

  return async (url, init) => {
    const { pathname } = new URL(url);
    const accept = new Headers(init.headers).get("accept-language");
    if (pathname === "/") {
      return new Response(null, {
        status: 307,
        headers: { location: accept === "ar" ? "/ar" : "/fr" },
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
    const results = await runSmoke(
      "http://localhost:3101",
      false,
      fakeFetcher({ indexable: false }),
    );
    expect(results.filter((r) => !r.ok)).toEqual([]);
    expect(results.length).toBeGreaterThan(15);
  });

  it("passes a correct indexable site, fetching the programme page from the sitemap path", async () => {
    const results = await runSmoke("http://localhost:3101", true, fakeFetcher({ indexable: true }));
    expect(results.filter((r) => !r.ok)).toEqual([]);
  });

  it("fails when the site is indexable but a noindex site was expected", async () => {
    const results = await runSmoke(
      "http://localhost:3101",
      false,
      fakeFetcher({ indexable: true }),
    );
    expect(results.filter((r) => !r.ok).map((r) => r.name)).toEqual(
      expect.arrayContaining(["header x-robots-tag", "robots.txt", "sitemap.xml"]),
    );
  });

  it("fails a site that lost HSTS", async () => {
    const results = await runSmoke(
      "http://localhost:3101",
      false,
      fakeFetcher({ indexable: false, omit: ["strict-transport-security"] }),
    );
    expect(results.filter((r) => !r.ok).map((r) => r.name)).toEqual([
      "header strict-transport-security",
    ]);
  });

  it("reports an unreachable host as failures without leaking the error", async () => {
    const down: Fetcher = async () => {
      throw new Error("connect ECONNREFUSED secret-host.internal");
    };
    const results = await runSmoke("http://localhost:3101", false, down);
    expect(results.every((r) => !r.ok)).toBe(true);
    expect(JSON.stringify(results)).not.toContain("secret-host");
  });
});
