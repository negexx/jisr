// Generates src/components/home/demo-data.ts from the real records in data/.
//
// The hero demo runs the real src/domain matching on real facts. The fixture changes exactly one
// thing about a programme and nothing else, and comments both departures in the emitted file:
//
//   1. requirements.coverage is set to "complete" on every demo programme - an illustrative
//      override. Every real record ships coverage "partial", which forces an unknown coverage
//      reason and makes a satisfied match unreachable; the flag is changed, no fact is. The FACTS
//      (name, institution, city, field, languages, tuition, officialUrl, every requirement rule)
//      are copied verbatim from data/programs/<slug>.yaml.
//   2. Each destination needs a decisive route. A real route that is already "direct" and
//      condition-free (ma-bac-to-fr) is reused verbatim; where the real route is "foundation"
//      (ma-bac-to-de, which short-circuits matching to "check"), a curated direct, condition-free
//      demo route reuses the real route's resolved fact (source_url + last_verified_at) but is
//      marked info_kind "guidance", so the curated route is never presented as an official
//      requirement. (A guidance route is not decisive in src/domain, so the destination that
//      relies on a curated route can reach check/not_satisfied but not satisfied - see the report.)
//
// Run: pnpm exec tsx scripts/data/demo-fixture.ts
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";

import type { AdmissionRoute, Country, Institution, Program } from "@/data-schema/resolved";

import { loadData } from "./load-data";
import { resolveCatalog } from "./resolve";
import { validateData } from "./validate";

const DATA_DIR = "data";
const NOW = "2026-10-11";
const OUT_FILE = path.join("src", "components", "home", "demo-data.ts");

// Real, shipped records: two Computer Science programmes (Germany) and one Engineering programme
// (France), so the demo shows two destinations and two fields.
const PROGRAM_SLUGS = [
  "de-technische-hochschule-aschaffenburg-hrk333-software-design-internat-daad9225",
  "de-friedrich-alexander-universitat-erlangen-hrk70-artificial-intelligence-daad9594",
  "fr-aix-marseille-universite-site-de-marseil-0134316w-licence-sciences-pour-lingenieur-39236",
] as const;

const ORIGIN = "MA";
const CREDENTIAL_TYPE_SLUG = "ma-bac";
const GRADING_SCALE_SLUG = "ma-bac-scale";

