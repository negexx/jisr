import { decodeEntities } from "../evidence";

// Numbeo cost-of-living pages: crowdsourced prices, never official. The project owner holds
// Numbeo's written permission to collect and use the data (see data/README.md).
export const NUMBEO_USER_AGENT =
  "Jisr-research (non-commercial; written permission held by the project owner; contact dagdaguihamza@gmail.com)";

export const NUMBEO_ROWS = {
  housing: "1 Bedroom Apartment Outside of City Centre",
  transport: "Monthly Public Transport Pass (Regular Price)",
} as const;

export type FoodBasketItem = {
  name: string;
  quantity: number;
  label: string;
  labelFr: string;
  labelAr: string;
};

// One month of food for one student: the basket is our modelling choice and is disclosed in the
// line's basis in every locale. "eggs 24" is two 12-packs, hence quantity 2.
export const FOOD_BASKET: readonly FoodBasketItem[] = [
  {
    name: "Milk (Regular, 1 Liter)",
    quantity: 8,
    label: "milk 8 L",
    labelFr: "lait 8 L",
    labelAr: "حليب 8 لتر",
  },
  {
    name: "Fresh White Bread (500 g Loaf)",
    quantity: 8,
    label: "bread 8 loaves (500 g)",
    labelFr: "pain 8 x 500 g",
    labelAr: "خبز 8 أرغفة (500 غ)",
  },
  {
    name: "White Rice (1 kg)",
    quantity: 2,
    label: "rice 2 kg",
    labelFr: "riz 2 kg",
    labelAr: "أرز 2 كغ",
  },
  {
    name: "Eggs (12, Large Size)",
    quantity: 2,
    label: "eggs 24",
    labelFr: "œufs 24",
    labelAr: "بيض 24",
  },
  {
    name: "Chicken Fillets (1 kg)",
    quantity: 3,
    label: "chicken 3 kg",
    labelFr: "poulet 3 kg",
    labelAr: "دجاج 3 كغ",
  },
  {
    name: "Apples (1 kg)",
    quantity: 3,
    label: "apples 3 kg",
    labelFr: "pommes 3 kg",
    labelAr: "تفاح 3 كغ",
  },
  {
    name: "Bananas (1 kg)",
    quantity: 3,
    label: "bananas 3 kg",
    labelFr: "bananes 3 kg",
    labelAr: "موز 3 كغ",
  },
  {
    name: "Tomatoes (1 kg)",
    quantity: 3,
    label: "tomatoes 3 kg",
    labelFr: "tomates 3 kg",
    labelAr: "طماطم 3 كغ",
  },
  {
    name: "Potatoes (1 kg)",
    quantity: 4,
    label: "potatoes 4 kg",
    labelFr: "pommes de terre 4 kg",
    labelAr: "بطاطس 4 كغ",
  },
  {
    name: "Onions (1 kg)",
    quantity: 2,
    label: "onions 2 kg",
    labelFr: "oignons 2 kg",
    labelAr: "بصل 2 كغ",
  },
  {
    name: "Lettuce (1 Head)",
    quantity: 4,
    label: "lettuce 4",
    labelFr: "salades 4",
    labelAr: "خس 4",
  },
  {
    name: "Meal at an Inexpensive Restaurant",
    quantity: 8,
    label: "8 inexpensive-restaurant meals",
    labelFr: "8 repas bon marché au restaurant",
    labelAr: "8 وجبات في مطعم رخيص",
  },
];

export type NumbeoRow = {
  name: string;
  avg: number | null;
  low: number | null;
  high: number | null;
};

export type NumbeoPage = {
  lastUpdate: string | null;
  contributors: number | null;
  // The h1 text after "Cost of Living in " ("Paris", "France", "Lyon, France"), as the page states it.
  place: string | null;
  // The text around the number in the first average cell ("€", "Ft"): the currency Numbeo showed.
  currencySymbol: string | null;
  rows: NumbeoRow[];
};

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

