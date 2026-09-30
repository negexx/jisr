// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SnapshotBundle, SnapshotClient } from "@/lib/snapshot/client";
import { SnapshotError } from "@/lib/snapshot/errors";
import { shardsForProfileForm } from "@/lib/snapshot/plan";
import { type SnapshotRequest, useSnapshotBundle } from "@/lib/snapshot/use-snapshot";

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

  it("aborts on unmount and never updates state afterwards", async () => {
    const { client, calls } = deferredClient();
    const { result, unmount } = renderHook(() => useSnapshotBundle(REQUEST, "fr", client));
    const call = lastCall(calls);
    unmount();
    expect(call.signal?.aborted).toBe(true);
    await act(async () => call.resolve(BUNDLE));
    expect(result.current.state).toEqual({ status: "loading" });
  });
});
