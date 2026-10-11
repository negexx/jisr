import Ar, { frontmatter as arFm } from "@content/ar/guides/studying-in-europe.mdx";
import En, { frontmatter as enFm } from "@content/en/guides/studying-in-europe.mdx";
import Fr, { frontmatter as frFm } from "@content/fr/guides/studying-in-europe.mdx";
import type { ComponentType } from "react";

import type { AppLocale } from "@/i18n/routing";

import { type GuideFrontmatter, parseGuideFrontmatter } from "./frontmatter";

export type GuideSlug = "studying-in-europe";

export type Guide = {
  slug: GuideSlug;
  frontmatter: GuideFrontmatter;
  Documents: Record<AppLocale, ComponentType>;
};

// Every translation's provenance is validated at module load: a missing or malformed frontmatter
// fails the build instead of shipping an unsourced guide. The French entry is the canonical one.
const FRONTMATTERS: Record<AppLocale, GuideFrontmatter> = {
  fr: parseGuideFrontmatter(frFm),
  en: parseGuideFrontmatter(enFm),
  ar: parseGuideFrontmatter(arFm),
};

export const GUIDES: readonly Guide[] = [
  {
    slug: "studying-in-europe",
    frontmatter: FRONTMATTERS.fr,
    Documents: { fr: Fr, en: En, ar: Ar },
  },
];

export const GUIDE_SLUGS: readonly GuideSlug[] = GUIDES.map((guide) => guide.slug);

export function guideBySlug(slug: string): Guide | undefined {
  return GUIDES.find((guide) => guide.slug === slug);
}
