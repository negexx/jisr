import { withCn } from "cn/next";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

import { CN_BUILD_OPTIONS } from "./scripts/cn/options";
import { SNAPSHOT_HEADER_RULES } from "./src/lib/snapshot-headers";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // `next dev` would otherwise write AGENTS.md and a root CLAUDE.md; project instructions live in .claude/.
  agentRules: false,
  async headers() {
    return SNAPSHOT_HEADER_RULES;
  },
};

// withCn compiles the merge tables on every config load (dev, typegen, build) and rebuilds them
// in dev when a source file starts using a class group the tables dropped.
export default withCn(withNextIntl(nextConfig), { ...CN_BUILD_OPTIONS });
