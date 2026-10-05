import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";

import { CostProfileRecordSchema } from "@/data-schema/records/cost-profile";
import { minorUnitDigits } from "@/lib/format";

import { fetchText, isCached } from "./http";
import {
  type CostLineKey,
  costLinesFrom,
  FOOD_BASKET,
  isCityNotFound,
  NUMBEO_USER_AGENT,
  type NumbeoPage,
  type NumbeoRow,
  parseNumbeoPage,
} from "./sources/numbeo";
import { DATA_DIR, STAGING_DIR, stageFile, toYaml } from "./staging";

// Usage: data:costs [--dry-run] [--countries FR,DE,...] [--max-requests 400] [--delay-ms 2000]
// Stages one Numbeo cost profile per programme city and one per country (the fallback for cities
// Numbeo does not list). Crowdsourced numbers: every line is an `estimate`, never `official`.
const MIN_DELAY_MS = 2000;
const COLLECTION = "cost-profiles";

export const COUNTRY_NAMES: Record<string, string> = {
  FR: "France",
  DE: "Germany",
  NL: "Netherlands",
  IT: "Italy",
  HU: "Hungary",
};

// Amounts keep the currency Numbeo is asked for; we never convert.
const currencyOf = (country: string): string => (country === "HU" ? "HUF" : "EUR");

const NUMBEO_HOST = "https://www.numbeo.com";

// Only a few big cities resolve bare ("/in/Paris"); every other one answers 200 "Cannot find city id",
// so the page is always asked for as "<City>-<Country>".
export function numbeoCityUrl(name: string, countryName: string, currency: string): string {
  const slug = encodeURIComponent(`${name.trim()} ${countryName.trim()}`.replace(/\s+/g, "-"));
  return `${NUMBEO_HOST}/cost-of-living/in/${slug}?displayCurrency=${currency}`;
}

export function numbeoCountryUrl(name: string, currency: string): string {
  return `${NUMBEO_HOST}/cost-of-living/country_result.jsp?country=${encodeURIComponent(name)}&displayCurrency=${currency}`;
}

// robots.txt of numbeo.com, read 2026-10-05: `User-agent: *` disallows only these two prefixes.
const ROBOTS_DISALLOWED = ["/heavy_crawling.any", "/DEPRECATED/"];

export function isAllowedByRobots(url: string): boolean {
  const { pathname } = new URL(url);
  return !ROBOTS_DISALLOWED.some((prefix) => pathname.startsWith(prefix));
}

// What the first average cell shows for the currency we ask for. HUF is unverified (the 10-city
// sample run confirms what Numbeo prints): this is the one place to edit.
export const ACCEPTED_CURRENCY_SYMBOLS: Record<string, readonly string[]> = {
  EUR: ["€"],
  HUF: ["Ft", "HUF"],
};

