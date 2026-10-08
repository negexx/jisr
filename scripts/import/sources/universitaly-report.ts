import { collapseSpaces } from "../text";
import type { Candidate } from "./universitaly";
import type { Comparison } from "./universitaly-compare";

export type ReportMeta = {
  fetchedAt: string;
  cacheDir: string;
  englishTotal: number;
  mixedTotal: number;
  italianTotal: number;
};

const line = (c: Candidate): string =>
  `- ${c.name} (${c.classCode}, ${c.field}${c.confidence === "low" ? ", low confidence" : ""}, ${c.durationYears ?? "?"} years) ${c.url ?? "no portal link"} [portal id ${c.portalId}]`;

export function renderReport(cmp: Comparison, meta: ReportMeta): string {
  const out: string[] = [];
  out.push("# Universitaly discovery report", "");
  out.push(
    `Academic year reported by the portal: ${cmp.academicYear}. Fetched ${meta.fetchedAt}. Raw responses: \`${meta.cacheDir}\` (sha256 in manifest.json). Nothing here is in data/ or in staging: this is a candidate list for the owner.`,
    "",
  );
  out.push("## Counts", "");
  out.push(
    `- English search (Triennale, includes mixed): ${meta.englishTotal} courses; of these mixed Italian-English in an in-scope class: ${cmp.tally["mixed-language"]}; mixed Italian-English rows inside the English search (all classes): ${meta.mixedTotal}`,
  );
  out.push(
    `- Italian search (Triennale, includes mixed): ${meta.italianTotal} courses (counted only)`,
  );
  for (const [status, n] of Object.entries(cmp.tally)) out.push(`- ${status}: ${n}`);
  out.push(
    `- candidates (English, in person, in scope): ${cmp.candidates}; matched to our programmes: ${cmp.matched.length}; possible matches: ${cmp.possible.length}; new at a university we have: ${cmp.newProgrammes.length}; at new universities: ${cmp.newUniversities.reduce((n, u) => n + u.programmes.length, 0)}`,
    "",
  );
  out.push("## New universities", "");
  if (cmp.newUniversities.length === 0) out.push("None.");
  for (const u of cmp.newUniversities) {
    const near =
      u.possiblyOurs.length === 0
        ? ""
        : ` (possibly the same as one of ours: ${u.possiblyOurs.map(collapseSpaces).join(", ")})`;
    out.push(`### ${u.university}${near}`);
    for (const c of u.programmes) out.push(line(c));
    out.push("");
  }
  out.push("## New programmes at universities we already have", "");
  if (cmp.newProgrammes.length === 0) out.push("None.");
  for (const c of cmp.newProgrammes) out.push(`${line(c)} at ${c.university}`);
  out.push("", "## Possible matches (same university and class, different name)", "");
  out.push(
    "A possible match also hides a programme of ours that has no portal course when a different new course of the same class exists at that university.",
    "",
  );
  if (cmp.possible.length === 0) out.push("None.");
  for (const p of cmp.possible) out.push(`- ${p.ours}: ${p.why} ${p.candidate.url ?? ""}`.trim());
  out.push("", "## Programmes we have that the portal does not list", "");
  out.push(
    '"university-not-matched" means the university\'s name matched no portal university name (see the near-match notes), not that the programme is missing.',
    "",
  );
  if (cmp.notListed.length === 0) out.push("None.");
  for (const n of cmp.notListed)
    out.push(`- ${n.ours.slug} (${n.ours.institutionName}): portal status ${n.portalStatus}`);
  out.push("", "## Mismatches on matched programmes", "");
  if (cmp.mismatches.length === 0) out.push("None.");
  for (const m of cmp.mismatches)
    out.push(`- ${m.slug}: ${m.field}, ours ${m.ours}, portal ${m.portal}`);
  out.push("", "## Our universities whose name matches no portal university name", "");
  if (cmp.institutionsNotSeen.length === 0) out.push("None.");
  for (const name of cmp.institutionsNotSeen) out.push(`- ${collapseSpaces(name)}`);
  out.push("");
  return out.join("\n");
}
