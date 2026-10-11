import "server-only";

import type { MetadataRoute } from "next";

import { GUIDE_SLUGS } from "@/lib/guides/catalog";
import { buildSitemap, type LocalePath } from "@/lib/seo";
import { readSiteEnv } from "@/lib/site-env";
import { programStaticParams } from "@/lib/snapshot/server";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const env = readSiteEnv();
  if (!env.indexable) return [];
  const params = await programStaticParams();
  return buildSitemap(
    env,
    params.map((param) => param.slug),
    GUIDE_SLUGS.map((slug): LocalePath => `/guides/${slug}`),
  );
}
