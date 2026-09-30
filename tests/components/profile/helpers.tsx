import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { configure, render } from "@testing-library/react";
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
import { buildSnapshot, E2E_DATA_DIR, removeTempDirs } from "../../lib/snapshot/fixture";

const catalogs = { fr, en, ar };

// The whole suite runs files in parallel; a form step can take longer than the 1 s default to appear.
configure({ asyncUtilTimeout: 5000 });

// The T2 fixture through the real snapshot client: only `fetch` is replaced, by files on disk.
export function withFixtureClient(): () => SnapshotClient {
  let client: SnapshotClient | undefined;
  beforeAll(() => {
    const dir = buildSnapshot(E2E_DATA_DIR);
    client = createSnapshotClient({
      baseUrl: "/snap",
      digest: null,
      fetch: async (input) => {
        const file = path.join(dir, String(input).replace("/snap/", ""));
        if (!existsSync(file)) return new Response(null, { status: 404 });
        return new Response(new Uint8Array(readFileSync(file)));
      },
    });
  }, 60_000);
  afterAll(removeTempDirs);
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
