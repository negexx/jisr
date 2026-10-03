import { describe, expect, it } from "vitest";

import { applyEnrichment, enrichRecord, type Verified } from "../../../scripts/import/proposals";

type Rec = Record<string, unknown>;

const registerRecord = (): Rec => ({
  slug: "de-xx",
  officialUrl: "https://www2.daad.de/x/10648/",
  summary: { fr: { text: "s", status: "draft" } },
  durationYears: { value: 3, source: "daad", info_kind: "guidance" },
  teachingLanguages: { value: ["en"], source: "daad", info_kind: "guidance" },
  tuition: { value: null, source: "daad", info_kind: "guidance" },
  intakes: { value: null, source: "daad", info_kind: "guidance" },
  applicationChannel: { value: null, source: "daad", info_kind: "guidance" },
  documents: { value: null, source: "daad", info_kind: "guidance" },
  requirements: { coverage: "partial", source: "daad", info_kind: "guidance", rules: [] },
  scholarships: [],
  sources: { daad: { url: "https://www2.daad.de/x/10648/", last_verified_at: "2026-10-01" } },
  _review: { revises: true },
});

const verified = (facts: Verified["facts"], extra: Partial<Verified> = {}): Verified => ({
  programmePage: null,
  facts,
  rejected: [],
  ...extra,
});

const tuitionFact = {
  value: { amountMinor: 150000, currency: "EUR", period: "semester" },
  evidence: [
    {
      url: "https://hs.example/fees",
      quote: "Tuition for non-EU students: EUR 1,500 per semester",
    },
  ],
};

// read a nested record without casts in every test
const at = (record: Rec, key: string): Rec => record[key] as Rec;

const TODAY = "2026-10-02";

