import "server-only";

import type { PendingSignup } from "./admission";

// Handoff to todo 4: the `pending_signups` table (email, consent_version, age_confirmed,
// …) arrives with the schema. Todo 4 replaces this body with a Drizzle read keyed by the
// normalised email. Until then no pending sign-up can exist, so the gate reads null and
// fails closed (age missing -> reject) for magic-link sign-ups.
export async function readPendingSignup(_email: string): Promise<PendingSignup | null> {
  return null;
}
