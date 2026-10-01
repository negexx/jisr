// Maps the national Parcoursup taxonomy (fil_lib_voe_acc) onto Jisr's three Release 1 fields.
// Exact-label table on purpose: every inclusion is visible in review. `low` means the label is a
// judgement call and the reviewer should look at the programme before approving.
export type FieldSlug = "computer-science" | "engineering" | "business-economics";
export type FieldMatch = { field: FieldSlug; confidence: "high" | "low" };

const TABLE: Readonly<Record<string, FieldMatch>> = {
  // Computer science
  Informatique: { field: "computer-science", confidence: "high" },
  "Science des données": { field: "computer-science", confidence: "high" },
  "Réseaux et télécommunications": { field: "computer-science", confidence: "high" },
  "Métiers du multimédia et de l'internet": { field: "computer-science", confidence: "low" },
  "Mathématiques et informatique appliquées aux sciences humaines et sociales": {
    field: "computer-science",
    confidence: "low",
  },
  "Sciences des systèmes communicants": { field: "computer-science", confidence: "low" },
  "Informatique, Mathématiques": { field: "computer-science", confidence: "low" },
  "Informatique, Sciences de la vie": { field: "computer-science", confidence: "low" },
  "Droit, Informatique": { field: "computer-science", confidence: "low" },
  // Engineering
  "Sciences pour l'ingénieur": { field: "engineering", confidence: "high" },
  "Génie électrique et informatique industrielle": { field: "engineering", confidence: "high" },
  "Génie mécanique et productique": { field: "engineering", confidence: "high" },
  "Génie civil - Construction durable": { field: "engineering", confidence: "high" },
  "Génie industriel et maintenance": { field: "engineering", confidence: "high" },
  "Génie chimique génie des procédés": { field: "engineering", confidence: "high" },
  "Mesures physiques": { field: "engineering", confidence: "low" },
  "Science et génie des matériaux": { field: "engineering", confidence: "high" },
  "Métiers de la Transition et de l'Efficacité Énergétiques": {
    field: "engineering",
    confidence: "high",
  },
  "Qualité, logistique industrielle et organisation": { field: "engineering", confidence: "low" },
  "Sciences et technologies": { field: "engineering", confidence: "low" },
  "Génie civil": { field: "engineering", confidence: "high" },
  Mécanique: { field: "engineering", confidence: "high" },
  "Electronique, énergie électrique, automatique": { field: "engineering", confidence: "high" },
  "Acoustique et Vibrations": { field: "engineering", confidence: "low" },
  "Génie urbain": { field: "engineering", confidence: "low" },
  "Mathématiques, Physique et Sciences pour l'Ingénieur": {
    field: "engineering",
    confidence: "low",
  },
  // Business / economics
  "Economie et gestion": { field: "business-economics", confidence: "high" },
  Economie: { field: "business-economics", confidence: "high" },
  Gestion: { field: "business-economics", confidence: "high" },
  "Administration économique et sociale": { field: "business-economics", confidence: "low" },
  "Techniques de commercialisation": { field: "business-economics", confidence: "high" },
  "Gestion des entreprises et des administrations": {
    field: "business-economics",
    confidence: "high",
  },
  "Gestion administrative et commerciale des organisations": {
    field: "business-economics",
    confidence: "high",
  },
  "Management de la Logistique et des Transports": {
    field: "business-economics",
    confidence: "low",
  },
  "Administration et Echanges internationaux": { field: "business-economics", confidence: "low" },
};

export function classifyField(parcoursupBranch: string): FieldMatch | null {
  return TABLE[parcoursupBranch.trim()] ?? null;
}
