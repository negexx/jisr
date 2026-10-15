// The emailed sign-in link opens the confirm page, which posts the token from its fragment (todo 28,
// F3). Server-side specs complete a sign-in the way that page does: this builds the page's request.

export const MAGIC_LINK_CONFIRM_PATH = "/api/auth/magic-link/confirm";

/** The token the emailed link carries in its fragment; throws when the link has none. */
export function tokenOfLink(link: string): string {
  const token = new URLSearchParams(new URL(link).hash.slice(1)).get("token");
  if (token === null || token === "") throw new Error("the emailed link carries no token");
  return token;
}

/** The confirm page's POST for `link`, from the link's own origin (a same-origin fetch). */
export function confirmRequest(link: string, headers: Record<string, string> = {}): Request {
  const { origin } = new URL(link);
  return new Request(`${origin}${MAGIC_LINK_CONFIRM_PATH}`, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      "sec-fetch-site": "same-origin",
      "sec-fetch-mode": "cors",
      "sec-fetch-dest": "empty",
      ...headers,
    },
    body: JSON.stringify({ token: tokenOfLink(link) }),
  });
}

/** The session cookie pairs a response sets, as a Cookie header value. */
export function cookieOf(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
}
