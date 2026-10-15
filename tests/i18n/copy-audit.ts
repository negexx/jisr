import { readFileSync } from "node:fs";
import path from "node:path";

import ar from "../../messages/ar.json";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
import golden from "../fixtures/i18n/guest-copy-golden.json";

export type Locale = "fr" | "en" | "ar";
export const LOCALES: readonly Locale[] = ["fr", "en", "ar"];

export type Catalogs = Record<Locale, Record<string, string>>;

type Tree = { [key: string]: string | Tree };

export function flatten(tree: Tree, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    const full = prefix === "" ? key : `${prefix}.${key}`;
    if (typeof value === "string") out[full] = value;
    else Object.assign(out, flatten(value, full));
  }
  return out;
}

export const CATALOGS: Catalogs = { fr: flatten(fr), en: flatten(en), ar: flatten(ar) };

// Captured from `git show 139272b9:messages/<locale>.json` (the base of accounts PR 2) before any
// copy was edited: the guest wording a signed-out visitor reads, byte for byte.
export const GUEST_GOLDEN: Catalogs = golden;

export type DeviceClaim = {
  // The signed-in wording for the same slot. The guest key above it is never edited.
  variant: string;
  // The file that renders the variant, and the text that proves it picks it.
  surface: string;
  token: string;
};

// Every message that tells the student their data stays on this device, that nothing is sent to a
// server, or that Jisr uses no cookies, and that a signed-in student still sees. Adding such a
// message means adding it here with its signed-in variant.
export const DEVICE_CLAIMS: Record<string, DeviceClaim> = {
  "home.ctaNote": {
    variant: "home.ctaNoteSignedIn",
    surface: "src/app/[locale]/page.tsx",
    token: "ctaNoteSignedIn",
  },
  "footer.privacy": {
    variant: "footer.privacySignedIn",
    surface: "src/components/site-footer.tsx",
    token: "privacySignedIn",
  },
  "footer.privacyLogs": {
    variant: "footer.privacyLogsSignedIn",
    surface: "src/components/site-footer.tsx",
    token: "privacyLogsSignedIn",
  },
  "clearData.description": {
    variant: "clearDataAccount.description",
    surface: "src/components/site-footer.tsx",
    token: 'tAccount("description")',
  },
  "profile.ctaNote": {
    variant: "profile.ctaNoteSignedIn",
    surface: "src/components/profile/profile-form.tsx",
    token: "ctaNoteSignedIn",
  },
  "profile.notices.storage": {
    variant: "profile.notices.storageSignedIn",
    surface: "src/components/profile/profile-wizard.tsx",
    token: "notices.storageSignedIn",
  },
  "profile.review.saveBody": {
    variant: "profile.review.saveBodySignedIn",
    surface: "src/components/profile/step-review.tsx",
    token: "review.saveBodySignedIn",
  },
  "profile.aside.deviceTitle": {
    variant: "profile.aside.deviceTitleSignedIn",
    surface: "src/components/profile/profile-wizard.tsx",
    token: "aside.deviceTitleSignedIn",
  },
  "profile.aside.deviceBody": {
    variant: "profile.aside.deviceBodySignedIn",
    surface: "src/components/profile/profile-wizard.tsx",
    token: "aside.deviceBodySignedIn",
  },
  "matches.states.none.description": {
    variant: "matches.states.none.descriptionSignedIn",
    surface: "src/components/matches/matches-states.tsx",
    token: "descriptionSignedIn",
  },
  "matches.states.reset.notice": {
    variant: "matches.states.reset.noticeSignedIn",
    surface: "src/components/matches/matches-states.tsx",
    token: "noticeSignedIn",
  },
  "program.personal.cta.description": {
    variant: "program.personal.cta.descriptionSignedIn",
    surface: "src/components/program/personal-match.tsx",
    token: "descriptionSignedIn",
  },
  "plan.lead": {
    variant: "plan.leadSignedIn",
    surface: "src/app/[locale]/plan/page.tsx",
    token: "leadSignedIn",
  },
  "plan.storage.notice": {
    variant: "plan.storage.noticeSignedIn",
    surface: "src/components/plan/plan-states.tsx",
    token: "noticeSignedIn",
  },
  "plan.noProfile.description": {
    variant: "plan.noProfile.descriptionSignedIn",
    surface: "src/components/plan/plan-states.tsx",
    token: "descriptionSignedIn",
  },
  "plan.reset.notice": {
    variant: "plan.reset.noticeSignedIn",
    surface: "src/components/plan/plan-states.tsx",
    token: "noticeSignedIn",
  },
  "compare.noProfile.description": {
    variant: "compare.noProfile.descriptionSignedIn",
    surface: "src/components/compare/compare-states.tsx",
    token: "descriptionSignedIn",
  },
  "compare.storage.notice": {
    variant: "compare.storage.noticeSignedIn",
    surface: "src/components/compare/compare-states.tsx",
    token: "noticeSignedIn",
  },
  "signup.lead": {
    variant: "signup.leadSignedIn",
    surface: "src/app/[locale]/sign-in/page.tsx",
    token: "leadSignedIn",
  },
  "signup.age.hint": {
    variant: "signup.age.hintSignedIn",
    surface: "src/components/auth/sign-in-form.tsx",
    token: "age.hintSignedIn",
  },
};

