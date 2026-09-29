import type { CountryCode } from "@/data-schema/primitives";
import type { Profile } from "@/data-schema/profile";
import type { AdmissionRoute } from "@/data-schema/resolved";

export function resolveRoute(
  profile: Profile,
  destination: CountryCode,
  routes: readonly AdmissionRoute[],
): AdmissionRoute | null {
  const { credential } = profile;
  return (
    routes.find(
      (r) =>
        r.origin === credential.country &&
        r.credentialType === credential.type &&
        r.destination === destination &&
        r.level === "bachelor",
    ) ?? null
  );
}
