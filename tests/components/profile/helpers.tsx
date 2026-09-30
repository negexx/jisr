import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterAll, beforeAll } from "vitest";

import { DirectionProvider } from "@/components/direction-provider";
import { ProfileForm } from "@/components/profile/profile-form";
import type { CoreShard } from "@/data-schema/snapshot";
import { localeDirection } from "@/i18n/direction";
import type { AppLocale } from "@/i18n/routing";
import { pickMessages } from "@/lib/i18n/client-messages";
import {
  createSnapshotClient,
  type SnapshotBundle,
  type SnapshotClient,
} from "@/lib/snapshot/client";
import { createTextLookup, type TextLookup } from "@/lib/snapshot/text";
import ar from "../../../messages/ar.json";
import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";

const catalogs = { fr, en, ar };

// tests/lib/snapshot/fixture.ts resolves paths with import.meta.url, which jsdom does not give as a
// file URL, so this builds the same fixture snapshot from the repository root (vitest's cwd).
function buildFixtureSnapshot(): string {
  const root = process.cwd();
  const outDir = mkdtempSync(path.join(os.tmpdir(), "jisr-profile-form-"));
  const run = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      path.join(root, "scripts", "data", "build.ts"),
      "--data-dir",
      path.join(root, "tests", "fixtures", "data", "e2e-journey"),
      "--out-dir",
      outDir,
    ],
    { cwd: root, encoding: "utf8", timeout: 120_000 },
  );
  if (run.status !== 0) {
    throw new Error(["data:build failed", run.stdout, run.stderr].join(String.fromCharCode(10)));
  }
  return outDir;
}

// The T2 fixture through the real snapshot client: only `fetch` is replaced, by files on disk.
export function withFixtureClient(): () => SnapshotClient {
  let client: SnapshotClient | undefined;
  let dir = "";
  beforeAll(() => {
    dir = buildFixtureSnapshot();
    client = createSnapshotClient({
      baseUrl: "/snap",
      digest: null,
      fetch: async (input) => {
        const file = path.join(dir, String(input).replace("/snap/", ""));
        if (!existsSync(file)) return new Response(null, { status: 404 });
        return new Response(new Uint8Array(readFileSync(file)));
      },
    });
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  return () => {
    if (client === undefined) throw new Error("fixture client is not built yet");
    return client;
  };
}

export function clientFor(
  core: CoreShard | undefined,
  text: TextLookup = () => undefined,
): SnapshotClient {
  const bundle: SnapshotBundle = {
    snapshotVersion: "abcdef012345",
    core,
    routes: undefined,
    programs: [],
    institutions: [],
    costProfiles: [],
    scholarships: [],
    text,
    hasPrograms: false,
  };
  return { load: async () => bundle };
}

export function textFor(locale: AppLocale, entries: Record<string, string>): TextLookup {
  return createTextLookup(
    [
      {
        kind: "text",
        locale,
        shard: "core",
        entries: Object.fromEntries(
          Object.entries(entries).map(([key, text]) => [
            key,
            { text, status: "reviewed", fallback: false },
          ]),
        ),
      },
    ],
    locale,
  );
}

function Providers({ locale, children }: { locale: AppLocale; children: React.ReactNode }) {
  const dir = localeDirection(locale);
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={pickMessages(catalogs[locale], ["profile", "domain.textNote"])}
      onError={(error) => {
        throw error;
      }}
      timeZone="UTC"
    >
      <div dir={dir} data-testid="dir-root">
        <DirectionProvider dir={dir}>{children}</DirectionProvider>
      </div>
    </NextIntlClientProvider>
  );
}

export function renderProfileForm(locale: AppLocale, client: SnapshotClient) {
  const user = userEvent.setup();
  const view = render(
    <Providers locale={locale}>
      <ProfileForm locale={locale} client={client} />
    </Providers>,
  );
  return { user, ...view };
}
