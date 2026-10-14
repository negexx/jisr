import type { IsoDate } from "@/data-schema/dates";
import type { Profile } from "@/data-schema/profile";
import type { ChecklistStepId } from "@/domain/types";
import { track } from "@/lib/analytics";
import { MAX_SAVED_PROGRAMS, SAVED_SCHEMA_VERSION } from "@/lib/constants";
import type { LocalJsonStore } from "@/lib/local-store";
import {
  EMPTY_PROGRESS,
  type PlanProgress,
  withoutProgram,
  withStepDone,
} from "@/lib/plan/progress";
import { type AccountProfile, EMPTY_ACCOUNT_PROFILE } from "@/lib/profile/account-profile";
import type { SavedRef, ToggleResult } from "@/lib/saved/actions";
import {
  addSaved,
  EMPTY_SAVED,
  isSavedSlug,
  parseSaved,
  removeSaved,
  type SavedList,
  type SavedProgram,
} from "@/lib/saved/saved";
import type {
  AccountData,
  ActionError,
  ActionResult,
  SaveProfileResult,
} from "@/lib/server/account-actions";

// The signed-in stores (Q1): Postgres is the source of truth and the account cache only mirrors
// it. Every mutation is applied to the cache at once, sent as one Server Action per operation,
// then reconciled to what the server returns; a failure removes only that operation and raises a
// notice. Each store sends its operations one at a time, in the order they were made.

export type SyncActions = {
  loadAccountData: () => Promise<ActionResult<AccountData>>;
  saveProgram: (item: SavedProgram) => Promise<ActionResult<{ items: SavedProgram[] }>>;
  unsaveProgram: (slug: string) => Promise<ActionResult<{ items: SavedProgram[] }>>;
  setStepDone: (
    slug: string,
    step: ChecklistStepId,
    done: boolean,
  ) => Promise<ActionResult<{ steps: ChecklistStepId[] }>>;
  forgetProgress: (slug: string) => Promise<ActionResult<void>>;
  saveProfile: (profile: Profile, expectedRevision: number) => Promise<SaveProfileResult>;
};

export type SyncStores = {
  saved: LocalJsonStore<SavedList>;
  plan: LocalJsonStore<PlanProgress>;
  profile: LocalJsonStore<AccountProfile>;
};

export type SyncNoticeKind =
  | "failed"
  | "savedLimit"
  | "planLimit"
  | "signedOut"
  | "consentRequired"
  | "profileReloaded";
// `id` changes with every notice, so the same kind raised twice is announced twice.
export type SyncNotice = { id: number; kind: SyncNoticeKind };
export type ProfileConflictState = { server: Profile; revision: number };
export type SyncStatus = { notice: SyncNotice | null; conflict: ProfileConflictState | null };

export type AccountSync = {
  toggleSaved: (ref: SavedRef, snapshotVersion: string, today: IsoDate) => ToggleResult;
  saveProgram: (item: SavedProgram) => void;
  unsaveProgram: (slug: string) => void;
  setStepDone: (slug: string, step: ChecklistStepId, done: boolean) => void;
  forgetProgress: (slug: string) => void;
  saveProfile: (profile: Profile) => void;
  resolveConflict: (choice: "server" | "mine") => void;
  hydrate: () => Promise<void>;
  // Forgets everything queued or held; called once the device is signed out.
  reset: () => void;
  dismissNotice: () => void;
  getStatus: () => SyncStatus;
  subscribe: (listener: () => void) => () => void;
};

export type AccountSyncOptions = {
  actions: SyncActions;
  stores: SyncStores;
  // False once signed out: nothing may then be written back under the cleared account keys.
  isActive: () => boolean;
  onSignedOut: () => void;
};

// How an operation ended: `reconcile` moves the confirmed (server) state, `after` raises notices.
type Settled<T> = { ok: boolean; reconcile?: (confirmed: T) => T; after?: () => void };
type Op<T> = { apply: (shown: T) => T; send: () => Promise<Settled<T>> };

type Lane<T> = {
  confirmed: () => T;
  shown: () => T;
  replace: (confirmed: T) => void;
  publish: () => void;
  enqueue: (op: Op<T>) => Promise<boolean>;
  idle: () => Promise<void>;
  reset: () => void;
};

const IDLE: SyncStatus = { notice: null, conflict: null };

function cachedValue<T>(store: LocalJsonStore<T>, empty: T): T {
  const state = store.getSnapshot();
  return state.status === "ready" ? state.value : empty;
}

function savedList(items: SavedProgram[]): SavedList {
  return { schemaVersion: SAVED_SCHEMA_VERSION, items };
}

function withSteps(progress: PlanProgress, slug: string, steps: readonly ChecklistStepId[]) {
  return steps.reduce(
    (next, step) => withStepDone(next, slug, step, true),
    withoutProgram(progress, slug),
  );
}

