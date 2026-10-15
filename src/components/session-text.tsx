"use client";

import { useSessionHint } from "@/lib/auth/session-hint";

// Static pages cannot see the session, so a line that differs once signed in arrives as both
// strings. The server renders the guest one, so the HTML is the signed-out page either way.
export function SessionText({ guest, signedIn }: { guest: string; signedIn: string }) {
  return useSessionHint() ? signedIn : guest;
}
