import { LOCALES } from "@/lib/constants";

// Shared by the signup Server Action and the browser's Google button, so it stays zod-free.
// Every redirect-based sign-in finishes on one landing route; this module is the only place that
// builds the URLs pointing at it (todo 11's contract test asserts every call site uses it).

type Locale = (typeof LOCALES)[number];

export const POST_AUTH_LANDING = "/welcome";
export const SIGN_IN_PATH = "/sign-in";
export const RETURN_PARAM = "return";

// Only plain path segments: no query, fragment, percent-escape or backslash survives, because Better
// Auth decodes the callback URL once more before redirecting (magic-link verify) and an escape could
// turn into a separator there.
const SEGMENT = /^[A-Za-z0-9._~-]+$/;

function isSafeSegment(segment: string): boolean {
  return SEGMENT.test(segment) && segment !== "." && segment !== "..";
}

/** A same-origin path under a known locale, or that locale's home when `raw` is anything else. */
export function safeReturnPath(raw: string | null | undefined, locale: Locale): string {
  const fallback = `/${locale}`;
  if (typeof raw !== "string" || !raw.startsWith("/")) return fallback;
  const segments = raw.slice(1).split("/");
  if (segments.at(-1) === "" && segments.length > 1) segments.pop();
  const [first, ...rest] = segments;
  if (!LOCALES.some((candidate) => candidate === first)) return fallback;
  return rest.every(isSafeSegment) ? raw : fallback;
}

function withReturn(path: string, returnPath: string): string {
  return `${path}?${new URLSearchParams({ [RETURN_PARAM]: returnPath })}`;
}

export type AuthCallbackUrls = {
  callbackURL: string;
  newUserCallbackURL: string;
  errorCallbackURL: string;
};

// Relative URLs: Better Auth resolves them against its own base URL and its origin check accepts
// them. Omitting callbackURL would send a magic-link verify to "/" instead of the landing.
export function authCallbackUrls(locale: Locale, returnPath: string | null): AuthCallbackUrls {
  const landing = withReturn(`/${locale}${POST_AUTH_LANDING}`, safeReturnPath(returnPath, locale));
  return { callbackURL: landing, newUserCallbackURL: landing, errorCallbackURL: landing };
}

/** The sign-in surface, for router.push from todo 11's menu and todo 16's signed-out click. */
export function signInPath(locale: Locale, returnPath: string | null): string {
  return withReturn(`/${locale}${SIGN_IN_PATH}`, safeReturnPath(returnPath, locale));
}
