import { describe, expect, it } from "vitest";

import {
  costLinesFrom,
  FOOD_BASKET,
  isCityNotFound,
  NUMBEO_ROWS,
  NUMBEO_USER_AGENT,
  type NumbeoPage,
  type NumbeoRow,
  parseNumbeoPage,
} from "../../../scripts/import/sources/numbeo";

const row = (name: string, avg: string, low?: string, high?: string): string =>
  `<tr><td>${name} </td> <td style="text-align: right" class="priceValue "> <span class="first_currency">&#8364;${avg}</span></td>` +
  (low === undefined
    ? " </tr>"
    : ` <td class="priceBarTd "> <span class="barTextLeft"> ${low}</span><div class="barViewTd"></div><span class="barTextRight">${high}</span></td> </tr>`);

const section = (title: string): string =>
  `<tr><th class="highlighted_th"><div class="category_title">${title}</div></th><th>Edit</th><th><span class="range_label">Range</span></th></tr>`;

const page = (rows: string[], footer = ""): string =>
  `<html><body><table class="data_wide_table new_data_table">${rows.join("\n")}</table>${footer}</body></html>`;

const FOOTER =
  "<div>This city had 1579 entries in the past 12 months by 1,246 different contributors. <br/>Last update: 3 October 2026</div>";

// Every basket row at a round low/high price: low = 1, high = 2 (eggs and the meal included).
const basketRows = (skip: string[] = []): string[] =>
  FOOD_BASKET.filter((item) => !skip.includes(item.name)).map((item) =>
    row(item.name, "1.50", "1.00", "2.00"),
  );

const numbeoRow = (name: string, avg: number | null, low: number | null, high: number | null) => ({
  name,
  avg,
  low,
  high,
});

const pageOf = (rows: NumbeoRow[]): NumbeoPage => ({
  lastUpdate: null,
  contributors: null,
  lowContributorWarning: false,
  place: null,
  currencySymbol: null,
  rows,
});

describe("constants", () => {
  it("names the project and a contact in the user agent", () => {
    expect(NUMBEO_USER_AGENT).toBe(
      "Jisr-research (non-commercial; written permission held by the project owner; contact dagdaguihamza@gmail.com)",
    );
  });

  it("lists the monthly food basket", () => {
    expect(FOOD_BASKET.map(({ name, quantity, label }) => ({ name, quantity, label }))).toEqual([
      { name: "Milk (Regular, 1 Liter)", quantity: 8, label: "milk 8 L" },
      { name: "Fresh White Bread (500 g Loaf)", quantity: 8, label: "bread 8 loaves (500 g)" },
      { name: "White Rice (1 kg)", quantity: 2, label: "rice 2 kg" },
      { name: "Eggs (12, Large Size)", quantity: 2, label: "eggs 24" },
      { name: "Chicken Fillets (1 kg)", quantity: 3, label: "chicken 3 kg" },
      { name: "Apples (1 kg)", quantity: 3, label: "apples 3 kg" },
      { name: "Bananas (1 kg)", quantity: 3, label: "bananas 3 kg" },
      { name: "Tomatoes (1 kg)", quantity: 3, label: "tomatoes 3 kg" },
      { name: "Potatoes (1 kg)", quantity: 4, label: "potatoes 4 kg" },
      { name: "Onions (1 kg)", quantity: 2, label: "onions 2 kg" },
      { name: "Lettuce (1 Head)", quantity: 4, label: "lettuce 4" },
      {
        name: "Meal at an Inexpensive Restaurant",
        quantity: 8,
        label: "8 inexpensive-restaurant meals",
      },
    ]);
  });

  it("gives every basket item a French and an Arabic label that state its amount", () => {
    for (const item of FOOD_BASKET) {
      expect(item.labelFr).toMatch(/\d/);
      expect(item.labelAr).toMatch(/\d/);
    }
    expect(FOOD_BASKET.map((item) => item.labelFr).join(" ")).not.toMatch(/\bresto\b/);
    expect(FOOD_BASKET.at(-1)?.labelFr).toBe("8 repas bon marché au restaurant");
  });

  it("names the housing and transport rows", () => {
    expect(NUMBEO_ROWS.housing).toBe("1 Bedroom Apartment Outside of City Centre");
    expect(NUMBEO_ROWS.transport).toBe("Monthly Public Transport Pass (Regular Price)");
  });
});