export function createAccountSync(options: AccountSyncOptions): AccountSync {
  const { actions, stores, isActive, onSignedOut } = options;
  const listeners = new Set<() => void>();
  let status: SyncStatus = IDLE;
  let noticeCount = 0;
  // Bumped by reset: work started before it is dropped instead of being applied.
  let epoch = 0;
  // New operations wait for a running hydration, so they apply on top of what it read.
  let barrier: Promise<void> = Promise.resolve();
  let hydrating: Promise<void> | null = null;
  // The student's profile kept on screen while a conflict waits for their choice.
  let held: Profile | null = null;

  function setStatus(next: Partial<SyncStatus>): void {
    status = { ...status, ...next };
    for (const listener of [...listeners]) listener();
  }

  function notice(kind: SyncNoticeKind): void {
    noticeCount += 1;
    setStatus({ notice: { id: noticeCount, kind } });
  }

  // `invalid` means a different thing per action, so the caller names its notice.
  function refused(error: ActionError, invalid: SyncNoticeKind = "failed"): void {
    if (error === "unauthenticated") {
      onSignedOut();
      notice("signedOut");
    } else if (error === "consent_required") notice("consentRequired");
    else if (error === "saved_limit") notice("savedLimit");
    else if (error === "invalid") notice(invalid);
    else notice("failed");
  }

  async function attempt<V, T>(
    call: () => Promise<V>,
    settle: (value: V) => Settled<T>,
  ): Promise<Settled<T>> {
    let value: V;
    try {
      value = await call();
    } catch {
      return { ok: false, after: () => notice("failed") };
    }
    return settle(value);
  }

  function lane<T>(store: LocalJsonStore<T>, empty: T, overlay: (value: T) => T): Lane<T> {
    let confirmed = cachedValue(store, empty);
    let pending: Array<Op<T>> = [];
    let tail: Promise<void> = Promise.resolve();
    let publishing = false;
    const shown = () => pending.reduce((value, op) => op.apply(value), overlay(confirmed));
    const publish = () => {
      if (!isActive()) return;
      const next = shown();
      publishing = true;
      try {
        store.update(() => next);
      } finally {
        publishing = false;
      }
    };
    // Another tab of this account wrote the shared cache (a `storage` event): with nothing of ours
    // in flight its value is the newer confirmed state; otherwise the server settles it.
    store.subscribe(() => {
      if (publishing || !isActive()) return;
      const state = store.getSnapshot();
      if (state.status !== "ready") return;
      if (pending.length === 0) confirmed = state.value;
      else void hydrate();
    });
    return {
      confirmed: () => confirmed,
      shown,
      publish,
      replace(next) {
        confirmed = next;
        publish();
      },
      enqueue(op) {
        const startedIn = epoch;
        const gate = barrier;
        pending.push(op);
        publish();
        const done = Promise.all([tail, gate]).then(async () => {
          if (startedIn !== epoch) return false;
          const outcome = await op.send();
          if (startedIn !== epoch) return false;
          pending = pending.filter((queued) => queued !== op);
          if (outcome.reconcile) confirmed = outcome.reconcile(confirmed);
          outcome.after?.();
          publish();
          return outcome.ok;
        });
        tail = done.then(() => undefined);
        return done;
      },
      idle: () => tail,
      reset() {
        confirmed = empty;
        pending = [];
        tail = Promise.resolve();
      },
    };
  }

  const saved = lane(stores.saved, EMPTY_SAVED, (value) => value);
  const plan = lane(stores.plan, EMPTY_PROGRESS, (value) => value);
  const profiles = lane(stores.profile, EMPTY_ACCOUNT_PROFILE, (value) =>
    held === null ? value : { ...value, profile: held },
  );

  function saveProgram(item: SavedProgram): void {
    void saved.enqueue({
      apply: (list) => addSaved(list, item) ?? list,
      send: () =>
        attempt(
          () => actions.saveProgram(item),
          (result) =>
            result.ok
              ? { ok: true, reconcile: () => savedList(result.value.items) }
              : { ok: false, after: () => refused(result.error) },
        ),
    });
  }

  function unsaveProgram(slug: string): void {
    const removed = saved.enqueue({
      apply: (list) => removeSaved(list, slug),
      send: () =>
        attempt(
          () => actions.unsaveProgram(slug),
          (result) =>
            result.ok
              ? { ok: true, reconcile: () => savedList(result.value.items) }
              : { ok: false, after: () => refused(result.error) },
        ),
    });
    // The server's unsave deletes the programme's ticks too: they are hidden at once and are gone
    // for good only if the unsave lands, without a request of their own.
    void plan.enqueue({
      apply: (progress) => withoutProgram(progress, slug),
      send: async () =>
        (await removed) ? { ok: true, reconcile: (c) => withoutProgram(c, slug) } : { ok: false },
    });
  }

  function setStepDone(slug: string, step: ChecklistStepId, done: boolean): void {
    void plan.enqueue({
      apply: (progress) => withStepDone(progress, slug, step, done),
      send: () =>
        attempt(
          () => actions.setStepDone(slug, step, done),
          (result) =>
            result.ok
              ? { ok: true, reconcile: (c) => withSteps(c, slug, result.value.steps) }
              : // A tick refused as invalid is the plan-programme cap (ruling P10), not bad input.
                { ok: false, after: () => refused(result.error, done ? "planLimit" : "failed") },
        ),
    });
  }

  function forgetProgress(slug: string): void {
    void plan.enqueue({
      apply: (progress) => withoutProgram(progress, slug),
      send: () =>
        attempt(
          () => actions.forgetProgress(slug),
          (result) =>
            result.ok
              ? { ok: true, reconcile: (c) => withoutProgram(c, slug) }
              : { ok: false, after: () => refused(result.error) },
        ),
    });
  }

  function saveProfile(profile: Profile): void {
    void profiles.enqueue({
      apply: (value) => ({ ...value, profile }),
      send: async () => {
        // Its base is the version the student has not chosen against yet: hold it with the other.
        if (status.conflict !== null) {
          return {
            ok: false,
            after: () => {
              held = profile;
            },
          };
        }
        return attempt(
          // Read when sent, not when made: an earlier save in the queue moves the revision.
          () => actions.saveProfile(profile, profiles.confirmed().revision),
          (result): Settled<AccountProfile> => {
            if (result.ok) {
              const { revision } = result.value;
              return { ok: true, reconcile: (value) => ({ ...value, profile, revision }) };
            }
            if (result.error === "conflict") {
              const { current } = result;
              return {
                ok: false,
                reconcile: (value) => ({ ...value, ...current }),
                after: () => {
                  held = profile;
                  setStatus({ conflict: { server: current.profile, revision: current.revision } });
                },
              };
            }
            // No row although one was expected, or a stored document this build cannot read:
            // what the server holds is unknown here, so read it again.
            if (result.error === "invalid") {
              return {
                ok: false,
                after: () => {
                  notice("profileReloaded");
                  void hydrate();
                },
              };
            }
            const { error } = result;
            return { ok: false, after: () => refused(error) };
          },
        );
      },
    });
  }

  function resolveConflict(choice: "server" | "mine"): void {
    if (status.conflict === null) return;
    const mine = held;
    held = null;
    setStatus({ conflict: null });
    if (choice === "mine" && mine !== null) saveProfile(mine);
    else profiles.publish();
  }

  function hydrate(): Promise<void> {
    if (hydrating !== null) return hydrating;
    const startedIn = epoch;
    const run = Promise.all([saved.idle(), plan.idle(), profiles.idle()])
      .then(async () => {
        if (startedIn !== epoch) return;
        let result: ActionResult<AccountData>;
        try {
          result = await actions.loadAccountData();
        } catch {
          // Offline or a failed request: the cache stays as it is until the next hydration.
          return;
        }
        if (startedIn !== epoch) return;
        if (!result.ok) {
          if (result.error === "unauthenticated") onSignedOut();
          return;
        }
        const data = result.value;
        saved.replace(savedList(data.saved));
        plan.replace(data.plan);
        profiles.replace({
          ...EMPTY_ACCOUNT_PROFILE,
          profile: data.profile,
          revision: data.revision,
        });
        if (status.conflict !== null && data.profile !== null) {
          setStatus({ conflict: { server: data.profile, revision: data.revision } });
        }
      })
      .finally(() => {
        if (hydrating === run) hydrating = null;
      });
    hydrating = run;
    barrier = run;
    return run;
  }

  return {
    toggleSaved(ref, snapshotVersion, today) {
      const list = saved.shown();
      if (isSavedSlug(list, ref.slug)) {
        unsaveProgram(ref.slug);
        return { ok: true, saved: false, persisted: true };
      }
      if (list.items.length >= MAX_SAVED_PROGRAMS) return { ok: false, reason: "full" };
      const item: SavedProgram = { ...ref, snapshotVersion, savedAt: today };
      // A reference the guest parser would reject is not sent either (same contract as the guest).
      if (parseSaved(savedList([item]))?.items.length !== 1) {
        return { ok: true, saved: false, persisted: false };
      }
      saveProgram(item);
      track("program-saved");
      return { ok: true, saved: true, persisted: true };
    },
    saveProgram,
    unsaveProgram,
    setStepDone,
    forgetProgress,
    saveProfile,
    resolveConflict,
    hydrate,
    reset() {
      epoch += 1;
      saved.reset();
      plan.reset();
      profiles.reset();
      held = null;
      hydrating = null;
      barrier = Promise.resolve();
      setStatus({ conflict: null });
    },
    dismissNotice() {
      if (status.notice !== null) setStatus({ notice: null });
    },
    getStatus: () => status,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
