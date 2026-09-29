import type { CollectionName } from "@/data-schema/records/collections";
import type { RuleRecord } from "@/data-schema/rules";

import type { Issue } from "./load-data";
import type { Catalog } from "./validate";

export function checkReferences(catalog: Catalog): Issue[] {
  const issues: Issue[] = [];
  const trackSlugs = new Set(
    [...catalog["credential-types"].values()].flatMap((e) => e.record.tracks.map((t) => t.slug)),
  );

  const report = (file: string, path: string, message: string) =>
    issues.push({ file, path, message });

  const need = (file: string, path: string, collection: CollectionName, slug: string) => {
    if (!catalog[collection].has(slug)) report(file, path, `unknown ${collection} "${slug}"`);
  };
  const needAll = (
    file: string,
    path: string,
    collection: CollectionName,
    slugs: readonly string[],
  ) => {
    for (const [i, slug] of slugs.entries()) need(file, `${path}.${i}`, collection, slug);
  };

  const checkRules = (file: string, prefix: string, rules: readonly RuleRecord[]) => {
    for (const rule of rules) {
      const at = `${prefix}.${rule.id}`;
      switch (rule.kind) {
        case "credential_type_in":
          needAll(file, `${at}.types`, "credential-types", rule.types);
          break;
        case "credential_track_in":
          rule.tracks.forEach((slug, i) => {
            if (!trackSlugs.has(slug)) report(file, `${at}.tracks.${i}`, `unknown track "${slug}"`);
          });
          break;
        case "overall_grade_min":
          need(file, `${at}.scale`, "grading-scales", rule.scale);
          break;
        case "subject_grade_min":
          need(file, `${at}.subject`, "subjects", rule.subject);
          need(file, `${at}.scale`, "grading-scales", rule.scale);
          break;
        case "subject_taken":
          needAll(file, `${at}.subjects`, "subjects", rule.subjects);
          break;
        case "language_proficiency":
          needAll(file, `${at}.acceptedTests`, "language-certificates", rule.acceptedTests);
          break;
        case "prior_study_years_min":
        case "manual_check":
          break;
      }
    }
  };

  const firstSeen = new Map<string, string>();
  const unique = (file: string, key: string, message: (other: string) => string) => {
    const other = firstSeen.get(key);
    if (other === undefined) firstSeen.set(key, file);
    else report(file, "", message(other));
  };

  for (const { file, record } of catalog["grading-scales"].values()) {
    if (record.country !== null) need(file, "country", "countries", record.country);
  }

  for (const { file, record } of catalog["grade-conversions"].values()) {
    need(file, "from", "grading-scales", record.from);
    need(file, "to", "grading-scales", record.to);
    unique(
      file,
      `conversion|${record.from}|${record.to}`,
      (other) => `duplicate grade conversion (also ${other})`,
    );
  }

  for (const { file, record } of catalog["credential-types"].values()) {
    need(file, "country", "countries", record.country);
    need(file, "gradingScale", "grading-scales", record.gradingScale);
    for (const track of record.tracks) {
      if (track.subjects !== null) {
        needAll(file, `tracks.${track.slug}.subjects`, "subjects", track.subjects);
      }
    }
  }

  for (const { file, record } of catalog["application-channels"].values()) {
    need(file, "country", "countries", record.country);
  }

  for (const { file, record } of catalog["admission-routes"].values()) {
    need(file, "origin", "countries", record.origin);
    need(file, "destination", "countries", record.destination);
    need(file, "credentialType", "credential-types", record.credentialType);
    needAll(file, "applicationChannels", "application-channels", record.applicationChannels);
    checkRules(file, "conditions", record.conditions);
    unique(
      file,
      `route|${record.origin}|${record.credentialType}|${record.destination}|${record.level}`,
      (other) => `duplicate admission route (also ${other})`,
    );
  }

  for (const { file, record } of catalog.institutions.values()) {
    need(file, "country", "countries", record.country);
  }

  for (const { file, record } of catalog.programs.values()) {
    need(file, "institution", "institutions", record.institution);
    need(file, "country", "countries", record.country);
    need(file, "field", "fields", record.field);
    if (record.applicationChannel.value !== null) {
      need(
        file,
        "applicationChannel.value",
        "application-channels",
        record.applicationChannel.value,
      );
    }
    needAll(file, "scholarships", "scholarships", record.scholarships);
    checkRules(file, "requirements.rules", record.requirements.rules);

    const institution = catalog.institutions.get(record.institution)?.record;
    if (institution !== undefined) {
      const mismatch = `program country/city must match institution ${record.institution}`;
      if (record.country !== institution.country) report(file, "country", mismatch);
      if (record.city !== institution.city.slug) report(file, "city", mismatch);
    }
  }

  for (const { file, record } of catalog["cost-profiles"].values()) {
    need(file, "country", "countries", record.country);
    unique(
      file,
      `costs|${record.country}|${record.city ?? ""}`,
      (other) =>
        `duplicate cost profile for ${record.country}/${record.city ?? "country-wide"} (also ${other})`,
    );
  }

  for (const { file, record } of catalog.scholarships.values()) {
    needAll(file, "destinations", "countries", record.destinations);
    needAll(file, "eligibleNationalities", "countries", record.eligibleNationalities);
    needAll(file, "fields", "fields", record.fields);
    checkRules(file, "requirements.rules", record.requirements.rules);
  }

  return issues;
}