const HEADER = `// GENERATED FILE - do not edit by hand.
// Produced by scripts/data/demo-fixture.ts from the shipped records in data/.
//
// The hero demo is illustrative. Exactly two things depart from the shipped facts:
//   1. requirements.coverage is set to "complete" on every demo programme. Every real record ships
//      coverage "partial", which forces an unknown coverage reason and makes a satisfied match
//      unreachable; the flag is changed, no fact is. The demo card labels the snapshot
//      "illustrative".
//   2. Each destination needs a decisive route. A real route that is already "direct" and
//      condition-free is reused verbatim (ma-bac-to-fr). Where the real route is "foundation"
//      (ma-bac-to-de, which short-circuits matching to "check"), a curated direct, condition-free
//      demo route reuses the real route's source_url and last_verified_at but is marked info_kind
//      "guidance", so it is never presented as an official requirement.
//
// Regenerate: pnpm exec tsx scripts/data/demo-fixture.ts
`;

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function main(): void {
  const loaded = loadData(DATA_DIR);
  const { catalog, errors } = validateData(loaded, { now: NOW });
  if (errors.length > 0) {
    throw new Error(`${errors.length} data error(s); run pnpm data:check before regenerating`);
  }
  const resolved = resolveCatalog(catalog);

  const programs: Program[] = PROGRAM_SLUGS.map((slug) => {
    const found = resolved.programs.find((entry) => entry.value.slug === slug);
    if (found === undefined) throw new Error(`data/ has no program "${slug}"`);
    // The only change to a programme: the documented illustrative coverage flag.
    return {
      ...found.value,
      requirements: { ...found.value.requirements, coverage: "complete" },
    };
  });

  const destinations = [...new Set(programs.map((program) => program.country))].sort();

  const realRouteOf = (destination: string) =>
    resolved.routes.find(
      (entry) =>
        entry.value.origin === ORIGIN &&
        entry.value.credentialType === CREDENTIAL_TYPE_SLUG &&
        entry.value.destination === destination &&
        entry.value.level === "bachelor",
    )?.value;

  const routes: AdmissionRoute[] = destinations.map((destination) => {
    const real = realRouteOf(destination);
    if (real === undefined) {
      throw new Error(`data/ has no route ${ORIGIN}/${CREDENTIAL_TYPE_SLUG} -> ${destination}`);
    }
    // A real route that is already direct and condition-free is the honest demo route: reuse it.
    if (real.outcome === "direct" && real.conditions.length === 0) return real;
    // Otherwise curate a direct, condition-free route for the demo, reusing the real route's fact
    // (a real official url + verified date) but never presenting it as an official requirement.
    return {
      slug: `demo-ma-bac-to-${destination.toLowerCase()}`,
      origin: ORIGIN,
      credentialType: CREDENTIAL_TYPE_SLUG,
      destination: real.destination,
      level: "bachelor",
      outcome: "direct",
      conditions: [],
      note: null,
      applicationChannels: [],
      fact: { ...real.fact, info_kind: "guidance" },
    };
  });

  const institutionSlugs = new Set(programs.map((program) => program.institution));
  const institutions: Institution[] = resolved.institutions
    .filter((entry) => institutionSlugs.has(entry.value.slug))
    .map((entry) => entry.value);

  const countryCodes = new Set<string>([...destinations, ORIGIN]);
  const countries: Country[] = resolved.countries
    .filter((entry) => countryCodes.has(entry.value.code))
    .map((entry) => entry.value);

  // Only the core the matching actually reads for this demo: the origin credential type and the
  // grading scale it points at. No demo programme carries a grade rule, so no conversion is needed.
  const credentialTypes = resolved.credentialTypes
    .filter((entry) => entry.value.slug === CREDENTIAL_TYPE_SLUG)
    .map((entry) => entry.value);
  const gradingScales = resolved.gradingScales
    .filter((entry) => entry.value.slug === GRADING_SCALE_SLUG)
    .map((entry) => entry.value);
  const gradeConversions = resolved.gradeConversions.map((entry) => entry.value);

  const body = [
    'import type { AdmissionRoute, Country, Institution, Program } from "@/data-schema/resolved";',
    'import type { CoreShard } from "@/data-schema/snapshot";',
    "",
    `export const DEMO_PROGRAMS: Program[] = ${json(programs)};`,
    "",
    `export const DEMO_ROUTES: AdmissionRoute[] = ${json(routes)};`,
    "",
    `export const DEMO_INSTITUTIONS: Institution[] = ${json(institutions)};`,
    "",
    `export const DEMO_COUNTRIES: Country[] = ${json(countries)};`,
    "",
    'export const DEMO_CORE: Pick<CoreShard, "credentialTypes" | "gradingScales" | "gradeConversions"> = {',
    `  credentialTypes: ${json(credentialTypes)},`,
    `  gradingScales: ${json(gradingScales)},`,
    `  gradeConversions: ${json(gradeConversions)},`,
    "};",
    "",
  ].join("\n");

  writeFileSync(OUT_FILE, `${HEADER}${body}`);

  // Keep the committed file Biome-formatted without a second manual step.
  const format = spawnSync("pnpm", ["exec", "biome", "format", "--write", OUT_FILE], {
    stdio: "inherit",
  });
  if (format.status !== 0) {
    console.warn(`demo-fixture: biome format did not run; format ${OUT_FILE} before committing`);
  }
  console.log(
    `demo-fixture: wrote ${OUT_FILE} (${programs.length} programmes, ${routes.length} route(s))`,
  );
}

main();
