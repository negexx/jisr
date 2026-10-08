import type { MetadataRoute } from "next";

import { buildRobots } from "@/lib/seo";
import { readSiteEnv } from "@/lib/site-env";

export default function robots(): MetadataRoute.Robots {
  return buildRobots(readSiteEnv());
}
