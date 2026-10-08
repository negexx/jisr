import createMiddleware from "next-intl/middleware";

import { routing } from "@/i18n/routing";

export const proxy = createMiddleware(routing);

export const config = {
  // Keep API, Next internals, Vercel internals, snapshot files and any path with a dot out of the proxy (Hobby caps).
  // Locale-prefixed paths (/fr, /fr/...) are skipped too: they are served from the static prerender, so running
  // the proxy there would only add a function invocation per page view. It stays for "/" and locale-less paths,
  // where it redirects. The (?:fr|en|ar) alternation must equal routing.locales; tests/proxy.test.ts enforces it.
  // Must stay an inline string literal: Next parses it statically. tests/proxy.test.ts guards the escape.
  matcher: ["/((?!api|_next|_vercel|snapshots|(?:fr|en|ar)(?:/|$)|.*\\..*).*)"],
};
