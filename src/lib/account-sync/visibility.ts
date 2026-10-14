export const REHYDRATE_AFTER_HIDDEN_MS = 60_000;

// Devices converge without a socket: a tab coming back after more than a minute away reads the
// account again. Returns the cleanup.
export function rehydrateOnReturn(
  target: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">,
  now: () => number,
  rehydrate: () => void,
): () => void {
  let hiddenAt: number | null = target.visibilityState === "hidden" ? now() : null;
  const onChange = () => {
    if (target.visibilityState === "hidden") {
      hiddenAt = now();
      return;
    }
    if (hiddenAt !== null && now() - hiddenAt > REHYDRATE_AFTER_HIDDEN_MS) rehydrate();
    hiddenAt = null;
  };
  target.addEventListener("visibilitychange", onChange);
  return () => target.removeEventListener("visibilitychange", onChange);
}
