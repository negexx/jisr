"use client";

import { lazy, Suspense, useSyncExternalStore } from "react";

const ProfileMatchesLink = lazy(() =>
  import("@/components/profile-matches-link").then((module) => ({
    default: module.ProfileMatchesLink,
  })),
);

// Same key as PROFILE_KEY in @/lib/profile/storage (a test keeps them equal). It is not imported:
// that module pulls Zod into the first load of the home page.
export const STORED_PROFILE_KEY = "jisr.profile";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function hasStoredProfile(): boolean {
  try {
    return window.localStorage.getItem(STORED_PROFILE_KEY) !== null;
  } catch {
    return false;
  }
}

// Only a device that holds a stored profile downloads the code that validates it. The wrapper is
// always rendered at button height, so the link appearing after hydration moves nothing.
export function HomeMatchesLink({ label }: { label: string }) {
  const hasProfile = useSyncExternalStore(subscribe, hasStoredProfile, () => false);
  return (
    <div className="min-h-12">
      {hasProfile ? (
        <Suspense fallback={null}>
          <ProfileMatchesLink label={label} />
        </Suspense>
      ) : null}
    </div>
  );
}
