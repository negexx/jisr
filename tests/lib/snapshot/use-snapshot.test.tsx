// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SnapshotBundle, SnapshotClient } from "@/lib/snapshot/client";
import { SnapshotError } from "@/lib/snapshot/errors";
import { shardsForProfileForm } from "@/lib/snapshot/plan";
import {
  type SnapshotRequest,
  type SnapshotState,
  snapshotBaseUrl,
  useSnapshotBundle,
} from "@/lib/snapshot/use-snapshot";

import { forbidConsole } from "../profile/no-console";

forbidConsole();

afterEach(() => {
  cleanup();
});

const BUNDLE: SnapshotBundle = {
  snapshotVersion: "abcdef012345",
  core: undefined,
  routes: undefined,
  programs: [],
  institutions: [],
  costProfiles: [],
  scholarships: [],
  text: () => undefined,
  hasPrograms: false,
};

const STALE_BUNDLE: SnapshotBundle = { ...BUNDLE, snapshotVersion: "000000000000" };

const REQUEST: SnapshotRequest = { key: "profile-form", plan: shardsForProfileForm() };

type Deferred = {
  resolve: (bundle: SnapshotBundle) => void;
  reject: (error: unknown) => void;
  signal: AbortSignal | undefined;
};

function deferredClient() {
  const calls: Deferred[] = [];
  const load = vi.fn<SnapshotClient["load"]>(
    (_plan, _locale, signal) =>
      new Promise<SnapshotBundle>((resolve, reject) => {
        calls.push({ resolve, reject, signal });
      }),
  );
  return { client: { load } satisfies SnapshotClient, calls };
}

function lastCall(calls: Deferred[]): Deferred {
  const call = calls.at(-1);
  if (call === undefined) throw new Error("load was not called");
  return call;
}

