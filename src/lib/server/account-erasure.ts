import "server-only";

import { eq, inArray, or, sql } from "drizzle-orm";

import { emailCooldowns, pendingSignups, verification } from "@/db/schema";
import { cooldownKey, normalizeEmail } from "@/lib/auth/normalize-email";

import { type AccountDb, sqlState } from "./account-store";

export type ErasedUser = { id: string; email: string };

const MAGIC_LINK_PREFIX = "magic-link:%";
const OAUTH_STATE_PREFIX = "auth-state:%";

// The JSON in a verification value, or null when it is not JSON, so one malformed row of someone
// else cannot fail a deletion. CASE (not AND) because Postgres does not promise to evaluate an
// AND's operands in order, and the cast throws on invalid input.
const jsonValue = sql`(case when pg_input_is_valid(${verification.value}, 'jsonb') then ${verification.value}::jsonb end)`;

// What Better Auth's deleteUser leaves behind (it deletes only the user, session and account rows;
// the app tables cascade from user.id): every verification row that names this user, and the two
// pre-account tables keyed by the address. Verification rows name a user three ways in 1.7:
// the user id as the whole value (delete-account-*, reset-password:*), the address inside a
// magic-link value, and the id or address inside an OAuth account-link state.
export async function eraseAccountResidue(db: AccountDb, user: ErasedUser): Promise<void> {
  const email = normalizeEmail(user.email);
  try {
    await db.transaction(async (tx) => {
      await tx
        .delete(verification)
        .where(
          or(
            eq(verification.value, user.id),
            sql`(${verification.identifier} like ${MAGIC_LINK_PREFIX} and lower(btrim(${jsonValue} ->> 'email')) = ${email})`,
            sql`(${verification.identifier} like ${OAUTH_STATE_PREFIX} and (${jsonValue} -> 'link' ->> 'userId' = ${user.id} or lower(btrim(${jsonValue} -> 'link' ->> 'email')) = ${email}))`,
          ),
        );
      // Keyed by the mailbox since todo 28 (cooldownKey); the plain form covers older rows.
      await tx
        .delete(emailCooldowns)
        .where(inArray(emailCooldowns.email, [email, cooldownKey(email)]));
      await tx.delete(pendingSignups).where(eq(pendingSignups.email, email));
    });
  } catch (error) {
    // Drizzle puts the statement's parameters (the address) into its message.
    console.error("[account] eraseAccountResidue failed", { sqlState: sqlState(error) });
    throw new Error("account erasure failed");
  }
}
