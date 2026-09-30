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

// `key` identifies the plan, see useSnapshotBundle. It stays in memory: never sent or logged.
export type SnapshotRequest = { key: string; plan: PlanInput };

export type SnapshotState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; bundle: SnapshotBundle }
  | { status: "error"; error: unknown };

export type UseSnapshotBundle = { state: SnapshotState; retry: () => void };

// `||`, not `??`: an empty variable (e.g. copied from .env.example) must not yield "/manifest.json".
export function snapshotBaseUrl(configured: string | undefined): string {
  return configured || "/snapshots";
}

let singleton: SnapshotClient | null = null;

export function getSnapshotClient(): SnapshotClient {
  singleton ??= createSnapshotClient({
    baseUrl: snapshotBaseUrl(process.env.NEXT_PUBLIC_SNAPSHOT_BASE_URL),
    fetch: (input, init) => fetch(input, init),
    digest: createDigest(),
  });
  return singleton;
}

const IDLE: SnapshotState = { status: "idle" };
const LOADING: SnapshotState = { status: "loading" };

// A settled state is only shown for the exact load that produced it.
type Settled = { load: string; state: SnapshotState };

/**
 * Loads the snapshot bundle for `request` in `locale`; `null` means "nothing to load yet"
 * (e.g. the profile is not read) and yields `idle`.
 *
 * Contract: the hook reloads only when `request.key`, `locale` or a `retry()` changes, never when
 * the plan closure alone changes. So `key` MUST change whenever any input the plan captures
 * changes (for matches: credential country and fields; for a program page: the program and the
 * credential country), or a bundle planned for old inputs is served. When the key changes the
 * hook reports `loading` in that same render: a bundle loaded for a previous key is never exposed.
 */
export function useSnapshotBundle(
  request: SnapshotRequest | null,
  locale: AppLocale,
  client?: SnapshotClient,
): UseSnapshotBundle {
  const [settled, setSettled] = useState<Settled | null>(null);
  const [attempt, setAttempt] = useState(0);
  const latestRequest = useRef(request);
  const key = request?.key ?? null;
  const load = key === null ? null : JSON.stringify([key, locale, attempt]);

  // Declared before the loading effect, so it has run by the time that effect reads the ref.
  useEffect(() => {
    latestRequest.current = request;
  });

  useEffect(() => {
    const current = latestRequest.current;
    if (load === null || current === null) return;
    const controller = new AbortController();
    (client ?? getSnapshotClient()).load(current.plan, locale, controller.signal).then(
      (bundle) => {
        if (!controller.signal.aborted) setSettled({ load, state: { status: "ready", bundle } });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setSettled({ load, state: { status: "error", error } });
      },
    );
    return () => controller.abort();
  }, [load, locale, client]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const state = load === null ? IDLE : settled?.load === load ? settled.state : LOADING;
  return { state, retry };
}
