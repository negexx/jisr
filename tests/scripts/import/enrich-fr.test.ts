import { describe, expect, it } from "vitest";

import {
  buildProposal,
  enrichProposal,
  enrichRecord,
  type National,
  PAGES,
  readFiche,
  readNational,
  sentence,
} from "../../../scripts/import/enrich-fr";

const FICHE_URL = "https://fiche.example/1";
const FICHE =
  "Fiche formation - Université A Licence - Informatique - Parcoursup Langues et options Langue vivante 1 : Anglais Niveau de français requis pour s'inscrire à la formation : B2 Enseignement à distance Enseignement à distance : Cette formation propose un enseignement à distance.";
const PAGE_TEXT: Record<string, string> = {
  [FICHE_URL]: FICHE,
  [PAGES.licence]:
    "La licence est un diplôme national de l’enseignement supérieur qui se prépare en six semestres au sein de l’Université. La licence valide 180 crédits.",
  [PAGES.but]:
    "Le BUT est un diplôme préparé en 3 ans en IUT (institut universitaire de technologie) qui favorise.",
  [PAGES.fees]:
    "Le montant des droits d’inscription que vous avez à payer est de : 2 902 euros pour une année en cycle de Licence ; 3 950 euros pour une année en cycle Master ; Certains établissements exonèrent les étudiants étrangers du paiement des frais d'inscription différenciés. 178 euros pour une année en cycle de Licence ;",
  [PAGES.certification]:
    "Sauf cas de dispense, la certification de français (TCF, DELF B2, DALF) est obligatoire dans le cadre de la procédure de candidature sur la plateforme Études en France.",
  [PAGES.applyLicence]:
    "Vous êtes titulaire ou futur titulaire du Bac marocain, Bac international marocain : vous devrez formuler vos vœux sur la plateforme Études en France de votre pays de résidence.",
  [PAGES.applyBut]:
    "Bac marocain ou Bac international marocain ou diplôme européen, quelque soit votre lieu de résidence, vous devrez formuler vos vœux sur la plateforme Études en France.",
};
const getText = async (url: string) => {
  const text = PAGE_TEXT[url];
  if (text === undefined) throw new Error("404");
  return text;
};

describe("readFiche", () => {
  it("reads the French level and the distance-learning sentence exactly as the page has them", () => {
    const f = readFiche(FICHE);
    expect(f.frenchLevel).toEqual({
      level: "B2",
      quote: "Niveau de français requis pour s'inscrire à la formation : B2",
    });
    expect(f.distance).toBe("Cette formation propose un enseignement à distance.");
  });
  it("finds nothing on a page that does not state them", () => {
    expect(readFiche("Fiche formation sans niveau")).toEqual({ frenchLevel: null, distance: null });
  });
  it("takes the first, non-EU fee sentence, never the 178 euro EU one", async () => {
    const n = await readNational(getText);
    expect(n.tuition?.quote).toMatch(/^2\s902 euros pour une année en cycle de Licence/);
  });
});

describe("readNational", () => {
  it("reads every national sentence from the live pages, and drops one whose page changed", async () => {
    const all = await readNational(getText);
    expect(Object.values(all).every((v) => v !== null)).toBe(true);
    const changed = await readNational(async (url) =>
      url === PAGES.fees ? "the page was rewritten" : getText(url),
    );
    expect(changed.tuition).toBeNull();
    expect(changed.licenceDuration).not.toBeNull();
  });
  it("sentence() returns null when there is no match", () => {
    expect(sentence("abc", /xyz/)).toBeNull();
  });
});