// Device claims that stay as they are, with the ruling that says why.
export const GUEST_ONLY_CLAIMS: Record<string, string> = {
  "profile.meta.description": "static <head> metadata cannot see the session (ruling P18, todo 21)",
  "legal.privacy.meta.description": "static <head> metadata (ruling P18, todo 21)",
  "signup.gate.bodyNew": "accurate before consent, shown to signed-in users only (ruling P20)",
  "signup.gate.bodyChanged": "accurate before consent, shown to signed-in users only (ruling P20)",
};

// What a device claim looks like in the English catalogue; the other locales mirror the keys.
const DEVICE_CLAIM_EN =
  /(stay|stays|kept|keep|saved|stored|removed)[^.]{0,30}(on|in) (this|your) (device|browser)|nothing is sent|no cookies|on this device only|from this device only|this device cannot|only (on|in) this/i;

// A signed-in variant must not repeat the guest promises that stop being true with an account.
const SIGNED_IN_FORBIDDEN: Record<Locale, RegExp> = {
  en: /nothing is sent|no cookies|device only|browser only|stays? on (this|your) device|kept on this device|never sent/i,
  fr: /rien n'est envoyé|aucun cookie\b(?! de suivi)|appareil uniquement|navigateur seulement|restent? sur (cet|votre) appareil|jamais envoy/i,
  ar: /لا يُرسل شيء|لا تُرسل أبدًا|هذا الجهاز فقط|هذا المتصفح فقط|تبقى[^.]*على (هذا )?الجهاز/u,
};

export function readSource(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

export type AuditInput = {
  catalogs: Catalogs;
  claims: Record<string, DeviceClaim>;
  guestOnly: Record<string, string>;
  source: (relativePath: string) => string;
};

// Returns one line per problem, each starting with the offending key.
export function auditDeviceClaims({ catalogs, claims, guestOnly, source }: AuditInput): string[] {
  const problems: string[] = [];
  const variantKeys = new Set(Object.values(claims).map((claim) => claim.variant));

  for (const [key, value] of Object.entries(catalogs.en)) {
    if (!DEVICE_CLAIM_EN.test(value)) continue;
    if (key in claims || key in guestOnly || variantKeys.has(key) || key.endsWith("SignedIn")) {
      continue;
    }
    problems.push(`${key}: device-local claim with no signed-in variant`);
  }

  for (const [key, claim] of Object.entries(claims)) {
    for (const locale of LOCALES) {
      if (catalogs[locale][key] === undefined) {
        problems.push(`${key}: missing in ${locale}`);
      }
      const variant = catalogs[locale][claim.variant];
      if (variant === undefined) {
        problems.push(`${key}: variant ${claim.variant} missing in ${locale}`);
      } else if (SIGNED_IN_FORBIDDEN[locale].test(variant)) {
        problems.push(`${key}: variant ${claim.variant} repeats a guest promise in ${locale}`);
      }
    }
    if (!source(claim.surface).includes(claim.token)) {
      problems.push(`${key}: ${claim.surface} never renders ${claim.variant} (${claim.token})`);
    }
  }
  return problems;
}