describe("parseNumbeoPage", () => {
  it("reads the average, the range, the thousands separator and the entity-encoded symbol", () => {
    const parsed = parseNumbeoPage(
      page([
        section("Rent Per Month"),
        row("1 Bedroom Apartment Outside of City Centre", "1,396.87", "1,100.00", "2,000.00"),
        row("Milk (Regular, 1 Liter)", "1.37", "1.00", "1.90"),
      ]),
    );
    expect(parsed.rows).toEqual([
      {
        name: "1 Bedroom Apartment Outside of City Centre",
        avg: 1396.87,
        low: 1100,
        high: 2000,
      },
      { name: "Milk (Regular, 1 Liter)", avg: 1.37, low: 1, high: 1.9 },
    ]);
  });

  it("gives null low and high for a row without a range", () => {
    const parsed = parseNumbeoPage(
      page([row("Average Monthly Net Salary (After Tax)", "3,125.89")]),
    );
    expect(parsed.rows).toEqual([
      { name: "Average Monthly Net Salary (After Tax)", avg: 3125.89, low: null, high: null },
    ]);
  });

  it("gives null for a cell with no number", () => {
    const html = page([
      `<tr><td>Odd Row </td> <td class="priceValue "> <span class="first_currency">?</span></td> <td class="priceBarTd "><span class="barTextLeft"></span><span class="barTextRight"></span></td></tr>`,
    ]);
    expect(parseNumbeoPage(html).rows).toEqual([
      { name: "Odd Row", avg: null, low: null, high: null },
    ]);
  });

  it("trims the name, decodes entities in it and handles highlighted cells", () => {
    const html = page([
      `<tr><td class="tr_highlighted">Fish &amp; Chips (1 kg) </td> <td style="text-align: right" class="priceValue tr_highlighted"> <span class="first_currency">&#8364;9.00</span></td> <td class="priceBarTd "> <span class="barTextLeft"> 8.00</span><span class="barTextRight">10.00</span></td> </tr>`,
    ]);
    expect(parseNumbeoPage(html).rows).toEqual([
      { name: "Fish & Chips (1 kg)", avg: 9, low: 8, high: 10 },
    ]);
  });

  it("ignores section header rows", () => {
    const parsed = parseNumbeoPage(page([section("Restaurants"), section("Markets")]));
    expect(parsed.rows).toEqual([]);
  });

  it("reads rows only from the data_wide_table", () => {
    const html = `<table class="other">${row("Outside Row", "1.00", "1.00", "1.00")}</table>${page([
      row("Inside Row", "2.00", "2.00", "2.00"),
    ])}`;
    expect(parseNumbeoPage(html).rows.map((r) => r.name)).toEqual(["Inside Row"]);
  });

  it("has no rows when the table is missing", () => {
    expect(parseNumbeoPage("<html><body><p>Not found</p></body></html>").rows).toEqual([]);
  });

  it("reads the last-update date as ISO and the contributors count", () => {
    const parsed = parseNumbeoPage(page([], FOOTER));
    expect(parsed.lastUpdate).toBe("2026-10-03");
    expect(parsed.contributors).toBe(1246);
  });

  it("reads the footer wording of a country page too", () => {
    const footer =
      "<div>This country had 9220 entries in the past 12 months by 981 different contributors. <br/>Last update: 5 October 2026</div>";
    const parsed = parseNumbeoPage(page([], footer));
    expect(parsed.lastUpdate).toBe("2026-10-05");
    expect(parsed.contributors).toBe(981);
  });

  it("reads the contributors count of a small-city footer that has no 'entries ... by' wording", () => {
    const footer =
      "<div>This city had 7 different contributors in the past 18 months.  Some data are estimated due to a low number of contributors. If you are living here, please update our data . Last update: 18 April 2025</div>";
    const parsed = parseNumbeoPage(page([], footer));
    expect(parsed.contributors).toBe(7);
    expect(parsed.lastUpdate).toBe("2025-04-18");
    expect(parsed.lowContributorWarning).toBe(true);
  });

  it("has no low-contributor warning on a normal footer or no footer", () => {
    expect(parseNumbeoPage(page([], FOOTER)).lowContributorWarning).toBe(false);
    expect(parseNumbeoPage(page([])).lowContributorWarning).toBe(false);
  });

  it("zero-pads the day of the last update", () => {
    const parsed = parseNumbeoPage(page([], "Last update: 7 January 2027"));
    expect(parsed.lastUpdate).toBe("2027-01-07");
  });

  it("has null date and contributors when the footer is missing or unreadable", () => {
    expect(parseNumbeoPage(page([])).lastUpdate).toBeNull();
    expect(parseNumbeoPage(page([])).contributors).toBeNull();
    expect(parseNumbeoPage(page([], "Last update: 3 Octember 2026")).lastUpdate).toBeNull();
  });

  it("reads the place from the h1 of a city page and of a country page", () => {
    const city = `<html><head><title>Cost of Living in Paris. Oct 2026. Prices in Paris</title></head><body><h1> Cost of Living in Paris</h1></body></html>`;
    const country = `<html><body><h1> Cost of Living in France </h1></body></html>`;
    expect(parseNumbeoPage(city).place).toBe("Paris");
    expect(parseNumbeoPage(country).place).toBe("France");
  });

  it("decodes entities in the place and keeps a ', Country' suffix", () => {
    const html = `<h1>Cost of Living in Saint-Martin-d&#39;H&egrave;res, France</h1>`;
    expect(parseNumbeoPage(html).place).toBe("Saint-Martin-d'Hères, France");
  });

  it("has no place when there is no h1 of that wording", () => {
    expect(parseNumbeoPage("<html><body><p>Not found</p></body></html>").place).toBeNull();
    expect(parseNumbeoPage("<h1>Something else</h1>").place).toBeNull();
  });

  it("recognises Numbeo's 'Cannot find city id' page by its h1 and no other page", () => {
    expect(
      isCityNotFound("<h1> Cannot find city id for Agen </h1><p>similar: Agen, France</p>"),
    ).toBe(true);
    expect(isCityNotFound("<h1>cannot find city id for X</h1>")).toBe(true);
    expect(isCityNotFound("<h1>Cost of Living in Agen, France</h1>")).toBe(false);
    expect(isCityNotFound("<p>Cannot find city id for Agen</p>")).toBe(false);
  });

  it("reads the currency symbol of the first average cell, prefix or suffix", () => {
    expect(parseNumbeoPage(page([row("Milk", "1.37", "1.00", "1.90")])).currencySymbol).toBe("€");
    const suffix = page([
      `<tr><td>Milk </td> <td class="priceValue "> <span class="first_currency">1,350.00&nbsp;Ft</span></td></tr>`,
    ]);
    expect(parseNumbeoPage(suffix).currencySymbol).toBe("Ft");
    const code = page([
      `<tr><td>Milk </td> <td class="priceValue "> <span class="first_currency">HUF 1,350.00</span></td></tr>`,
    ]);
    expect(parseNumbeoPage(code).currencySymbol).toBe("HUF");
  });

  it("has no currency symbol when no average cell or no symbol is there", () => {
    expect(parseNumbeoPage(page([])).currencySymbol).toBeNull();
    const bare = page([
      `<tr><td>Milk </td> <td class="priceValue "> <span class="first_currency">1.37</span></td></tr>`,
    ]);
    expect(parseNumbeoPage(bare).currencySymbol).toBeNull();
  });

  it("keeps every row when a name repeats (the mapping decides what to do)", () => {
    const parsed = parseNumbeoPage(
      page([
        row("Bottled Water", "1.00", "1.00", "1.00"),
        row("Bottled Water", "9.00", "9.00", "9.00"),
      ]),
    );
    expect(parsed.rows.map((r) => r.avg)).toEqual([1, 9]);
  });
});

