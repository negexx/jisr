import type { IsoDate } from "@/data-schema/dates";

// Client-side only: in M3 the browser clock is the source of `now`. A build-time (SSG) page must
// never call this, or the build date would be baked into the HTML as if it were the visitor's today.
export function todayIso(): IsoDate {
  return new Date().toISOString().slice(0, 10);
}
