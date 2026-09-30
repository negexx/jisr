import type {
  Country,
  CredentialTrack,
  CredentialType,
  Field,
  GradingScale,
  LanguageCertificate,
  Subject,
} from "@/data-schema/resolved";
import type { CoreShard } from "@/data-schema/snapshot";
import { certificatesFor } from "@/lib/profile/reference-checks";

import type { CountryOption, FormState } from "./types";

export type { CountryOption };

export const MAX_SUBJECT_ROWS = 8;

const ALWAYS_OFFERED_LANGUAGES = ["fr", "en"] as const;

function toOption(country: Country): CountryOption {
  return { code: country.code, name: country.name };
}

export function countryOptions(core: CoreShard): CountryOption[] {
  return core.countries.map(toOption);
}

function originCodes(core: CoreShard): Set<string> {
  return new Set(core.credentialTypes.map((type) => type.country));
}

export function originCountries(core: CoreShard): CountryOption[] {
  const origins = originCodes(core);
  return core.countries.filter((country) => origins.has(country.code)).map(toOption);
}

export function destinationOptions(core: CoreShard): CountryOption[] {
  const origins = originCodes(core);
  return core.countries.filter((country) => !origins.has(country.code)).map(toOption);
}

export function credentialTypeOptions(form: FormState, core: CoreShard): CredentialType[] {
  return core.credentialTypes.filter((type) => type.country === form.credential.country);
}

function chosenType(form: FormState, core: CoreShard): CredentialType | undefined {
  return credentialTypeOptions(form, core).find((type) => type.slug === form.credential.type);
}

export function trackOptions(form: FormState, core: CoreShard): CredentialTrack[] {
  return chosenType(form, core)?.tracks ?? [];
}

export function gradingScaleFor(form: FormState, core: CoreShard): GradingScale | undefined {
  const type = chosenType(form, core);
  return type && core.gradingScales.find((scale) => scale.slug === type.gradingScale);
}

// With `rowIndex`, the subjects the other rows already use are left out (a row keeps its own
// choice); without it, every subject already listed is left out (the "add a subject" case).
export function subjectOptions(form: FormState, core: CoreShard, rowIndex?: number): Subject[] {
  const track = trackOptions(form, core).find(
    (candidate) => candidate.slug === form.credential.track,
  );
  const curriculum = track?.subjects;
  const offered =
    curriculum && curriculum.length > 0
      ? core.subjects.filter((subject) => curriculum.includes(subject.slug))
      : core.subjects;
  const taken = new Set(
    form.credential.subjects.flatMap((row, index) => (index === rowIndex ? [] : [row.subject])),
  );
  return offered.filter((subject) => !taken.has(subject.slug));
}

// fr and en first, then every other language a certificate exists for, in first-seen order.
export function languageRowOptions(core: CoreShard): string[] {
  const languages: string[] = [...ALWAYS_OFFERED_LANGUAGES];
  for (const certificate of core.languageCertificates) {
    if (!languages.includes(certificate.language)) languages.push(certificate.language);
  }
  return languages;
}

export function studyLanguageOptions(core: CoreShard): string[] {
  return languageRowOptions(core);
}

// ADR 0005 item 6: an empty `acceptedTests` means any certificate counts, so the choice is limited to the row's language.
export function certificateOptionsFor(language: string, core: CoreShard): LanguageCertificate[] {
  return certificatesFor(language, core);
}

export function fieldOptions(core: CoreShard): Field[] {
  return core.fields;
}
