import { createAuthClient } from "better-auth/react";

// Browser-side auth client. Kept in its own module so the server instance (and its
// server-only imports) never reaches a client chunk. Zod-free.
export const authClient = createAuthClient();
