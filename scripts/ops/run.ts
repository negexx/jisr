import {
  type CheckResult,
  checkCacheControl,
  checkHeaders,
  checkHtmlPage,
  checkLocaleRedirect,
  checkNotFound,
  checkRobots,
  checkSitemap,
  checkStatus,
  firstProgramPathInSitemap,
  firstProgramSlugInShard,
  manifestFiles,
} from "./checks";

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

type Fetched = { response: Response; body: string };

const REQUEST_TIMEOUT_MS = 30_000;

// Redirects are never followed: a 307 from the proxy is itself what is being checked. The body is
// read for the checks only and is never printed.
async function get(
  fetcher: Fetcher,
  baseUrl: string,
  path: string,
  headers: Record<string, string> = {},
): Promise<Fetched | null> {
  try {
    const response = await fetcher(`${baseUrl}${path}`, {
      redirect: "manual",
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return { response, body: await response.text() };
  } catch {
    return null;
  }
}

function unreachable(name: string): CheckResult {
  return { name, ok: false, reason: "request failed" };
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

async function homeRedirects(fetcher: Fetcher, baseUrl: string): Promise<CheckResult[]> {
  const plain = await get(fetcher, baseUrl, "/");
  const arabic = await get(fetcher, baseUrl, "/", { "accept-language": "ar" });
  return [
    plain === null
      ? unreachable("GET / redirects to a locale")
      : checkLocaleRedirect(
          "GET / redirects to a locale",
          plain.response.status,
          plain.response.headers.get("location"),
          baseUrl,
          null,
        ),
    arabic === null
      ? unreachable("GET / with Accept-Language ar redirects to /ar")
      : checkLocaleRedirect(
          "GET / with Accept-Language ar redirects to /ar",
          arabic.response.status,
          arabic.response.headers.get("location"),
          baseUrl,
          "ar",
        ),
  ];
}

async function localePages(fetcher: Fetcher, baseUrl: string): Promise<CheckResult[]> {
  const pages = [
    { path: "/fr", locale: "fr" },
    { path: "/ar", locale: "ar" },
    { path: "/en/scholarships", locale: "en" },
  ] as const;
  const results: CheckResult[] = [];
  for (const { path, locale } of pages) {
    const name = `GET ${path} is an html page in ${locale}`;
    const page = await get(fetcher, baseUrl, path);
    results.push(
      page === null
        ? unreachable(name)
        : checkHtmlPage(
            name,
            page.response.status,
            page.response.headers.get("content-type"),
            page.body,
            locale,
          ),
    );
  }
  return results;
}

async function notFoundPages(fetcher: Fetcher, baseUrl: string): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  for (const path of ["/fr/no-such-page", "/fr/programs/no-such-slug"]) {
    const name = `GET ${path} is the trilingual 404`;
    const page = await get(fetcher, baseUrl, path);
    results.push(
      page === null ? unreachable(name) : checkNotFound(name, page.response.status, page.body),
    );
  }
  return results;
}

async function programmePage(
  fetcher: Fetcher,
  baseUrl: string,
  sitemapXml: string | null,
  manifest: unknown,
  expectIndexable: boolean,
): Promise<CheckResult[]> {
  const name = "GET a programme page returns 200";
  let path: string | null = null;
  if (expectIndexable && sitemapXml !== null) {
    path = firstProgramPathInSitemap(sitemapXml);
  } else {
    const { programsShard } = manifestFiles(manifest);
    if (programsShard !== null) {
      const shard = await get(fetcher, baseUrl, `/snapshots/${programsShard}`);
      const slug = shard === null ? null : firstProgramSlugInShard(parseJson(shard.body));
      if (slug !== null) path = `/fr/programs/${slug}`;
    }
  }
  if (path === null) return [{ name, ok: false, reason: "no programme page found to fetch" }];
  const page = await get(fetcher, baseUrl, path);
  return [page === null ? unreachable(name) : checkStatus(name, page.response.status, 200)];
}

export async function runSmoke(
  baseUrl: string,
  expectIndexable: boolean,
  fetcher: Fetcher = fetch,
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  results.push(...(await homeRedirects(fetcher, baseUrl)));
  results.push(...(await localePages(fetcher, baseUrl)));

  const sitemap = await get(fetcher, baseUrl, "/sitemap.xml");
  const manifestFetch = await get(fetcher, baseUrl, "/snapshots/manifest.json");
  const manifest = manifestFetch === null ? null : parseJson(manifestFetch.body);
  results.push(
    ...(await programmePage(
      fetcher,
      baseUrl,
      sitemap === null ? null : sitemap.body,
      manifest,
      expectIndexable,
    )),
  );

  results.push(...(await notFoundPages(fetcher, baseUrl)));

  const home = await get(fetcher, baseUrl, "/fr");
  results.push(
    ...(home === null
      ? [unreachable("security headers on /fr")]
      : checkHeaders(home.response.headers, expectIndexable)),
  );

  results.push(
    manifestFetch === null
      ? unreachable("manifest is revalidated")
      : checkCacheControl("manifest is revalidated", manifestFetch.response.headers, "no-cache"),
  );
  const { coreShard } = manifestFiles(manifest);
  if (coreShard === null) {
    results.push({ name: "shard is immutable", ok: false, reason: "no shard in the manifest" });
  } else {
    const shard = await get(fetcher, baseUrl, `/snapshots/${coreShard}`);
    results.push(
      shard === null
        ? unreachable("shard is immutable")
        : checkCacheControl("shard is immutable", shard.response.headers, "immutable"),
    );
  }

  const robots = await get(fetcher, baseUrl, "/robots.txt");
  results.push(
    robots === null ? unreachable("robots.txt") : checkRobots(robots.body, expectIndexable),
  );
  results.push(
    sitemap === null ? unreachable("sitemap.xml") : checkSitemap(sitemap.body, expectIndexable),
  );

  return results;
}
