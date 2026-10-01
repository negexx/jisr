import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { decodeBytes, probeHttps } from "../../../scripts/import/http";
import { parseHrkList, sectorOfSponsor } from "../../../scripts/import/sources/hrk";
import {
  buildDuoRecord,
  buildHrkRecord,
  resolveSite,
} from "../../../scripts/import/sources/institutions";
import { ownSitesByUai } from "../../../scripts/import/sources/onisep-actions";
import { parseCsv, READ_SOURCE, toYaml, writeStaged } from "../../../scripts/import/staging";
import { hostKey, isOriginUrl, isUrlShortener } from "../../../scripts/import/text";

const hrk = (over: Partial<Parameters<typeof buildHrkRecord>[0]> = {}) => ({
  hsNr: "7",
  name: "Hochschule Beispiel",
  kind: "Universitäten",
  sponsor: "öffentlich-rechtlich",
  state: "Bayern",
  city: "München",
  homepage: "https://www.beispiel.de/",
  alias: "",
  ...over,
});
const duo = (over: Partial<Parameters<typeof buildDuoRecord>[0]> = {}) => ({
  code: "99XX",
  name: "Hogeschool Voorbeeld",
  kind: "hbo" as const,
  city: "Utrecht",
  website: "www.voorbeeld.nl",
  denomination: "Overige",
  ...over,
});
const none = new Map<string, string | null>();

describe("URL helpers", () => {
  it("recognises front-door addresses", () => {
    expect(isOriginUrl("https://www.x.de")).toBe(true);
    expect(isOriginUrl("https://www.x.de/")).toBe(true);
    expect(isOriginUrl("https://x.de/studium/service")).toBe(false);
    expect(isOriginUrl("https://x.de/?utm_source=a")).toBe(false);
    expect(isOriginUrl("https://x.de/#top")).toBe(false);
    expect(isOriginUrl("not a url")).toBe(false);
  });
  it("compares hosts without www and spots shorteners", () => {
    expect(hostKey("https://WWW.Example.de/a")).toBe("example.de");
    expect(isUrlShortener("https://bit.ly/abc")).toBe(true);
    expect(isUrlShortener("https://example.de/abc")).toBe(false);
  });
});

describe("resolveSite", () => {
  it("accepts an https front door without a note", () => {
    expect(resolveSite("https://www.x.de/", none)).toEqual({ url: "https://www.x.de/", note: "" });
  });
  it("flags tracking links and deep pages instead of passing them as clean", () => {
    const tracked = resolveSite("https://iu.prf.hn/click/camref:1/creativeref:2", none);
    expect(tracked.url).not.toBeNull();
    expect(tracked.note).toMatch(/page or carries a query/);
    expect(resolveSite("https://hu-berlin.de/studium/service", none).note).toMatch(/homepage/);
  });
  it("uses the probed https address and says when the domain changed", () => {
    const same = resolveSite(
      "http://www.x.de",
      new Map([["http://www.x.de", "https://www.x.de/"]]),
    );
    expect(same.note).toMatch(/the https form answers/);
    const moved = resolveSite(
      "http://uvt.nl",
      new Map([["http://uvt.nl", "https://www.tilburguniversity.edu/"]]),
    );
    expect(moved.url).toBe("https://www.tilburguniversity.edu/");
    expect(moved.note).toMatch(/different domain \(tilburguniversity\.edu\)/);
  });
  it("reports a failed probe and an empty website honestly", () => {
    expect(resolveSite("www.y.nl", new Map([["www.y.nl", null]]))).toMatchObject({
      url: null,
      note: expect.stringMatching(/probe failed/),
    });
    expect(resolveSite("  ", none)).toEqual({ url: null, note: "no website listed" });
  });
});

describe("staged institution records", () => {
  it("never claim info_kind official: a human reads the institution's own page", () => {
    for (const record of [
      buildHrkRecord(hrk(), none),
      buildHrkRecord(hrk({ sponsor: "kirchlich, staatlich anerkannt" }), none),
      buildHrkRecord(hrk({ sponsor: "???" }), none),
      buildHrkRecord(hrk({ homepage: "" }), none),
      buildDuoRecord(duo(), none),
    ]) {
      expect(record.data.info_kind).toBe(READ_SOURCE);
    }
  });
  it("leave the type null when it is church-run or unknown, and set it otherwise", () => {
    expect(buildHrkRecord(hrk(), none).data.type).toBe("public");
    expect(buildHrkRecord(hrk({ sponsor: "privat, staatlich anerkannt" }), none).data.type).toBe(
      "private",
    );
    const church = buildHrkRecord(hrk({ sponsor: "kirchlich, staatlich anerkannt" }), none);
    expect(church.data.type).toBeNull();
    expect(church.review.todo).toMatch(/church-run/);
    expect(buildHrkRecord(hrk({ sponsor: "???" }), none).data.type).toBeNull();
    expect(buildDuoRecord(duo(), none).data.type).toBeNull();
  });
  it("use stable ids: HRK number or DUO code in the slug", () => {
    expect(buildHrkRecord(hrk(), none).id).toBe("de-hochschule-beispiel-hrk7");
    expect(buildDuoRecord(duo(), none).id).toBe("nl-hogeschool-voorbeeld-99xx");
  });
  it("surface the DUO denomination as a hint", () => {
    expect(buildDuoRecord(duo({ denomination: "Rijks" }), none).review.todo).toMatch(/"Rijks"/);
  });
});

