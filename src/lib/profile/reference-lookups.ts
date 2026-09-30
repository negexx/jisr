import type { GradingScale, LanguageCertificate } from "@/data-schema/resolved";
import type { CoreShard } from "@/data-schema/snapshot";

// The two lookups the profile form needs while the student types; the reference check itself
// (reference-checks.ts) is only needed when saving, so it is kept out of the form's first load.
export function certificatesFor(language: string, core: CoreShard): LanguageCertificate[] {
  return core.languageCertificates.filter((certificate) => certificate.language === language);
}

export function scaleForCredentialType(
  typeSlug: string,
  core: CoreShard,
): GradingScale | undefined {
  const type = core.credentialTypes.find((candidate) => candidate.slug === typeSlug);
  return type && core.gradingScales.find((scale) => scale.slug === type.gradingScale);
}
