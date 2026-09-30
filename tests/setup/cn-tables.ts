import { build } from "cn/build";

import { CN_BUILD_OPTIONS } from "../../scripts/cn/options";

// `src/lib/utils.ts` imports the generated tables; compile them before any test file loads.
export async function setup(): Promise<void> {
  await build({ ...CN_BUILD_OPTIONS });
}
