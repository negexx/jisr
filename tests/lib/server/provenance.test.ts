import { readFileSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { startTestDatabase, type TestDatabase } from "@scripts/db/harness";
import { Pool } from "pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from "vitest";

import { type Profile, ProfileSchema } from "@/data-schema/profile";
import type { Manifest } from "@/data-schema/snapshot";
import { CHECKLIST_STEP_IDS, type ChecklistStepId } from "@/domain/types";
import { exportFilenameFrom } from "@/lib/auth/account-export";
import { isOneOf } from "@/lib/guards";
import { buildPlanView } from "@/lib/journey/plan-view";
import type { SavedProgram } from "@/lib/saved/saved";
import type { AccountExport } from "@/lib/server/account-export-store";
import type { GuestImportPayload } from "@/lib/server/import";
import type { SignInLinkRequest } from "@/lib/server/signup";
import { createSnapshotClient } from "@/lib/snapshot/client";
import { shardsForPlan } from "@/lib/snapshot/plan";

import { E2E_NOW, E2E_PROFILE, E2E_SLUGS } from "../../fixtures/e2e/profiles";
import { confirmRequest } from "../../support/magic-link";
import { importsOf, SRC, sourceFiles } from "../client-scanner";
import {
  buildSnapshot,
  buildVariant,
  createFakeServer,
  E2E_DATA_DIR,
  MANIFEST_URL,
  readManifest,
  removeTempDirs,
  shardUrl,
} from "../snapshot/fixture";

// ADR 0013 decision 13: a saved programme stores the slug and the snapshot_version it was saved
// against. The version is provenance, never a pin: nothing fetches a snapshot by it, programmes are
// always resolved against the current manifest, and export and import keep the stored value as it
// is. Two halves. The first runs the real snapshot client and the plan view on a row saved against
// an older snapshot; the second runs a real account (PGlite, real sessions) through export and
// import. The program page's update notice is in tests/components/program/provenance.test.tsx.

const TIMEOUT_MS = 300_000;
const ORIGIN = "http://localhost:3000";

// ---------------------------------------------------------------------------------------------
// A row never pins the snapshot that is loaded
// ---------------------------------------------------------------------------------------------

function renamed(tag: string) {
  return [
    {
      file: "programs/xx-test-prog-ok.yaml",
      from: "name: XX Test Programme OK",
      to: `name: XX Test Programme OK ${tag}`,
    },
  ];
}

// A version no snapshot has ever had: nothing validates a stored version against the data.
const NO_SUCH_SNAPSHOT = "00000000000f";

let olderDir = "";
let currentDir = "";
let olderManifest: Manifest;
let currentManifest: Manifest;

// Saved against the older snapshot, on a deployment that now serves the current one.
function rows(): SavedProgram[] {
  return [
    {
      slug: E2E_SLUGS.ok,
      country: "XB",
      field: "xx-test-field-cs",
      snapshotVersion: olderManifest.snapshotVersion,
      savedAt: "2026-09-01",
    },
    {
      slug: E2E_SLUGS.foundation,
      country: "XC",
      field: "xx-test-field-cs",
      snapshotVersion: NO_SUCH_SNAPSHOT,
      savedAt: "2026-09-02",
    },
  ];
}

describe("a saved row's snapshot version is provenance, not a pin", () => {
  beforeAll(() => {
    olderDir = buildSnapshot(E2E_DATA_DIR);
    currentDir = buildVariant(renamed("v2"));
    olderManifest = readManifest(olderDir);
    currentManifest = readManifest(currentDir);
  }, TIMEOUT_MS);

  afterAll(removeTempDirs);

  it("is set up with a deployment that has moved on since the rows were saved", () => {
    expect(currentManifest.snapshotVersion).not.toBe(olderManifest.snapshotVersion);
    const [first, second] = rows();
    expect(first?.snapshotVersion).toBe(olderManifest.snapshotVersion);
    expect(second?.snapshotVersion).not.toBe(currentManifest.snapshotVersion);
  });

  it("plans the same shards whatever version the rows carry", () => {
    const saved = rows();
    const plan = shardsForPlan(saved, E2E_PROFILE.credential.country, currentManifest);
    const withOtherVersions = saved.map((row) => ({
      ...row,
      snapshotVersion: currentManifest.snapshotVersion,
    }));
    const withoutVersions = saved.map(({ country, field }) => ({ country, field }));
    const country = E2E_PROFILE.credential.country;
    expect(shardsForPlan(withOtherVersions, country, currentManifest)).toEqual(plan);
    expect(shardsForPlan(withoutVersions, country, currentManifest)).toEqual(plan);
    expect(plan.structural.length).toBeGreaterThan(3);
  });

  it("loads the current manifest and the shards it lists, and nothing named by a row", async () => {
    const saved = rows();
    const server = createFakeServer(currentDir);
    const client = createSnapshotClient({
      baseUrl: "/snapshots",
      fetch: server.fetch,
      digest: null,
    });

    const bundle = await client.load(
      (manifest) => shardsForPlan(saved, E2E_PROFILE.credential.country, manifest),
      "fr",
    );

    expect(bundle.snapshotVersion).toBe(currentManifest.snapshotVersion);
    const requested = server.requests.map((request) => request.url);
    expect(requested[0]).toBe(MANIFEST_URL);
    expect(requested.filter((url) => url === MANIFEST_URL)).toHaveLength(1);

    const currentFiles = new Set(
      Object.keys(currentManifest.shards).map((name) => shardUrl(currentManifest, name)),
    );
    for (const url of requested.slice(1)) expect(currentFiles.has(url), url).toBe(true);

    const olderOnly = Object.keys(olderManifest.shards)
      .map((name) => shardUrl(olderManifest, name))
      .filter((url) => !currentFiles.has(url));
    expect(olderOnly.length).toBeGreaterThan(0);
    for (const url of requested) {
      expect(olderOnly, url).not.toContain(url);
      for (const row of saved) expect(url).not.toContain(row.snapshotVersion);
    }
  });

  it("shows a row saved against an older snapshot from the data published today", async () => {
    const saved = rows();
    const loadWith = async (dir: string) =>
      createSnapshotClient({
        baseUrl: "/snapshots",
        fetch: createFakeServer(dir).fetch,
        digest: null,
      }).load((manifest) => shardsForPlan(saved, E2E_PROFILE.credential.country, manifest), "fr");

    const current = await loadWith(currentDir);
    const view = buildPlanView({ profile: E2E_PROFILE, bundle: current, saved, now: E2E_NOW });
    expect(view.entries.map((entry) => [entry.kind, entry.slug])).toEqual([
      ["program", E2E_SLUGS.ok],
      ["program", E2E_SLUGS.foundation],
    ]);
    const first = view.entries[0];
    expect(first?.kind === "program" ? first.name : null).toBe("XX Test Programme OK v2");

    // The row's version changes nothing: the same view as for rows that carry no version at all.
    const slugsOnly = saved.map(({ slug }) => ({ slug }));
    expect(
      buildPlanView({ profile: E2E_PROFILE, bundle: current, saved: slugsOnly, now: E2E_NOW }),
    ).toEqual(view);

    // And it is the current data, not the data of the snapshot the row was saved against.
    const older = await loadWith(olderDir);
    const wasSaved = buildPlanView({ profile: E2E_PROFILE, bundle: older, saved, now: E2E_NOW });
    const before = wasSaved.entries[0];
    expect(before?.kind === "program" ? before.name : null).toBe("XX Test Programme OK");
  });

  it("is invisible to the snapshot layer: nothing under src/lib/snapshot imports the saved list or an account module", () => {
    const leaks = /^(?:@\/lib|\.\.)\/(?:saved|plan|account|auth|server)/;
    const offenders = sourceFiles(join(SRC, "lib", "snapshot"))
      .flatMap((file) =>
        importsOf(readFileSync(file, "utf8")).map(({ specifier }) => ({ file, specifier })),
      )
      .filter(({ specifier }) => leaks.test(specifier));
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// An account's rows through export and import
// ---------------------------------------------------------------------------------------------

const io = vi.hoisted(() => ({ mailDir: "", requestHeaders: new Headers() }));

vi.mock("next/headers", () => ({ headers: async () => io.requestHeaders }));

vi.mock("@/lib/server/email", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/server/email")>();
  return {
    ...original,
    sendAuthEmail: async (request: Parameters<typeof original.sendAuthEmail>[0]) => {
      await original.sendAuthEmail(request, { mailDir: io.mailDir });
    },
  };
});

type RouteModule = typeof import("@/app/api/account/export/route");
type Actions = typeof import("@/lib/server/account-actions");
type Importer = typeof import("@/lib/server/import");
type Student = { cookie: string; id: string; email: string };

let testDb: TestDatabase;
let pool: Pool;
let route: RouteModule;
let actions: Actions;
let importer: Importer;
let closeAppPool: () => Promise<void>;
let alice: Student;
let dave: Student;
let erin: Student;

async function lastLink(): Promise<string> {
  const files = (await readdir(io.mailDir)).sort();
  const last = files.at(-1);
  if (last === undefined) throw new Error("no magic-link mail was written");
  const mail: { url: string } = JSON.parse(await readFile(join(io.mailDir, last), "utf8"));
  return mail.url;
}

async function signUp(email: string): Promise<Student> {
  const { requestSignInLink } = await import("@/lib/server/signup");
  const request: SignInLinkRequest = {
    mode: "signup",
    email,
    consent: true,
    ageConfirmed: true,
    locale: "fr",
    returnPath: null,
  };
  io.requestHeaders = new Headers({ origin: ORIGIN });
  expect(await requestSignInLink(request)).toEqual({ ok: true });
  const response = await (await import("@/lib/auth/server"))
    .getAuth()
    .handler(confirmRequest(await lastLink()));
  expect(response.status).toBe(200);
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  const { rows: found } = await pool.query<{ id: string }>(
    'select id from "user" where email = $1',
    [email],
  );
  const id = found[0]?.id;
  if (id === undefined) throw new Error("sign-up created no user");
  return { cookie, id, email };
}

function signedInAs(student: Student): void {
  io.requestHeaders = new Headers({ cookie: student.cookie, origin: ORIGIN });
}

function program(slug: string, overrides: Partial<SavedProgram> = {}): SavedProgram {
  return {
    slug,
    country: "FR",
    field: "computer-science",
    snapshotVersion: "0123456789ab",
    savedAt: "2026-10-01",
    ...overrides,
  };
}

const ALICE_PROFILE: Profile = ProfileSchema.parse({
  schemaVersion: 2,
  nationality: "MA",
  credential: {
    country: "MA",
    type: "bac",
    track: "sciences-maths-a",
    status: "expected",
    overall: { scale: "ma-20", value: 13.37 },
    subjects: [{ subject: "mathematics", grade: { scale: "ma-20", value: 17 } }],
  },
  priorHigherEducationYears: 0,
  languages: [{ language: "fr", level: "B2", certificate: null }],
});
const ALICE_EDITED_PROFILE: Profile = { ...ALICE_PROFILE, priorHigherEducationYears: 1 };

// Three versions on purpose, one of which no snapshot has ever had; two programmes saved on the
// same day, so that their order can only come from the order they were saved in.
const SEEDED = [
  program("xx-prog-c", { snapshotVersion: "ba9876543210", savedAt: "2026-10-01" }),
  program("xx-prog-a", { snapshotVersion: "0123456789ab", savedAt: "2026-10-01" }),
  program("xx-prog-b", { snapshotVersion: NO_SUCH_SNAPSHOT, savedAt: "2026-10-02", country: "DE" }),
];

async function expectOk(result: Promise<{ ok: boolean }>): Promise<void> {
  expect(await result).toMatchObject({ ok: true });
}

async function seedAlice(): Promise<void> {
  signedInAs(alice);
  await expectOk(actions.saveProfile(ALICE_PROFILE, 0));
  await expectOk(actions.saveProfile(ALICE_EDITED_PROFILE, 1));
  for (const item of SEEDED) await expectOk(actions.saveProgram(item));
  await expectOk(actions.setStepDone("xx-prog-c", "visa", true));
  await expectOk(actions.setStepDone("xx-prog-c", "documents", true));
  await expectOk(actions.setStepDone("xx-prog-b", "submit", true));
}

async function exportOf(
  student: Student,
): Promise<{ response: Response; document: AccountExport }> {
  signedInAs(student);
  const response = await route.GET();
  expect(response.status).toBe(200);
  return { response, document: JSON.parse(await response.text()) };
}

// What a person could do with the file: read the profile the way this build reads one, group the
// ticks by programme, keep the rows as they are. The export's profile is `unknown` because the
// stored document may be from another build, so it is parsed here, as any reader must.
function payloadFromExport(document: AccountExport): GuestImportPayload {
  const profile = ProfileSchema.safeParse(document.profile?.data);
  const plan: Record<string, ChecklistStepId[]> = {};
  for (const { programSlug, stepId } of document.checklistProgress) {
    if (!isOneOf(stepId, CHECKLIST_STEP_IDS)) continue;
    plan[programSlug] = [...(plan[programSlug] ?? []), stepId];
  }
  return {
    profile: profile.success ? profile.data : null,
    saved: document.savedPrograms.map(
      ({ slug, country, field, snapshotVersion, savedAt }): SavedProgram => ({
        slug,
        country,
        field,
        snapshotVersion,
        savedAt,
      }),
    ),
    plan,
  };
}

const withoutCreatedAt = (document: AccountExport) =>
  document.savedPrograms.map(({ createdAt: _createdAt, ...stored }) => stored);

async function storedVersions(student: Student): Promise<Array<[string, string]>> {
  const { rows: found } = await pool.query<{ slug: string; snapshot_version: string }>(
    "select slug, snapshot_version from saved_programs where user_id = $1 order by slug",
    [student.id],
  );
  return found.map((row) => [row.slug, row.snapshot_version]);
}

async function accountOf(student: Student) {
  signedInAs(student);
  const loaded = await actions.loadAccountData();
  if (!loaded.ok) throw new Error(`loadAccountData refused: ${loaded.error}`);
  return loaded.value;
}

describe("an account's rows keep the snapshot version they were saved against", () => {
  beforeAll(async () => {
    io.mailDir = await mkdtemp(join(tmpdir(), "jisr-provenance-mail-"));
    testDb = await startTestDatabase({ port: 0 });
    pool = new Pool({ connectionString: testDb.databaseUrl });
    process.env.DATABASE_URL = testDb.databaseUrl;
    process.env.BETTER_AUTH_SECRET = "test-secret-test-secret-test-secret-0123";
    process.env.BETTER_AUTH_URL = ORIGIN;
    vi.stubEnv("ACCOUNTS_ENABLED", "true");
    route = await import("@/app/api/account/export/route");
    actions = await import("@/lib/server/account-actions");
    importer = await import("@/lib/server/import");
    alice = await signUp("alice@example.com");
    dave = await signUp("dave@example.com");
    erin = await signUp("erin@example.com");
    await seedAlice();
    const { db } = await import("@/db");
    closeAppPool = () => db.$client.end();
  }, TIMEOUT_MS);

  beforeEach(() => {
    vi.stubEnv("ACCOUNTS_ENABLED", "true");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await closeAppPool?.();
    await pool?.end();
    await testDb?.stop();
    await rm(io.mailDir, { recursive: true, force: true });
  }, TIMEOUT_MS);

  it("stores each version as it was given, and keeps it when the same programme is saved again", async () => {
    expect(await storedVersions(alice)).toEqual([
      ["xx-prog-a", "0123456789ab"],
      ["xx-prog-b", NO_SUCH_SNAPSHOT],
      ["xx-prog-c", "ba9876543210"],
    ]);

    signedInAs(alice);
    const again = program("xx-prog-c", { snapshotVersion: "fffffffffff0", savedAt: "2026-12-24" });
    await expectOk(actions.saveProgram(again));

    // The row records the snapshot the student first saw, not the latest one they saved from.
    expect(await storedVersions(alice)).toEqual([
      ["xx-prog-a", "0123456789ab"],
      ["xx-prog-b", NO_SUCH_SNAPSHOT],
      ["xx-prog-c", "ba9876543210"],
    ]);
    const saved = (await accountOf(alice)).saved;
    expect(saved.find((item) => item.slug === "xx-prog-c")).toEqual(SEEDED[0]);
  });

  it("exports the stored versions untouched, and the profile as a document to be parsed", async () => {
    const { response, document } = await exportOf(alice);

    expect(document.savedPrograms.map((row) => [row.slug, row.snapshotVersion])).toEqual(
      SEEDED.map((item) => [item.slug, item.snapshotVersion]),
    );
    expect(document.checklistProgress).toEqual([
      { programSlug: "xx-prog-b", stepId: "submit", doneAt: expect.any(String) },
      { programSlug: "xx-prog-c", stepId: "documents", doneAt: expect.any(String) },
      { programSlug: "xx-prog-c", stepId: "visa", doneAt: expect.any(String) },
    ]);
    expectTypeOf<AccountExport["profile"]>().toEqualTypeOf<{
      data: unknown;
      revision: number;
      updatedAt: string;
    } | null>();
    expect(ProfileSchema.parse(document.profile?.data)).toEqual(ALICE_EDITED_PROFILE);
    // The name the server chose is one the browser accepts, so the download keeps it.
    expect(exportFilenameFrom(response.headers.get("content-disposition"))).toBe(
      `jisr-export-${document.exportedAt.slice(0, 10)}.json`,
    );
  });

  it("brings an exported account into a new one with every snapshot version, date and order unchanged", async () => {
    const { document } = await exportOf(alice);
    const payload = payloadFromExport(document);
    expect(payload.profile).toEqual(ALICE_EDITED_PROFILE);

    signedInAs(dave);
    expect(await importer.importGuestData(payload, "auto")).toEqual({ ok: true, value: undefined });

    // The same rows, read three ways: through the sync action, in the table, and back out again.
    const [fromAlice, fromDave] = [await accountOf(alice), await accountOf(dave)];
    expect(fromDave.saved).toEqual(fromAlice.saved);
    expect(fromDave.saved.map((item) => item.snapshotVersion)).toEqual([
      "ba9876543210",
      "0123456789ab",
      NO_SUCH_SNAPSHOT,
    ]);
    expect(fromDave.plan).toEqual(fromAlice.plan);
    expect(fromDave.profile).toEqual(ALICE_EDITED_PROFILE);
    expect(await storedVersions(dave)).toEqual(await storedVersions(alice));

    const { document: again } = await exportOf(dave);
    expect(withoutCreatedAt(again)).toEqual(withoutCreatedAt(document));
    expect(again.checklistProgress.map(({ doneAt: _doneAt, ...tick }) => tick)).toEqual(
      document.checklistProgress.map(({ doneAt: _doneAt, ...tick }) => tick),
    );
  });

  it("brings the saved programmes of an export whose profile this build cannot read, without a profile", async () => {
    await pool.query(
      `update profiles set data = '{"schemaVersion":99,"future":true}'::jsonb where user_id = $1`,
      [alice.id],
    );
    try {
      const { document } = await exportOf(alice);
      expect(document.profile?.data).toEqual({ schemaVersion: 99, future: true });
      expect(ProfileSchema.safeParse(document.profile?.data).success).toBe(false);

      const payload = payloadFromExport(document);
      expect(payload.profile).toBeNull();
      signedInAs(erin);
      expect(await importer.importGuestData(payload, "auto")).toEqual({
        ok: true,
        value: undefined,
      });

      const imported = await accountOf(erin);
      expect(imported.profile).toBeNull();
      expect(imported.saved.map((item) => [item.slug, item.snapshotVersion])).toEqual(
        SEEDED.map((item) => [item.slug, item.snapshotVersion]),
      );
      expect(await storedVersions(erin)).toEqual(await storedVersions(alice));
    } finally {
      await pool.query("update profiles set data = $2::jsonb where user_id = $1", [
        alice.id,
        JSON.stringify(ALICE_EDITED_PROFILE),
      ]);
    }
  });
});
