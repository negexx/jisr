import createMDX from "@next/mdx";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

import { securityHeaderRules } from "./src/lib/security-headers";
import { readSiteEnv } from "./src/lib/site-env";
import { SNAPSHOT_HEADER_RULES } from "./src/lib/snapshot-headers";

// Validated at config load so a malformed deployment variable fails the build, not the first visitor.
const siteEnv = readSiteEnv();

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const withMDX = createMDX({});

const nextConfig: NextConfig = {
  // `next dev` would otherwise write AGENTS.md and a root CLAUDE.md; project instructions live in .claude/.
  agentRules: false,
  experimental: {
    // Experimental flag: src/app/global-not-found.tsx. This app has no root layout of its own (the
    // [locale] layout renders <html>), so without it unknown paths and program slugs get Next's bare
    // 404 page, with no lang and in English only.
    globalNotFound: true,
  },
  // The route handlers' output-file traces pick up files nothing imports at runtime: test-only
  // fixtures under tests/, the audit captures under docs/, and the committed proposal JSONs under
  // data-staging/. `.vercelignore` excludes all three folders, so `vercel deploy --prebuilt` cannot
  // upload them and the deployment fails with `ENOENT: readlink`. Keep them out of the traces.
  outputFileTracingExcludes: {
    "*": ["tests/**", "docs/**", "data-staging/**"],
  },
  async headers() {
    return [...SNAPSHOT_HEADER_RULES, ...securityHeaderRules(siteEnv.indexable)];
  },
};

export default withNextIntl(withMDX(nextConfig));