describe("costLinesFrom", () => {
  it("takes the one-bedroom-outside-the-centre range for housing", () => {
    const result = costLinesFrom(
      parseNumbeoPage(
        page([
          section("Rent Per Month"),
          row("Apartment (1 bedroom) in City Centre", "1,900.00", "1,500.00", "2,500.00"),
          row(NUMBEO_ROWS.housing, "1,396.87", "1,100.00", "2,000.00"),
        ]),
      ),
    );
    expect(result.lines.housing).toEqual({ min: 1100, max: 2000 });
    expect(result.used.housing).toEqual([
      { name: NUMBEO_ROWS.housing, avg: 1396.87, low: 1100, high: 2000 },
    ]);
  });

  it("rounds the range outwards so it never shrinks: min down, max up", () => {
    const result = costLinesFrom(pageOf([numbeoRow(NUMBEO_ROWS.housing, 900, 800.4, 1300.2)]));
    expect(result.lines.housing).toEqual({ min: 800, max: 1301 });
  });

  it("keeps a whole-unit range as it is, free of floating-point noise", () => {
    const result = costLinesFrom(
      pageOf([numbeoRow(NUMBEO_ROWS.housing, 900, 0.1 + 0.2 + 799.7, 0.1 + 0.2 + 1299.7)]),
    );
    expect(result.lines.housing).toEqual({ min: 800, max: 1300 });
  });

  it("fails closed when a needed row appears twice: no line, listed as a duplicate", () => {
    const result = costLinesFrom(
      pageOf([
        numbeoRow(NUMBEO_ROWS.housing, 900, 800, 1300),
        numbeoRow(NUMBEO_ROWS.housing, 950, 850, 1350),
        numbeoRow(NUMBEO_ROWS.transport, 50, 40, 60),
        numbeoRow(NUMBEO_ROWS.transport, 55, 45, 65),
      ]),
    );
    expect(result.lines.housing).toBeUndefined();
    expect(result.lines.transport).toBeUndefined();
    expect(result.used.housing).toBeUndefined();
    expect(result.missing).toContain(`${NUMBEO_ROWS.housing} (duplicate)`);
    expect(result.missing).toContain(`${NUMBEO_ROWS.transport} (duplicate)`);
  });

  it("fails closed when a basket row appears twice, leaving the other lines", () => {
    const rows = [
      ...FOOD_BASKET.map((item) => numbeoRow(item.name, 1.5, 1, 2)),
      numbeoRow("Onions (1 kg)", 3, 2, 4),
      numbeoRow(NUMBEO_ROWS.transport, 50, 40, 60),
    ];
    const result = costLinesFrom(pageOf(rows));
    expect(result.lines.food).toBeUndefined();
    expect(result.lines.transport).toEqual({ min: 40, max: 60 });
    expect(result.missing).toContain("Onions (1 kg) (duplicate)");
  });

  it("ignores duplicates of rows it does not use", () => {
    const result = costLinesFrom(
      pageOf([
        numbeoRow("Bottled Water", 1, 1, 1),
        numbeoRow("Bottled Water", 9, 9, 9),
        numbeoRow(NUMBEO_ROWS.housing, 900, 800, 1300),
      ]),
    );
    expect(result.lines.housing).toEqual({ min: 800, max: 1300 });
  });

  it("treats a range with low above high as no range", () => {
    const result = costLinesFrom(
      pageOf([
        numbeoRow(NUMBEO_ROWS.housing, 900, 1300, 800),
        numbeoRow(NUMBEO_ROWS.transport, 50, 60, 40),
        ...FOOD_BASKET.map((item) =>
          item.name === "Milk (Regular, 1 Liter)"
            ? numbeoRow(item.name, 1.5, 2, 1)
            : numbeoRow(item.name, 1.5, 1, 2),
        ),
      ]),
    );
    expect(result.lines).toEqual({});
    expect(result.missing).toEqual([
      NUMBEO_ROWS.housing,
      "Milk (Regular, 1 Liter)",
      NUMBEO_ROWS.transport,
    ]);
  });

  it("accepts a range whose low equals its high", () => {
    const result = costLinesFrom(pageOf([numbeoRow(NUMBEO_ROWS.housing, 900, 900, 900)]));
    expect(result.lines.housing).toEqual({ min: 900, max: 900 });
  });

  it("gives no housing line for a row without a range, and lists it as missing", () => {
    const result = costLinesFrom(parseNumbeoPage(page([row(NUMBEO_ROWS.housing, "1,396.87")])));
    expect(result.lines.housing).toBeUndefined();
    expect(result.used.housing).toBeUndefined();
    expect(result.missing).toContain(NUMBEO_ROWS.housing);
  });

  it("gives no housing line when only one end of the range is known", () => {
    const result = costLinesFrom(pageOf([numbeoRow(NUMBEO_ROWS.housing, 900, 800, null)]));
    expect(result.lines.housing).toBeUndefined();
    expect(result.missing).toContain(NUMBEO_ROWS.housing);
  });

  it("takes the pass range for transport", () => {
    const result = costLinesFrom(
      parseNumbeoPage(
        page([
          row("One-way Ticket (Local Transport)", "2.50", "2.00", "3.00"),
          row(NUMBEO_ROWS.transport, "88.80", "75.00", "90.00"),
        ]),
      ),
    );
    expect(result.lines.transport).toEqual({ min: 75, max: 90 });
    expect(result.used.transport).toEqual([
      { name: NUMBEO_ROWS.transport, avg: 88.8, low: 75, high: 90 },
    ]);
  });

  it("sums quantity times the low price for food min and the high price for food max", () => {
    // basket quantities total 8+8+2+2+3+3+3+3+4+2+4+8 = 50
    const result = costLinesFrom(parseNumbeoPage(page(basketRows())));
    expect(result.lines.food).toEqual({ min: 50, max: 100 });
    expect(result.missing).not.toContain("Milk (Regular, 1 Liter)");
  });

  it("uses a different low and high price per item", () => {
    const rows = FOOD_BASKET.map((item) =>
      numbeoRow(
        item.name,
        5,
        item.name === "Milk (Regular, 1 Liter)" ? 1.1 : 1,
        item.name === "Milk (Regular, 1 Liter)" ? 1.3 : 2,
      ),
    );
    const result = costLinesFrom(pageOf(rows));
    // min: 42 other units at 1 + 8 x 1.10 = 50.80 -> 50; max: 42 x 2 + 8 x 1.30 = 94.40 -> 95
    expect(result.lines.food).toEqual({ min: 50, max: 95 });
  });

  it("carries every basket row behind the food line, in basket order", () => {
    const result = costLinesFrom(parseNumbeoPage(page(basketRows())));
    expect(result.used.food?.map((r) => r.name)).toEqual(FOOD_BASKET.map((i) => i.name));
  });

  it("needs every basket row: one missing row removes the food line and is listed", () => {
    const result = costLinesFrom(
      parseNumbeoPage(
        page([...basketRows(["Onions (1 kg)"]), row(NUMBEO_ROWS.transport, "50", "40", "60")]),
      ),
    );
    expect(result.lines.food).toBeUndefined();
    expect(result.used.food).toBeUndefined();
    expect(result.missing).toEqual([NUMBEO_ROWS.housing, "Onions (1 kg)"]);
    expect(result.lines.transport).toEqual({ min: 40, max: 60 });
  });

  it("treats a basket row without a range as missing", () => {
    const rows = basketRows(["Apples (1 kg)"]);
    rows.push(row("Apples (1 kg)", "2.00"));
    const result = costLinesFrom(parseNumbeoPage(page(rows)));
    expect(result.lines.food).toBeUndefined();
    expect(result.missing).toContain("Apples (1 kg)");
  });

  it("removes only the missing line and lists it, leaving the others", () => {
    const result = costLinesFrom(
      parseNumbeoPage(
        page([...basketRows(), row(NUMBEO_ROWS.housing, "1,396.87", "1,100.00", "2,000.00")]),
      ),
    );
    expect(result.lines).toEqual({
      housing: { min: 1100, max: 2000 },
      food: { min: 50, max: 100 },
    });
    expect(result.missing).toEqual([NUMBEO_ROWS.transport]);
    expect(Object.keys(result.used).sort()).toEqual(["food", "housing"]);
  });

  it("gives no lines and lists every needed row for an empty page", () => {
    const result = costLinesFrom(pageOf([]));
    expect(result.lines).toEqual({});
    expect(result.used).toEqual({});
    expect(result.missing).toEqual([
      NUMBEO_ROWS.housing,
      ...FOOD_BASKET.map((i) => i.name),
      NUMBEO_ROWS.transport,
    ]);
  });
});
