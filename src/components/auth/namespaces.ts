// The message namespaces the sign-in form and the finish-signup gate read on the client. A page
// that mounts either wraps it in a NextIntlClientProvider with exactly these (todo 11's landing too).
export const SIGN_IN_MESSAGE_NAMESPACES = ["signup", "externalLink"] as const;

// The landing needs the gate's and sign-in messages (the gate renders on it) plus its own.
export const WELCOME_MESSAGE_NAMESPACES = ["welcome", ...SIGN_IN_MESSAGE_NAMESPACES] as const;

// The deletion confirm page (todo 19) reads only its own messages.
export const ACCOUNT_DELETE_MESSAGE_NAMESPACES = ["accountDelete"] as const;
