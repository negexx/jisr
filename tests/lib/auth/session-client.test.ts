import { beforeEach, describe, expect, it, vi } from "vitest";

import { forgetSession, lookupSession } from "@/lib/auth/session-client";

const client = vi.hoisted(() => ({
  getSession: vi.fn<() => Promise<unknown>>(),
}));

vi.mock("@/lib/auth/client", () => ({ authClient: { getSession: client.getSession } }));

beforeEach(() => {
  client.getSession.mockReset();
  forgetSession();
});

describe("lookupSession", () => {
  it("reports a signed-in user with the address and consent version the server holds", async () => {
    client.getSession.mockResolvedValue({
      data: {
        session: {},
        user: {
          id: "u1",
          email: "amina@example.com",
          consentVersion: "2026-10-14",
          consentedAt: new Date("2026-10-15T23:30:00.000Z"),
        },
      },
      error: null,
    });
    await expect(lookupSession()).resolves.toEqual({
      status: "signed-in",
      email: "amina@example.com",
      consentVersion: "2026-10-14",
      consentedAt: "2026-10-15T23:30:00.000Z",
    });
  });

  it("keeps the consent timestamp from a string and ignores anything that is not one", async () => {
    client.getSession.mockResolvedValueOnce({
      data: { session: {}, user: { id: "u1", consentedAt: "2026-10-14T08:00:00.000Z" } },
      error: null,
    });
    await expect(lookupSession()).resolves.toMatchObject({
      consentedAt: "2026-10-14T08:00:00.000Z",
    });
    forgetSession();
    client.getSession.mockResolvedValueOnce({
      data: { session: {}, user: { id: "u1", consentedAt: "yesterday" } },
      error: null,
    });
    await expect(lookupSession()).resolves.toMatchObject({ consentedAt: null });
  });

  it("reports no consent version as null", async () => {
    client.getSession.mockResolvedValue({ data: { session: {}, user: { id: "u1" } }, error: null });
    await expect(lookupSession()).resolves.toMatchObject({
      status: "signed-in",
      consentVersion: null,
      consentedAt: null,
    });
  });

  it("reports a null session as signed out", async () => {
    client.getSession.mockResolvedValue({ data: null, error: null });
    await expect(lookupSession()).resolves.toEqual({ status: "signed-out" });
  });

  it.each([
    [
      "an error answer",
      () => client.getSession.mockResolvedValue({ data: null, error: { status: 500 } }),
    ],
    ["a network failure", () => client.getSession.mockRejectedValue(new TypeError("network"))],
  ])("reports %s as unavailable", async (_label, arrange) => {
    arrange();
    await expect(lookupSession()).resolves.toEqual({ status: "unavailable" });
  });

  it("shares one request between concurrent and later callers while signed in", async () => {
    client.getSession.mockResolvedValue({ data: { session: {}, user: { id: "u1" } }, error: null });
    await Promise.all([lookupSession(), lookupSession()]);
    await lookupSession();
    expect(client.getSession).toHaveBeenCalledTimes(1);
  });

  it("asks again after a failure, after a signed-out answer and after forgetSession", async () => {
    client.getSession.mockRejectedValueOnce(new TypeError("network"));
    await lookupSession();
    client.getSession.mockResolvedValueOnce({ data: null, error: null });
    await lookupSession();
    client.getSession.mockResolvedValue({ data: { session: {}, user: { id: "u1" } }, error: null });
    await lookupSession();
    expect(client.getSession).toHaveBeenCalledTimes(3);
    forgetSession();
    await lookupSession();
    expect(client.getSession).toHaveBeenCalledTimes(4);
  });
});