// US format: "1,396.87". The currency symbol (an entity in the average cell) is ignored; the caller
// knows which currency it asked Numbeo for.
function numberIn(text: string): number | null {
  const match = text.match(/\d[\d,]*(?:\.\d+)?/);
  if (match === null) return null;
  const value = Number(match[0].replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

function cellText(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function barValue(cell: string, side: "barTextLeft" | "barTextRight"): number | null {
  const match = cell.match(new RegExp(`class="${side}"[^>]*>([\\s\\S]*?)</span>`));
  return match === null ? null : numberIn(cellText(match[1] ?? ""));
}

function parseRow(rowHtml: string): NumbeoRow | null {
  const cells = [...rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1] ?? "");
  const name = cellText(cells[0] ?? "");
  if (name === "") return null;
  const range = cells[2] ?? "";
  return {
    name,
    avg: numberIn(cellText(cells[1] ?? "")),
    low: barValue(range, "barTextLeft"),
    high: barValue(range, "barTextRight"),
  };
}

function lastUpdateOf(html: string): string | null {
  const match = html.match(/Last update:\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (match === null) return null;
  const month = MONTHS.indexOf((match[2] ?? "").toLowerCase());
  if (month < 0) return null;
  return `${match[3]}-${String(month + 1).padStart(2, "0")}-${(match[1] ?? "").padStart(2, "0")}`;
}

function contributorsOf(html: string): number | null {
  const match = html.match(/by\s+([\d,]+)\s+different contributors/);
  return match === null ? null : numberIn(match[1] ?? "");
}

function placeOf(html: string): string | null {
  for (const heading of html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)) {
    const match = cellText(heading[1] ?? "").match(/^Cost of Living in\s+(.+)$/i);
    if (match !== null) return match[1] ?? null;
  }
  return null;
}

// Numbeo answers 200 with this heading for a city it cannot resolve from the URL.
export function isCityNotFound(html: string): boolean {
  return [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].some((heading) =>
    /^Cannot find city id/i.test(cellText(heading[1] ?? "")),
  );
}

function currencySymbolOf(tableHtml: string): string | null {
  const cell = tableHtml.match(/class="first_currency"[^>]*>([\s\S]*?)<\/span>/i);
  if (cell === null) return null;
  const symbol = cellText(cell[1] ?? "")
    .replace(/\d[\d,]*(?:\.\d+)?/, "")
    .trim();
  return symbol === "" ? null : symbol;
}

export function parseNumbeoPage(html: string): NumbeoPage {
  const table = html.match(/<table\b[^>]*data_wide_table[^>]*>([\s\S]*?)<\/table>/i);
  const rows = [...(table?.[1] ?? "").matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((m) => parseRow(m[1] ?? ""))
    .filter((r): r is NumbeoRow => r !== null);
  return {
    lastUpdate: lastUpdateOf(html),
    contributors: contributorsOf(html),
    place: placeOf(html),
    currencySymbol: currencySymbolOf(table?.[1] ?? ""),
    rows,
  };
}

export type CostLineKey = "housing" | "food" | "transport";
export type MajorRange = { min: number; max: number };

type PricedRow = NumbeoRow & { low: number; high: number };

const hasRange = (row: NumbeoRow | undefined): row is PricedRow =>
  row !== undefined && row.low !== null && row.high !== null && row.low <= row.high;

// Sums are taken in hundredths so that floating-point noise (0.1 + 0.2) cannot push a whole-unit
// total across a unit boundary.
const hundredths = (value: number): number => Math.round(value * 100);

// Min is rounded down and max up to whole units, so the published range never shrinks.
function wholeUnits(minHundredths: number, maxHundredths: number): MajorRange {
  return { min: Math.floor(minHundredths / 100), max: Math.ceil(maxHundredths / 100) };
}

// Housing, food and transport lines in major units (the caller converts to minor units), rounded
// outwards to whole units: min floored, max ceiled, so the range never shrinks. Fails closed: a
// needed row that is absent, appears more than once, or has no usable range (a missing end, or low
// above high) gives no line and is listed in `missing` ("<name> (duplicate)" for a repeated row).
export function costLinesFrom(page: NumbeoPage): {
  lines: Partial<Record<CostLineKey, MajorRange>>;
  used: Record<string, NumbeoRow[]>;
  missing: string[];
} {
  const lines: Partial<Record<CostLineKey, MajorRange>> = {};
  const used: Record<string, NumbeoRow[]> = {};
  const missing: string[] = [];

  const priced = (name: string): PricedRow | null => {
    const matches = page.rows.filter((r) => r.name === name);
    if (matches.length > 1) {
      missing.push(`${name} (duplicate)`);
      return null;
    }
    const row = matches[0];
    if (!hasRange(row)) {
      missing.push(name);
      return null;
    }
    return row;
  };

  const single = (key: "housing" | "transport"): void => {
    const row = priced(NUMBEO_ROWS[key]);
    if (row === null) return;
    lines[key] = wholeUnits(hundredths(row.low), hundredths(row.high));
    used[key] = [row];
  };

  single("housing");

  const basketRows: PricedRow[] = [];
  let lowTotal = 0;
  let highTotal = 0;
  for (const item of FOOD_BASKET) {
    const row = priced(item.name);
    if (row === null) continue;
    basketRows.push(row);
    lowTotal += hundredths(row.low) * item.quantity;
    highTotal += hundredths(row.high) * item.quantity;
  }
  if (basketRows.length === FOOD_BASKET.length) {
    lines.food = wholeUnits(lowTotal, highTotal);
    used.food = basketRows;
  }

  single("transport");

  return { lines, used, missing };
}
