import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { waitUntil as vercelWaitUntil } from "@vercel/functions";

import type { AuthEmailKind } from "@/db/schema";
import { accountsEnabled } from "@/lib/auth/accounts-enabled";
import { CURRENT_CONSENT_VERSION } from "@/lib/auth/consent";
import { LOCALES } from "@/lib/constants";

export type { AuthEmailKind };

export type AuthEmailLocale = (typeof LOCALES)[number];

export type AuthEmailRequest = {
  kind: AuthEmailKind;
  to: string;
  url: string;
  token: string;
  // The magic-link plugin's `metadata`: the only place the sign-in form can say which language
  // the email should be in, and (`mode: "signup"`, set by the auth instance only for a signup the
  // Server Action recorded) that the link creates an account. Never stored, never logged.
  metadata?: Record<string, unknown>;
};

export type RenderedAuthEmail = { subject: string; text: string };

type Env = Record<string, string | undefined>;

export type AuthEmailDeps = {
  env?: Env;
  fetch?: typeof fetch;
  // Keeps the serverless invocation alive for the Brevo call without making the auth request
  // wait for it. Injected so tests can await the call.
  waitUntil?: (promise: Promise<unknown>) => void;
  mailDir?: string;
};

export class AuthEmailAccountsDisabled extends Error {
  constructor() {
    super("Accounts are switched off: no auth email was sent.");
    this.name = "AuthEmailAccountsDisabled";
  }
}

export class AuthEmailTransportNotConfigured extends Error {
  constructor(reason: string) {
    super(`Auth email transport is not configured: ${reason}. No email was sent.`);
    this.name = "AuthEmailTransportNotConfigured";
  }
}

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
const DEFAULT_SENDER_NAME = "Jisr";
const DEFAULT_MAIL_DIR = join("tests", "e2e", ".mail");
const MAGIC_LINK_VALID_MINUTES = 15;

export function resolveAuthEmailLocale(
  url: string,
  metadata?: Record<string, unknown>,
): AuthEmailLocale {
  const fromMetadata = localeOf(metadata?.locale);
  if (fromMetadata) return fromMetadata;
  try {
    const callback = new URL(url).searchParams.get("callbackURL");
    if (callback) {
      const [, first] = new URL(callback, "http://placeholder.invalid").pathname.split("/");
      const fromPath = localeOf(first);
      if (fromPath) return fromPath;
    }
  } catch {
    // An unparsable URL falls through to the default language.
  }
  return "fr";
}

function localeOf(value: unknown): AuthEmailLocale | null {
  return LOCALES.find((locale) => locale === value) ?? null;
}

// A magic link is rendered as a sign-up email or a sign-in email; the cooldown and the stored kind
// do not distinguish them.
export type AuthEmailTemplate = AuthEmailKind | "magic-link-signup";

type Template = (url: string, privacyUrl: string) => RenderedAuthEmail;

// The privacy notice on the same origin as the link (the auth base URL), in the email's language.
function privacyUrlFor(url: string, locale: AuthEmailLocale): string {
  try {
    return new URL(`/${locale}/privacy`, new URL(url).origin).toString();
  } catch {
    return `/${locale}/privacy`;
  }
}

