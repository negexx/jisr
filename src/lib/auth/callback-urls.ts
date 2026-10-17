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

export function isAuthPage(pathname: string): boolean {
  return pathname.startsWith(SIGN_IN_PATH) || pathname.startsWith(POST_AUTH_LANDING);
}

/** Where to come back to from a locale-less `pathname`; the sign-in and landing pages are not. */
export function returnPathFor(locale: Locale, pathname: string): string | null {
  if (isAuthPage(pathname)) return null;
  return pathname === "/" ? `/${locale}` : `/${locale}${pathname}`;
}

/** The landing, which holds the finish-signup gate and then comes back to `pathname`. */
export function finishSetupPath(locale: Locale, pathname: string): string {
  return authCallbackUrls(locale, returnPathFor(locale, pathname)).callbackURL;
}

// With no `return` at all the landing continues to the plan, the page a signed-in student most
// likely wants; a `return` that is present but unsafe falls back to the locale home.
export function landingReturnPath(raw: string | null | undefined, locale: Locale): string {
  return raw === null || raw === undefined || raw === ""
    ? `/${locale}/plan`
    : safeReturnPath(raw, locale);
}

export const ACCOUNT_PATH = "/account";
export const ACCOUNT_DELETE_PATH = "/account/delete";
export const DELETE_TOKEN_PARAM = "token";

/** The account page, also the `return` a signed-out visitor to it signs in with. */
export function accountPath(locale: Locale): string {
  return `/${locale}${ACCOUNT_PATH}`;
}

/**
 * The page that confirms a deletion. Sent as the deletion request's callbackURL, which is how the
 * request names its locale: Better Auth hands it back to the email sender inside its own URL.
 */
export function accountDeletePath(locale: Locale): string {
  return `/${locale}${ACCOUNT_DELETE_PATH}`;
}

/** The body of the deletion request: Better Auth echoes its callbackURL to the email sender. */
export function accountDeleteRequest(locale: Locale): { callbackURL: string } {
  return { callbackURL: accountDeletePath(locale) };
}

/**
 * The emailed link: the confirm page carrying the token, never Better Auth's GET callback. The token
 * rides the fragment, which the browser never sends, so it reaches no request log or Referer.
 */
export function accountDeleteConfirmPath(locale: Locale, token: string): string {
  return `${accountDeletePath(locale)}#${new URLSearchParams({ [DELETE_TOKEN_PARAM]: token })}`;
}

const ERROR_CODE = /^[A-Za-z0-9_-]{1,64}$/;
export const UNKNOWN_ERROR_CODE = "UNKNOWN";

/** The sign-in surface carrying a failure code, for the landing to forward Better Auth's `?error=`. */
export function signInErrorPath(
  locale: Locale,
  returnPath: string | null,
  errorCode: string,
): string {
  const code = ERROR_CODE.test(errorCode) ? errorCode : UNKNOWN_ERROR_CODE;
  return `${signInPath(locale, returnPath)}&${new URLSearchParams({ error: code })}`;
}

// Todo 28, F3 (ruling Q16): the emailed sign-in link opens this page, which signs in only when the
// student presses its button. Everything rides the fragment, which the browser never sends: the
// token reaches no request log, Referer or analytics, and the query stays empty.
export const SIGN_IN_CONFIRM_PATH = "/sign-in/confirm";
export const SIGN_IN_TOKEN_PARAM = "token";

/** Better Auth's mount point plus our confirm endpoint (src/lib/auth/magic-link-confirm.ts). */
export const MAGIC_LINK_CONFIRM_ENDPOINT = "/api/auth/magic-link/confirm";

/** "signup" when the link creates an account (the server-side email wording only). */
export type SignInLinkMode = "signup" | "signin";

/** The emailed sign-in link: the confirm page, with the token and the return path. */
export function signInConfirmPath(
  locale: Locale,
  token: string,
  returnPath: string | null,
): string {
  const fragment = new URLSearchParams({ [SIGN_IN_TOKEN_PARAM]: token });
  if (returnPath !== null) fragment.set(RETURN_PARAM, safeReturnPath(returnPath, locale));
  return `/${locale}${SIGN_IN_CONFIRM_PATH}#${fragment}`;
}

// Better Auth's magic-link token is 32 letters; the bound only keeps junk out of the request.
const LINK_TOKEN = /^[0-9A-Za-z_-]{1,128}$/;

export type SignInLink = { token: string | null; returnPath: string | null };

/**
 * What the confirm page reads from `location.hash` (with or without its leading `#`). A legacy
 * fragment still carrying a `mode=` parameter parses fine: the extra parameter is ignored.
 */
export function readSignInLink(hash: string, locale: Locale): SignInLink {
  const fragment = new URLSearchParams(hash.replace(/^#/, ""));
  const token = fragment.get(SIGN_IN_TOKEN_PARAM);
  const returnPath = fragment.get(RETURN_PARAM);
  return {
    token: token !== null && LINK_TOKEN.test(token) ? token : null,
    returnPath: returnPath === null ? null : safeReturnPath(returnPath, locale),
  };
}
