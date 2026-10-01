import { describe, expect, it } from "vitest";

import {
  type Entry,
  matchInstitution,
  type OurInstitution,
  parseDetail,
  parseList,
  uniAssistCsv,
} from "../../../scripts/import/sources/uniassist";

const detailText = (name: string, tail: string) =>
  `Start Tools uni-assist universities ${name} Address ${name} ${tail} Legal disclosure Terms and Conditions`;

describe("parseList", () => {
  it("reads the options of the university select, decoding names and skipping non-detail ones", () => {
    const html = `<select>
      <option value="">Select</option>
      <option value="32" data-url="/en/tools/uni-assist-universities/detail/hochschule/32/" data-region="76">Technical University of Munich (TUM)</option>
      <option value="82" data-url="/en/tools/uni-assist-universities/detail/hochschule/82/">Hochschule Darmstadt (h_da) &ndash; University of Applied Sciences</option>
      <option value="9" data-url="/en/other/">Not a university</option>
    </select>`;
    expect(parseList(html).map((e) => [e.id, e.name])).toEqual([
      [32, "Technical University of Munich (TUM)"],
      [82, "Hochschule Darmstadt (h_da) - University of Applied Sciences"],
    ]);
  });
});

describe("parseDetail", () => {
  it("says uni-assist processes the application when the page has no note", () => {
    const d = parseDetail(
      detailText(
        "Hochschule Bonn-Rhein-Sieg",
        "Grantham-Allee 20 53757 Sankt Augustin www.h-brs.de/de",
      ),
      "Hochschule Bonn-Rhein-Sieg",
    );
    expect(d).toMatchObject({
      mode: "processes",
      city: "Sankt Augustin",
      website: "https://www.h-brs.de/de",
      note: "",
    });
  });

  it("recognises the VPD-only note, quoted verbatim", () => {
    const note =
      "Please inform yourself at the university about its special application procedure. We will issue you with a preliminary review documentation, the so-called Vorpüfungsdokumentation (VPD). You are then required to submit your application with the VPD directly to the university.";
    const d = parseDetail(
      detailText(
        "Technical University of Munich (TUM)",
        `Arcisstraße 21 80333 München www.tum.de/en Note ${note}`,
      ),
      "Technical University of Munich (TUM)",
    );
    expect(d).toMatchObject({ mode: "vpd_only", city: "München", note });
  });

  it("flags notes that only concern some courses or levels as special", () => {
    const d = parseDetail(
      detailText(
        "University of Cologne - VPD",
        "Albertus-Magnus-Platz 50923 Köln https://www.portal.uni-koeln.de/x Note For study courses allocated via the VPD -procedure the following applies: Please inform yourself at the university. The VPD is submitted directly to the university.",
      ),
      "University of Cologne - VPD",
    );
    expect(d?.mode).toBe("special");
  });

  it("returns null for a page that does not have the expected layout", () => {
    expect(parseDetail("nothing here", "Some University")).toBeNull();
  });
});

const entry = (over: Partial<Entry>): Entry => ({
  id: 1,
  path: "/x/",
  name: "Test University",
  website: null,
  city: null,
  note: "",
  mode: "processes",
  detailUrl: "https://www.uni-assist.de/x/",
  ...over,
});
const ours: OurInstitution[] = [
  {
    slug: "a-kleve",
    name: "Hochschule Rhein-Waal",
    city: "Kleve",
    website: "https://www.hochschule-rhein-waal.de/",
  },
  {
    slug: "a-kamp",
    name: "Hochschule Rhein-Waal",
    city: "Kamp-Lintfort",
    website: "https://www.hochschule-rhein-waal.de/",
  },
  {
    slug: "whs",
    name: "Westfälische Hochschule Gelsenkirchen",
    city: "Gelsenkirchen",
    website: "https://www.w-hs.de/",
  },
  { slug: "tuc", name: "Technische Universität Chemnitz", city: "Chemnitz", website: null },
  {
    slug: "other-chemnitz",
    name: "Hochschule Mittweida Campus",
    city: "Chemnitz",
    website: "https://x.example/",
  },
];

describe("matchInstitution", () => {
  it("matches the website host and narrows several campus units by town", () => {
    const m = matchInstitution(
      entry({ website: "https://www.hochschule-rhein-waal.de/en", city: "Kleve" }),
      ours,
    );
    expect(m).toEqual({ slugs: ["a-kleve"], method: "host+city", candidates: [] });
  });

  it("keeps every campus unit when the town is not one of them", () => {
    const m = matchInstitution(
      entry({ website: "https://www.hochschule-rhein-waal.de/", city: "Emmerich" }),
      ours,
    );
    expect(m.method).toBe("host");
    expect(m.slugs).toEqual(["a-kleve", "a-kamp"]);
  });

  it("treats a language subdomain as the same site", () => {
    const m = matchInstitution(
      entry({ website: "https://www.en.w-hs.de", city: "Gelsenkirchen" }),
      ours,
    );
    expect(m).toMatchObject({ slugs: ["whs"], method: "domain+city" });
  });

  it("falls back to an exact normalised name, ignoring a parenthesised suffix", () => {
    const m = matchInstitution(
      entry({
        name: "Technische Universität Chemnitz (TU Chemnitz)",
        website: "https://tu.example/",
      }),
      ours,
    );
    expect(m).toMatchObject({ slugs: ["tuc"], method: "name" });
  });

  it("never guesses: an unmatched entry lists the institutions of its town for a person", () => {
    const m = matchInstitution(
      entry({ name: "Chemnitz Art School", website: "https://art.example/", city: "Chemnitz" }),
      ours,
    );
    expect(m.method).toBe("none");
    expect(m.slugs).toEqual([]);
    expect(m.candidates).toEqual(["tuc", "other-chemnitz"]);
  });
});

describe("uniAssistCsv", () => {
  it("writes one quoted row per university with the verbatim note", () => {
    const csv = uniAssistCsv([
      {
        entry: entry({
          name: 'A, "B" University',
          mode: "vpd_only",
          note: "Please inform yourself.",
        }),
        match: { slugs: ["x"], method: "host", candidates: [] },
      },
    ]);
    expect(csv.split("\n")[0]).toContain("sameTownCandidates");
    expect(csv).toContain('"A, ""B"" University"');
    expect(csv).toContain("vpd_only,host,x,,");
  });
});