describe("applyEnrichment", () => {
  it("fills a missing fact and adds its source with no date", () => {
    const next = applyEnrichment(registerRecord(), verified({ tuition: tuitionFact }), TODAY);
    expect(next.tuition).toEqual({
      value: tuitionFact.value,
      source: "page-1",
      info_kind: "official",
    });
    expect(at(next, "sources")["page-1"]).toEqual({
      url: "https://hs.example/fees",
      last_verified_at: null,
    });
  });

  it("keeps old sources and their dates", () => {
    const next = applyEnrichment(registerRecord(), verified({ tuition: tuitionFact }), TODAY);
    expect(at(at(next, "sources"), "daad").last_verified_at).toBe("2026-10-01");
  });

  const languagesFact = {
    value: ["en", "de"],
    evidence: [{ url: "https://hs.example/lang", quote: "Taught in English and German" }],
  };

  it("replaces a guidance value when the programme page was verified, and leaves facts the reader did not establish alone", () => {
    const next = applyEnrichment(
      registerRecord(),
      verified({ teachingLanguages: languagesFact }, { programmePage: "https://hs.example/cs" }),
      TODAY,
    );
    expect(next.teachingLanguages).toEqual({
      value: ["en", "de"],
      source: "page-1",
      info_kind: "official",
    });
    expect(next.durationYears).toEqual({ value: 3, source: "daad", info_kind: "guidance" });
  });

  it("without a verified programme page keeps a non-null guidance value and says what the reader found", () => {
    const before = registerRecord();
    const { record, conflicts } = enrichRecord(
      before,
      verified({ teachingLanguages: languagesFact }),
      TODAY,
    );
    expect(record.teachingLanguages).toEqual(before.teachingLanguages);
    const note = `teachingLanguages: kept the register value; the reader found ${JSON.stringify(languagesFact.value)} at https://hs.example/lang but no programme page was verified`;
    expect(conflicts).toEqual([note]);
    expect(String(at(record, "_review").notes)).toContain(note);
    expect(record.sources).toEqual(before.sources);
  });

  it("without a verified programme page still fills a missing fact next to a kept guidance value", () => {
    const { record, conflicts } = enrichRecord(
      registerRecord(),
      verified({ teachingLanguages: languagesFact, tuition: tuitionFact }),
      TODAY,
    );
    expect(at(record, "tuition")).toMatchObject({
      value: tuitionFact.value,
      info_kind: "official",
    });
    expect(at(record, "teachingLanguages").value).toEqual(["en"]);
    expect(conflicts).toHaveLength(1);
  });

  it("without a verified programme page says nothing when the guidance value already agrees", () => {
    const before = registerRecord();
    const same = { ...languagesFact, value: ["en"] };
    expect(enrichRecord(before, verified({ teachingLanguages: same }), TODAY)).toEqual({
      record: before,
      conflicts: [],
    });
  });

  it("never overwrites an existing official value, and says so", () => {
    const valueA = { amountMinor: 100000, currency: "EUR", period: "year" };
    const record: Rec = {
      ...registerRecord(),
      tuition: { value: valueA, source: "programme", info_kind: "official" },
    };
    const next = applyEnrichment(record, verified({ tuition: tuitionFact }), TODAY);
    expect(at(next, "tuition").value).toEqual(valueA);
    expect(at(next, "_review").notes).toContain("tuition: kept the existing official value");

    const same = applyEnrichment(
      record,
      verified({ tuition: { ...tuitionFact, value: valueA } }),
      TODAY,
    );
    expect(same).toBe(record);
  });

  it("reuses the key of a source with the same url", () => {
    const next = applyEnrichment(
      registerRecord(),
      verified({
        tuition: {
          ...tuitionFact,
          evidence: [{ url: "https://www2.daad.de/x/10648/", quote: "q" }],
        },
      }),
      TODAY,
    );
    expect(at(next, "tuition").source).toBe("daad");
    expect(Object.keys(at(next, "sources"))).toEqual(["daad"]);
  });

  it("uses the smallest free page-N key", () => {
    const record: Rec = {
      ...registerRecord(),
      sources: {
        ...at(registerRecord(), "sources"),
        "page-1": { url: "https://hs.example/other", last_verified_at: null },
      },
    };
    const next = applyEnrichment(record, verified({ tuition: tuitionFact }), TODAY);
    expect(at(next, "tuition").source).toBe("page-2");
    expect(at(at(next, "sources"), "page-2").url).toBe("https://hs.example/fees");
  });

  it("converts documents to the record shape", () => {
    const next = applyEnrichment(
      registerRecord(),
      verified({
        documents: {
          value: [{ slug: "cv", name: { fr: "CV", en: "CV" }, translationRequired: null }],
          evidence: [{ url: "https://hs.example/docs", quote: "Please submit your CV" }],
        },
      }),
      TODAY,
    );
    expect(at(next, "documents").value).toEqual([
      {
        slug: "cv",
        name: { fr: { text: "CV", status: "draft" }, en: { text: "CV", status: "draft" } },
        translationRequired: null,
      },
    ]);
  });

  it("leaves requirements, officialUrl, summary and scholarships untouched", () => {
    const before = registerRecord();
    const next = applyEnrichment(before, verified({ tuition: tuitionFact }), TODAY);
    expect(next.requirements).toEqual(registerRecord().requirements);
    expect(next.officialUrl).toBe("https://www2.daad.de/x/10648/");
    expect(next.summary).toEqual(registerRecord().summary);
    expect(next.scholarships).toEqual([]);
  });

  it("returns the same object when nothing was accepted", () => {
    const record = registerRecord();
    expect(applyEnrichment(record, verified({}), TODAY)).toBe(record);
    expect(
      applyEnrichment(
        record,
        verified({ tuition: { value: tuitionFact.value, evidence: [] } }),
        TODAY,
      ),
    ).toBe(record);
  });

  it("marks a changed record for the audit sample", () => {
    const next = applyEnrichment(registerRecord(), verified({ tuition: tuitionFact }), TODAY);
    const review = at(next, "_review");
    expect(review.preparedBy).toBe("assistant");
    expect(review.preparedAt).toBe(TODAY);
    expect(review.evidence).toEqual([
      {
        fact: "tuition",
        url: "https://hs.example/fees",
        quote: "Tuition for non-EU students: EUR 1,500 per semester",
      },
    ]);
    expect(String(review.todo)).toMatch(/prepared by the assistant from the quoted pages/);
    expect(review.revises).toBe(true);
  });

  it("carries what the reader rejected into the audit notes", () => {
    const next = applyEnrichment(
      registerRecord(),
      verified(
        { tuition: tuitionFact },
        { rejected: [{ fact: "durationYears", reason: "no quote was found" }] },
      ),
      TODAY,
    );
    expect(at(next, "_review").rejected).toEqual(["durationYears: no quote was found"]);
  });

  it("says when the programme page was not verified, and not when it was", () => {
    const note =
      "programme page not verified: facts come from pages not tied to this programme by name";
    const without = applyEnrichment(registerRecord(), verified({ tuition: tuitionFact }), TODAY);
    expect(String(at(without, "_review").notes)).toContain(note);
    const withPage = applyEnrichment(
      registerRecord(),
      verified({ tuition: tuitionFact }, { programmePage: "https://hs.example/cs" }),
      TODAY,
    );
    expect(String(at(withPage, "_review").notes ?? "")).not.toContain(note);
  });

  it("shows the competing value and its url in a conflict note", () => {
    const valueA = { amountMinor: 100000, currency: "EUR", period: "year" };
    const record: Rec = {
      ...registerRecord(),
      tuition: { value: valueA, source: "programme", info_kind: "official" },
    };
    const next = applyEnrichment(record, verified({ tuition: tuitionFact }), TODAY);
    expect(String(at(next, "_review").notes)).toContain(
      `tuition: kept the existing official value; the reader found ${JSON.stringify(tuitionFact.value)} at https://hs.example/fees`,
    );
  });

  it("appends conflict notes to the existing notes and keeps the reader notes", () => {
    const valueA = { amountMinor: 100000, currency: "EUR", period: "year" };
    const record: Rec = {
      ...registerRecord(),
      tuition: { value: valueA, source: "programme", info_kind: "official" },
      _review: { revises: true, notes: "earlier note" },
    };
    const next = applyEnrichment(
      record,
      verified({ tuition: tuitionFact }, { notes: "older tariff" }),
      TODAY,
    );
    const notes = String(at(next, "_review").notes);
    expect(notes.startsWith("earlier note; tuition: kept the existing official value")).toBe(true);
    expect(notes).toContain("older tariff");
  });

  it("merges the evidence of earlier runs without duplicates", () => {
    const earlier = { fact: "tuition", url: "https://hs.example/fees", quote: "same quote" };
    const other = { fact: "durationYears", url: "https://hs.example/d", quote: "d" };
    const record: Rec = {
      ...registerRecord(),
      _review: { revises: true, evidence: [other, earlier] },
    };
    const next = applyEnrichment(
      record,
      verified({
        tuition: {
          value: tuitionFact.value,
          evidence: [{ url: earlier.url, quote: earlier.quote }],
        },
      }),
      TODAY,
    );
    expect(at(next, "_review").evidence).toEqual([other, earlier]);
  });
});

describe("applyEnrichment: a recurring deadline", () => {
  const recurringIntakes = {
    value: [
      {
        startDate: null,
        applicationOpens: null,
        applicationDeadline: null,
        recurringDeadline: { month: 7, day: 15 },
      },
    ],
    evidence: [
      {
        url: "https://hs.example/apply",
        quote: "Applicants from outside the EU: application deadline 15 July",
      },
    ],
  };

  it("stores the recurring item as official with the new source", () => {
    const next = applyEnrichment(registerRecord(), verified({ intakes: recurringIntakes }), TODAY);
    expect(next.intakes).toEqual({
      value: recurringIntakes.value,
      source: "page-1",
      info_kind: "official",
    });
    expect(at(next, "sources")["page-1"]).toEqual({
      url: "https://hs.example/apply",
      last_verified_at: null,
    });
  });

  it("keeps an existing official dated intake", () => {
    const dated = {
      value: [{ startDate: null, applicationOpens: null, applicationDeadline: "2027-05-01" }],
      source: "daad",
      info_kind: "official",
    };
    const next = applyEnrichment(
      { ...registerRecord(), intakes: dated },
      verified({ intakes: recurringIntakes }),
      TODAY,
    );
    expect(next.intakes).toEqual(dated);
  });
});
