import createMiddleware from "next-intl/middleware";

import { routing } from "@/i18n/routing";

export const proxy = createMiddleware(routing);

export const config = {
  // Keep API, Next internals, Vercel internals, snapshot files and any path with a dot out of the proxy (Hobby caps).
  // Must stay an inline string literal: Next parses it statically. tests/proxy.test.ts guards the escape.
  matcher: ["/((?!api|_next|_vercel|snapshots|.*\\..*).*)"],
};
