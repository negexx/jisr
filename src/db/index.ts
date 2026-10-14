import "server-only";

import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";

import { createPool } from "./pool";
import * as schema from "./schema";

// Runtime connection: the pooled Neon URL. drizzle-kit migrations use the direct
// (unpooled) URL instead — see drizzle.config.ts.
// Every pooled connection has its TimeZone pinned to UTC (see ./pool).
const pool = createPool(process.env.DATABASE_URL);

// Keeps the Fluid/fra1 function instance alive long enough for idle Neon connections to
// drain from the pool. A no-op outside a request scope.
attachDatabasePool(pool);

export const db = drizzle({ client: pool, schema });