const normalisedName = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[\s\-‐-―'‘’`]+/g, " ")
    .trim();

// Numbeo redirects or falls back for names it does not know, and ignores a currency it does not
// support: the page must say it is the place and the currency we asked for, or nothing is staged.
export function pageRefusal(
  page: NumbeoPage,
  expected: { label: string; names: readonly string[]; currency: string },
): string | null {
  if (page.place === null) return `page names no place, expected ${expected.label}`;
  const place = normalisedName(page.place);
  if (!expected.names.some((name) => normalisedName(name) === place))
    return `page is for ${page.place}, expected ${expected.label}`;
  const symbols = ACCEPTED_CURRENCY_SYMBOLS[expected.currency] ?? [];
  const accepted = symbols.join(" or ");
  if (page.currencySymbol === null) return `currency symbol not found, expected ${accepted}`;
  const shown = page.currencySymbol.toLowerCase();
  if (!symbols.some((symbol) => symbol.toLowerCase() === shown))
    return `currency symbol ${page.currencySymbol}, expected ${accepted}`;
  return null;
}

type Locale = "fr" | "en" | "ar";
export type StagedBasis = Record<Locale, { text: string; status: "draft" }>;

export type StagedCostLine = {
  value: { min: number; max: number; currency: string; per: "month" };
  source: "numbeo";
  info_kind: "estimate";
  basis: StagedBasis;
};

export type StagedCostProfile = {
  slug: string;
  country: string;
  city: string | null;
  lines: Partial<Record<CostLineKey, StagedCostLine>>;
  sources: { numbeo: { url: string; last_verified_at: null } };
  _review: {
    kind: "cost-profiles";
    slug: string;
    name: string;
    preparedBy: "assistant";
    preparedAt: string;
    sourceId: string;
    evidence: { fact: string; url: string; quote: string }[];
    notes: string;
  };
};

// Basis texts (machine drafts: fr, en and ar are all unreviewed). The basket is listed in full.
const BASKET = {
  fr: FOOD_BASKET.map((item) => item.labelFr).join(", "),
  en: FOOD_BASKET.map((item) => item.label).join(", "),
  ar: FOOD_BASKET.map((item) => item.labelAr).join("، "),
} satisfies Record<Locale, string>;

type BasisContext = {
  date: string | null;
  readOn: string;
  contributors: number | null;
  countryLevel: boolean;
};

const BASIS_PARTS: Record<
  Locale,
  {
    head: (ctx: BasisContext) => string;
    line: Record<CostLineKey, string>;
    rounding: string;
    country: string;
  }
> = {
  en: {
    head: (c) =>
      c.date === null
        ? `Numbeo read on ${c.readOn} (crowdsourced, not official)`
        : `Numbeo, page updated ${c.date} (crowdsourced, unofficial${c.contributors === null ? "" : `, ${c.contributors} contributors`})`,
    line: {
      housing:
        "Monthly rent of a 1-bedroom apartment outside the city centre: Numbeo's low to high range.",
      food: `Basket: ${BASKET.en}. Min/max: low/high prices.`,
      transport:
        "Monthly public transport pass, regular price: Numbeo's range; a student pass may cost less.",
    },
    rounding: "Rounded outwards.",
    country: "country-level figure; used where the city has no usable Numbeo figure",
  },
  fr: {
    head: (c) =>
      c.date === null
        ? `Numbeo lu le ${c.readOn} (collaboratif, non officiel)`
        : `Numbeo mis à jour le ${c.date} (collaboratif, non officiel${c.contributors === null ? "" : `, ${c.contributors} contributeurs`})`,
    line: {
      housing:
        "Loyer mensuel d'un appartement 1 chambre hors centre-ville : fourchette basse-haute de Numbeo.",
      food: `Panier : ${BASKET.fr}. Min/max : prix bas/hauts.`,
      transport:
        "Abonnement mensuel de transport public, tarif normal : fourchette de Numbeo ; un abonnement étudiant peut coûter moins.",
    },
    rounding: "Arrondi vers l'extérieur.",
    country: "chiffre national ; repli si la ville n'a pas de chiffre exploitable",
  },
  ar: {
    head: (c) =>
      c.date === null
        ? `Numbeo قُرئ في ${c.readOn} (جماعي وغير رسمي)`
        : `Numbeo، تحديث الصفحة في ${c.date} (جماعي وغير رسمي${c.contributors === null ? "" : `، ${c.contributors} مساهما`})`,
    line: {
      housing: "إيجار شهري لشقة بغرفة نوم خارج وسط المدينة: النطاق الأدنى والأعلى في Numbeo.",
      food: `سلة: ${BASKET.ar}. الأدنى من الأسعار المنخفضة والأقصى من المرتفعة.`,
      transport:
        "اشتراك النقل العام الشهري بالسعر العادي: نطاق Numbeo؛ قد يكون اشتراك الطلبة أرخص.",
    },
    rounding: "تقريب نحو الخارج.",
    country: "رقم على مستوى البلد، يُستخدم حين لا يتوفر للمدينة رقم قابل للاستخدام في Numbeo",
  },
};

function basisFor(line: CostLineKey, ctx: BasisContext): StagedBasis {
  const text = (locale: Locale): { text: string; status: "draft" } => {
    const parts = BASIS_PARTS[locale];
    const head = ctx.countryLevel ? `${parts.head(ctx)}: ${parts.country}` : parts.head(ctx);
    return { text: `${head}. ${parts.line[line]} ${parts.rounding}`, status: "draft" };
  };
  return { fr: text("fr"), en: text("en"), ar: text("ar") };
}

const LINE_ORDER: readonly CostLineKey[] = ["housing", "food", "transport"];

const figure = (value: number | null): string => (value === null ? "n/a" : value.toFixed(2));

function quoteOf(line: CostLineKey, rows: readonly NumbeoRow[], currency: string): string {
  if (line === "food") {
    const parts = rows.map((row, index) => {
      const quantity = FOOD_BASKET[index]?.quantity ?? 1;
      return `${row.name} x ${quantity}: low ${figure(row.low)}, high ${figure(row.high)}`;
    });
    return `${parts.join("; ")} (${currency})`;
  }
  const [row] = rows;
  return `${row?.name ?? line}: average ${figure(row?.avg ?? null)}, low ${figure(row?.low ?? null)}, high ${figure(row?.high ?? null)} (${currency})`;
}

// The profile for one Numbeo page, or null when no line could be built (a city Numbeo lists too
// thinly then falls back to the country profile). Pure: the caller supplies the read date.
export function buildProfile(input: {
  slug: string;
  country: string;
  city: string | null;
  url: string;
  page: NumbeoPage;
  currency: string;
  preparedAt: string;
}): StagedCostProfile | null {
  const { slug, page, currency, url } = input;
  const { lines: majors, used, missing } = costLinesFrom(page);
  const factor = 10 ** minorUnitDigits(currency);
  const ctx: BasisContext = {
    date: page.lastUpdate,
    readOn: input.preparedAt,
    contributors: page.contributors,
    countryLevel: input.city === null,
  };
  const lines: Partial<Record<CostLineKey, StagedCostLine>> = {};
  const evidence: StagedCostProfile["_review"]["evidence"] = [];
  for (const key of LINE_ORDER) {
    const range = majors[key];
    if (range === undefined) continue;
    lines[key] = {
      value: {
        min: Math.round(range.min * factor),
        max: Math.round(range.max * factor),
        currency,
        per: "month",
      },
      source: "numbeo",
      info_kind: "estimate",
      basis: basisFor(key, ctx),
    };
    evidence.push({ fact: `lines.${key}`, url, quote: quoteOf(key, used[key] ?? [], currency) });
  }
  if (evidence.length === 0) return null;
  const notes = [
    `Numbeo page last update ${page.lastUpdate ?? "not stated"}; ${page.contributors ?? "unknown number of"} contributors; prices read in ${currency}.`,
    page.lowContributorWarning
      ? "Numbeo flags some data as estimated (low number of contributors)."
      : "",
    missing.length === 0
      ? ""
      : `Not built (row missing, repeated or without a range): ${missing.join("; ")}.`,
  ]
    .filter((part) => part !== "")
    .join(" ");
  return {
    slug,
    country: input.country,
    city: input.city,
    lines,
    sources: { numbeo: { url, last_verified_at: null } },
    _review: {
      kind: COLLECTION,
      slug,
      name: `Numbeo cost profile ${slug}`,
      preparedBy: "assistant",
      preparedAt: input.preparedAt,
      sourceId: `numbeo:${slug}`,
      evidence,
      notes,
    },
  };
}

export type CityRow = { country: string; citySlug: string; name: string };

type Loose = Record<string, unknown>;
const asObject = (value: unknown): Loose | null =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Loose) : null;
const asString = (value: unknown): string | null =>
  typeof value === "string" && value !== "" ? value : null;

