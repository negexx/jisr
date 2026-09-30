"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { AppLocale } from "@/i18n/routing";

import {
  createDigest,
  createSnapshotClient,
  type PlanInput,
  type SnapshotBundle,
  type SnapshotClient,
} from "./client";

// `key` identifies the plan (e.g. which profile inputs it was derived from) so a new request object
// on every render does not reload. It stays in memory: it is never sent or logged.
export type SnapshotRequest = { key: string; plan: PlanInput };

export type SnapshotState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; bundle: SnapshotBundle }
  | { status: "error"; error: unknown };

export type UseSnapshotBundle = { state: SnapshotState; retry: () => void };

let singleton: SnapshotClient | null = null;

export function getSnapshotClient(): SnapshotClient {
  singleton ??= createSnapshotClient({
    baseUrl: process.env.NEXT_PUBLIC_SNAPSHOT_BASE_URL ?? "/snapshots",
    fetch: (input, init) => fetch(input, init),
    digest: createDigest(),
  });
  return singleton;
}

const IDLE: SnapshotState = { status: "idle" };
const LOADING: SnapshotState = { status: "loading" };

export function useSnapshotBundle(
  request: SnapshotRequest | null,
  locale: AppLocale,
  client?: SnapshotClient,
): UseSnapshotBundle {
  const [state, setState] = useState<SnapshotState>(request === null ? IDLE : LOADING);
  const [attempt, setAttempt] = useState(0);
  const latestRequest = useRef(request);
  const key = request?.key ?? null;

  // Declared before the loading effect, so it has run by the time that effect reads the ref.
  useEffect(() => {
    latestRequest.current = request;
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is the retry trigger, read by no code.
  useEffect(() => {
    const current = latestRequest.current;
    if (key === null || current === null) {
      setState(IDLE);
      return;
    }
    const controller = new AbortController();
    setState(LOADING);
    (client ?? getSnapshotClient()).load(current.plan, locale, controller.signal).then(
      (bundle) => {
        if (!controller.signal.aborted) setState({ status: "ready", bundle });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setState({ status: "error", error });
      },
    );
    return () => controller.abort();
  }, [key, locale, client, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, retry };
}
