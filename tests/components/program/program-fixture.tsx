import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";

import { PROGRAM_CLIENT_NAMESPACES } from "@/components/program/client-namespaces";
import type { FactMeta } from "@/data-schema/resolved";
import type { AppLocale } from "@/i18n/routing";
import { type MessageTree, pickMessages } from "@/lib/i18n/client-messages";
import { pageFacts } from "@/lib/journey/page-facts";
import { createSnapshotClient, type SnapshotBundle } from "@/lib/snapshot/client";
import { shardsForProgram } from "@/lib/snapshot/plan";

import ar from "../../../messages/ar.json";
import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";

// Works under jsdom too: paths come from the working directory (vitest runs at the repository root), never from import.meta.url.
const ROOT = process.cwd();
export const E2E_DATA_DIR = path.join(ROOT, "tests", "fixtures", "data", "e2e-journey");
const BUILD_SCRIPT = path.join(ROOT, "scripts", "data", "build.ts");

export const catalogs: Record<AppLocale, MessageTree> = { fr, en, ar };

const dirs: string[] = [];

// Runs the real data:build CLI on the e2e fixture into a temp dir.
export function buildFixtureSnapshot(): string {
  const outDir = mkdtempSync(path.join(os.tmpdir(), "jisr-program-"));
  dirs.push(outDir);
  const run = spawnSync(
    process.execPath,
    ["--import", "tsx", BUILD_SCRIPT, "--data-dir", E2E_DATA_DIR, "--out-dir", outDir],
    { cwd: ROOT, encoding: "utf8", timeout: 120_000 },
  );
  if (run.status !== 0) throw new Error(`data:build failed\n${run.stdout}\n${run.stderr}`);
  return outDir;
}

export function removeFixtureSnapshots(): void {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
}

// A snapshot client served from a built dir, as the browser would fetch it under /snapshots.
export function fixtureClient(dir: string) {
  const fetchFromDir = async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const file = path.join(dir, url.replace(/^\/snapshots\//, ""));
    if (!url.startsWith("/snapshots/") || !existsSync(file)) {
      return new Response(null, { status: 404 });
    }
    return new Response(new Uint8Array(readFileSync(file)));
  };
  return createSnapshotClient({ baseUrl: "/snapshots", fetch: fetchFromDir, digest: null });
}

export type ProgramRefLike = { slug: string; country: string; field: string };

// The fixture programs' destination and field, as the page passes them to PersonalMatch.
export const PROGRAM_REFS: Record<string, ProgramRefLike> = {
  "xx-test-prog-ok": { slug: "xx-test-prog-ok", country: "XB", field: "xx-test-field-cs" },
  "xx-test-prog-fail": { slug: "xx-test-prog-fail", country: "XB", field: "xx-test-field-cs" },
  "xx-test-prog-check": { slug: "xx-test-prog-check", country: "XB", field: "xx-test-field-eng" },
  "xx-test-prog-stale": { slug: "xx-test-prog-stale", country: "XB", field: "xx-test-field-eng" },
  "xx-test-prog-foundation": {
    slug: "xx-test-prog-foundation",
    country: "XC",
    field: "xx-test-field-cs",
  },
  "xx-test-prog-fronly": { slug: "xx-test-prog-fronly", country: "XB", field: "xx-test-field-cs" },
};

export async function loadProgramBundle(
  dir: string,
  slug: string,
  locale: AppLocale,
): Promise<SnapshotBundle> {
  const ref = PROGRAM_REFS[slug];
  if (ref === undefined) throw new Error(`no ref for ${slug}`);
  return fixtureClient(dir).load((manifest) => shardsForProgram(ref, "XA", manifest), locale);
}

// The banner facts of a fixture program, derived from a client bundle the way the page derives them.
export function bannerFactsOf(bundle: SnapshotBundle, slug: string): FactMeta[] {
  const program = bundle.programs.flatMap((s) => s.programs).find((p) => p.slug === slug);
  if (program === undefined) throw new Error(`no program ${slug}`);
  const institution =
    bundle.institutions
      .flatMap((s) => s.institutions)
      .find((i) => i.slug === program.institution) ?? null;
  const channel =
    bundle.core?.applicationChannels.find((c) => c.slug === program.applicationChannel.value) ??
    null;
  return pageFacts(
    {
      program,
      institution,
      costProfiles: bundle.costProfiles.flatMap((s) => s.profiles),
      scholarships: bundle.scholarships.flatMap((s) => s.scholarships),
      applicationChannel: channel,
    },
    "2000-01-01",
  ).map(({ meta }) => ({
    source_url: meta.source_url,
    info_kind: meta.info_kind,
    last_verified_at: meta.last_verified_at,
    class: meta.class,
  }));
}

function throwOnIntlError(error: Error): never {
  throw error;
}

// The nested provider the page gives its client leaves: only PROGRAM_CLIENT_NAMESPACES, so a leaf
// reading any other namespace fails here as it would in production.
export function ClientLeafProvider({
  locale,
  children,
}: {
  locale: AppLocale;
  children: ReactNode;
}) {
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={pickMessages(catalogs[locale], PROGRAM_CLIENT_NAMESPACES)}
      onError={throwOnIntlError}
      timeZone="UTC"
    >
      <div dir={locale === "ar" ? "rtl" : "ltr"}>{children}</div>
    </NextIntlClientProvider>
  );
}
