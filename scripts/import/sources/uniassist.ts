import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";

import { decodeEntities, htmlToText } from "../evidence";
import { fetchText } from "../http";
import { DATA_DIR, STAGING_DIR } from "../staging";
import { collapseSpaces, hostKey, nameKey, sameTown } from "../text";

// uni-assist e.V. is the central service many German universities use for applicants with a
// foreign school-leaving certificate. Its official list says, per university, whether uni-assist
// processes the application or only issues the preliminary review document (VPD) that the
// applicant then sends to the university. Which courses and applicant groups are covered is set by
// each university: the list narrows the question, the university's own page answers it.
export const UNIASSIST_LIST_URL = "https://www.uni-assist.de/en/tools/uni-assist-universities/";
const UNIASSIST_ORIGIN = "https://www.uni-assist.de";

export type ListEntry = { id: number; path: string; name: string };

// The list page has a <select> with one <option> per university and the path of its detail page.
export function parseList(html: string): ListEntry[] {
  const entries: ListEntry[] = [];
  for (const m of html.matchAll(
    /<option value="(\d+)" data-url="([^"]+)"[^>]*>([^<]+)<\/option>/g,
  )) {
    const [, id, pagePath, name] = m;
    if (id === undefined || pagePath === undefined || name === undefined) continue;
    if (!pagePath.includes("/detail/hochschule/")) continue;
    entries.push({ id: Number(id), path: pagePath, name: collapseSpaces(decodeEntities(name)) });
  }
  return entries;
}

// "processes": uni-assist handles the application (no note on its page).
// "vpd_only": uni-assist issues the VPD, the applicant then applies directly to the university.
// "special": a note that only applies to some courses or levels; read it.
export type Mode = "processes" | "vpd_only" | "special";

export type Detail = {
  website: string | null;
  city: string | null;
  note: string;
  mode: Mode;
};

// `text` is the visible text of a detail page: "... uni-assist universities <name> Address <name>
// <street> <zip> <city> <website> [Note <text>] Legal disclosure ...".
export function parseDetail(text: string, name: string): Detail | null {
  const marker = `Address ${name} `;
  const at = text.lastIndexOf(marker);
  if (at === -1) return null;
  let rest = text.slice(at + marker.length);
  const end = rest.search(/\s(?:Legal disclosure|Terms and Conditions)\b/);
  if (end !== -1) rest = rest.slice(0, end);
  const [addressAndSite = "", ...noteParts] = rest.split(/\sNote\s/);
  const note = collapseSpaces(noteParts.join(" Note "));
  const tokens = collapseSpaces(addressAndSite).split(" ");
  const last = tokens[tokens.length - 1] ?? "";
  const hasSite = /^(https?:\/\/|www\.)\S+$|^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(last);
  const website = hasSite ? (last.startsWith("http") ? last : `https://${last}`) : null;
  const address = collapseSpaces(hasSite ? tokens.slice(0, -1).join(" ") : addressAndSite);
  const city = /\b\d{5}\s+(.+)$/.exec(address)?.[1]?.trim() ?? null;
  const mode: Mode =
    note === ""
      ? "processes"
      : /Vorp[üu]fungsdokumentation|\bVPD\b/.test(note) &&
          /directly to the university/i.test(note) &&
          !/^(For all Master|For study courses)/i.test(note)
        ? "vpd_only"
        : "special";
  return { website, city, note, mode };
}

export type Entry = ListEntry & Detail & { detailUrl: string };

async function pool<T, R>(items: readonly T[], size: number, work: (item: T) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        const index = next++;
        const item = items[index];
        if (item !== undefined) out[index] = await work(item);
      }
    }),
  );
  return out;
}