describe("buildProposal", () => {
  const base = async (): Promise<National> => readNational(getText);
  it("builds duration, fee, channel and a French-level rule for a public Licence", async () => {
    const p = buildProposal({
      slug: "x",
      fiche: FICHE_URL,
      isBut: false,
      publicInstitution: true,
      facts: readFiche(FICHE),
      national: await base(),
    });
    expect(p.facts.durationYears?.value).toBe(3);
    expect(p.facts.tuition?.value).toEqual({
      amountMinor: 290200,
      currency: "EUR",
      period: "year",
    });
    expect(p.facts.applicationChannel?.value).toBe("fr-campus-france");
    expect(p.requirements?.rules.map((r) => r.kind)).toEqual([
      "language_proficiency",
      "manual_check",
      "manual_check",
    ]);
  });
  it("adds no fee for a private institution and uses the BUT sources for a BUT", async () => {
    const p = buildProposal({
      slug: "x",
      fiche: FICHE_URL,
      isBut: true,
      publicInstitution: false,
      facts: readFiche("rien"),
      national: await base(),
    });
    expect(p.facts.tuition).toBeUndefined();
    expect(p.facts.durationYears?.evidence[0]?.url).toBe(PAGES.but);
    expect(p.facts.applicationChannel?.evidence[0]?.url).toBe(PAGES.applyBut);
    expect(p.requirements?.rules).toEqual([]);
  });
});

describe("enrichRecord", () => {
  const record = {
    slug: "fr-a-licence-informatique-1",
    institution: "fr-a",
    country: "FR",
    city: "lille",
    field: "computer-science",
    level: "bachelor",
    name: "Licence - Informatique",
    summary: { fr: { text: "Licence - Informatique, Université A (Lille).", status: "draft" } },
    officialUrl: FICHE_URL,
    durationYears: { value: null, source: "fiche", info_kind: "official" },
    teachingLanguages: { value: null, source: "fiche", info_kind: "official" },
    tuition: { value: null, source: "fiche", info_kind: "official" },
    intakes: { value: null, source: "fiche", info_kind: "official" },
    applicationChannel: { value: null, source: "fiche", info_kind: "official" },
    documents: { value: null, source: "fiche", info_kind: "official" },
    requirements: { coverage: "partial", source: "fiche", info_kind: "official", rules: [] },
    scholarships: [],
    sources: { fiche: { url: FICHE_URL, last_verified_at: "2026-10-01" } },
  };

  it("fills the verified facts with their quotes' pages as sources and dates them", async () => {
    const out = await enrichRecord({
      record,
      institutionType: "public",
      fiche: FICHE_URL,
      national: await readNational(getText),
      getText,
      date: "2026-10-02",
    });
    expect(out?.facts.sort()).toEqual(["applicationChannel", "durationYears", "tuition"]);
    expect(out?.record).toMatchObject({
      durationYears: { value: 3, info_kind: "official" },
      tuition: { value: { amountMinor: 290200 } },
      applicationChannel: { value: "fr-campus-france" },
      requirements: { coverage: "partial" },
    });
    expect(JSON.stringify(out?.record)).not.toContain("_review");
    expect(JSON.stringify(out?.record)).not.toContain('"last_verified_at":null');
  });

  it("leaves a fact it cannot verify as to be checked", async () => {
    const national = await readNational(getText);
    const broken: National = {
      ...national,
      tuition: { url: PAGES.fees, quote: "9 999 euros pour une année en cycle de Licence" },
    };
    const out = await enrichRecord({
      record,
      institutionType: "public",
      fiche: FICHE_URL,
      national: broken,
      getText,
      date: "2026-10-02",
    });
    expect(out?.record.tuition).toMatchObject({ value: null });
    expect(out?.facts).not.toContain("tuition");
  });

  it("does nothing when the programme's own page cannot be verified", async () => {
    const out = await enrichRecord({
      record: { ...record, name: "Licence - Astrophysique quantique avancée" },
      institutionType: "public",
      fiche: FICHE_URL,
      national: await readNational(getText),
      getText,
      date: "2026-10-02",
    });
    expect(out).toBeNull();
  });
});

describe("enrichProposal", () => {
  it("builds the same proposal enrichRecord applies, for a record's own fiche and the national pages", async () => {
    const proposal = await enrichProposal({
      record: { slug: "fr-test-licence-1", name: "Licence Informatique", officialUrl: FICHE_URL },
      institutionType: "public",
      fiche: FICHE_URL,
      national: await readNational(getText),
      getText,
    });
    expect(proposal.programmePage).toBe(FICHE_URL);
    expect(proposal.facts.durationYears?.value).toBe(3);
    expect(proposal.facts.applicationChannel?.value).toBe("fr-campus-france");
    expect(proposal.requirements?.rules.some((r) => r.kind === "language_proficiency")).toBe(true);
  });
});
