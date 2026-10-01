import { describe, expect, it } from "vitest";

import type { Candidate } from "../../../scripts/import/shortlist";
import { scoreCandidate, selectShortlist, shortlistCsv } from "../../../scripts/import/shortlist";

const base: Candidate = {
  slug: "p",
  country: "FR",
  field: "computer-science",
  institution: "i",
  confidence: "high",
  languages: null,
  hasEnglishName: false,
  institutionType: "public",
  institutionMatched: true,
  hasDates: false,
  source: "parcoursup",
};
const c = (over: Partial<Candidate>): Candidate => ({ ...base, ...over });

describe("scoreCandidate", () => {
  it("drops low-confidence fields", () => {
    expect(scoreCandidate(c({ confidence: "low" }))).toBeNull();
  });
  it("drops German-only teaching and German programmes with no stated language", () => {
    const daad = c({ country: "DE", source: "daad", languages: ["de"] });
    expect(scoreCandidate(daad)).toBeNull();
    expect(scoreCandidate(c({ country: "DE", source: "ba", languages: null }))).toBeNull();
  });
  it("ranks English-only above bilingual German programmes", () => {
    const en = scoreCandidate(c({ country: "DE", source: "daad", languages: ["en"] }));
    const both = scoreCandidate(c({ country: "DE", source: "daad", languages: ["de", "en"] }));
    expect(en).not.toBeNull();
    expect(both).not.toBeNull();
    expect((en ?? 0) > (both ?? 0)).toBe(true);
  });
  it("requires an English name for Dutch programmes", () => {
    expect(scoreCandidate(c({ country: "NL", source: "rio", institutionType: null }))).toBeNull();
    expect(
      scoreCandidate(
        c({ country: "NL", source: "rio", institutionType: null, hasEnglishName: true }),
      ),
    ).not.toBeNull();
  });
  it("drops Dutch programmes that are not publicly funded", () => {
    expect(
      scoreCandidate(
        c({
          country: "NL",
          source: "rio",
          institutionType: null,
          hasEnglishName: true,
          notPubliclyFunded: true,
        }),
      ),
    ).toBeNull();
  });
  it("prefers public institutions and register-matched ones", () => {
    const pub = scoreCandidate(c({ institutionType: "public" })) ?? 0;
    const priv = scoreCandidate(c({ institutionType: "private" })) ?? 0;
    expect(pub > priv).toBe(true);
  });
});

describe("selectShortlist", () => {
  const many = (institution: string, n: number): Candidate[] =>
    Array.from({ length: n }, (_, i) => c({ slug: `${institution}-${i}`, institution }));

  it("fills the quota round-robin across institutions", () => {
    const picked = selectShortlist([...many("a", 5), ...many("b", 5), ...many("c", 5)], {
      perCountryField: 6,
      perInstitution: 3,
    });
    expect(picked).toHaveLength(6);
    expect(picked.map((p) => p.institution).sort()).toEqual(["a", "a", "b", "b", "c", "c"]);
  });
  it("caps programmes per institution", () => {
    const picked = selectShortlist(many("only", 10), { perCountryField: 8, perInstitution: 3 });
    expect(picked).toHaveLength(3);
  });
  it("applies the quota per country and field and is deterministic", () => {
    const input = [
      ...many("a", 4),
      ...many("b", 4).map((x) => ({ ...x, field: "engineering", slug: `e-${x.slug}` })),
      ...many("n", 4).map((x) => ({
        ...x,
        country: "NL",
        hasEnglishName: true,
        institutionType: null as null,
        source: "rio" as const,
        slug: `n-${x.slug}`,
      })),
    ];
    const limits = { perCountryField: 2, perInstitution: 3 };
    const first = selectShortlist(input, limits);
    expect(first).toHaveLength(6);
    expect(selectShortlist([...input].reverse(), limits).map((p) => p.slug)).toEqual(
      first.map((p) => p.slug),
    );
  });
  it("writes a csv", () => {
    const [row] = selectShortlist(many("a", 1), { perCountryField: 1, perInstitution: 1 });
    expect(shortlistCsv(row ? [row] : [])).toMatch(
      /^slug,country,field,institution,score,source\na-0,FR,computer-science,a,/,
    );
  });
});
