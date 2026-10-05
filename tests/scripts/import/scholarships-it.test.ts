import { describe, expect, it } from "vitest";

import { mentionsInternationalApplicants } from "../../../scripts/import/evidence";
import {
  type ScholarshipProposal,
  ScholarshipProposalSchema,
  verifyScholarship,
} from "../../../scripts/import/scholarships";

// Italian regional right-to-study agencies (DSU) write their calls in Italian: the verifier must
// read the same things in Italian as in English, German, Dutch and French, and no looser.
const HOME = "https://dsu.example.it/borse";
const WHO = `${HOME}/chi`;
const LEVEL = `${HOME}/livello`;
const HOW = `${HOME}/come`;

const pages: Record<string, string> = {
  [HOME]: "Borsa di studio regionale per il diritto allo studio universitario.",
  [WHO]:
    "Possono presentare domanda gli studenti stranieri extra UE iscritti ai corsi di laurea. Gli studenti provenienti dal Marocco possono chiedere l'ISEE parificato. Studenti non comunitari con redditi all'estero presentano la documentazione legalizzata. I cittadini stranieri non possono presentare domanda dopo la scadenza. La borsa è riservata ai cittadini italiani residenti in Toscana. Gli studenti stranieri sono esclusi da questo bando. Sono ammessi studenti internazionali di tutti i paesi tranne il Marocco. Il bando prevede corsi di lingue straniere per tutti. Lo studente straniero non può presentare domanda. Gli studenti extra UE non sono idonei. Gli studenti stranieri non vengono ammessi. Gli studenti stranieri non beneficiano della borsa. La borsa è rivolta esclusivamente agli studenti italiani, non agli stranieri. Ufficio Studenti Stranieri di Ateneo. Lingua  Straniera del corso.",
  [LEVEL]:
    "La borsa è destinata agli studenti iscritti ai corsi di laurea. Il bando è rivolto agli iscritti ai corsi di laurea, di laurea magistrale e di laurea magistrale a ciclo unico. Il bando riguarda i corsi di laurea e di laurea magistrale. Possono partecipare gli studenti iscritti alla laurea triennale. Il bando è rivolto agli iscritti ai corsi di laurea magistrale. Il bando è per gli iscritti ai corsi di dottorato di ricerca. Possono partecipare i candidati in possesso della laurea. Il bando è per i laureati che vogliono iscriversi a un master. Il bando è rivolto a chi si iscrive a un corso di laurea magistrale dopo la laurea triennale. Studenti che hanno conseguito la laurea e si iscrivono ai corsi di laurea. Corso di laurea di secondo livello. Corso di laurea di secondo ciclo. Iscritti alla laurea specialistica. Iscritti a un percorso postlaurea. Dopo il conseguimento del diploma di laurea. Corsi di laurea specialistica.",
  [HOW]: "Presenta la domanda online dal tuo Dossier Utente entro le scadenze del bando.",
};
const getText = async (url: string) => {
  const text = pages[url];
  if (text === undefined) throw new Error("404");
  return text;
};

const q = (url: string, quote: string) => ({ url, quote });

function proposal(over: Record<string, unknown> = {}): ScholarshipProposal {
  return ScholarshipProposalSchema.parse({
    slug: "it-dsu-test",
    name: "Borsa DSU di prova",
    provider: "Agenzia DSU di prova",
    destinations: ["IT"],
    eligibleNationalities: [],
    fields: [],
    summary: { fr: "Une bourse régionale." },
    howToApply: { fr: "Candidature en ligne." },
    officialUrl: HOME,
    support: null,
    deadline: null,
    documents: null,
    evidence: {
      eligibility: [
        q(
          WHO,
          "Possono presentare domanda gli studenti stranieri extra UE iscritti ai corsi di laurea",
        ),
      ],
      level: [q(LEVEL, "La borsa è destinata agli studenti iscritti ai corsi di laurea")],
      howToApply: [q(HOW, "Presenta la domanda online dal tuo Dossier Utente")],
    },
    ...over,
  });
}

async function run(over: Record<string, unknown> = {}) {
  return verifyScholarship(proposal(over), getText);
}
const reasonsOf = (r: Awaited<ReturnType<typeof run>>): string =>
  r.ok ? "" : r.reasons.join(" | ");
const evidence = (over: Record<string, unknown>) => ({
  ...(proposal().evidence as Record<string, unknown>),
  ...over,
});

