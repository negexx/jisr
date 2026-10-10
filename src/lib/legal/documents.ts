import ArPrivacy from "@content/ar/privacy.mdx";
import ArTerms from "@content/ar/terms.mdx";
import EnPrivacy from "@content/en/privacy.mdx";
import EnTerms from "@content/en/terms.mdx";
import FrPrivacy from "@content/fr/privacy.mdx";
import FrTerms from "@content/fr/terms.mdx";

export const PRIVACY = { en: EnPrivacy, fr: FrPrivacy, ar: ArPrivacy } as const;
export const TERMS = { en: EnTerms, fr: FrTerms, ar: ArTerms } as const;
