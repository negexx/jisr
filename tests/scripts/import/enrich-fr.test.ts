import { describe, expect, it } from "vitest";
import {
  buildProposal,
  calendarIntakes,
  enrichProposal,
  enrichRecord,
  type National,
  PAGES,
  readFiche,
  readNational,
  sentence,
} from "../../../scripts/import/enrich-fr";
import { htmlToText, quoteInText } from "../../../scripts/import/evidence";

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
    "Bac marocain ou Bac international marocain ou diplôme européen, quelque soit votre lieu de résidence, vous devrez formuler vos vœux sur la plateforme Études en France. Calendrier de candidature. Du 1er octobre 2026 au 15 novembre 2026 à 23h59 (heure marocaine). Ensuite, patientez.",
  [PAGES.calendarLicence]:
    "Le calendrier de la procédure de candidature Du 1er octobre 2026 au 15 novembre 2026 à 23h59 (heure marocaine) pour toutes les formations connectées à la plateforme Études en France : DAP blanche : 1ère année de Licence à l'Université (L1) ou 1ère année PASS/L.AS ; DAP jaune : École Nationale d’Architecture ENSA ; Universités connectées : 2ème année de Licence (L2), ...",
};
const LICENCE_CALENDAR_HTML =
  "<html><body><h1>Le calendrier de la procédure de candidature</h1><p>Du 1er&nbsp;octobre 2026&nbsp;au 15&nbsp;novembre 2026 à&nbsp;23h59 (heure&nbsp;marocaine) pour toutes les formations connectées à la plateforme Études&nbsp;en France&nbsp;: DAP&nbsp;blanche&nbsp;: 1ère année de Licence à l&#39;Université&nbsp;(L1) ou 1ère année PASS/L.AS&nbsp;; DAP jaune&nbsp;: École Nationale d’Architecture ENSA&nbsp;; Universités connectées&nbsp;: 2ème année de Licence (L2), ...</p></body></html>";
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
    const { notes, ...rest } = all;
    expect(notes).toBeUndefined();
    expect(Object.values(rest).every((v) => v !== null)).toBe(true);
    const changed = await readNational(async (url) =>
      url === PAGES.fees ? "the page was rewritten" : getText(url),
    );
    expect(changed.tuition).toBeNull();
    expect(changed.licenceDuration).not.toBeNull();
  });
  it("sentence() returns null when there is no match", () => {
    expect(sentence("abc", /xyz/)).toBeNull();
  });

  it("reads the BUT calendar sentence exactly as the page text has it, with no-break spaces", async () => {
    const html =
      "<html><body><p>Calendrier</p><p>Du 1er&nbsp;octobre 2026&nbsp;au 15&nbsp;novembre 2026 à&nbsp;23h59 (heure&nbsp;marocaine).</p><p>Autre</p></body></html>";
    const text = htmlToText(html);
    const n = await readNational(async (url) => (url === PAGES.applyBut ? text : getText(url)));
    expect(n.butCalendar).toEqual({
      url: PAGES.applyBut,
      quote: "Du 1er octobre 2026 au 15 novembre 2026 à 23h59 (heure marocaine).",
    });
    expect(quoteInText(n.butCalendar?.quote ?? "", text)).toBe(true);
  });

  it("reads the Licence calendar, without a full stop, from the Campus France calendar page", async () => {
    const text = htmlToText(LICENCE_CALENDAR_HTML);
    const n = await readNational(async (url) =>
      url === PAGES.calendarLicence ? text : getText(url),
    );
    expect(n.licenceCalendar).toEqual({
      url: PAGES.calendarLicence,
      quote: "Du 1er octobre 2026 au 15 novembre 2026 à 23h59 (heure marocaine)",
    });
    expect(n.licenceCalendarAudience).toEqual({
      url: PAGES.calendarLicence,
      quote: "DAP blanche : 1ère année de Licence à l'Université (L1)",
    });
    expect(quoteInText(n.licenceCalendar?.quote ?? "", text)).toBe(true);
    expect(quoteInText(n.licenceCalendarAudience?.quote ?? "", text)).toBe(true);
    expect(n.notes).toBeUndefined();
  });

  it("still takes a calendar sentence that ends with a full stop, and does not count the stop as a difference", async () => {
    const withStop = "Du 1er octobre 2026 au 15 novembre 2026 à 23h59 (heure marocaine).";
    const audience = "DAP blanche : 1ère année de Licence à l'Université (L1)";
    const n = await readNational(async (url) =>
      url === PAGES.calendarLicence
        ? `${withStop} ${audience}. Rappel : Du 1er octobre 2026 au 15 novembre 2026 à 23h59 (heure marocaine) pour tous.`
        : getText(url),
    );
    expect(n.licenceCalendar?.quote).toBe(withStop);
    expect(n.notes).toBeUndefined();
  });

  it("proposes no Licence calendar when the page carries two distinct date sentences, and says so", async () => {
    const text =
      "Du 1er octobre 2026 au 15 novembre 2026 à 23h59 (heure marocaine) pour les L1 ; Du 2 décembre 2026 au 20 janvier 2027 à 23h59 (heure marocaine) pour les autres. DAP blanche : 1ère année de Licence à l'Université (L1)";
    const n = await readNational(async (url) =>
      url === PAGES.calendarLicence ? text : getText(url),
    );
    expect(n.licenceCalendar).toBeNull();
    expect(n.notes?.join(" ")).toMatch(/Licence: several calendar sentences found: not proposing/);
  });

  it("keeps the Licence calendar but no audience, and notes it, when the L1 line is missing", async () => {
    const n = await readNational(async (url) =>
      url === PAGES.calendarLicence
        ? "Du 1er octobre 2026 au 15 novembre 2026 à 23h59 (heure marocaine) pour les formations connectées."
        : getText(url),
    );
    expect(n.licenceCalendar).not.toBeNull();
    expect(n.licenceCalendarAudience).toBeNull();
    expect(n.notes?.join(" ")).toMatch(/Licence: .*who it is for.*not proposing/);
  });

  it("has no Licence calendar when the page is unreachable", async () => {
    const n = await readNational(async (url) => {
      if (url === PAGES.calendarLicence) throw new Error("404");
      return getText(url);
    });
    expect(n.licenceCalendar).toBeNull();
    expect(n.licenceCalendarAudience).toBeNull();
  });

  it("proposes no BUT calendar when the page carries several calendar sentences, and says so", async () => {
    const text =
      "Du 1er octobre 2026 au 15 novembre 2026 à 23h59 (heure marocaine). Pour les étudiants déjà en France : Du 2 décembre 2026 au 20 janvier 2027 à 23h59 (heure marocaine).";
    const n = await readNational(async (url) => (url === PAGES.applyBut ? text : getText(url)));
    expect(n.butCalendar).toBeNull();
    expect(n.notes?.join(" ")).toMatch(/several calendar sentences found: not proposing/);
  });

  it("keeps the calendar when the same sentence is repeated", async () => {
    const one = "Du 1er octobre 2026 au 15 novembre 2026 à 23h59 (heure marocaine).";
    const n = await readNational(async (url) =>
      url === PAGES.applyBut ? `${one} Autre texte. ${one}` : getText(url),
    );
    expect(n.butCalendar?.quote).toBe(one);
    expect(n.notes ?? []).toEqual([]);
  });

  it("has no BUT calendar when the page does not carry the sentence", async () => {
    const n = await readNational(async (url) =>
      url === PAGES.applyBut ? "Rien de tel ici." : getText(url),
    );
    expect(n.butCalendar).toBeNull();
  });
});

