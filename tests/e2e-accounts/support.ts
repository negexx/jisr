import { randomBytes } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import {
  type Browser,
  type BrowserContext,
  expect,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { Client } from "pg";

import type { AccountExport } from "@/lib/server/account-export-store";

import { E2E_NOW, E2E_PROFILE, PROFILE_KEY, SAVED_KEY } from "../e2e/support/fixture-data";
import type { E2eLocale } from "../e2e/support/locales";
import { escapeRegExp, type Translate } from "../e2e/support/messages";
import { savedItem } from "../e2e/support/plan";

// Must match playwright.accounts.config.ts (its webServer starts the app and the database there).
export const ORIGIN = "http://localhost:3500";
const DB_URL = "postgres://postgres@127.0.0.1:54330/postgres?sslmode=disable";
// The file transport's output directory (src/lib/server/email.ts DEFAULT_MAIL_DIR).
const MAIL_DIR = path.resolve(process.cwd(), "tests", "e2e", ".mail");

// One address per locale and run: no two runs, and no two locales, share an account.
const RUN_ID = randomBytes(4).toString("hex");
export function addressFor(locale: E2eLocale, label: string): string {
  return `jisr-e2e-${RUN_ID}-${locale}-${label}@example.com`;
}

type MailKind = "magic-link" | "delete-account";

// The sign-in or deletion link the file transport wrote for `to`, written at or after `since`.
// The link is a secret: it is returned to the caller and never printed.
export async function readMailLink(to: string, kind: MailKind, since: number): Promise<URL> {
  let link: string | null = null;
  await expect
    .poll(
      async () => {
        let names: string[] = [];
        try {
          names = await readdir(MAIL_DIR);
        } catch {
          return false;
        }
        const recent = names
          .filter((name) => name.endsWith(".json") && Number(name.split("-")[0]) >= since - 1000)
          .sort()
          .reverse();
        for (const name of recent) {
          const record: { kind: string; to: string; url: string } = JSON.parse(
            await readFile(path.join(MAIL_DIR, name), "utf8"),
          );
          if (record.kind === kind && record.to === to) {
            link = record.url;
            return true;
          }
        }
        return false;
      },
      { message: `${kind} email for the test address was written`, timeout: 20_000 },
    )
    .toBe(true);
  if (link === null) throw new Error("unreachable: the poll above succeeded without a link");
  return new URL(link);
}

async function withDb<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

// The one-a-minute send limit is real server behaviour (covered by tests/db); the suite signs the
// same address in on several devices within a minute, so it resets the row for that address.
export async function resetEmailCooldown(email: string): Promise<void> {
  await withDb((client) =>
    client.query("delete from email_cooldowns where email = $1", [email.toLowerCase()]),
  );
}

export async function accountRowCount(email: string): Promise<number> {
  return withDb(async (client) => {
    const result = await client.query<{ n: string }>(
      'select count(*)::text as n from "user" where email = $1',
      [email.toLowerCase()],
    );
    return Number(result.rows[0]?.n ?? "0");
  });
}

export type Device = { context: BrowserContext; page: Page };

export async function openDevice(
  browser: Browser,
  state?: Awaited<ReturnType<BrowserContext["storageState"]>>,
): Promise<Device> {
  const context = await browser.newContext({
    baseURL: ORIGIN,
    viewport: { width: 1280, height: 800 },
    ...(state === undefined ? {} : { storageState: state }),
  });
  const page = await context.newPage();
  // The same pinned day as the guest specs: the fixture data is dated around it.
  await page.clock.install({ time: new Date(`${E2E_NOW}T10:00:00.000Z`) });
  return { context, page };
}

// Guest data as a visitor who used Jisr before signing in has it: written once (not by an init
// script, which would write it again after the sign-in claimed it).
export async function seedGuestData(
  page: Page,
  locale: E2eLocale,
  slugs: readonly string[],
): Promise<void> {
  await page.goto(`/${locale}`);
  await page.evaluate(
    ([profileKey, profile, savedKey, saved]) => {
      window.localStorage.setItem(profileKey, profile);
      window.localStorage.setItem(savedKey, saved);
    },
    [
      PROFILE_KEY,
      JSON.stringify(E2E_PROFILE),
      SAVED_KEY,
      JSON.stringify({ schemaVersion: 1, items: slugs.map((slug) => savedItem(slug)) }),
    ] as const,
  );
}

export async function guestSavedSlugs(page: Page): Promise<string[]> {
  const raw = await page.evaluate((key) => window.localStorage.getItem(key), SAVED_KEY);
  if (raw === null) return [];
  const parsed: { items: Array<{ slug: string }> } = JSON.parse(raw);
  return parsed.items.map((item) => item.slug).sort();
}

export async function localKeys(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Object.keys(window.localStorage).filter((key) => key.startsWith("jisr.")),
  );
}

// The signed-in student's own export, read through the same endpoint the account page uses.
export async function fetchExport(page: Page): Promise<AccountExport> {
  return page.evaluate(async () => {
    const response = await fetch("/api/account/export", { cache: "no-store" });
    if (!response.ok) throw new Error(`export answered ${response.status}`);
    return response.json();
  });
}

export async function exportStatus(page: Page): Promise<number> {
  return page.evaluate(
    async () => (await fetch("/api/account/export", { cache: "no-store" })).status,
  );
}

export async function savedSlugsOnServer(page: Page): Promise<string[]> {
  const doc = await fetchExport(page);
  return doc.savedPrograms.map((item) => item.slug).sort();
}

export async function shot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await testInfo.attach(name, {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
}

function startsWithText(text: string): RegExp {
  return new RegExp(`^${escapeRegExp(text)}`);
}

// The sign-in form, filled and sent. The sign-up path also ticks the consent and age boxes.
export async function requestLink(
  page: Page,
  t: Translate,
  email: string,
  mode: "signup" | "signin",
): Promise<void> {
  await page.getByRole("radio", { name: t(`signup.modes.${mode}`) }).check();
  await page.getByLabel(startsWithText(t("signup.email.label"))).fill(email);
  if (mode === "signup") {
    await page.getByRole("checkbox", { name: startsWithText(t("signup.consent.label")) }).check();
    await page.getByRole("checkbox", { name: startsWithText(t("signup.age.label")) }).check();
  }
  await page.getByRole("button", { name: t("signup.submit") }).click();
  await expect(page.getByRole("heading", { name: t("signup.sent.title") })).toBeVisible();
}

// A returning student on another device: asks for a link, opens it in `device`, which lands on the
// welcome page (the caller then looks at what the page shows).
export async function signInOnDevice(
  device: Device,
  t: Translate,
  locale: E2eLocale,
  email: string,
  returnPath: string,
): Promise<void> {
  const { page } = device;
  await resetEmailCooldown(email);
  const since = Date.now();
  await page.goto(`/${locale}/sign-in?return=${encodeURIComponent(returnPath)}`);
  await requestLink(page, t, email, "signin");
  const link = await readMailLink(email, "magic-link", since);
  await page.goto(link.toString());
}
