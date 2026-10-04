import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildFrenchLanguageProposals,
  frenchLanguage,
  readFrenchProgrammes,
} from "../../../scripts/import/fr-language";
import { ProposalSchema, verifyProposal } from "../../../scripts/import/proposals";

const LINE = "Niveau de français requis pour s'inscrire à la formation : B2";
const fiche = (extra = "", level = LINE) =>
  `Licence Gestion - Université Exemple Présentation de la formation ${extra} ${level} Parcours de BUT ouverts à la rentrée 2026 Langue vivante 1 : Anglais`;
const FICHE_URL = (id: number) =>
  `https://dossierappel.parcoursup.fr/Candidats/public/fiches/afficherFicheFormation?g_ta_cod=${id}&typeBac=0&originePc=0`;

describe("frenchLanguage", () => {
  it("reads the French level line as the quote", () => {
    expect(frenchLanguage(fiche())).toEqual({ ok: true, level: "B2", quote: LINE });
    expect(frenchLanguage(fiche("", LINE.replace("B2", "C1")))).toMatchObject({ level: "C1" });
  });

  it.each([
    "A1",
    "A2",
    "B1",
  ])("gives nothing when the French level required is only %s", (level) => {
    expect(frenchLanguage(fiche("", LINE.replace("B2", level)))).toEqual({
      ok: false,
      reason: "low-level",
    });
  });

  it("gives nothing without the level line", () => {
    expect(frenchLanguage("Licence Gestion Présentation de la formation")).toEqual({
      ok: false,
      reason: "no-level-line",
    });
  });

  it.each([
    "La Licence IPEM est entièrement dispensée en langue anglaise.",
    "Option Internationale (>50% des cours en anglais) dès le BUT2.",
    "Des enseignements en langue allemande sont proposés.",
    "Un cursus bilingue français-espagnol.",
    "Parcours international ouvert dès la deuxième année.",
    "Programme taught in English for all students.",
    "Cours en anglais au semestre 5.",
    "Une filière anglophone.",
    "Les enseignements sont dispensés en espagnol.",
    "Cette licence propose 50% des cours dispensés en langues étrangères.",
    "Les étudiants peuvent réaliser leur troisième année soit en français, soit entièrement en anglais.",
    "Parcours Franco-Suisse-Allemand (Triple Diplôme)",
    "Licence - Double diplôme Diplôme en Partenariat International",
    "Language : English and French",
    "Les langues de travail sont l'allemand, le français et l'anglais.",
    "Niveau d'allemand requis pour s'inscrire à la formation : B2",
    "Licence franco-allemande en économie.",
    "Bachelor of Science in International Economics",
    "Une licence internationale d'économie et gestion.",
    "La langue d'enseignement est le français et l'anglais.",
    "Des enseignements entièrement en langues anglaises.",
    "Des interventions en anglais par des professionnels.",
    "En licence 3, en mobilité internationale au premier semestre.",
    "Une mobilité obligatoire sur un semestre en troisième année.",
    "Possibilité d'intégrer le Programme International MINERVE.",
  ])("refuses a fiche that shows instruction in another language: %s", (extra) => {
    expect(frenchLanguage(fiche(extra))).toEqual({ ok: false, reason: "other-language" });
  });

  it("accepts a fiche that asks for English skills without teaching in English", () => {
    const text = fiche(
      "Disposer de compétences en langue anglaise. Un bon niveau en anglais est apprécié.",
    );
    expect(frenchLanguage(text).ok).toBe(true);
  });

  it("accepts a fiche that only mentions English as a school subject", () => {
    const text = fiche("Langue vivante 1 : Anglais. Les enseignements sont dispensés en français.");
    expect(frenchLanguage(text).ok).toBe(true);
  });
});

describe("buildFrenchLanguageProposals", () => {
  const texts = new Map<string, string>([
    [FICHE_URL(1), fiche()],
    [FICHE_URL(2), fiche("Entièrement dispensée en langue anglaise.")],
    [FICHE_URL(3), "Licence Gestion sans niveau de langue"],
  ]);
  const textOf = async (url: string): Promise<string> => {
    const text = texts.get(url);
    if (text === undefined) throw new Error("unreachable");
    return text;
  };
  const programmes = [1, 2, 3, 4].map((id) => ({ slug: `fr-x-${id}`, url: FICHE_URL(id) }));

  it("makes a language-only proposal for a clean fiche and reports the others", async () => {
    const { proposals, skipped } = await buildFrenchLanguageProposals({ programmes, textOf });
    expect(proposals).toHaveLength(1);
    const [proposal] = proposals;
    expect(() => ProposalSchema.parse(proposal)).not.toThrow();
    expect(proposal?.slug).toBe("fr-x-1");
    expect(proposal?.programmePage).toBe(FICHE_URL(1));
    expect(Object.keys(proposal?.facts ?? {})).toEqual(["teachingLanguages"]);
    expect(proposal?.facts.teachingLanguages?.value).toEqual(["fr"]);
    expect(proposal?.facts.teachingLanguages?.evidence).toEqual([
      { url: FICHE_URL(1), quote: LINE },
    ]);
    expect(skipped).toEqual([
      { slug: "fr-x-2", reason: "other-language" },
      { slug: "fr-x-3", reason: "no-level-line" },
      { slug: "fr-x-4", reason: "page unreadable" },
    ]);
  });

  it("makes a proposal that verifyProposal accepts", async () => {
    const { proposals } = await buildFrenchLanguageProposals({ programmes, textOf });
    for (const proposal of proposals) {
      const verified = await verifyProposal(proposal, "Licence Gestion", textOf);
      expect(verified.rejected).toEqual([]);
      expect(Object.keys(verified.facts)).toEqual(["teachingLanguages"]);
    }
  });
});

describe("readFrenchProgrammes", () => {
  it("returns the French fiche programmes that hold no language, by scope", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "fr-language-"));
    try {
      await mkdir(path.join(root, "programs"), { recursive: true });
      await mkdir(path.join(root, "institutions"), { recursive: true });
      const institution = (slug: string, website: string | null) =>
        writeFile(
          path.join(root, "institutions", `${slug}.yaml`),
          `slug: ${slug}\nwebsite: ${website === null ? "null" : website}\n`,
        );
      await institution("fr-no-site", null);
      await institution("fr-site", "https://www.univ-example.fr");
      const program = (slug: string, inst: string, url: string, language: string) =>
        writeFile(
          path.join(root, "programs", `${slug}.yaml`),
          `slug: ${slug}\ninstitution: ${inst}\nofficialUrl: ${url}\nteachingLanguages:\n  value: ${language}\n`,
        );
      await program("fr-a", "fr-no-site", FICHE_URL(1), "null");
      await program("fr-b", "fr-site", FICHE_URL(2), "null");
      await program("fr-c", "fr-no-site", FICHE_URL(3), "[fr]");
      await program("fr-d", "fr-no-site", "https://www.univ-example.fr/licence", "null");
      await program("de-e", "fr-no-site", FICHE_URL(5), "null");
      expect(await readFrenchProgrammes(root, "no-website")).toEqual([
        { slug: "fr-a", url: FICHE_URL(1) },
      ]);
      expect(await readFrenchProgrammes(root, "all")).toEqual([
        { slug: "fr-a", url: FICHE_URL(1) },
        { slug: "fr-b", url: FICHE_URL(2) },
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