export async function fetchUniAssist(): Promise<{ entries: Entry[]; failed: string[] }> {
  const list = parseList(await fetchText(UNIASSIST_LIST_URL, { accept: "text/html" }));
  if (list.length < 100) throw new Error(`uni-assist list has only ${list.length} entries`);
  const failed: string[] = [];
  const parsed = await pool(list, 4, async (entry) => {
    const detailUrl = `${UNIASSIST_ORIGIN}${entry.path}`;
    try {
      const text = htmlToText(await fetchText(detailUrl, { accept: "text/html" }));
      const detail = parseDetail(text, entry.name);
      if (detail === null) {
        failed.push(`${entry.name}: unexpected page layout`);
        return null;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
      return { ...entry, ...detail, detailUrl };
    } catch (error) {
      failed.push(`${entry.name}: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  });
  return { entries: parsed.filter((e): e is Entry => e !== null), failed };
}

// --- matching to our German institutions ----------------------------------------------------------
export type OurInstitution = { slug: string; name: string; city: string; website: string | null };

export type Match = {
  slugs: string[];
  method: "host" | "host+city" | "domain" | "domain+city" | "name" | "none";
  // Unmatched only: institutions of our data in the same town, for a person to decide on.
  candidates: string[];
};

const stripParens = (name: string) => name.replace(/\([^)]*\)/g, " ");

// "en.w-hs.de" and "www.w-hs.de" are the same site: compare the last two labels.
function registrableDomain(url: string | null): string | null {
  const host = url === null ? null : hostKey(url);
  if (host === null) return null;
  return host.split(".").slice(-2).join(".");
}

// Exact host first (the strongest evidence: the same website), then the registrable domain (language
// subdomains), each narrowed by the town when one university has several campus units; then an
// exact normalised name. Never a fuzzy match: an unmatched entry is reported with the institutions
// in its town, and a person decides.
export function matchInstitution(entry: Entry, ours: readonly OurInstitution[]): Match {
  const narrow = (pool: readonly OurInstitution[]) =>
    entry.city === null ? [] : pool.filter((i) => sameTown(i.city, entry.city ?? ""));
  const host = entry.website === null ? null : hostKey(entry.website);
  if (host !== null) {
    const same = ours.filter((i) => i.website !== null && hostKey(i.website) === host);
    if (same.length > 0) {
      const inTown = narrow(same);
      if (inTown.length > 0)
        return { slugs: inTown.map((i) => i.slug), method: "host+city", candidates: [] };
      return { slugs: same.map((i) => i.slug), method: "host", candidates: [] };
    }
  }
  const domain = registrableDomain(entry.website);
  if (domain !== null) {
    const same = ours.filter((i) => registrableDomain(i.website) === domain);
    if (same.length > 0) {
      const inTown = narrow(same);
      return {
        slugs: (inTown.length > 0 ? inTown : same).map((i) => i.slug),
        method: inTown.length > 0 ? "domain+city" : "domain",
        candidates: [],
      };
    }
  }
  const key = nameKey(stripParens(entry.name));
  const byName = ours.filter((i) => nameKey(stripParens(i.name)) === key);
  if (byName.length > 0)
    return { slugs: byName.map((i) => i.slug), method: "name", candidates: [] };
  return { slugs: [], method: "none", candidates: narrow(ours).map((i) => i.slug) };
}

export async function loadGermanInstitutions(
  stagingDir = STAGING_DIR,
  dataDir = DATA_DIR,
): Promise<OurInstitution[]> {
  const bySlug = new Map<string, OurInstitution>();
  for (const root of [stagingDir, dataDir]) {
    const dir = path.join(root, "institutions");
    if (!existsSync(dir)) continue;
    for (const file of await readdir(dir)) {
      if (!file.startsWith("de-") || !file.endsWith(".yaml")) continue;
      const record: unknown = parse(await readFile(path.join(dir, file), "utf8"));
      if (typeof record !== "object" || record === null) continue;
      const r = record as {
        slug?: unknown;
        name?: unknown;
        city?: { name?: unknown };
        website?: unknown;
      };
      if (typeof r.slug !== "string" || typeof r.name !== "string") continue;
      bySlug.set(r.slug, {
        slug: r.slug,
        name: r.name,
        city: typeof r.city?.name === "string" ? r.city.name : "",
        website: typeof r.website === "string" ? r.website : null,
      });
    }
  }
  return [...bySlug.values()];
}

// --- the review sheet ------------------------------------------------------------------------------
export const UNIASSIST_FILE = "UNIASSIST.csv";

const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);

export function uniAssistCsv(rows: readonly { entry: Entry; match: Match }[]): string {
  const header =
    "uniAssistId,name,city,website,mode,matchMethod,matchedInstitutions,sameTownCandidates,detailUrl,note";
  const lines = rows.map(({ entry, match }) =>
    [
      String(entry.id),
      entry.name,
      entry.city ?? "",
      entry.website ?? "",
      entry.mode,
      match.method,
      match.slugs.join(";"),
      match.candidates.join(";"),
      entry.detailUrl,
      entry.note,
    ]
      .map(cell)
      .join(","),
  );
  return `${[header, ...lines].join("\n")}\n`;
}

export async function importUniAssist(): Promise<void> {
  const { entries, failed } = await fetchUniAssist();
  const ours = await loadGermanInstitutions();
  const rows = entries.map((entry) => ({ entry, match: matchInstitution(entry, ours) }));
  await writeFile(path.join(STAGING_DIR, UNIASSIST_FILE), uniAssistCsv(rows));

  const count = (f: (r: (typeof rows)[number]) => boolean) => rows.filter(f).length;
  console.log(`uni-assist universities: ${entries.length} (${failed.length} pages failed)`);
  for (const mode of ["processes", "vpd_only", "special"] as const) {
    console.log(`  ${mode}: ${count((r) => r.entry.mode === mode)}`);
  }
  console.log(
    `matched to our institutions: ${["host+city", "host", "domain+city", "domain", "name"].map((m) => `${m} ${count((r) => r.match.method === m)}`).join(", ")}; unmatched ${count((r) => r.match.method === "none")} (same-town candidates are in the sheet)`,
  );
  for (const r of rows.filter((x) => x.match.method === "none")) {
    console.log(
      `  unmatched: ${r.entry.name} (${r.entry.city ?? "?"}, ${r.entry.website ?? "no site"})`,
    );
  }
  for (const f of failed) console.log(`  failed: ${f}`);
  console.log(`sheet: ${path.join(STAGING_DIR, UNIASSIST_FILE)}`);
}

if (process.argv[1]?.endsWith("uniassist.ts") === true) {
  importUniAssist().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