describe("calendarIntakes", () => {
  it("turns the Licence quote, which has no full stop, into ISO dates", () => {
    expect(
      calendarIntakes({
        url: PAGES.calendarLicence,
        quote: "Du 1er octobre 2026 au 15 novembre 2026 à 23h59 (heure marocaine)",
      }),
    ).toEqual({
      startDate: null,
      applicationOpens: "2026-10-01",
      applicationDeadline: "2026-11-15",
    });
  });
  it("turns the BUT sentence into ISO dates", () => {
    expect(
      calendarIntakes({
        url: PAGES.applyBut,
        quote: "Du 1er octobre 2026 au 15 novembre 2026 à 23h59 (heure marocaine).",
      }),
    ).toEqual({
      startDate: null,
      applicationOpens: "2026-10-01",
      applicationDeadline: "2026-11-15",
    });
  });
  it("accepts a plain day number and the other months", () => {
    expect(
      calendarIntakes({
        url: PAGES.applyBut,
        quote: "Du 15 janvier 2027 au 1er mars 2027 à 23h59 (heure marocaine).",
      }),
    ).toEqual({
      startDate: null,
      applicationOpens: "2027-01-15",
      applicationDeadline: "2027-03-01",
    });
    expect(
      calendarIntakes({
        url: PAGES.applyBut,
        quote: "Du 2 octobre 2026 au 3 novembre 2026 à 12h00 (heure marocaine).",
      }),
    ).toMatchObject({ applicationOpens: "2026-10-02", applicationDeadline: "2026-11-03" });
  });
  it("parses month names written without accents", () => {
    expect(
      calendarIntakes({
        url: PAGES.applyBut,
        quote: "Du 1er decembre 2026 au 28 fevrier 2027 à 23h59 (heure marocaine).",
      }),
    ).toMatchObject({ applicationOpens: "2026-12-01", applicationDeadline: "2027-02-28" });
    expect(
      calendarIntakes({
        url: PAGES.applyBut,
        quote: "Du 1er décembre 2026 au 28 février 2027 à 23h59 (heure marocaine).",
      }),
    ).toMatchObject({ applicationOpens: "2026-12-01", applicationDeadline: "2027-02-28" });
    expect(
      calendarIntakes({
        url: PAGES.applyBut,
        quote: "Du 1er août 2026 au 2 août 2026 (heure marocaine).",
      }),
    ).toMatchObject({ applicationOpens: "2026-08-01", applicationDeadline: "2026-08-02" });
  });
  it("is null for an impossible date", () => {
    expect(
      calendarIntakes({
        url: PAGES.applyBut,
        quote: "Du 31 février 2026 au 1er mars 2026 à 23h59 (heure marocaine).",
      }),
    ).toBeNull();
  });
  it("is null when there are not two dates, or a month is unknown", () => {
    expect(
      calendarIntakes({ url: PAGES.applyBut, quote: "Candidature avant le 15 novembre 2026." }),
    ).toBeNull();
    expect(calendarIntakes({ url: PAGES.applyBut, quote: "Du 1er octobre 2026." })).toBeNull();
    expect(
      calendarIntakes({
        url: PAGES.applyBut,
        quote: "Du 1er octobrr 2026 au 15 novembre 2026 (heure marocaine).",
      }),
    ).toBeNull();
  });
  it("is null when the range is reversed", () => {
    expect(
      calendarIntakes({
        url: PAGES.applyBut,
        quote: "Du 15 novembre 2026 au 1er octobre 2026 à 23h59 (heure marocaine).",
      }),
    ).toBeNull();
  });
  it("is null for the shared-month form, which names the month once", () => {
    expect(
      calendarIntakes({
        url: PAGES.applyBut,
        quote: "Du 1er au 15 octobre 2026 à 23h59 (heure marocaine).",
      }),
    ).toBeNull();
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