describe("HRK parsing", () => {
  const header =
    "Hs-Nr.\tHochschulkurzname\tHochschulname\tHochschultyp\tTrägerschaft\tBundesland\tOrt (Hausanschrift)\tHome Page";
  it("keeps a quoted name that spans two lines as one row, without the quotes", () => {
    const text = [
      header,
      '763\tMUC\t"Munich University of Digital \nTechnologies & Applied Sciences"\tFachhochschulen / HAW\tprivat, staatlich anerkannt\tBayern\tMünchen\thttps://x.example/',
      '186\tKSH\t"Katholische    Stiftungshochschule  München"\tFachhochschulen / HAW\tkirchlich, staatlich anerkannt\tBayern\tMünchen\thttps://y.example/',
    ].join("\r\n");
    const parsed = parseHrkList(text);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({
      hsNr: "763",
      name: "Munich University of Digital Technologies & Applied Sciences",
    });
    expect(parsed[1]?.name).toBe("Katholische Stiftungshochschule München");
  });
  it("accepts a quote in the middle of a cell as a literal character", () => {
    const rows = parseCsv('a\tb\nx"y\tz', "\t");
    expect(rows[0]).toEqual({ a: 'x"y', b: "z" });
  });
  it("still maps a plain church sponsor to no type", () => {
    expect(sectorOfSponsor("kirchlich, staatlich anerkannt").type).toBeNull();
  });
});

describe("decodeBytes", () => {
  it("maps undefined cp1252 bytes to C1 codes that the staging guard rejects", () => {
    const text = decodeBytes(Uint8Array.from([0x41, 0x81]), "windows-1252");
    expect(text).toBe("A\u0081");
    expect(() => toYaml({ name: text })).toThrow(/control characters/);
  });
  it("applies the cp1252 table to latin1 labels too, which Node maps to the same decoder", () => {
    expect(decodeBytes(Uint8Array.from([0x96]), "latin1")).toBe("–");
  });
  it("rejects the replacement character produced by bad UTF-8", () => {
    expect(() => toYaml({ name: "caf�" })).toThrow(/control characters/);
  });
});

describe("writeStaged validation", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "jisr-stage-"));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const record = (slug: string, name: string) => ({
    collection: "fields",
    id: slug,
    data: { slug, name },
    review: {
      kind: "fields",
      slug,
      name: slug,
      institution: "",
      city: "",
      field: "",
      confidence: "",
      officialUrl: "",
      todo: "",
    },
  });

  it("writes nothing when any record is bad", async () => {
    const stagingDir = path.join(root, "staging");
    await expect(
      writeStaged([record("good", "ok"), record("bad", "x\u0096y")], {
        overwrite: false,
        stagingDir,
        dataDir: path.join(root, "data"),
      }),
    ).rejects.toThrow(/control characters/);
    expect(existsSync(path.join(stagingDir, "fields", "good.yaml"))).toBe(false);
  });
});

describe("probeHttps", () => {
  let root: string;
  let cacheFile: string;
  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "jisr-probe-"));
    cacheFile = path.join(root, "probe.json");
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const answer = (finalUrl: string, ok = true) => {
    const response = new Response("x", { status: ok ? 200 : 403 });
    Object.defineProperty(response, "url", { value: finalUrl });
    return response;
  };

  it("returns the final https address without the query and caches successes only", async () => {
    let calls = 0;
    const fetchImpl = async (url: string) => {
      calls++;
      if (url.includes("blocked")) throw new Error("ECONNRESET");
      if (url.includes("forbidden")) return answer(url, false);
      return answer(`${url}/de/?conv=abc123#x`);
    };
    const urls = ["http://www.ok.de", "www.blocked.de", "http://www.forbidden.de"];
    const first = await probeHttps(urls, { cacheFile, fetchImpl, concurrency: 2 });
    expect(first.get("http://www.ok.de")).toBe("https://www.ok.de/de/");
    expect(first.get("www.blocked.de")).toBeNull();
    expect(first.get("http://www.forbidden.de")).toBeNull();
    expect(Object.keys(JSON.parse(readFileSync(cacheFile, "utf8")))).toEqual(["http://www.ok.de"]);

    calls = 0;
    await probeHttps(urls, { cacheFile, fetchImpl, concurrency: 2 });
    expect(calls).toBe(2); // the success is cached; both failures are retried
  });

  it("honours refresh by ignoring the cache", async () => {
    let calls = 0;
    const fetchImpl = async (url: string) => {
      calls++;
      return answer(`${url}/`);
    };
    await probeHttps(["http://a.de"], { cacheFile, fetchImpl });
    await probeHttps(["http://a.de"], { cacheFile, fetchImpl });
    expect(calls).toBe(1);
    await probeHttps(["http://a.de"], { cacheFile, fetchImpl, refresh: true });
    expect(calls).toBe(2);
  });

  it("does not trust a redirect that ends on plain http", async () => {
    const fetchImpl = async () => answer("http://downgraded.example/");
    const result = await probeHttps(["http://a.de"], { cacheFile, fetchImpl });
    expect(result.get("http://a.de")).toBeNull();
  });
});

describe("onisep own sites", () => {
  it("prefers a front door over a deep link, and ignores shorteners", () => {
    const sites = ownSitesByUai([
      { ens_code_uai: "A", ens_site_web: "https://iut.example/formations/dut-x" },
      { ens_code_uai: "A", ens_site_web: "https://iut.example/formations/dut-x" },
      { ens_code_uai: "A", ens_site_web: "https://iut.example/" },
      { ens_code_uai: "B", ens_site_web: "https://bit.ly/Faculte" },
    ]);
    expect(sites.get("A")).toBe("https://iut.example/");
    expect(sites.has("B")).toBe(false);
  });
});
