import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

import { SNAPSHOT_HEADER_RULES } from "./src/lib/snapshot-headers";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  async headers() {
    return SNAPSHOT_HEADER_RULES;
  },
};

export default withNextIntl(nextConfig);
