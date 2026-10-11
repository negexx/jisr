import ArBac, {
  frontmatter as arBacFm,
} from "@content/ar/guides/bac-and-european-universities.mdx";
import ArCommon, { frontmatter as arCommonFm } from "@content/ar/guides/common-mistakes.mdx";
import ArDocuments, {
  frontmatter as arDocumentsFm,
} from "@content/ar/guides/documents-and-legalisation.mdx";
import ArScholarships, {
  frontmatter as arScholarshipsFm,
} from "@content/ar/guides/scholarships-for-moroccan-students.mdx";
import ArEurope, { frontmatter as arEuropeFm } from "@content/ar/guides/studying-in-europe.mdx";
import EnBac, {
  frontmatter as enBacFm,
} from "@content/en/guides/bac-and-european-universities.mdx";
import EnCommon, { frontmatter as enCommonFm } from "@content/en/guides/common-mistakes.mdx";
import EnDocuments, {
  frontmatter as enDocumentsFm,
} from "@content/en/guides/documents-and-legalisation.mdx";
import EnScholarships, {
  frontmatter as enScholarshipsFm,
} from "@content/en/guides/scholarships-for-moroccan-students.mdx";
import EnEurope, { frontmatter as enEuropeFm } from "@content/en/guides/studying-in-europe.mdx";
import FrBac, {
  frontmatter as frBacFm,
} from "@content/fr/guides/bac-and-european-universities.mdx";
import FrCommon, { frontmatter as frCommonFm } from "@content/fr/guides/common-mistakes.mdx";
import FrDocuments, {
  frontmatter as frDocumentsFm,
} from "@content/fr/guides/documents-and-legalisation.mdx";
import FrScholarships, {
  frontmatter as frScholarshipsFm,
} from "@content/fr/guides/scholarships-for-moroccan-students.mdx";
import FrEurope, { frontmatter as frEuropeFm } from "@content/fr/guides/studying-in-europe.mdx";
import type { ComponentType } from "react";

import type { AppLocale } from "@/i18n/routing";

import { type GuideFrontmatter, parseGuideFrontmatter } from "./frontmatter";

export type GuideSlug =
  | "studying-in-europe"
  | "bac-and-european-universities"
  | "documents-and-legalisation"
  | "scholarships-for-moroccan-students"
  | "common-mistakes";

export type Guide = {
  slug: GuideSlug;
  frontmatter: GuideFrontmatter;
  Documents: Record<AppLocale, ComponentType>;
};

// Every translation's provenance is validated at module load: a missing or malformed frontmatter
// fails the build instead of shipping an unsourced guide. Each guide's French entry is canonical.
const FRONTMATTERS: Record<GuideSlug, Record<AppLocale, GuideFrontmatter>> = {
  "studying-in-europe": {
    fr: parseGuideFrontmatter(frEuropeFm),
    en: parseGuideFrontmatter(enEuropeFm),
    ar: parseGuideFrontmatter(arEuropeFm),
  },
  "bac-and-european-universities": {
    fr: parseGuideFrontmatter(frBacFm),
    en: parseGuideFrontmatter(enBacFm),
    ar: parseGuideFrontmatter(arBacFm),
  },
  "documents-and-legalisation": {
    fr: parseGuideFrontmatter(frDocumentsFm),
    en: parseGuideFrontmatter(enDocumentsFm),
    ar: parseGuideFrontmatter(arDocumentsFm),
  },
  "scholarships-for-moroccan-students": {
    fr: parseGuideFrontmatter(frScholarshipsFm),
    en: parseGuideFrontmatter(enScholarshipsFm),
    ar: parseGuideFrontmatter(arScholarshipsFm),
  },
  "common-mistakes": {
    fr: parseGuideFrontmatter(frCommonFm),
    en: parseGuideFrontmatter(enCommonFm),
    ar: parseGuideFrontmatter(arCommonFm),
  },
};

export const GUIDES: readonly Guide[] = [
  {
    slug: "studying-in-europe",
    frontmatter: FRONTMATTERS["studying-in-europe"].fr,
    Documents: { fr: FrEurope, en: EnEurope, ar: ArEurope },
  },
  {
    slug: "bac-and-european-universities",
    frontmatter: FRONTMATTERS["bac-and-european-universities"].fr,
    Documents: { fr: FrBac, en: EnBac, ar: ArBac },
  },
  {
    slug: "documents-and-legalisation",
    frontmatter: FRONTMATTERS["documents-and-legalisation"].fr,
    Documents: { fr: FrDocuments, en: EnDocuments, ar: ArDocuments },
  },
  {
    slug: "scholarships-for-moroccan-students",
    frontmatter: FRONTMATTERS["scholarships-for-moroccan-students"].fr,
    Documents: { fr: FrScholarships, en: EnScholarships, ar: ArScholarships },
  },
  {
    slug: "common-mistakes",
    frontmatter: FRONTMATTERS["common-mistakes"].fr,
    Documents: { fr: FrCommon, en: EnCommon, ar: ArCommon },
  },
];

export const GUIDE_SLUGS: readonly GuideSlug[] = GUIDES.map((guide) => guide.slug);

export function guideBySlug(slug: string): Guide | undefined {
  return GUIDES.find((guide) => guide.slug === slug);
}