// Arabic is a machine draft until the native review (project rule, all `ar` copy).
const TEMPLATES: Record<AuthEmailLocale, Record<AuthEmailTemplate, Template>> = {
  fr: {
    // Anyone can type an address into the sign-up form, so the email itself tells the recipient
    // what opening the link means and that ignoring it creates nothing (todo 28, F2).
    "magic-link-signup": (url, privacyUrl) => ({
      subject: "Confirmez votre connexion à Jisr",
      text: [
        "Bonjour,",
        "Quelqu'un a demandé à se connecter à Jisr avec cette adresse email. En ouvrant ce lien, vous vous connectez — et s'il n'existe pas encore de compte Jisr avec cette adresse, il est créé :",
        url,
        `Si un compte est créé, cela vaut confirmation que vous avez 16 ans ou plus et que vous acceptez la politique de confidentialité de Jisr, version ${CURRENT_CONSENT_VERSION} : ${privacyUrl}`,
        `Ce lien est valable ${MAGIC_LINK_VALID_MINUTES} minutes et ne peut être utilisé qu'une seule fois.`,
        "Si vous n'avez pas fait cette demande, ignorez ce message : rien n'est créé.",
        "Jisr",
      ].join("\n\n"),
    }),
    "magic-link": (url) => ({
      subject: "Votre lien de connexion à Jisr",
      text: [
        "Bonjour,",
        "Pour vous connecter à Jisr, ouvrez ce lien :",
        url,
        `Ce lien est valable ${MAGIC_LINK_VALID_MINUTES} minutes et ne peut être utilisé qu'une seule fois. Si vous n'avez pas demandé ce lien, ignorez ce message.`,
        "Jisr",
      ].join("\n\n"),
    }),
    "delete-account": (url) => ({
      subject: "Confirmez la suppression de votre compte Jisr",
      text: [
        "Bonjour,",
        "Vous avez demandé la suppression de votre compte Jisr et de toutes les données associées. Pour confirmer, ouvrez ce lien :",
        url,
        "Cette suppression est définitive. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre compte reste inchangé.",
        "Jisr",
      ].join("\n\n"),
    }),
  },
  en: {
    "magic-link-signup": (url, privacyUrl) => ({
      subject: "Confirm your sign-in to Jisr",
      text: [
        "Hello,",
        "Someone asked to sign in to Jisr with this email address. Opening this link signs you in — and if there is no Jisr account for this address yet, it creates one:",
        url,
        `If an account is created, it confirms that you are 16 or older and accept the Jisr privacy notice, version ${CURRENT_CONSENT_VERSION}: ${privacyUrl}`,
        `This link is valid for ${MAGIC_LINK_VALID_MINUTES} minutes and can be used only once.`,
        "If you did not ask for this, ignore this email: nothing is created.",
        "Jisr",
      ].join("\n\n"),
    }),
    "magic-link": (url) => ({
      subject: "Your Jisr sign-in link",
      text: [
        "Hello,",
        "To sign in to Jisr, open this link:",
        url,
        `This link is valid for ${MAGIC_LINK_VALID_MINUTES} minutes and can be used only once. If you did not request it, you can ignore this message.`,
        "Jisr",
      ].join("\n\n"),
    }),
    "delete-account": (url) => ({
      subject: "Confirm the deletion of your Jisr account",
      text: [
        "Hello,",
        "You asked to delete your Jisr account and all the data linked to it. To confirm, open this link:",
        url,
        "This deletion is permanent. If you did not make this request, ignore this message: your account stays as it is.",
        "Jisr",
      ].join("\n\n"),
    }),
  },
  ar: {
    "magic-link-signup": (url, privacyUrl) => ({
      subject: "تأكيد تسجيل الدخول إلى جسر",
      text: [
        "مرحبًا،",
        "طلب أحدهم تسجيل الدخول إلى جسر بعنوان البريد الإلكتروني هذا. بفتحك هذا الرابط، فأنت تسجّل الدخول — وإذا لم يكن هناك حساب في جسر بهذا العنوان بعد، فسيُنشأ حساب:",
        url,
        `إذا أُنشئ حساب، فهذا يعني أنك تؤكد أن عمرك 16 سنة أو أكثر وأنك تقبل إشعار الخصوصية لجسر، الإصدار ${CURRENT_CONSENT_VERSION}: ${privacyUrl}`,
        `هذا الرابط صالح لمدة ${MAGIC_LINK_VALID_MINUTES} دقيقة ويمكن استخدامه مرة واحدة فقط.`,
        "إذا لم تطلب ذلك، فتجاهل هذه الرسالة: لا يُنشأ أي شيء.",
        "جسر",
      ].join("\n\n"),
    }),
    "magic-link": (url) => ({
      subject: "رابط تسجيل الدخول إلى جسر",
      text: [
        "مرحبًا،",
        "لتسجيل الدخول إلى جسر، افتح هذا الرابط:",
        url,
        `هذا الرابط صالح لمدة ${MAGIC_LINK_VALID_MINUTES} دقيقة ويمكن استخدامه مرة واحدة فقط. إذا لم تطلب هذا الرابط، فتجاهل هذه الرسالة.`,
        "جسر",
      ].join("\n\n"),
    }),
    "delete-account": (url) => ({
      subject: "تأكيد حذف حسابك في جسر",
      text: [
        "مرحبًا،",
        "لقد طلبت حذف حسابك في جسر وجميع البيانات المرتبطة به. للتأكيد، افتح هذا الرابط:",
        url,
        "هذا الحذف نهائي. إذا لم تقم بهذا الطلب، فتجاهل هذه الرسالة: يبقى حسابك كما هو.",
        "جسر",
      ].join("\n\n"),
    }),
  },
};

export function renderAuthEmail(
  template: AuthEmailTemplate,
  locale: AuthEmailLocale,
  url: string,
): RenderedAuthEmail {
  return TEMPLATES[locale][template](url, privacyUrlFor(url, locale));
}

function templateOf(request: AuthEmailRequest): AuthEmailTemplate {
  if (request.kind === "magic-link" && request.metadata?.mode === "signup") {
    return "magic-link-signup";
  }
  return request.kind;
}

type Sender = { email: string; name: string };

