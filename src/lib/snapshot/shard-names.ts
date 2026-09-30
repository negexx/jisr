import type { CountryCode, Locale, Slug } from "@/data-schema/primitives";

// Same names as `shardNames` in src/data-schema/snapshot.ts (checked by manifest-guard.test.ts),
// kept here because that module builds Zod schemas and must not reach client bundles.
export const shardNames = {
  core: () => "core",
  routes: (origin: CountryCode) => `routes.${origin}`,
  institutions: (destination: CountryCode) => `institutions.${destination}`,
  costs: (destination: CountryCode) => `costs.${destination}`,
  programs: (destination: CountryCode, field: Slug) => `programs.${destination}.${field}`,
  scholarships: (destination: CountryCode) => `scholarships.${destination}`,
  text: (locale: Locale, shard: string) => `text.${locale}.${shard}`,
} as const;