async function yamlRecords(dir: string): Promise<Loose[]> {
  if (!existsSync(dir)) return [];
  const names = (await readdir(dir)).filter((n) => n.endsWith(".yaml")).sort();
  const records: Loose[] = [];
  for (const name of names) {
    const record = asObject(parse(await readFile(path.join(dir, name), "utf8")));
    if (record !== null) records.push(record);
  }
  return records;
}

// One row per (country, city slug): the programme's city slug joined to its institution's city name.
export async function loadCities(dataDir: string): Promise<CityRow[]> {
  const names = new Map<string, string>();
  for (const inst of await yamlRecords(path.join(dataDir, "institutions"))) {
    const slug = asString(inst.slug);
    const name = asString(asObject(inst.city)?.name);
    if (slug !== null && name !== null) names.set(slug, name);
  }
  const rows = new Map<string, CityRow>();
  for (const program of await yamlRecords(path.join(dataDir, "programs"))) {
    const country = asString(program.country);
    const citySlug = asString(program.city);
    const institution = asString(program.institution);
    const name = institution === null ? undefined : names.get(institution);
    if (country === null || citySlug === null || name === undefined) continue;
    const key = `${country}|${citySlug}`;
    if (!rows.has(key)) rows.set(key, { country, citySlug, name });
  }
  return [...rows.values()].sort((a, b) =>
    `${a.country}|${a.citySlug}`.localeCompare(`${b.country}|${b.citySlug}`),
  );
}