describe("useSnapshotBundle", () => {
  it("stays idle and loads nothing while the request is null", () => {
    const { client } = deferredClient();
    const { result } = renderHook(() => useSnapshotBundle(null, "fr", client));
    expect(result.current.state).toEqual({ status: "idle" });
    expect(client.load).not.toHaveBeenCalled();
  });

  it("goes loading -> ready", async () => {
    const { client, calls } = deferredClient();
    const { result } = renderHook(() => useSnapshotBundle(REQUEST, "ar", client));
    expect(result.current.state).toEqual({ status: "loading" });
    expect(client.load).toHaveBeenCalledWith(REQUEST.plan, "ar", expect.any(AbortSignal));

    await act(async () => lastCall(calls).resolve(BUNDLE));
    expect(result.current.state).toEqual({ status: "ready", bundle: BUNDLE });
  });

  it("goes error -> retry -> ready", async () => {
    const { client, calls } = deferredClient();
    const { result } = renderHook(() => useSnapshotBundle(REQUEST, "fr", client));
    const error = new SnapshotError("network");
    await act(async () => lastCall(calls).reject(error));
    expect(result.current.state).toEqual({ status: "error", error });

    act(() => result.current.retry());
    await waitFor(() => expect(client.load).toHaveBeenCalledTimes(2));
    expect(result.current.state).toEqual({ status: "loading" });
    await act(async () => lastCall(calls).resolve(BUNDLE));
    expect(result.current.state).toEqual({ status: "ready", bundle: BUNDLE });
  });

  it("reloads only when the request key or locale changes", async () => {
    const { client } = deferredClient();
    const { rerender } = renderHook(
      ({ request }: { request: SnapshotRequest }) => useSnapshotBundle(request, "fr", client),
      { initialProps: { request: REQUEST } },
    );
    rerender({ request: { ...REQUEST } });
    expect(client.load).toHaveBeenCalledTimes(1);
    rerender({ request: { ...REQUEST, key: "other" } });
    expect(client.load).toHaveBeenCalledTimes(2);
  });

  it("aborts the previous load when the request changes", () => {
    const { client, calls } = deferredClient();
    const { rerender } = renderHook(
      ({ request }: { request: SnapshotRequest | null }) =>
        useSnapshotBundle(request, "fr", client),
      { initialProps: { request: REQUEST as SnapshotRequest | null } },
    );
    const first = lastCall(calls);
    rerender({ request: null });
    expect(first.signal?.aborted).toBe(true);
  });

  it("aborts on unmount", () => {
    const { client, calls } = deferredClient();
    const { unmount } = renderHook(() => useSnapshotBundle(REQUEST, "fr", client));
    const call = lastCall(calls);
    unmount();
    expect(call.signal?.aborted).toBe(true);
  });

  it("never applies the result of an aborted load", async () => {
    const { client, calls } = deferredClient();
    const other: SnapshotRequest = { key: "other", plan: shardsForProfileForm() };
    const { result, rerender } = renderHook(
      ({ request }: { request: SnapshotRequest }) => useSnapshotBundle(request, "fr", client),
      { initialProps: { request: REQUEST } },
    );
    const abandoned = lastCall(calls);
    rerender({ request: other });
    rerender({ request: REQUEST });
    expect(abandoned.signal?.aborted).toBe(true);

    await act(async () => abandoned.resolve(STALE_BUNDLE));
    expect(result.current.state).toEqual({ status: "loading" });
    await act(async () => lastCall(calls).resolve(BUNDLE));
    expect(result.current.state).toEqual({ status: "ready", bundle: BUNDLE });
  });

  it("never renders a bundle loaded for a previous key under the new key", async () => {
    const { client, calls } = deferredClient();
    const renders: Array<{ key: string; state: SnapshotState }> = [];
    const { rerender } = renderHook(
      ({ request }: { request: SnapshotRequest }) => {
        const hook = useSnapshotBundle(request, "fr", client);
        renders.push({ key: request.key, state: hook.state });
        return hook;
      },
      { initialProps: { request: REQUEST } },
    );
    await act(async () => lastCall(calls).resolve(STALE_BUNDLE));
    expect(renders.at(-1)?.state).toEqual({ status: "ready", bundle: STALE_BUNDLE });

    rerender({ request: { key: "other", plan: shardsForProfileForm() } });
    await act(async () => lastCall(calls).resolve(BUNDLE));

    const underNewKey = renders.filter((r) => r.key === "other");
    expect(underNewKey.length).toBeGreaterThan(0);
    for (const { state } of underNewKey) {
      expect(state.status === "ready" && state.bundle === STALE_BUNDLE).toBe(false);
    }
    expect(underNewKey.at(-1)?.state).toEqual({ status: "ready", bundle: BUNDLE });
  });

  it("shows loading, not the old bundle, as soon as the locale changes", async () => {
    const { client, calls } = deferredClient();
    const { result, rerender } = renderHook(
      ({ locale }: { locale: "fr" | "ar" }) => useSnapshotBundle(REQUEST, locale, client),
      { initialProps: { locale: "fr" as "fr" | "ar" } },
    );
    await act(async () => lastCall(calls).resolve(STALE_BUNDLE));
    rerender({ locale: "ar" });
    expect(result.current.state).toEqual({ status: "loading" });
  });
});

describe("snapshotBaseUrl", () => {
  it("defaults to /snapshots when the variable is unset or empty", () => {
    expect(snapshotBaseUrl(undefined)).toBe("/snapshots");
    expect(snapshotBaseUrl("")).toBe("/snapshots");
    expect(snapshotBaseUrl("https://cdn.example.org/snapshots")).toBe(
      "https://cdn.example.org/snapshots",
    );
  });

  it("makes the default client request /snapshots/manifest.json when the variable is empty", async () => {
    vi.stubEnv("NEXT_PUBLIC_SNAPSHOT_BASE_URL", "");
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return new Response(null, { status: 503 });
    });
    try {
      vi.resetModules();
      const fresh = await import("@/lib/snapshot/use-snapshot");
      await expect(fresh.getSnapshotClient().load(shardsForProfileForm(), "fr")).rejects.toThrow();
      expect(urls).toEqual(["/snapshots/manifest.json"]);
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });
});
