import { createCn } from "cn/engine";

import tables from "../../generated/cn-tables";

// Same output as tailwind-merge for every class the app uses: the tables are compiled by
// `cn build` (see scripts/cn/options.ts) from the classes found under src/, so the client only
// ships the class groups it needs. A class built dynamically at runtime is invisible to the scan.
export const cn = createCn(tables);
