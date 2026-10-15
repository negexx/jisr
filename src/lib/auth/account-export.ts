// The browser half of the data export (todo 20). Zod-free. The server answers a JSON attachment;
// this turns it into a download from a blob, using the file name the server chose.

export type ExportOutcome = "downloaded" | "signed-out" | "unavailable" | "failed";

export const EXPORT_ENDPOINT = "/api/account/export";
const FALLBACK_FILENAME = "jisr-export.json";
// Only plain file names: the header is the server's, but a name is never trusted to carry a path.
const SAFE_FILENAME = /^[A-Za-z0-9._-]{1,100}$/;

export function exportFilenameFrom(contentDisposition: string | null): string {
  const name = contentDisposition?.match(/filename="([^"]*)"/)?.[1];
  return name !== undefined && SAFE_FILENAME.test(name) ? name : FALLBACK_FILENAME;
}

async function refusalCode(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    return typeof body === "object" &&
      body !== null &&
      "code" in body &&
      typeof body.code === "string"
      ? body.code
      : null;
  } catch {
    return null;
  }
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function downloadAccountExport(): Promise<ExportOutcome> {
  try {
    const response = await fetch(EXPORT_ENDPOINT, { cache: "no-store" });
    if (response.ok) {
      saveBlob(
        await response.blob(),
        exportFilenameFrom(response.headers.get("content-disposition")),
      );
      return "downloaded";
    }
    const code = await refusalCode(response);
    if (response.status === 401 && code === "UNAUTHENTICATED") return "signed-out";
    if (response.status === 403 && code === "ACCOUNTS_DISABLED") return "unavailable";
    return "failed";
  } catch {
    return "failed";
  }
}
