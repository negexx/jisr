import { z } from "zod";

import { LocalizedTextSchema } from "../localized-text";
import { CountryCodeSchema, CurrencySchema } from "../primitives";

export const CountryRecordSchema = z.strictObject({
  code: CountryCodeSchema,
  name: LocalizedTextSchema,
  currency: CurrencySchema,
});

export type CountryRecord = z.infer<typeof CountryRecordSchema>;