const NAMED_SENDER = /^\s*(.*?)\s*<([^<>\s@]+@[^<>\s@]+)>\s*$/;
const BARE_SENDER = /^[^<>\s@]+@[^<>\s@]+$/;

// BREVO_SENDER is `Name <address>` or a bare address.
function parseSender(raw: string | undefined): Sender {
  const value = (raw ?? "").trim();
  const named = NAMED_SENDER.exec(value);
  if (named?.[2]) return { email: named[2], name: named[1] || DEFAULT_SENDER_NAME };
  if (BARE_SENDER.test(value)) return { email: value, name: DEFAULT_SENDER_NAME };
  throw new AuthEmailTransportNotConfigured("BREVO_SENDER is missing or malformed");
}

type Transport = { kind: "brevo"; apiKey: string; sender: Sender } | { kind: "file" };

// The file transport writes magic-link tokens to disk, so it is for tests and local runs only:
// an allow-list of NODE_ENV values (an unset or misspelled one must not open it), or an explicit
// opt-in for the e2e run, which is a production build. Never on Vercel: VERCEL_ENV is set on every
// Vercel build and function there (any value, even a stray opt-in variable, keeps it closed).
const FILE_TRANSPORT_NODE_ENVS = new Set(["development", "test"]);

function selectTransport(env: Env): Transport {
  const apiKey = (env.BREVO_API_KEY ?? "").trim();
  if (apiKey) return { kind: "brevo", apiKey, sender: parseSender(env.BREVO_SENDER) };
  if (env.VERCEL_ENV !== undefined) {
    throw new AuthEmailTransportNotConfigured("BREVO_API_KEY is empty on Vercel");
  }
  const nodeEnvAllowed = FILE_TRANSPORT_NODE_ENVS.has(env.NODE_ENV ?? "");
  if (nodeEnvAllowed || env.JISR_EMAIL_FILE_TRANSPORT === "1") return { kind: "file" };
  throw new AuthEmailTransportNotConfigured("BREVO_API_KEY is empty");
}

async function writeMailFile(
  mailDir: string,
  request: AuthEmailRequest,
  rendered: RenderedAuthEmail,
): Promise<void> {
  await mkdir(mailDir, { recursive: true });
  const file = join(mailDir, `${Date.now()}-${randomUUID()}.json`);
  const record = {
    kind: request.kind,
    to: request.to,
    subject: rendered.subject,
    text: rendered.text,
    url: request.url,
  };
  await writeFile(file, JSON.stringify(record, null, 2), { mode: 0o600 });
}

// Never rejects. A failed delivery is recorded as the kind and a status code (or "network")
// and nothing else: not the address, the link, the token, the response body or the error text.
async function postToBrevo(
  transport: Extract<Transport, { kind: "brevo" }>,
  request: AuthEmailRequest,
  rendered: RenderedAuthEmail,
  send: typeof fetch,
): Promise<void> {
  try {
    const response = await send(BREVO_ENDPOINT, {
      method: "POST",
      headers: {
        "api-key": transport.apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: transport.sender,
        to: [{ email: request.to }],
        subject: rendered.subject,
        textContent: rendered.text,
      }),
    });
    const { ok, status } = response;
    await discardBody(response);
    if (!ok) recordDeliveryFailure(request.kind, status);
  } catch {
    recordDeliveryFailure(request.kind, "network");
  }
}

// The body is never read (it may echo the address), only released so the connection is freed.
async function discardBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Releasing the body is best effort and must not hide the status.
  }
}

function recordDeliveryFailure(kind: AuthEmailKind, status: number | "network"): void {
  console.error("auth email delivery failed", { kind, status });
}

// The single export every auth email callback delegates to. It refuses while accounts are off
// (defence in depth behind the gate plugin and the verification hook) and throws a named error
// instead of silently succeeding when no transport is allowed: a magic link or deletion email
// that never leaves the process must fail visibly, never look sent.
export async function sendAuthEmail(
  request: AuthEmailRequest,
  deps: AuthEmailDeps = {},
): Promise<void> {
  const env = deps.env ?? process.env;
  if (!accountsEnabled(env)) throw new AuthEmailAccountsDisabled();
  const transport = selectTransport(env);
  const rendered = renderAuthEmail(
    templateOf(request),
    resolveAuthEmailLocale(request.url, request.metadata),
    request.url,
  );
  if (transport.kind === "file") {
    await writeMailFile(deps.mailDir ?? join(process.cwd(), DEFAULT_MAIL_DIR), request, rendered);
    return;
  }
  const delivery = postToBrevo(transport, request, rendered, deps.fetch ?? fetch);
  (deps.waitUntil ?? vercelWaitUntil)(delivery);
}
