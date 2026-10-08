import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";

import { classSlug } from "./sources/mur";
import type { OurInstitution } from "./sources/universitaly-stage";

export type ExistingProgramme = { slug: string; institution: string; where: "data/" | "staging" };

async function italianYamlFiles(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  return (await readdir(dir)).filter((n) => n.startsWith("it-") && n.endsWith(".yaml")).sort();
}

// Our Italian institutions: every institution file in data/ (so one without programmes is not
// missed) plus the institution of every programme (name known from the institution file, else
// from the programmes the caller already loaded).
export async function readInstitutions(
  dataDir: string,
  fromProgrammes: readonly OurInstitution[],
): Promise<OurInstitution[]> {
  const bySlug = new Map<string, string>(fromProgrammes.map((i) => [i.slug, i.name]));
  const dir = path.join(dataDir, "institutions");
  for (const name of await italianYamlFiles(dir)) {
    const record: unknown = parse(await readFile(path.join(dir, name), "utf8"));
    if (typeof record !== "object" || record === null) continue;
    const slug = "slug" in record ? record.slug : undefined;
    const label = "name" in record ? record.name : undefined;
    if (typeof slug === "string" && typeof label === "string") bySlug.set(slug, label);
  }
  return [...bySlug].map(([slug, name]) => ({ slug, name }));
}

// The programmes already in data/ or staged, read with a regex (thousands of files in staging):
// the slug is the file name, the institution is its top-level `institution:` line.
export async function readExistingProgrammes(
  dataDir: string,
  stagingDir: string,
): Promise<ExistingProgramme[]> {
  const out: ExistingProgramme[] = [];
  for (const [where, root] of [
    ["data/", dataDir],
    ["staging", stagingDir],
  ] as const) {
    const dir = path.join(root, "programs");
    for (const name of await italianYamlFiles(dir)) {
      const found = /^institution: (.+)$/m.exec(await readFile(path.join(dir, name), "utf8"));
      const institution = found?.[1]?.trim().replace(/^(['"])(.*)\1$/, "$2");
      if (institution === undefined) continue;
      out.push({ slug: name.slice(0, -".yaml".length), institution, where });
    }
  }
  return out;
}

// A programme of the same institution and the same degree class is possibly the same course under
// another name (the portal's English name against the register's Italian one). The candidate's own
// slug already being staged is not a duplicate: that file is simply kept.
export function findDuplicate(
  existing: readonly ExistingProgramme[],
  candidate: { institutionSlug: string; classCode: string; slug: string },
): ExistingProgramme | null {
  const suffix = `-${classSlug(candidate.classCode)}`;
  return (
    existing.find(
      (e) =>
        e.institution === candidate.institutionSlug &&
        e.slug.endsWith(suffix) &&
        e.slug !== candidate.slug,
    ) ?? null
  );
}
