import { probeHttps } from "../http";
import type { StagedRecord } from "../staging";
import { READ_SOURCE } from "../staging";
import { slugify } from "../text";
import { DUO_INSTITUTIONS_PAGE, fetchDuoInstitutions } from "./duo";
import {
  fetchHrkInstitutions,
  HRK_DOWNLOADS_PAGE,
  sectorOfSponsor,
  websiteCandidates,
} from "./hrk";

// German institutions come from the HRK Hochschulkompass list, Dutch ones from DUO's open data.
// Both are official registers but say nothing about programmes, so only institutions are staged.
// A website that is not https is probed once (does the https form answer?) and, if it does, kept
// as a candidate; a human still confirms it is the right site.
export async function importInstitutions(): Promise<StagedRecord[]> {
  const [hrk, duo] = [await fetchHrkInstitutions(), await fetchDuoInstitutions()];
  const toProbe = [
    ...hrk.map((i) => websiteCandidates(i.homepage)),
    ...duo.map((i) => websiteCandidates(i.website)),
  ].flatMap((w) => (w.needsProbe && w.asListed !== null ? [w.asListed] : []));
  const probed = await probeHttps(toProbe);
  const resolve = (homepage: string) => {
    const { asListed, needsProbe } = websiteCandidates(homepage);
    if (asListed === null) return { url: null, note: "no website listed" };
    if (!needsProbe) return { url: asListed, note: "" };
    const https = probed.get(asListed) ?? null;
    return https === null
      ? {
          url: null,
          note: `listed website "${asListed}" does not answer over https: find the official https site`,
        }
      : {
          url: https,
          note: `listed as "${asListed}"; the https form answers: confirm it is the official site`,
        };
  };

  const records: StagedRecord[] = [];
  for (const inst of hrk) {
    const slug = `de-${slugify(inst.name, 40)}-hrk${inst.hsNr}`;
    const { type, church } = sectorOfSponsor(inst.sponsor);
    const site = resolve(inst.homepage);
    const confirmed = type !== null && !church && site.url !== null && site.note === "";
    const notes = [
      `HRK: ${inst.kind}, ${inst.state}`,
      ...(church
        ? ["church-run (state-recognised): the app only has public/private, check how to classify"]
        : []),
      ...(type === null ? [`unknown sponsor "${inst.sponsor}"`] : []),
      ...(site.note === "" ? [] : [site.note]),
    ];
    records.push(
      institution({
        slug,
        name: inst.name,
        country: "DE",
        city: inst.city,
        type,
        website: site.url,
        source: "hrk",
        sourceUrl: HRK_DOWNLOADS_PAGE,
        confirmed,
        todo: notes.join("; "),
      }),
    );
  }
  for (const inst of duo) {
    const slug = `nl-${slugify(inst.name, 40)}-${inst.code.toLowerCase()}`;
    const site = resolve(inst.website);
    records.push(
      institution({
        slug,
        name: inst.name,
        country: "NL",
        city: inst.city,
        type: null,
        website: site.url,
        source: "duo",
        sourceUrl: DUO_INSTITUTIONS_PAGE,
        confirmed: false,
        todo: [
          `DUO: ${inst.kind}; public/private is not in the file: check the institution's legal status`,
          site.note,
        ]
          .filter((t) => t !== "")
          .join("; "),
      }),
    );
  }
  return records;
}

function institution(input: {
  slug: string;
  name: string;
  country: string;
  city: string;
  type: "public" | "private" | null;
  website: string | null;
  source: string;
  sourceUrl: string;
  confirmed: boolean;
  todo: string;
}): StagedRecord {
  return {
    collection: "institutions",
    id: input.slug,
    data: {
      slug: input.slug,
      name: input.name,
      country: input.country,
      city: { slug: slugify(input.city), name: input.city },
      type: input.type,
      website: input.website,
      source: input.source,
      info_kind: input.confirmed ? "official" : READ_SOURCE,
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
