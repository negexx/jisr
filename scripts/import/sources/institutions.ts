import { probeHttps } from "../http";
import type { StagedRecord } from "../staging";
import { READ_SOURCE } from "../staging";
import { hostKey, isOriginUrl, slugify } from "../text";
import type { DuoInstitution } from "./duo";
import { DUO_INSTITUTIONS_PAGE, fetchDuoInstitutions } from "./duo";
import type { HrkInstitution } from "./hrk";
import {
  fetchHrkInstitutions,
  HRK_DOWNLOADS_PAGE,
  sectorOfSponsor,
  websiteCandidates,
} from "./hrk";

export type Site = { url: string | null; note: string };
export type Probed = ReadonlyMap<string, string | null>;

// Turns the website a register lists into a candidate plus a note for the reviewer. Nothing here
// confirms a website: an https front door is only the cleanest candidate.
export function resolveSite(homepage: string, probed: Probed): Site {
  const { asListed, needsProbe } = websiteCandidates(homepage);
  if (asListed === null) return { url: null, note: "no website listed" };
  if (!needsProbe) {
    return isOriginUrl(asListed)
      ? { url: asListed, note: "" }
      : {
          url: asListed,
          note: `listed URL "${asListed}" is a page or carries a query (tracking?): replace it with the institution's homepage`,
        };
  }
  const https = probed.get(asListed) ?? null;
  if (https === null) {
    return {
      url: null,
      note: `listed website "${asListed}" did not answer over https (probe failed): find the official https site`,
    };
  }
  const moved =
    hostKey(asListed.includes("://") ? asListed : `http://${asListed}`) !== hostKey(https);
  return {
    url: https,
    note: moved
      ? `listed as "${asListed}" but https redirects to a different domain (${hostKey(https)}): check it is the same institution`
      : `listed as "${asListed}"; the https form answers`,
  };
}

export function stagedInstitution(input: {
  slug: string;
  name: string;
  country: string;
  city: string;
  type: "public" | "private" | null;
  website: string | null;
  source: string;
  sourceUrl: string;
  sourceId: string;
  todo: string;
}): StagedRecord {
  return {
    collection: "institutions",
    id: input.slug,
    sourceId: input.sourceId,
    data: {
      slug: input.slug,
      name: input.name,
      country: input.country,
      city: { slug: slugify(input.city), name: input.city },
      type: input.type,
      website: input.website,
      source: input.source,
      // A register row is not something a reader can verify on the cited page, so a human always
      // reads the institution's own page, adds it as the source and sets info_kind.
      info_kind: READ_SOURCE,
      sources: { [input.source]: { url: input.sourceUrl, last_verified_at: null } },
    },
    review: {
      kind: "institutions",
      slug: input.slug,
      name: input.name,
      institution: "",
      city: input.city,
      field: "",
      confidence: "",
      officialUrl: input.website ?? "",
      todo: input.todo,
    },
  };
}

const CONFIRM =
  "confirm the details on the institution's own site, add that page as the source, then set info_kind: official";

export function hrkSlug(inst: Pick<HrkInstitution, "name" | "hsNr">): string {
  return `de-${slugify(inst.name, 40)}-hrk${inst.hsNr}`;
}

export function buildHrkRecord(inst: HrkInstitution, probed: Probed): StagedRecord {
  const { type, church } = sectorOfSponsor(inst.sponsor);
  const site = resolveSite(inst.homepage, probed);
  const notes = [
    `HRK: ${inst.kind}, ${inst.state}, sponsor "${inst.sponsor}"`,
    ...(church ? ["church-run: the app only has public/private, decide how to classify it"] : []),
    ...(type === null && !church ? [`unknown sponsor "${inst.sponsor}": set the type`] : []),
    ...(site.note === "" ? [] : [site.note]),
    CONFIRM,
  ];
  return stagedInstitution({
    slug: hrkSlug(inst),
    name: inst.name,
    country: "DE",
    city: inst.city,
    type,
    website: site.url,
    source: "hrk",
    sourceUrl: HRK_DOWNLOADS_PAGE,
    sourceId: `hrk:${inst.hsNr}`,
    todo: notes.join("; "),
  });
}

export function buildDuoRecord(inst: DuoInstitution, probed: Probed): StagedRecord {
  const site = resolveSite(inst.website, probed);
  const notes = [
    `DUO: ${inst.kind}, denomination "${inst.denomination}"; public/private is not in the file: check the institution's legal status`,
    ...(site.note === "" ? [] : [site.note]),
    CONFIRM,
  ];
  return stagedInstitution({
    slug: `nl-${slugify(inst.name, 40)}-${inst.code.toLowerCase()}`,
    name: inst.name,
    country: "NL",
    city: inst.city,
    type: null,
    website: site.url,
    source: "duo",
    sourceUrl: DUO_INSTITUTIONS_PAGE,
    sourceId: `duo:${inst.code}`,
    todo: notes.join("; "),
  });
}

// German institutions come from the HRK Hochschulkompass list, Dutch ones from DUO's open data.
// Both are registers that say nothing about programmes, so only institutions are staged.
export async function importInstitutions(): Promise<StagedRecord[]> {
  const [hrk, duo] = [await fetchHrkInstitutions(), await fetchDuoInstitutions()];
  const toProbe = [
    ...hrk.map((i) => websiteCandidates(i.homepage)),
    ...duo.map((i) => websiteCandidates(i.website)),
  ].flatMap((w) => (w.needsProbe && w.asListed !== null ? [w.asListed] : []));
  const probed = await probeHttps(toProbe);
  return [
    ...hrk.map((i) => buildHrkRecord(i, probed)),
    ...duo.map((i) => buildDuoRecord(i, probed)),
  ];
}
