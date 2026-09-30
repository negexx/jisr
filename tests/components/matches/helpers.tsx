import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterAll, beforeAll } from "vitest";

import { DirectionProvider } from "@/components/direction-provider";
import { MatchesClient } from "@/components/matches/matches-client";
import { MATCHES_MESSAGE_NAMESPACES } from "@/components/matches/namespaces";
import { localeDirection } from "@/i18n/direction";
import type { AppLocale } from "@/i18n/routing";
import { pickMessages } from "@/lib/i18n/client-messages";
import {
  createSnapshotClient,
  type SnapshotBundle,
  type SnapshotClient,
} from "@/lib/snapshot/client";
import ar from "../../../messages/ar.json";
import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";
import { buildSnapshot, E2E_DATA_DIR, removeTempDirs } from "../../lib/snapshot/fixture";

export const catalogs = { fr, en, ar };

export type FixtureClient = {
  client: () => SnapshotClient;
  // Every URL the client asked the (fake) network for, in order.
  requests: string[];
};

// The T2 fixture through the real snapshot client: only `fetch` is replaced, by files on disk.
export function withFixtureClient(): FixtureClient {
  let client: SnapshotClient | undefined;
  const requests: string[] = [];
  beforeAll(() => {
    const dir = buildSnapshot(E2E_DATA_DIR);
    client = createSnapshotClient({
      baseUrl: "/snap",
      digest: null,
      fetch: async (input) => {
        requests.push(String(input));
        const file = path.join(dir, String(input).replace("/snap/", ""));
        if (!existsSync(file)) return new Response(null, { status: 404 });
        return new Response(new Uint8Array(readFileSync(file)));
      },
    });
  }, 60_000);
  afterAll(removeTempDirs);
  return {
    requests,
    client: () => {
      if (client === undefined) throw new Error("fixture client is not built yet");
      return client;
    },
  };
}

export function bundleClient(bundle: SnapshotBundle): SnapshotClient {
  return { load: async () => bundle };
}

export function Providers({ locale, children }: { locale: AppLocale; children: React.ReactNode }) {
  const dir = localeDirection(locale);
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={pickMessages(catalogs[locale], MATCHES_MESSAGE_NAMESPACES)}
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

export function renderMatches(locale: AppLocale, client: SnapshotClient) {
  return render(
    <Providers locale={locale}>
      <MatchesClient locale={locale} client={client} />
    </Providers>,
  );
}
