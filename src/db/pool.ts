import { Pool, type PoolClient } from "pg";

const SQLSTATE = /^[0-9A-Z]{5}$/;

// Defence in depth: Drizzle already maps zone-less `timestamp` columns as UTC itself, so this SET
// only guards raw reads and any other consumer of the pool. It runs as the pool's `verify` hook
// rather than a `connect` listener because the hook finishes before the first query is handed the
// connection, and a failure removes that connection from the pool and fails the checkout. A SET
// after connect rather than the `options` startup parameter, which poolers such as Neon's can reject.
export function pinSessionTimeZone(
  client: Pick<PoolClient, "query">,
  done: (error?: Error) => void,
): void {
  client.query("SET TIME ZONE 'UTC'").then(
    () => done(),
    (error: unknown) => {
      // Fixed text plus the SQLSTATE only: the driver's own message can carry the host or user.
      const code =
        typeof error === "object" && error !== null && "code" in error ? error.code : null;
      const suffix = typeof code === "string" && SQLSTATE.test(code) ? ` (SQLSTATE ${code})` : "";
      console.error(`[db] could not pin session time zone to UTC${suffix}`);
      done(new Error("could not pin session time zone to UTC"));
    },
  );
}

export function createPool(connectionString: string | undefined): Pool {
  return new Pool({ connectionString, verify: pinSessionTimeZone });
}