export type RunOptions = {
  dryRun: boolean;
  countries?: readonly string[];
  maxRequests: number;
  delayMs: number;
  dataDir: string;
  stagingDir: string;
  now: () => string;
  fetch: (url: string) => Promise<string>;
  isCached: (url: string) => boolean;
  sleep: (ms: number) => Promise<void>;
};

export type RunOutcome = { ok: boolean; lines: string[]; requests: number; staged: string[] };

type Target = {
  slug: string;
  country: string;
  city: string | null;
  url: string;
  currency: string;
  // The place the page must be about: shown in the refusal, and the names that match it.
  label: string;
  names: string[];
};

function targetsFor(countries: readonly string[], cities: readonly CityRow[]): Target[] {
  const countryTargets = countries.map((country) => {
    const name = COUNTRY_NAMES[country] ?? country;
    return {
      slug: `${country.toLowerCase()}-numbeo`,
      country,
      city: null,
      url: numbeoCountryUrl(name, currencyOf(country)),
      currency: currencyOf(country),
      label: name,
      names: [name],
    };
  });
  const cityTargets = cities
    .filter((row) => countries.includes(row.country))
    .map((row) => ({
      slug: `${row.country.toLowerCase()}-${row.citySlug}-numbeo`,
      country: row.country,
      city: row.citySlug,
      url: numbeoCityUrl(
        row.name,
        COUNTRY_NAMES[row.country] ?? row.country,
        currencyOf(row.country),
      ),
      currency: currencyOf(row.country),
      label: row.name,
      names: [row.name, `${row.name}, ${COUNTRY_NAMES[row.country] ?? row.country}`],
    }));
  return [...countryTargets, ...cityTargets];
}

const isNotListed = (error: unknown): boolean =>
  error instanceof Error && /HTTP 404\b/.test(error.message);

