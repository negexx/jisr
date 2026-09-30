// The message namespaces the program page's client leaves read (PersonalMatch and ProgramDeadline with
// the shared components they render). The page passes only these to the nested provider.
export const PROGRAM_CLIENT_NAMESPACES = [
  "program.personal",
  "domain.status",
  "domain.route",
  "domain.reason",
  "domain.budgetFit",
  "domain.intake",
  "domain.textNote",
  "domain.infoKind",
  "domain.freshness",
  "matchStatusBadge",
  "reasonList",
  "deadline",
  "sourceBadge",
  "externalLink",
] as const;
