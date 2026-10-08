import { expect, test } from "@playwright/test";

// The fixture build has no NEXT_PUBLIC_SITE_URL, so it behaves like a preview: not indexable.
// Request-level checks only (no page rendering), so one project is enough.

test("robots.txt disallows everything on a build without a site url", async ({ request }) => {
  const response = await request.get("/robots.txt", { maxRedirects: 0 });
  expect(response.status()).toBe(200);
  const body = await response.text();
  expect(body).toMatch(/^Disallow:\s*\/\s*$/im);
  expect(body).not.toMatch(/^Allow:/im);
  expect(body).not.toMatch(/^Sitemap:/im);
});

test("sitemap.xml lists no URL on a build without a site url", async ({ request }) => {
  const response = await request.get("/sitemap.xml", { maxRedirects: 0 });
  expect(response.status()).toBe(200);
  expect(await response.text()).not.toContain("<url>");
});

test("pages carry the security headers and noindex", async ({ request }) => {
  const response = await request.get("/fr", { maxRedirects: 0 });
  expect(response.status()).toBe(200);
  const headers = response.headers();
  expect(headers["x-robots-tag"]).toContain("noindex");
  expect(headers["strict-transport-security"]).toMatch(/max-age=\d+/);
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
});

test("an unknown page is the trilingual 404 with status 404", async ({ request }) => {
  const response = await request.get("/fr/no-such-page", { maxRedirects: 0 });
  expect(response.status()).toBe(404);
  expect(await response.text()).toContain('lang="ar"');
});

test("the bare origin redirects to a locale", async ({ request }) => {
  const response = await request.get("/", { maxRedirects: 0 });
  expect([307, 308]).toContain(response.status());
  const location = response.headers().location ?? "";
  expect(new URL(location, "http://localhost").pathname).toMatch(/^\/(fr|en|ar)$/);
});
