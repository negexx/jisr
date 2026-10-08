import { describe, expect, it } from "vitest";
import type { Ateneo } from "../../../scripts/import/sources/mur";
import type { Candidate } from "../../../scripts/import/sources/universitaly";
import {
  buildUniversitalyRecords,
  resolveAteneo,
} from "../../../scripts/import/sources/universitaly-stage";
import { READ_SOURCE } from "../../../scripts/import/staging";
import { programmeSummary } from "../../../scripts/import/summaries";
import { SourceKeySchema } from "../../../src/data-schema/primitives";

const atenei: Ateneo[] = [
  {
    code: "0201",
    fullName: "Università degli studi di Genova",
    shortName: "Genova",
    statale: true,
    city: "GENOVA",
    region: "Liguria",
  },
  {
    code: "0301",
    fullName: "Politecnico di Milano",
    shortName: "Milano Politecnico",
    statale: true,
    city: "MILANO",
    region: "Lombardia",
  },
  {
    code: "0401",
    fullName: "Università degli studi di Padova",
    shortName: "Padova",
    statale: true,
    city: "PADOVA",
    region: "Veneto",
  },
  {
    code: "0501",
    fullName: 'Libera Università Mediterranea "Giuseppe Degennaro"',
    shortName: "LUM G. Degennaro",
    statale: false,
    city: "CASAMASSIMA",
    region: "Puglia",
  },
  {
    code: "0601",
    fullName: "Università degli studi di Milano",
    shortName: "Milano",
    statale: true,
    city: "MILANO",
    region: "Lombardia",
  },
];

const cand = (over: Partial<Candidate> = {}): Candidate => ({
  portalId: 1625723,
  university: "Università degli Studi di GENOVA",
  name: "Computer Engineering",
  classCode: "L-8",
  classCodes: ["L-8"],
  field: "engineering",
  confidence: "high",
  durationYears: 3,
  url: "https://corsi.unige.it/corsi/12133",
  academicYear: "2026/2027",
  delivery: "conventional",
  ...over,
});

const build = (candidates: Candidate[], ours: { slug: string; name: string }[] = []) =>
  buildUniversitalyRecords({ candidates, atenei, ourInstitutions: ours, fetchedAt: "2026-10-08" });

describe("resolveAteneo", () => {
  it("resolves by exact name key, ignoring case and accents", () => {
    expect(resolveAteneo("Università degli Studi di GENOVA", atenei)).toMatchObject({
      code: "0201",
    });
    expect(resolveAteneo("POLITECNICO DI MILANO", atenei)).toMatchObject({ code: "0301" });
  });
  it("resolves a short portal spelling to the one university that contains its distinctive words", () => {
    expect(resolveAteneo('LUM "Giuseppe Degennaro"', atenei)).toMatchObject({ code: "0501" });
  });
  it("returns null for an unknown university and 'ambiguous' when two match equally", () => {
    expect(resolveAteneo("Università di Trento", atenei)).toBeNull();
    expect(resolveAteneo("Università di Milano", atenei)).toBe("ambiguous");
  });
});

describe("buildUniversitalyRecords", () => {
  it("stages a new university once and one programme per candidate, with the portal link and TODO facts", () => {
    const { records, report } = build([
      cand(),
      cand({ portalId: 7, name: "Electrical Engineering", url: null }),
    ]);
    const inst = records.filter((r) => r.collection === "institutions");
    const progs = records.filter((r) => r.collection === "programs");
    expect(inst).toHaveLength(1);
    expect(inst[0]?.id).toBe("it-genova-genova");
    expect(inst[0]?.sourceId).toBe("mur-institution:0201@genova");
    expect(progs.map((p) => p.id)).toEqual([
      "it-genova-genova-computer-engineering-l8",
      "it-genova-genova-electrical-engineering-l8",
    ]);
    const p = progs[0];
    expect(p?.sourceId).toBe("universitaly:1625723");
    expect(p?.data).toMatchObject({
      institution: "it-genova-genova",
      country: "IT",
      city: "genova",
      field: "engineering",
      level: "bachelor",
      name: "Computer Engineering",
      officialUrl: "https://corsi.unige.it/corsi/12133",
    });
    expect((p?.data.durationYears as { info_kind: string }).info_kind).toBe(READ_SOURCE);
    expect((p?.data.tuition as { info_kind: string }).info_kind).toBe(READ_SOURCE);
    expect(p?.review.todo).toContain("portal");
    expect(p?.review.todo).toContain("3 years");
    expect(progs[1]?.data.officialUrl).toBeNull();
    expect(progs[1]?.review.todo).toContain("no portal link");
    expect(report.staged).toHaveLength(2);
  });
  it("reuses one of our institutions and stages no institution record", () => {
    const { records, report } = build(
      [
        cand({
          university: "Università degli Studi di PADOVA",
          name: "Economics, governance and decision-making",
          classCode: "L-33",
          classCodes: ["L-33"],
          field: "business-economics",
          delivery: "blended",
        }),
      ],
      [{ slug: "it-padova-padova", name: "Università degli studi di Padova" }],
    );
    expect(records.filter((r) => r.collection === "institutions")).toHaveLength(0);
    expect(records[0]?.data.institution).toBe("it-padova-padova");
    expect(records[0]?.review.todo).toContain("blended");
    expect(report.reusedInstitutions).toEqual(["it-padova-padova"]);
  });
  it("reuses the existing slug of a university whose portal spelling differs (LUM)", () => {
    const { records } = build(
      [
        cand({
          university: 'LUM "Giuseppe Degennaro"',
          name: "Business Economics and Organization",
          classCode: "L-18",
          classCodes: ["L-18"],
          field: "business-economics",
          delivery: "blended",
        }),
      ],
      [
        {
          slug: "it-casamassima-lum-g-degennaro-casamassima",
          name: 'Libera Università Mediterranea "Giuseppe Degennaro"',
        },
      ],
    );
    expect(records.filter((r) => r.collection === "institutions")).toHaveLength(0);
    expect(records[0]?.data.institution).toBe("it-casamassima-lum-g-degennaro-casamassima");
  });
  it("refuses a candidate whose university is unknown, ambiguous or has several institutions of ours", () => {
    const unknown = build([cand({ portalId: 1, university: "Università di Trento" })]);
    expect(unknown.records).toEqual([]);
    expect(unknown.report.refused).toEqual([
      { portalId: 1, reason: expect.stringContaining("no MUR university") },
    ]);
    const ambiguous = build([cand({ portalId: 2, university: "Università di Milano" })]);
    expect(ambiguous.report.refused[0]?.reason).toContain("more than one");
    const campus = build(
      [cand({ portalId: 3, university: "Università degli Studi di PADOVA" })],
      [
        { slug: "it-padova-padova", name: "Università degli studi di Padova" },
        { slug: "it-padova-rovigo", name: "Università degli studi di Padova" },
      ],
    );
    expect(campus.report.refused[0]?.reason).toContain("campus");
  });
  it("refuses two candidates that would get the same programme slug", () => {
    expect(() => build([cand(), cand({ portalId: 99 })])).toThrow(/same slug/);
  });
});

describe("the universitaly source name", () => {
  it("is a valid source key and has a summary line in all three languages", () => {
    expect(SourceKeySchema.safeParse("universitaly").success).toBe(true);
    const summary = programmeSummary(
      "Computer Engineering",
      "Università di Genova",
      "Genova",
      "universitaly",
    );
    expect(summary.fr.text).toContain("Universitaly");
    expect(summary.en.text).toContain("Universitaly");
    expect(summary.ar.text).toContain("Universitaly");
  });
});