describe("international applicants in Italian", () => {
  it.each([
    "Possono presentare domanda gli studenti stranieri",
    "cittadini extra UE",
    "studenti extra-UE",
    "studenti non comunitari",
    "studenti non UE residenti all'estero",
    "studenti internazionali",
    "cittadini di paesi extracomunitari",
  ])("names international applicants (%s)", (quote) => {
    expect(mentionsInternationalApplicants(quote)).toBe(true);
  });

  it.each([
    "corsi di lingue straniere",
    "la lingua straniera del corso",
    "Ufficio relazioni internazionali di Ateneo",
    "Gli studenti italiani iscritti",
    "Lingua  Straniera del corso",
    "Ufficio Studenti Stranieri di Ateneo",
  ])("does not take %s for international applicants", (quote) => {
    expect(mentionsInternationalApplicants(quote)).toBe(false);
  });
});

describe("Italian eligibility", () => {
  it("accepts a verbatim Italian quote about foreign students and builds a bachelor record", async () => {
    const result = await run();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.record.level).toBe("bachelor");
  });

  it.each([
    "I cittadini stranieri non possono presentare domanda dopo la scadenza",
    "La borsa è riservata ai cittadini italiani residenti in Toscana",
    "Gli studenti stranieri sono esclusi da questo bando",
    "Lo studente straniero non può presentare domanda",
    "Gli studenti extra UE non sono idonei",
    "Gli studenti stranieri non vengono ammessi",
    "Gli studenti stranieri non beneficiano della borsa",
    "La borsa è rivolta esclusivamente agli studenti italiani, non agli stranieri",
  ])("rejects an Italian exclusion (%s)", async (quote) => {
    const result = await run({ evidence: evidence({ eligibility: [q(WHO, quote)] }) });
    expect(result.ok).toBe(false);
    expect(reasonsOf(result)).toMatch(/exclusion/);
  });

  it("names Morocco in Italian when the nationality is listed", async () => {
    const ok = await run({
      eligibleNationalities: ["MA"],
      evidence: evidence({
        eligibility: [
          q(
            WHO,
            "Possono presentare domanda gli studenti stranieri extra UE iscritti ai corsi di laurea",
          ),
          q(WHO, "Gli studenti provenienti dal Marocco possono chiedere l'ISEE parificato"),
        ],
      }),
    });
    expect(ok.ok).toBe(true);
    const missing = await run({ eligibleNationalities: ["MA"] });
    expect(missing.ok).toBe(false);
    expect(reasonsOf(missing)).toMatch(/names MA/);
    const except = await run({
      eligibleNationalities: ["MA"],
      evidence: evidence({
        eligibility: [
          q(WHO, "Sono ammessi studenti internazionali di tutti i paesi tranne il Marocco"),
        ],
      }),
    });
    expect(except.ok).toBe(false);
  });
});

describe("Italian level", () => {
  const level = (...quotes: string[]) =>
    run({ evidence: evidence({ level: quotes.map((quote) => q(LEVEL, quote)) }) });

  it.each([
    "La borsa è destinata agli studenti iscritti ai corsi di laurea",
    "Il bando è rivolto agli iscritti ai corsi di laurea, di laurea magistrale e di laurea magistrale a ciclo unico",
    "Il bando riguarda i corsi di laurea e di laurea magistrale",
    "Possono partecipare gli studenti iscritti alla laurea triennale",
  ])("accepts a bachelor or both-levels quote (%s)", async (quote) => {
    expect((await level(quote)).ok).toBe(true);
  });

  it.each([
    "Il bando è rivolto agli iscritti ai corsi di laurea magistrale",
    "Il bando è per gli iscritti ai corsi di dottorato di ricerca",
    "Possono partecipare i candidati in possesso della laurea",
    "Il bando è per i laureati che vogliono iscriversi a un master",
    "Il bando è rivolto a chi si iscrive a un corso di laurea magistrale dopo la laurea triennale",
    "studenti che hanno conseguito la laurea e si iscrivono ai corsi di laurea",
    "corso di laurea di secondo livello",
    "corso di laurea di secondo ciclo",
    "iscritti alla laurea specialistica",
    "iscritti a un percorso postlaurea",
    "dopo il conseguimento del diploma di laurea",
    "corsi di laurea specialistica",
  ])("rejects a graduate-level or degree-holder quote (%s)", async (quote) => {
    const result = await level(quote);
    expect(result.ok).toBe(false);
    expect(reasonsOf(result)).toMatch(/level/i);
  });

  it("rejects a good level quote next to a graduate one", async () => {
    const result = await level(
      "La borsa è destinata agli studenti iscritti ai corsi di laurea",
      "Il bando è per gli iscritti ai corsi di dottorato di ricerca",
    );
    expect(result.ok).toBe(false);
  });
});
