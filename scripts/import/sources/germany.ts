import { probeHttps } from "../http";
import type { ReviewRow, StagedRecord } from "../staging";
import { READ_SOURCE } from "../staging";
import { collapseSpaces, slugify } from "../text";
import type { BaProgramme } from "./ba";
import {
  BA_STUDIENSUCHE_PAGE,
  baUnitSlug,
  classifyGerman,
  fetchBaProgrammes,
  matchHrk,
} from "./ba";
import type { HrkInstitution } from "./hrk";
import {
  fetchHrkInstitutions,
  HRK_DOWNLOADS_PAGE,
  sectorOfSponsor,
  websiteCandidates,
} from "./hrk";
import type { Probed } from "./institutions";
import { hrkSlug, resolveSite, stagedInstitution } from "./institutions";

const unread = (source: string) => ({ value: null, source, info_kind: READ_SOURCE });

function programmeRecord(input: {
  p: BaProgramme;
  instSlug: string;
  instName: string;
  city: string;
  match: { field: string; confidence: "high" | "low" };
  matchedTo: string | null;
}): StagedRecord {
  const { p, instSlug, instName, city, match, matchedTo } = input;
  const slug = `${instSlug}-${slugify(p.name, 24)}-${p.id}`;
  const todo = [
    `BA Studiensuche: ${p.hochschulart}, ${p.state}, subjects: ${p.subjects.join(", ") || "none listed"}`,
    matchedTo === null
      ? `provider "${p.provider}" is not in the HRK list: check it is a recognised Hochschule`
      : `provider "${p.provider}" matched to HRK institution "${matchedTo}"`,
    ...(match.confidence === "low"
      ? ["field is a judgement call: check the programme content"]
      : []),
    ...(/nebenfach|kombination|zwei-?fach|lehramt/i.test(p.name)
      ? ["may be a minor or combination subject, not a stand-alone degree"]
      : []),
    "the API has no programme page, language or fees: find the programme page on the institution's site and set officialUrl (required) and use it as the source, then durationYears, teachingLanguages (German unless stated), tuition for non-EU students (state rules differ), intakes, documents, requirements and the application channel (uni-assist or direct), and set each info_kind",
  ];
  const review: ReviewRow = {
    kind: "programs",
    slug,
    name: p.name,
    institution: instName,
    city,
    field: match.field,
    confidence: match.confidence,
    officialUrl: "",
    todo: todo.join("; "),
  };
  return {
    collection: "programs",
    id: slug,
    data: {
      slug,
      institution: instSlug,
      country: "DE",
      city: slugify(city),
      field: match.field,
      level: "bachelor",
      name: p.name,
      summary: {
        fr: {
          text: `${p.name}, ${instName} (${city}). Programme référencé dans la Studiensuche de l'Agence fédérale pour l'emploi.`.slice(
            0,
            400,
          ),
          status: "draft",
        },
      },
      officialUrl: null,
      durationYears: unread("ba"),
      teachingLanguages: unread("ba"),
      tuition: unread("ba"),
      intakes: unread("ba"),
      applicationChannel: unread("ba"),
      documents: unread("ba"),
      requirements: { coverage: "partial", source: "ba", info_kind: READ_SOURCE, rules: [] },
      scholarships: [],
      sources: { ba: { url: BA_STUDIENSUCHE_PAGE, last_verified_at: null } },
    },
    review,
  };
}

// One institution unit per (institution, study town): the validator requires a programme's city to
// equal its institution's. The HRK record from `data:import institutions` covers the main town.
export function buildGermanRecords(input: {
  programmes: readonly BaProgramme[];
  hrk: readonly HrkInstitution[];
  probed: Probed;
}): StagedRecord[] {
  const { programmes, hrk, probed } = input;
  const lite = hrk.map((i) => ({ slug: hrkSlug(i), name: i.name, city: i.city, alias: i.alias }));
  const hrkBySlug = new Map(hrk.map((i) => [hrkSlug(i), i]));
  const extras = new Map<string, StagedRecord>();
  const records: StagedRecord[] = [];

  for (const p of programmes) {
    const match = classifyGerman(p.group, p.name, p.subjects);
    const matched = matchHrk(p.provider, p.city, lite);
    const hrkInst = matched === null ? undefined : hrkBySlug.get(matched.slug);
    const city = collapseSpaces(p.city || hrkInst?.city || "");
    if (match === null || city === "") continue;

    let instSlug: string;
    let instName: string;
    if (hrkInst !== undefined && matched !== null) {
      instName = hrkInst.name;
      instSlug =
        slugify(hrkInst.city) === slugify(city) ? matched.slug : `${matched.slug}-${slugify(city)}`;
      if (instSlug !== matched.slug && !extras.has(instSlug)) {
        const site = resolveSite(hrkInst.homepage, probed);
        extras.set(
          instSlug,
          stagedInstitution({
            slug: instSlug,
            name: instName,
            country: "DE",
            city,
            type: sectorOfSponsor(hrkInst.sponsor).type,
            website: site.url,
            source: "hrk",
            sourceUrl: HRK_DOWNLOADS_PAGE,
            todo: `study location in ${city} of "${instName}" (HRK main town ${hrkInst.city}); website is the main institution's: check it; confirm on the institution's own site, add that page as the source, then set info_kind: official`,
          }),
        );
      }
    } else {
      instName = p.provider;
      instSlug = baUnitSlug(p);
      if (!extras.has(instSlug)) {
        extras.set(
          instSlug,
          stagedInstitution({
            slug: instSlug,
            name: instName,
            country: "DE",
            city,
            type: null,
            website: null,
            source: "ba",
            sourceUrl: BA_STUDIENSUCHE_PAGE,
            todo: `provider from the BA Studiensuche (${p.hochschulart}, ${p.state}); not matched to the HRK list: find its official site, check it is a recognised Hochschule, set the type, add its page as the source, then info_kind: official`,
          }),
        );
      }
    }
    records.push(
      programmeRecord({ p, instSlug, instName, city, match, matchedTo: matched?.name ?? null }),
    );
  }

  records.push({
    collection: "application-channels",
    id: "de-uni-assist",
    data: {
      slug: "de-uni-assist",
      name: "uni-assist",
      country: "DE",
      kind: "intermediary",
      url: "https://www.uni-assist.de/",
      accountRequired: null,
      summary: {
        fr: {
          text: "Service central de candidature pour les étudiants internationaux de nombreuses universités allemandes.",
          status: "draft",
        },
      },
      source: "main",
      info_kind: READ_SOURCE,
      sources: { main: { url: "https://www.uni-assist.de/", last_verified_at: null } },
    },
    review: {
      kind: "application-channels",
      slug: "de-uni-assist",
      name: "uni-assist",
      institution: "",
      city: "",
      field: "",
      confidence: "",
      officialUrl: "https://www.uni-assist.de/",
      todo: "not every university uses uni-assist (some take applications directly): confirm per institution, and whether an account is required",
    },
  });
  return [...extras.values(), ...records];
}

export async function importGermany(): Promise<StagedRecord[]> {
  const [programmes, hrk] = [await fetchBaProgrammes(), await fetchHrkInstitutions()];
  const probed = await probeHttps(
    hrk.flatMap((i) => {
      const w = websiteCandidates(i.homepage);
      return w.needsProbe && w.asListed !== null ? [w.asListed] : [];
    }),
  );
  return buildGermanRecords({ programmes, hrk, probed });
}
