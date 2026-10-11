// Every message namespace the hero demo island renders through the shared trust components
// (MatchStatusBadge, SourceBadge, ExternalLink). Task 8 passes exactly these to the nested provider
// around HeroDemo, and the hero-demo test does the same.
export const DEMO_NAMESPACES = [
  "sourceBadge",
  "externalLink",
  "matchStatusBadge",
  "domain.status",
  "domain.infoKind",
  "domain.freshness",
] as const;
