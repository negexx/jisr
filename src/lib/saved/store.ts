import { ACCOUNT_SAVED_KEY, accountAwareStore } from "@/lib/account-cache";
import { getLocalStorage } from "@/lib/local-storage";
import { createLocalJsonStore } from "@/lib/local-store";

import { EMPTY_SAVED, parseSaved, SAVED_KEY } from "./saved";

// Written only by the account sync layer (src/lib/account-sync).
export const accountSavedStore = createLocalJsonStore(getLocalStorage, {
  key: ACCOUNT_SAVED_KEY,
  empty: EMPTY_SAVED,
  parse: parseSaved,
});

export const savedStore = accountAwareStore(
  createLocalJsonStore(getLocalStorage, {
    key: SAVED_KEY,
    empty: EMPTY_SAVED,
    parse: parseSaved,
  }),
  accountSavedStore,
);
