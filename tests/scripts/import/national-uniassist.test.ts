import { describe, expect, it } from "vitest";
import { parseRegistry } from "../../../scripts/import/national";
import {
  parseSheet,
  type SheetRow,
  uniAssistEntries,
} from "../../../scripts/import/national-uniassist";

const NOTE =
  "Please inform yourself at the university about its special application procedure. We will issue you with a preliminary review documentation, the so-called Vorpüfungsdokumentation (VPD). You are then required to submit your application with the VPD directly to the university.";
const DIRECT_SENTENCE =
  "You are then required to submit your application with the VPD directly to the university.";

const row = (over: Partial<SheetRow> = {}): SheetRow => ({
  uniAssistId: "16",
  name: "Ansbach University of Applied Sciences",
  mode: "vpd_only",
  matchedInstitutions: "de-ansbach",
  detailUrl: "https://www.uni-assist.de/en/tools/uni-assist-universities/detail/hochschule/16/",
  note: NOTE,
  ...over,
});

describe("uniAssistEntries", () => {
  it("turns a matched vpd_only row into one applicationChannel entry with the VPD sentence", () => {
    const { entries, forPerson } = uniAssistEntries([row()]);
    expect(forPerson).toEqual([]);
    expect(entries).toHaveLength(1);
    const [entry] = entries;
    expect(entry).toMatchObject({
      id: "de-uni-assist-vpd-16",
      fact: "applicationChannel",
      channel: "de-uni-assist-vpd",
      infoKind: "official",
      selector: { country: "DE", institutions: ["de-ansbach"] },
    });
    const [evidence] = entry?.evidence ?? [];
    expect(evidence?.url).toBe(
      "https://www.uni-assist.de/en/tools/uni-assist-universities/detail/hochschule/16/",
    );
    expect(evidence?.quote).toBe(DIRECT_SENTENCE);
    expect(NOTE).toContain(evidence?.quote ?? "");
    expect(evidence?.quote.length).toBeGreaterThanOrEqual(15);
  });

  it("produces entries that the registry schema accepts", () => {
    const { entries } = uniAssistEntries([row(), row({ uniAssistId: "17", name: "Other" })]);
    expect(() => parseRegistry({ entries })).not.toThrow();
  });

  it("falls back to the first sentence with VPD wording when none says 'directly'", () => {
    const note = "Please ask the university. We issue a preliminary review documentation first.";
    const { entries } = uniAssistEntries([row({ note })]);
    expect(entries[0]?.evidence[0]?.quote).toBe(
      "We issue a preliminary review documentation first.",
    );
  });

  it("sends a processes row to forPerson with a reason and no entry", () => {
    const { entries, forPerson } = uniAssistEntries([row({ mode: "processes", note: "" })]);
    expect(entries).toEqual([]);
    expect(forPerson).toHaveLength(1);
    expect(forPerson[0]?.name).toBe("Ansbach University of Applied Sciences");
    expect(forPerson[0]?.reason).toMatch(/processes/);
  });

  it("sends a special row to forPerson", () => {
    const { entries, forPerson } = uniAssistEntries([row({ mode: "special" })]);
    expect(entries).toEqual([]);
    expect(forPerson[0]?.reason).toMatch(/special/);
  });

  it("sends a vpd_only row with no matched institution to forPerson", () => {
    const { entries, forPerson } = uniAssistEntries([row({ matchedInstitutions: "" })]);
    expect(entries).toEqual([]);
    expect(forPerson[0]?.reason).toMatch(/no matched institution/);
  });

  it("sends a vpd_only row whose note has no VPD wording to forPerson", () => {
    const { entries, forPerson } = uniAssistEntries([
      row({ note: "Please inform yourself at the university about its special procedure." }),
    ]);
    expect(entries).toEqual([]);
    expect(forPerson[0]?.reason).toMatch(/VPD wording/);
  });

  it("sends a row whose detail url is not https to forPerson", () => {
    const { entries, forPerson } = uniAssistEntries([row({ detailUrl: "http://example.org/x" })]);
    expect(entries).toEqual([]);
    expect(forPerson[0]?.reason).toMatch(/https/);
  });

  it("keeps both slugs of a row that matches two institutions in one entry", () => {
    const { entries } = uniAssistEntries([row({ matchedInstitutions: "de-a;de-b" })]);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.selector.institutions).toEqual(["de-a", "de-b"]);
  });

  it("keeps entry ids unique and kebab-case when ids repeat or are missing", () => {
    const { entries } = uniAssistEntries([
      row({ uniAssistId: "16" }),
      row({ uniAssistId: "16", name: "Twin" }),
      row({ uniAssistId: "", name: "Hochschule Für Ärzte" }),
    ]);
    const ids = entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(3);
    for (const id of ids) expect(id).toMatch(/^de-uni-assist-vpd-[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });
});

describe("parseSheet", () => {
  it("reads the review sheet columns, quoted cells included", () => {
    const csv = [
      "uniAssistId,name,city,website,mode,matchMethod,matchedInstitutions,sameTownCandidates,detailUrl,note",
      '16,Ansbach,Ansbach,https://www.hs-ansbach.de/en,vpd_only,host+city,de-a;de-b,,https://www.uni-assist.de/x/16/,"One, two. VPD here."',
    ].join("\n");
    expect(parseSheet(csv)).toEqual([
      {
        uniAssistId: "16",
        name: "Ansbach",
        mode: "vpd_only",
        matchedInstitutions: "de-a;de-b",
        detailUrl: "https://www.uni-assist.de/x/16/",
        note: "One, two. VPD here.",
      },
    ]);
  });

  it("refuses a sheet without the expected columns", () => {
    expect(() => parseSheet("a,b\n1,2\n")).toThrow();
  });
});