// Fetches sequentially (one request at a time, `delayMs` apart), stages what parses, never
// overwrites a staged file or a slug already in data/.
export async function runCosts(options: RunOptions): Promise<RunOutcome> {
  if (options.delayMs < MIN_DELAY_MS)
    throw new Error(
      `--delay-ms must be at least ${MIN_DELAY_MS}: one request every 2 seconds at most`,
    );
  const countries = (options.countries ?? Object.keys(COUNTRY_NAMES)).map((c) => c.toUpperCase());
  for (const code of countries)
    if (!(code in COUNTRY_NAMES)) throw new Error(`no Numbeo country name for ${code}`);

  const lines: string[] = [];
  const staged: string[] = [];
  const pending: Target[] = [];
  for (const target of targetsFor(countries, await loadCities(options.dataDir))) {
    if (existsSync(stageFile(COLLECTION, target.slug, options.stagingDir)))
      lines.push(`skipped ${target.slug}: already staged (never overwritten)`);
    else if (existsSync(path.join(options.dataDir, COLLECTION, `${target.slug}.yaml`)))
      lines.push(`skipped ${target.slug}: already in data/ (never overwritten)`);
    else if (!isAllowedByRobots(target.url))
      lines.push(`refused ${target.slug}: ${target.url} is disallowed by robots.txt`);
    else pending.push(target);
  }

  const cached = pending.filter((t) => options.isCached(t.url)).length;
  const uncached = pending.length - cached;
  if (options.dryRun) {
    const planned = Math.min(uncached, options.maxRequests);
    const minutes = Math.ceil((planned * options.delayMs) / 60000);
    lines.push(
      `${planned} requests planned (${cached} already cached), about ${minutes} minutes at the ${options.delayMs} ms delay, one attempt each, no retries`,
    );
    if (uncached > planned)
      lines.push(
        `--max-requests ${options.maxRequests} would leave ${uncached - planned} unfetched`,
      );
    lines.push("dry run: nothing fetched or written");
    return { ok: true, lines, requests: 0, staged };
  }

  let requests = 0;
  let failed = 0;
  for (const target of pending) {
    const fallback =
      target.city === null ? "" : `; falls back to ${target.country.toLowerCase()}-numbeo`;
    if (!options.isCached(target.url)) {
      if (requests >= options.maxRequests) {
        lines.push(`not fetched ${target.slug}: --max-requests ${options.maxRequests} reached`);
        continue;
      }
      if (requests > 0) await options.sleep(options.delayMs);
      requests++;
    }
    let body: string;
    try {
      body = await options.fetch(target.url);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isNotListed(error)) {
        lines.push(`no profile ${target.slug}: not listed on Numbeo (${message})${fallback}`);
      } else {
        failed++;
        lines.push(`failed ${target.slug}: ${message} (re-run to retry)${fallback}`);
      }
      continue;
    }
    if (isCityNotFound(body)) {
      lines.push(`no profile ${target.slug}: not listed by Numbeo${fallback}`);
      continue;
    }
    const page = parseNumbeoPage(body);
    const refusal = pageRefusal(page, target);
    if (refusal !== null) {
      lines.push(`no profile ${target.slug}: ${refusal}${fallback}`);
      continue;
    }
    const profile = buildProfile({
      slug: target.slug,
      country: target.country,
      city: target.city,
      url: target.url,
      page,
      currency: target.currency,
      preparedAt: options.now(),
    });
    if (profile === null) {
      lines.push(
        `no profile ${target.slug}: no housing, food or transport line on the page${fallback}`,
      );
      continue;
    }
    const { _review, ...record } = profile;
    const check = CostProfileRecordSchema.safeParse({
      ...record,
      sources: { numbeo: { url: target.url, last_verified_at: options.now() } },
    });
    if (!check.success) {
      const issue = check.error.issues[0];
      lines.push(
        `no profile ${target.slug}: invalid at ${issue?.path.join(".") ?? "?"}: ${issue?.message ?? "?"}${fallback}`,
      );
      continue;
    }
    const file = stageFile(COLLECTION, target.slug, options.stagingDir);
    await mkdir(path.dirname(file), { recursive: true });
    // "wx": fail instead of overwriting, even if another process created the file meanwhile.
    await writeFile(file, toYaml({ ...profile }), { flag: "wx" });
    staged.push(`${COLLECTION}/${target.slug}`);
    lines.push(`staged ${COLLECTION}/${target.slug} (${Object.keys(profile.lines).join(", ")})`);
    if (profile._review.notes.includes("Not built"))
      lines.push(`partial ${target.slug}: ${profile._review.notes}`);
  }
  lines.push(
    `staged ${staged.length} profile(s) with ${requests} request(s)${failed === 0 ? "" : `, ${failed} failed (re-run to retry)`}`,
  );
  return { ok: failed === 0, lines, requests, staged };
}

// One attempt: fetchText retries 429, 5xx and network errors, so any retry would be a request the
// --max-requests cap and the delay do not count. A failed URL is not cached, so a re-run retries it.
export function numbeoFetch(url: string): Promise<string> {
  return fetchText(url, {
    headers: { "user-agent": NUMBEO_USER_AGENT },
    accept: "text/html",
    attempts: 1,
  });
}

function numberFlag(argv: readonly string[], name: string, fallback: number): number {
  const at = argv.indexOf(name);
  if (at === -1) return fallback;
  const value = Number(argv[at + 1]);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} needs a positive integer`);
  return value;
}

async function main(argv: readonly string[]): Promise<void> {
  const countriesAt = argv.indexOf("--countries");
  const countries =
    countriesAt === -1
      ? undefined
      : (argv[countriesAt + 1] ?? "").split(",").filter((code) => code !== "");
  const outcome = await runCosts({
    dryRun: argv.includes("--dry-run"),
    ...(countries === undefined ? {} : { countries }),
    maxRequests: numberFlag(argv, "--max-requests", 400),
    delayMs: numberFlag(argv, "--delay-ms", MIN_DELAY_MS),
    dataDir: DATA_DIR,
    stagingDir: STAGING_DIR,
    now: () => new Date().toISOString().slice(0, 10),
    fetch: numbeoFetch,
    isCached: (url) => isCached(url),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  });
  for (const line of outcome.lines) console.log(line);
  if (!outcome.ok) process.exitCode = 1;
}

if (process.argv[1]?.endsWith("costs.ts") === true) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
