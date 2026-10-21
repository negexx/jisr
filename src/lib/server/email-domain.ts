import "server-only";

import { promises as dns } from "node:dns";

export type MailRouteResolver = {
  mx(domain: string): Promise<{ exchange: string; priority: number }[]>;
  a(domain: string): Promise<string[]>;
  aaaa(domain: string): Promise<string[]>;
};

const systemResolver: MailRouteResolver = {
  mx: (domain) => dns.resolveMx(domain),
  a: (domain) => dns.resolve4(domain),
  aaaa: (domain) => dns.resolve6(domain),
};

const NO_SUCH_RECORDS = new Set(["ENOTFOUND", "ENODATA"]);

// "Failed" is any answer that says nothing about the domain (timeout, SERVFAIL, refused): it must
// never block a real sign-in.
const FAILED = Symbol("lookup failed");

async function records<T>(lookup: Promise<T[]>): Promise<T[] | typeof FAILED> {
  try {
    return await lookup;
  } catch (error) {
    const code = error instanceof Error && "code" in error ? error.code : undefined;
    return typeof code === "string" && NO_SUCH_RECORDS.has(code) ? [] : FAILED;
  }
}

function isNullMx(found: readonly { exchange: string }[]): boolean {
  const [only] = found;
  return (
    found.length === 1 && only !== undefined && (only.exchange === "" || only.exchange === ".")
  );
}

async function routeExists(domain: string, resolver: MailRouteResolver): Promise<boolean> {
  const mx = await records(resolver.mx(domain));
  if (mx === FAILED) return true;
  if (mx.length > 0) return !isNullMx(mx);
  // No MX: mail goes to the host's own address (RFC 5321, implicit MX).
  const [a, aaaa] = await Promise.all([
    records(resolver.a(domain)),
    records(resolver.aaaa(domain)),
  ]);
  if (a === FAILED || aaaa === FAILED) return true;
  return a.length > 0 || aaaa.length > 0;
}

// False only when DNS says mail cannot reach the domain: it does not exist, it has neither MX nor
// address records, or it publishes a null MX. Any error or a lookup slower than `timeoutMs` counts
// as "route exists" (fail open); the sign-in link still goes through its own throttles.
export async function hasMailRoute(
  email: string,
  resolver: MailRouteResolver = systemResolver,
  timeoutMs = 2000,
): Promise<boolean> {
  const domain = email.slice(email.lastIndexOf("@") + 1).toLowerCase();
  if (domain === "" || !email.includes("@")) return true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(true), timeoutMs);
  });
  try {
    return await Promise.race([routeExists(domain, resolver), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
