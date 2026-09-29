import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";

import { LocalizedTextSchema } from "@/data-schema/localized-text";
import {
  CefrSchema,
  CountryCodeSchema,
  CurrencySchema,
  HttpsUrlSchema,
  IsoDateSchema,
  LanguageCodeSchema,
  MoneyRangeSchema,
  SlugSchema,
  SourceKeySchema,
} from "@/data-schema/primitives";

const FR = { text: "Base fictive", status: "draft" };

type Row = readonly [unknown, boolean];
const tables: ReadonlyArray<readonly [string, ZodType, readonly Row[]]> = [
  [
    "IsoDateSchema",
    IsoDateSchema,
    [
      ["2024-02-29", true],
      ["2023-02-29", false],
      [20240229, false],
    ],
  ],
  [
    "SlugSchema",
    SlugSchema,
    [
      ["xx-test-a", true],
      ["Xx", false],
      ["a--b", false],
      ["-a", false],
      ["a_b", false],
      ["a-", false],
    ],
  ],
  [
    "SourceKeySchema",
    SourceKeySchema,
    [
      ["main", true],
      ["fees_2026", true],
      ["a-b", true],
      ["Main", false],
      ["_a", false],
    ],
  ],
  [
    "CountryCodeSchema",
    CountryCodeSchema,
    [
      ["XA", true],
      ["xa", false],
      ["XAA", false],
    ],
  ],
  [
    "LanguageCodeSchema",
    LanguageCodeSchema,
    [
      ["xx", true],
      ["XX", false],
    ],
  ],
  [
    "CurrencySchema",
    CurrencySchema,
    [
      ["XTS", true],
      ["xts", false],
    ],
  ],
  [
    "HttpsUrlSchema",
    HttpsUrlSchema,
    [
      ["https://example.org/a", true],
      ["http://example.org", false],
      ["example.org", false],
    ],
  ],
  [
    "CefrSchema",
    CefrSchema,
    [
      ["B2", true],
      ["B3", false],
    ],
  ],
  [
    "MoneyRangeSchema",
    MoneyRangeSchema,
    [
      [{ min: 1, max: 2, currency: "XTS" }, true],
      [{ min: 3, max: 2, currency: "XTS" }, false],
      [{ min: 1.5, max: 2, currency: "XTS" }, false],
      [{ min: -1, max: 2, currency: "XTS" }, false],
      [{ min: 1, max: 2, currency: "XTS", extra: 1 }, false],
    ],
  ],
  [
    "LocalizedTextSchema",
    LocalizedTextSchema,
    [
      [{ fr: FR }, true],
      [{ fr: FR, en: FR, ar: FR }, true],
      [{ en: FR }, false],
      [{ fr: { text: "", status: "draft" } }, false],
      [{ fr: { text: "   ", status: "draft" } }, false],
      [{ fr: { text: "x".repeat(400), status: "draft" } }, true],
      [{ fr: { text: "x".repeat(401), status: "draft" } }, false],
      [{ fr: { text: "x", status: "final" } }, false],
      [{ fr: FR, de: FR }, false],
    ],
  ],
];

describe.each(tables)("%s", (_name, schema, rows) => {
  it.each(rows)("%j -> %s", (input, ok) => {
    expect(schema.safeParse(input).success).toBe(ok);
  });
});
