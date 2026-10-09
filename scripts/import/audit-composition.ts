import { programmeKind } from "./fr-calendar";

export { readInstitutionTypes } from "./national";

type Loose = Record<string, unknown>;
const asObject = (v: unknown): Loose =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Loose) : {};

const tally = (values: readonly string[]): string => {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts]
    .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
    .map(([value, count]) => `${value} ${count}`)
    .join(", ");
};

// One line for the top of an identical-evidence batch: who the batch is made of, so the reader sees
// at a glance whether a selector took in programmes the national page is not about (a private
// school, another channel, another country).
export function batchComposition(
  records: readonly unknown[],
  institutionTypes: ReadonlyMap<string, string>,
): string {
  const rows = records.map((record) => {
    const r = asObject(record);
    const slug = typeof r.slug === "string" ? r.slug : "";
    const institution = typeof r.institution === "string" ? r.institution : "";
    const channel = asObject(r.applicationChannel).value;
    return {
      country: slug === "" ? "unknown" : (slug.split("-")[0] ?? "unknown"),
      institution,
      type: institutionTypes.get(institution) ?? "unknown",
      french: slug.startsWith("fr-"),
      kind: programmeKind({ slug, name: r.name }),
      channel: typeof channel === "string" ? channel : "none",
    };
  });
  const kinds = rows.filter((r) => r.french).map((r) => r.kind);
  const parts = [
    `country ${tally(rows.map((r) => r.country))}`,
    `institution type ${tally(rows.map((r) => r.type))}`,
    ...(kinds.length === 0 ? [] : [`French programme kind ${tally(kinds)}`]),
    `application channel ${tally(rows.map((r) => r.channel))}`,
    `distinct institutions ${new Set(rows.map((r) => r.institution).filter((i) => i !== "")).size}`,
  ];
  return `Batch composition (${rows.length} records): ${parts.join("; ")}.`;
}
