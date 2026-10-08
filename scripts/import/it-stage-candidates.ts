import { readFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import type { Candidate } from "./sources/universitaly";

const CandidateSchema = z.object({
  portalId: z.number().int().positive(),
  university: z.string(),
  name: z.string(),
  classCode: z.string(),
  classCodes: z.array(z.string()),
  field: z.enum(["computer-science", "engineering", "business-economics"]),
  confidence: z.enum(["high", "low"]),
  durationYears: z.number().nullable(),
  url: z
    .string()
    .refine((u) => URL.canParse(u) && /^https?:$/.test(new URL(u).protocol))
    .nullable(),
  academicYear: z.string(),
  delivery: z.enum(["conventional", "blended"]),
});

const CandidatesFileSchema = z.object({
  meta: z.object({ fetchedAt: z.string() }).optional(),
  newUniversities: z.array(z.object({ programmes: z.array(CandidateSchema) })).default([]),
  newProgrammes: z.array(CandidateSchema).default([]),
});

export async function readCandidates(
  runDir: string,
): Promise<{ byId: Map<number, Candidate>; fetchedAt: string }> {
  const file = path.join(runDir, "candidates.json");
  const parsed = CandidatesFileSchema.safeParse(JSON.parse(await readFile(file, "utf8")));
  if (!parsed.success) throw new Error(`${file} does not have the expected shape`);
  const all = [
    ...parsed.data.newUniversities.flatMap((u) => u.programmes),
    ...parsed.data.newProgrammes,
  ];
  return {
    byId: new Map(all.map((c) => [c.portalId, c])),
    fetchedAt: parsed.data.meta?.fetchedAt.slice(0, 10) ?? "an unrecorded date",
  };
}
