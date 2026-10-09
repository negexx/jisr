import { z } from "zod";

import type { Entry } from "./national";
import { parseCsv } from "./staging";

// uni-assist's own list says, per university, whether uni-assist processes the application or only
// issues the preliminary review document (VPD) that the applicant then sends to the university.
// Only the second kind carries a sentence on the detail page that can be quoted as evidence for a
// channel; everything else is left to a person or to the university's own page (the curated
// registry). The sheet is data-staging/UNIASSIST.csv, written by `pnpm data:import`.
const SheetRowSchema = z.object({
  uniAssistId: z.string(),
  name: z.string(),
  mode: z.string(),
  matchedInstitutions: z.string(),
  detailUrl: z.string(),
  note: z.string(),
});

export type SheetRow = z.infer<typeof SheetRowSchema>;

export function parseSheet(csv: string): SheetRow[] {
  return parseCsv(csv).map((row) => SheetRowSchema.parse(row));
}

export type ForPerson = { name: string; reason: string };

const VPD_WORDING = /\bVPD\b|preliminary review/i;
const SENTENCE_END = /(?<=[.!?])\s+/;
const MIN_QUOTE = 15;

// The sentence that says the VPD is sent on to the university; failing that, the first sentence that
// names the VPD. Always a verbatim substring of the note.
export function vpdSentence(note: string): string | null {
  const candidates = note
    .split(SENTENCE_END)
    .map((s) => s.trim())
    .filter((s) => s.length >= MIN_QUOTE && VPD_WORDING.test(s));
  return candidates.find((s) => /directly to the university/i.test(s)) ?? candidates[0] ?? null;
}

const asciiKebab = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

function uniqueId(row: SheetRow, taken: Set<string>): string {
  const base = `de-uni-assist-vpd-${asciiKebab(row.uniAssistId) || asciiKebab(row.name) || "row"}`;
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  taken.add(id);
  return id;
}

function whyNoEntry(row: SheetRow): string | null {
  if (row.mode === "processes")
    return "processes: uni-assist handles the application and its detail page has no sentence to quote; needs the university's own page";
  if (row.mode === "special")
    return "special: the note applies to some courses or levels only; read it";
  if (row.mode !== "vpd_only") return `unknown mode ${row.mode}`;
  if (row.matchedInstitutions.trim() === "") return "vpd_only but no matched institution of ours";
  if (!row.detailUrl.startsWith("https://")) return "vpd_only but the detail url is not https";
  if (vpdSentence(row.note) === null) return "vpd_only but the note has no VPD wording to quote";
  return null;
}

export function uniAssistEntries(rows: readonly SheetRow[]): {
  entries: Entry[];
  forPerson: ForPerson[];
} {
  const entries: Entry[] = [];
  const forPerson: ForPerson[] = [];
  const taken = new Set<string>();
  for (const row of rows) {
    const reason = whyNoEntry(row);
    const quote = vpdSentence(row.note);
    if (reason !== null || quote === null) {
      forPerson.push({ name: row.name, reason: reason ?? "no VPD wording to quote" });
      continue;
    }
    entries.push({
      id: uniqueId(row, taken),
      fact: "applicationChannel",
      channel: "de-uni-assist-vpd",
      infoKind: "official",
      selector: {
        country: "DE",
        institutions: row.matchedInstitutions.split(";").filter((slug) => slug !== ""),
      },
      evidence: [{ url: row.detailUrl, quote }],
      notes: `uni-assist list: ${row.name}`,
    });
  }
  return { entries, forPerson };
}
