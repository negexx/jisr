import { describe, expect, it } from "vitest";

import { readSiteEnv, SiteEnvError } from "@/lib/site-env";

describe("readSiteEnv", () => {
  it("is not indexable and has no urls when nothing is set (safe by default)", () => {
    expect(readSiteEnv({})).toEqual({
      siteUrl: null,
      indexable: false,
      snapshotBaseUrl: null,
      goatCounterUrl: null,
    });
  });

  it("treats blank values as unset", () => {
    expect(
      readSiteEnv({ NEXT_PUBLIC_SITE_URL: "  ", NEXT_PUBLIC_GOATCOUNTER_URL: "" }).siteUrl,
    ).toBe(null);
  });

  it("is indexable with a valid site url", () => {
    const env = readSiteEnv({ NEXT_PUBLIC_SITE_URL: "https://jisr.vercel.app" });
    expect(env.siteUrl).toBe("https://jisr.vercel.app");
    expect(env.indexable).toBe(true);
  });

  it("is never indexable on a Vercel preview even with a site url", () => {
    const env = readSiteEnv({
      NEXT_PUBLIC_SITE_URL: "https://jisr.vercel.app",
      VERCEL_ENV: "preview",
    });
    expect(env.indexable).toBe(false);
    expect(env.siteUrl).toBe("https://jisr.vercel.app");
  });

  it.each([
    "jisr.vercel.app",
    "ftp://jisr.vercel.app",
    "http://jisr.vercel.app",
    "https://jisr.vercel.app/",
    "https://jisr.vercel.app/fr",
    "https://jisr.vercel.app?x=1",
    "https://jisr.vercel.app#top",
    "https://user:pw@jisr.vercel.app",
  ])("rejects site url %s", (value) => {
    expect(() => readSiteEnv({ NEXT_PUBLIC_SITE_URL: value })).toThrow(SiteEnvError);
  });

  it("allows http only for localhost", () => {
    expect(readSiteEnv({ NEXT_PUBLIC_SITE_URL: "http://localhost:3101" }).siteUrl).toBe(
      "http://localhost:3101",
    );
  });

  it.each([
    "/snapshots",
    "https://cdn.example.com/snapshots",
    "https://cdn.example.com",
  ])("accepts snapshot base url %s", (value) => {
    expect(readSiteEnv({ NEXT_PUBLIC_SNAPSHOT_BASE_URL: value }).snapshotBaseUrl).toBe(value);
  });

  it.each([
    "snapshots",
    "//cdn.example.com",
    "http://cdn.example.com",
    "/snapshots/",
    "/s?x=1",
    "/s#h",
    "https://cdn.example.com/snapshots/",
    "https://cdn.example.com/s?x=1",
    "https://user:pw@cdn.example.com",
  ])("rejects snapshot base url %s", (value) => {
    expect(() => readSiteEnv({ NEXT_PUBLIC_SNAPSHOT_BASE_URL: value })).toThrow(SiteEnvError);
  });

  // The client (snapshotBaseUrl in use-snapshot.ts) uses the raw value and does not trim it, so
  // padding that this module silently accepted would break every fetch in the browser.
  it.each([" /snapshots", "/snapshots ", "   "])("rejects padded snapshot base url %j", (value) => {
    expect(() => readSiteEnv({ NEXT_PUBLIC_SNAPSHOT_BASE_URL: value })).toThrow(SiteEnvError);
  });

  it("treats an empty snapshot base url as unset, like the client does", () => {
    expect(readSiteEnv({ NEXT_PUBLIC_SNAPSHOT_BASE_URL: "" }).snapshotBaseUrl).toBe(null);
  });

  it("accepts a goatcounter url only in production, but validates it always", () => {
    const url = "https://jisr.goatcounter.com/count";
    expect(
      readSiteEnv({
        NEXT_PUBLIC_SITE_URL: "https://jisr.vercel.app",
        NEXT_PUBLIC_GOATCOUNTER_URL: url,
      }).goatCounterUrl,
    ).toBe(url);
    expect(readSiteEnv({ NEXT_PUBLIC_GOATCOUNTER_URL: url }).goatCounterUrl).toBe(null);
    for (const bad of [
      "https://evil.example/count",
      "http://jisr.goatcounter.com/count",
      "https://jisr.goatcounter.com/count?x=1",
      "https://jisr.goatcounter.com",
    ]) {
      expect(() => readSiteEnv({ NEXT_PUBLIC_GOATCOUNTER_URL: bad })).toThrow(SiteEnvError);
    }
  });

  it("names the offending variable in the error", () => {
    expect(() => readSiteEnv({ NEXT_PUBLIC_SITE_URL: "nope" })).toThrow(/NEXT_PUBLIC_SITE_URL/);
    expect(() => readSiteEnv({ NEXT_PUBLIC_SNAPSHOT_BASE_URL: "nope" })).toThrow(
      /NEXT_PUBLIC_SNAPSHOT_BASE_URL/,
    );
    expect(() => readSiteEnv({ NEXT_PUBLIC_GOATCOUNTER_URL: "nope" })).toThrow(
      /NEXT_PUBLIC_GOATCOUNTER_URL/,
    );
  });
});
