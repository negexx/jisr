import { describe, expect, it } from "vitest";

import { hasMailRoute, type MailRouteResolver } from "@/lib/server/email-domain";

type Mx = { exchange: string; priority: number };

function dnsError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`query ${code}`), { code });
}

function resolver(overrides: Partial<MailRouteResolver>): MailRouteResolver {
  return {
    mx: async () => {
      throw dnsError("ENODATA");
    },
    a: async () => {
      throw dnsError("ENODATA");
    },
    aaaa: async () => {
      throw dnsError("ENODATA");
    },
    ...overrides,
  };
}

const mx = (...exchanges: string[]): (() => Promise<Mx[]>) => {
  return async () => exchanges.map((exchange, index) => ({ exchange, priority: index * 10 }));
};

describe("hasMailRoute", () => {
  it("accepts a domain with an MX record", async () => {
    expect(await hasMailRoute("ana@example.org", resolver({ mx: mx("mail.example.org") }))).toBe(
      true,
    );
  });

  it("looks up the part after the last @", async () => {
    const asked: string[] = [];
    await hasMailRoute(
      "ana@Example.ORG",
      resolver({
        mx: async (domain) => {
          asked.push(domain);
          return [{ exchange: "mail.example.org", priority: 10 }];
        },
      }),
    );
    expect(asked).toEqual(["example.org"]);
  });

  it.each([
    ["an empty exchange", ""],
    ["a dot", "."],
  ])("refuses a null MX (RFC 7505) written as %s", async (_label, exchange) => {
    expect(await hasMailRoute("ana@example.org", resolver({ mx: mx(exchange) }))).toBe(false);
  });

  it("does not take two records, one of them a dot, for a null MX", async () => {
    expect(
      await hasMailRoute("ana@example.org", resolver({ mx: mx(".", "mail.example.org") })),
    ).toBe(true);
  });

  it("refuses a domain that does not exist (ENOTFOUND on MX, A and AAAA)", async () => {
    const missing = async () => {
      throw dnsError("ENOTFOUND");
    };
    expect(
      await hasMailRoute("ana@nope.invalid", resolver({ mx: missing, a: missing, aaaa: missing })),
    ).toBe(false);
  });

  it("refuses a domain with no MX, no A and no AAAA record", async () => {
    expect(await hasMailRoute("ana@bare.example", resolver({}))).toBe(false);
  });

  it("accepts a domain with no MX but an A record (RFC 5321 implicit MX)", async () => {
    expect(
      await hasMailRoute("ana@legacy.example", resolver({ a: async () => ["192.0.2.1"] })),
    ).toBe(true);
  });

  it("accepts a domain with no MX but an AAAA record", async () => {
    expect(
      await hasMailRoute("ana@v6.example", resolver({ aaaa: async () => ["2001:db8::1"] })),
    ).toBe(true);
  });

  it.each([
    ["ETIMEOUT", "ETIMEOUT"],
    ["ESERVFAIL", "ESERVFAIL"],
    ["ECONNREFUSED", "ECONNREFUSED"],
  ])("lets a sign-in through when the lookup fails with %s", async (_label, code) => {
    const failing = async () => {
      throw dnsError(code);
    };
    expect(await hasMailRoute("ana@example.org", resolver({ mx: failing }))).toBe(true);
  });

  it("lets a sign-in through when only the fallback lookup fails", async () => {
    const failing = async () => {
      throw dnsError("ETIMEOUT");
    };
    expect(await hasMailRoute("ana@example.org", resolver({ a: failing }))).toBe(true);
  });

  it("lets a sign-in through when the lookup never answers", async () => {
    const hanging = () => new Promise<never>(() => {});
    const started = Date.now();
    expect(await hasMailRoute("ana@example.org", resolver({ mx: hanging }), 30)).toBe(true);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("lets a sign-in through for a value with no domain part", async () => {
    expect(await hasMailRoute("not-an-address", resolver({}))).toBe(true);
  });
});
