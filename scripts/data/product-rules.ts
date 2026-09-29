import type { Issue } from "./load-data";
import type { Catalog } from "./validate";

export const TUITION_NOT_OFFICIAL =
  "tuition must be an official published fee; leave the value null when it is not published, the app then shows it as to-be-checked";
export const COMPLETE_WITHOUT_RULES =
  "complete coverage needs at least one rule; use partial while requirements are unpublished";

function tuitionMustBeOfficial(catalog: Catalog): Issue[] {
  return [...catalog.programs.values()].flatMap(({ file, record }) =>
    record.tuition.value !== null && record.tuition.info_kind !== "official"
      ? [{ file, path: "tuition.info_kind", message: TUITION_NOT_OFFICIAL }]
      : [],
  );
}

function completeCoverageNeedsRules(catalog: Catalog): Issue[] {
  const containers = [...catalog.programs.values(), ...catalog.scholarships.values()];
  return containers.flatMap(({ file, record }) =>
    record.requirements.coverage === "complete" && record.requirements.rules.length === 0
      ? [{ file, path: "requirements.coverage", message: COMPLETE_WITHOUT_RULES }]
      : [],
  );
}

function teachingLanguageWithoutRule(catalog: Catalog): Issue[] {
  return [...catalog.programs.values()].flatMap(({ file, record }) => {
    const languages = record.teachingLanguages.value;
    const declaresLanguageRule = record.requirements.rules.some(
      (rule) => rule.kind === "language_proficiency",
    );
    if (
      record.requirements.coverage !== "complete" ||
      languages === null ||
      languages.length === 0 ||
      declaresLanguageRule
    ) {
      return [];
    }
    return [
      {
        file,
        path: "requirements",
        message: `program teaches in ${languages.join(", ")} but declares no language requirement; confirm the published requirement or mark coverage partial`,
      },
    ];
  });
}

export function productRuleErrors(catalog: Catalog): Issue[] {
  return [...tuitionMustBeOfficial(catalog), ...completeCoverageNeedsRules(catalog)];
}

export function productRuleWarnings(catalog: Catalog): Issue[] {
  return teachingLanguageWithoutRule(catalog);
}
