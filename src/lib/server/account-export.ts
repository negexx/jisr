import "server-only";

import { db } from "@/db";
import { accountsEnabled } from "@/lib/auth/accounts-enabled";
import { ACCOUNTS_DISABLED_CODE } from "@/lib/auth/accounts-gate";

import { exportAccountDataFor } from "./account-export-store";
import { guarded } from "./account-guard";
import { readSessionUser } from "./session";

const UNAUTHENTICATED_CODE = "UNAUTHENTICATED";

const NO_STORE = { "cache-control": "no-store" };

function refusal(status: 401 | 403, code: string): Response {
  return Response.json({ code }, { status, headers: NO_STORE });
}

export function exportFilename(exportedAt: Date): string {
  return `jisr-export-${exportedAt.toISOString().slice(0, 10)}.json`;
}

// GET /api/account/export: the signed-in student's data as one JSON file. It needs a session but not
// current consent: the right of access must not wait behind re-consenting. While accounts are off it
// answers before any session or database work. The session lookup runs inside guarded() because its
// error would carry the token.
export async function handleAccountExport(): Promise<Response> {
  if (!accountsEnabled()) return refusal(403, ACCOUNTS_DISABLED_CODE);
  return guarded("exportAccountData", async () => {
    const sessionUser = await readSessionUser();
    if (sessionUser === null) return refusal(401, UNAUTHENTICATED_CODE);
    const exportedAt = new Date();
    const document = await exportAccountDataFor(db, sessionUser.id, exportedAt);
    if (document === null) return refusal(401, UNAUTHENTICATED_CODE);
    return new Response(JSON.stringify(document, null, 2), {
      status: 200,
      headers: {
        ...NO_STORE,
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${exportFilename(exportedAt)}"`,
      },
    });
  });
}
