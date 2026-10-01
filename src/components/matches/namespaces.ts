// Every message namespace the My Matches island (and the shared trust components it renders) reads;
// the page passes exactly these to its nested provider, and the tests do the same.
export const MATCHES_MESSAGE_NAMESPACES = [
  "matches",
  "matchCard",
  "costBreakdown",
  "reasonList",
  "sourceBadge",
  "deadline",
  "matchStatusBadge",
  "externalLink",
  "domain",
] as const;
