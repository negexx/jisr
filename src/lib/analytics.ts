// The only analytics call the app code makes (ADR 0004 §2): a closed list of count-only events.
// Nothing about the student is ever an argument, so none can reach GoatCounter through here.
export const JOURNEY_EVENTS = [
  "profile-started",
  "profile-completed",
  "matches-viewed",
  "program-saved",
  "plan-opened",
] as const;

export type JourneyEvent = (typeof JOURNEY_EVENTS)[number];

declare global {
  interface Window {
    // Set by the inline loader (AnalyticsLoader) only when analytics is enabled for this build.
    __jisrAnalytics?: boolean;
    // Events fired before count.js has loaded; the loader flushes them.
    __jisrEvents?: string[];
    goatcounter?: {
      endpoint?: string;
      count?: (vars: { path: string; event: boolean }) => void;
    };
  }
}

const sent = new Set<JourneyEvent>();

export function track(event: JourneyEvent): void {
  if (typeof window === "undefined" || window.__jisrAnalytics !== true || sent.has(event)) return;
  sent.add(event);
  const goatcounter = window.goatcounter;
  if (goatcounter?.count) goatcounter.count({ path: event, event: true });
  else window.__jisrEvents = [...(window.__jisrEvents ?? []), event];
}
