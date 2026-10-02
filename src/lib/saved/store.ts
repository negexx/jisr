import { getLocalStorage } from "@/lib/local-storage";
import { createLocalJsonStore } from "@/lib/local-store";

import { EMPTY_SAVED, parseSaved, SAVED_KEY } from "./saved";

export const savedStore = createLocalJsonStore(getLocalStorage, {
  key: SAVED_KEY,
  empty: EMPTY_SAVED,
  parse: parseSaved,
});
