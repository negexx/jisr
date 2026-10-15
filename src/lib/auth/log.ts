import { APIError, isAPIError } from "better-auth/api";

// Better Auth hands its logger the raw error: a failed Drizzle query carries its parameters in the
// message (the session token, the address), and a rejected callback URL is logged as typed. Its
// default logger prints all of it, and so does better-call's own `# SERVER_ERROR` line for an error
// that is not an APIError. Everything Better Auth writes therefore goes through here: the message with
// addresses and URLs blanked and, for each extra argument, only an Error's name and short code.
// Objects are dropped: they are where a user row or a link would sit.
const ADDRESS = /[^\s@<>"'()]+@[^\s@<>"'()]+/g;
const URL_LIKE = /\b[a-z][a-z0-9+.-]*:\/\/\S+/gi;
const SHORT_CODE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_MESSAGE_LENGTH = 200;

export function redactLogText(text: string): string {
  return text.replace(URL_LIKE, "<url>").replace(ADDRESS, "<address>").slice(0, MAX_MESSAGE_LENGTH);
}

// Drizzle wraps the driver's error as `cause`; the SQLSTATE sits on the innermost.
function codeOf(error: Error): string | null {
  for (let at: unknown = error; at instanceof Error; at = at.cause) {
    const code: unknown = "code" in at ? at.code : undefined;
    if (typeof code === "string" && SHORT_CODE.test(code)) return code;
  }
  return null;
}

function describeArgument(value: unknown): string | null {
  if (!(value instanceof Error)) return null;
  const name = SHORT_CODE.test(value.name) ? value.name : "Error";
  const code = codeOf(value);
  return code === null ? name : `${name} ${code}`;
}

type LogLevel = "debug" | "info" | "warn" | "error";

export function scrubbedAuthLog(level: LogLevel, message: string, ...args: unknown[]): void {
  const details = args.flatMap((arg) => describeArgument(arg) ?? []);
  const line = `[better-auth] ${redactLogText(message)}`;
  const write = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  write(...(details.length > 0 ? [line, details] : [line]));
}

// Better Auth's `onAPIError.onError`. An APIError is an ordinary refusal and becomes its response;
// only a 500 is worth a line. Anything else is a bug or an outage: it is logged scrubbed and turned
// into a bodyless 500 here, because better-call would otherwise print the raw error itself.
export function onAuthApiError(error: unknown): void {
  if (isAPIError(error)) {
    if (error.status === "INTERNAL_SERVER_ERROR") scrubbedAuthLog("error", error.status, error);
    return;
  }
  scrubbedAuthLog("error", "unexpected error", error);
  throw new APIError("INTERNAL_SERVER_ERROR", { code: "INTERNAL_SERVER_ERROR" });
}
