# Scholarships Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/[locale]/scholarships`, MVP page 5 of 7: a static list of the 19 published scholarships grouped by destination, each with its amount, coverage, deadline, requirements, documents, how to apply, its programmes, and a SourceBadge on every fact.

**Architecture:** A pure function (`src/lib/scholarships/sections.ts`) turns per-destination shards (scholarships, programmes, institutions) into country sections using the domain's `appliesToProgram`. A build-time loader in `src/lib/snapshot/server.ts` feeds it from `public/snapshots`. Server components render the page; one tiny `"use client"` leaf (`NationalityCheck`) reads the guest profile for nationality-restricted cards. The header gains a fourth item and the home page a link.

**Tech Stack:** Next.js 16 App Router (static), React 19, next-intl, Tailwind v4 logical utilities, Vitest (jsdom per file), Playwright + axe, Biome, pnpm.

Spec: `docs/superpowers/specs/2026-10-07-scholarships-page-design.md` (approved 2026-10-07). Branch: `feat/scholarships-page` (already created; spec committed as `db427605`).

## Global Constraints

Copied from the spec and `.claude/CLAUDE.md`; every task includes them.

- All user-facing strings go through next-intl in `en`, `fr`, `ar` (`ar` is a machine draft). Tailwind logical utilities only (`ms-`, `pe-`, `text-start`), never `ml-`/`pr-`/`left-`.
- Money only through `formatMoney` / `formatMoneyRange` (`src/lib/format.ts`); dates through `formatDate` (DD/MM/YYYY); ICU numbers are plural/select selectors only and displayed numbers are preformatted strings (`formatNumber` from `@/lib/journey/reasons`) so `ar` keeps Latin digits.
- The page is static: `setRequestLocale`, `generateMetadata` with a translated title and description, no `generateStaticParams` of its own (the `[locale]` layout generates the locales and sets `dynamicParams = false`); a file that reads `src/lib/snapshot/server.ts` starts with `import "server-only"`.
- Anything that depends on the clock or the profile is a small `"use client"` leaf with a neutral server placeholder; the static HTML contains no status, freshness or profile claim.
- Client code imports no Zod and nothing runtime from `@/data-schema` (`tests/lib/client-imports.test.ts` enforces it). Existing pages must not import new client code: the client JS ratchet in `tests/e2e/support/js-budget.ts` only goes down, so no existing row is raised and `/scholarships` gets a new row.
- Every fact is shown with `SourceBadge`; a value the sources do not publish is shown as "not published in the sources we read, to check" with no badge, never as a zero or an estimate. Stale data: `SourceBadge` already mounts `FreshnessMark`; no new freshness logic.
- Never edit `data/` or built snapshots. Report data gaps, do not fill them.
- Do NOT touch `next.config.ts`, `src/components/empty-state.tsx`, `src/components/plan/*`, `tests/components/empty-state.test.tsx`, `tests/components/plan/helpers.tsx`. `messages/en.json` and `messages/fr.json` show as modified in `git status` (line-ending flags only, `git diff` is empty); the only allowed edit is additive keys, written with LF endings. Before each commit that includes `messages/*.json`, run `git diff --stat -- messages` and `git diff -- messages | grep '^-' | grep -v '^---'` must print nothing (additions only).
- Stage explicit file paths only (never `git add -A` or a folder). Conventional commits; every commit message ends with the line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Never push to `main`, never force-push.
- Named exports (Next file conventions excepted). No `any`, no `@ts-ignore`, no non-null `!`.

## Environment (this machine)

- Before any `pnpm` or `next` command: `export SWC_NATIVE_BINDING_CACHE='C:\Users\dagda\.swc-cache'` (it does not persist between Bash calls).
- The shell strips backslashes: never write regexes or `\n` through heredocs; use the Edit/Write tools. `rm -rf` is denied.
- The owner's dev server runs on port 3000. Do not stop it. Run `pnpm test:e2e` and `pnpm build` in a separate worktree (`git worktree add ../UniWay-schol -b feat/scholarships-e2e feat/scholarships-page`, then `pnpm install --frozen-lockfile` there) so the dev server's `.next` and `public/snapshots` are not disturbed. After a `pnpm build` in the main checkout, run `pnpm data:build` again.
- Library docs before writing against an API: `MSYS_NO_PATHCONV=1 npx ctx7@latest docs /vercel/next.js/v16.2.9 "<query>"` (or next-intl). The patterns below are already used in the repo; only look things up if a signature fails to compile.
- For all UI work invoke the `impeccable` skill (phone-first, fr LTR and ar RTL, 44 px tap targets).

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/scholarships/sections.ts` (new) | Pure: per-destination inputs to country sections; programme grouping by institution; whole-country detection. No React, no fs. |
| `src/lib/snapshot/server.ts` (modify) | `loadScholarshipsPageData(locale, dir?)`: reads shards, calls `buildSections`, returns text lookup and core. |
| `src/components/scholarships/nationality-check.tsx` (new, client) | Profile-dependent nationality line for restricted cards only. |
| `src/components/scholarships/scholarship-card.tsx` (new, server) | One card: facts, badges, details blocks. |
| `src/components/scholarships/scholarship-programmes.tsx` (new, server) | The programmes `<details>` block. |
| `src/components/scholarships/scholarships-page-view.tsx` (new, server) | Intro, jump row, country sections. |
| `src/app/[locale]/scholarships/page.tsx` (new) | Route: metadata and view. |
| `src/components/program/program-sections.tsx` (modify, 1 word) | Export the existing `sameSource` helper so the card reuses it. |
| `src/components/nav-links.tsx`, `src/components/site-header.tsx` (modify) | Fourth nav item with `prefetch: false`. |
| `src/app/[locale]/page.tsx` (modify) | Home link to the page. |
| `messages/{en,fr,ar}.json` (modify, additive) | `scholarshipsPage` namespace, `nav.scholarships`, `home.scholarshipsCta`. |
| `tests/...` | Mirrors the above, plus `tests/e2e/scholarships.spec.ts`, `tests/e2e/perf.spec.ts` scenario and `tests/e2e/support/js-budget.ts` rows. |

Design decisions the plan fixes (flagged to the owner in the final report):
1. A scholarship listed in several destination shards is rendered once, in the section of the first destination (sorted by code); its programmes are the union over those shards. Anchors stay `#scholarship-<slug>`. Today every real scholarship has one destination.
2. Applicable programmes are computed per shard exactly like the programme page does (programmes of the shard's own country), so the two pages cannot disagree.
3. `howToApply` has no per-fact provenance in the schema, so it is shown with the card's official-page link and no badge of its own.
4. An institution named by a scholarship that is not in the institutions shard is omitted from the "no programme listed yet" line (a slug is never shown as a name).

---

### Task 1: Pure sections builder

**Files:**
- Create: `src/lib/scholarships/sections.ts`
- Test: `tests/lib/scholarships/sections.test.ts`

**Interfaces:**
- Consumes: `appliesToProgram(s: Scholarship, program: Program): boolean` from `@/domain/scholarships`; types `Scholarship`, `Program`, `Institution` from `@/data-schema/resolved`; `CountryCode`, `Slug` from `@/data-schema/primitives`.
- Produces (used by Tasks 2 and 5):
  ```ts
  export type DestinationInput = { country: CountryCode; scholarships: readonly Scholarship[]; programs: readonly Program[]; institutions: readonly Institution[] };
  export type ProgramLink = { slug: Slug; name: string };
  export type InstitutionGroup = { slug: Slug; name: string | null; programs: ProgramLink[] };
  export type ProgramScope =
    | { kind: "country"; count: number }
    | { kind: "institutions"; groups: InstitutionGroup[]; without: string[] };
  export type ScholarshipEntry = { scholarship: Scholarship; scope: ProgramScope };
  export type CountrySection = { country: CountryCode; entries: ScholarshipEntry[] };
  export function buildSections(inputs: readonly DestinationInput[]): CountrySection[];
  ```

- [ ] **Step 1: Write the failing test**

`tests/lib/scholarships/sections.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { Institution } from "@/data-schema/resolved";
import { buildSections, type DestinationInput } from "@/lib/scholarships/sections";

import { meta, program, scholarship } from "../../fixtures/domain/builders";

const inst = (slug: string, name: string, country = "XB"): Institution => ({
  slug,
  name,
  country,
  city: { slug: "xx-test-city", name: "XX City" },
  type: "public",
  website: null,
  fact: meta(),
});

const progIn = (slug: string, institution: string, over: Partial<ReturnType<typeof program>> = {}) =>
  program({ slug, institution, name: `Programme ${slug}`, ...over });

function input(over: Partial<DestinationInput> = {}): DestinationInput {
  return { country: "XB", scholarships: [], programs: [], institutions: [], ...over };
}

describe("buildSections", () => {
  it("returns no section when there is no scholarship", () => {
    expect(buildSections([input()])).toEqual([]);
    expect(buildSections([])).toEqual([]);
  });

  it("counts programmes for a whole-country scholarship instead of listing them", () => {
    const s = scholarship({ slug: "xx-test-sch-all" });
    const sections = buildSections([
      input({
        scholarships: [s],
        programs: [progIn("p1", "i1"), progIn("p2", "i2"), progIn("p3", "i2", { country: "XC" })],
      }),
    ]);
    expect(sections).toHaveLength(1);
    expect(sections[0]?.entries[0]?.scope).toEqual({ kind: "country", count: 2 });
  });

  it("groups programmes by institution for an institution-restricted scholarship", () => {
    const s = scholarship({ slug: "xx-test-sch-r", institutions: ["i2", "i1", "i3"] });
    const [section] = buildSections([
      input({
        scholarships: [s],
        institutions: [inst("i1", "Bravo University"), inst("i2", "Alpha University"), inst("i3", "Charlie College")],
        programs: [
          progIn("p-b", "i2", { name: "B programme" }),
          progIn("p-a", "i2", { name: "A programme" }),
          progIn("p-1", "i1"),
          progIn("p-x", "i9"),
        ],
      }),
    ]);
    const scope = section?.entries[0]?.scope;
    expect(scope?.kind).toBe("institutions");
    if (scope?.kind !== "institutions") return;
    expect(scope.groups.map((g) => [g.slug, g.name])).toEqual([
      ["i2", "Alpha University"],
      ["i1", "Bravo University"],
    ]);
    expect(scope.groups[0]?.programs.map((p) => p.slug)).toEqual(["p-a", "p-b"]);
    // i3 is named but has no programme; i9's programme does not apply
    expect(scope.without).toEqual(["Charlie College"]);
  });

  it("omits a named institution that is not in the institutions shard from `without`", () => {
    const s = scholarship({ slug: "xx-test-sch-r", institutions: ["i-unknown"] });
    const [section] = buildSections([input({ scholarships: [s], programs: [progIn("p1", "i1")] })]);
    expect(section?.entries[0]?.scope).toEqual({ kind: "institutions", groups: [], without: [] });
  });

  it("keeps an explicitly linked programme of another institution in the groups", () => {
    const s = scholarship({ slug: "xx-test-sch-r", institutions: ["i1"] });
    const [section] = buildSections([
      input({
        scholarships: [s],
        institutions: [inst("i1", "One"), inst("i2", "Two")],
        programs: [progIn("p2", "i2", { scholarships: ["xx-test-sch-r"] })],
      }),
    ]);
    const scope = section?.entries[0]?.scope;
    expect(scope?.kind === "institutions" && scope.groups.map((g) => g.slug)).toEqual(["i2"]);
  });

  it("names a group by null when its institution is unknown", () => {
    const s = scholarship({ slug: "xx-test-sch-r", institutions: ["i1"] });
    const [section] = buildSections([input({ scholarships: [s], programs: [progIn("p1", "i1")] })]);
    const scope = section?.entries[0]?.scope;
    expect(scope?.kind === "institutions" && scope.groups[0]?.name).toBeNull();
  });

  it("orders sections by country code and entries by slug", () => {
    const sections = buildSections([
      input({ country: "NL", scholarships: [scholarship({ slug: "xx-b", destinations: ["NL"] }), scholarship({ slug: "xx-a", destinations: ["NL"] })] }),
      input({ country: "DE", scholarships: [scholarship({ slug: "xx-c", destinations: ["DE"] })] }),
    ]);
    expect(sections.map((s) => s.country)).toEqual(["DE", "NL"]);
    expect(sections[1]?.entries.map((e) => e.scholarship.slug)).toEqual(["xx-a", "xx-b"]);
  });

  it("renders a scholarship listed in several shards once, in the first destination, with the union of programmes", () => {
    const s = scholarship({ slug: "xx-multi", destinations: ["XB", "XC"] });
    const sections = buildSections([
      input({ country: "XC", scholarships: [s], programs: [progIn("pc", "ic", { country: "XC" })] }),
      input({ country: "XB", scholarships: [s], programs: [progIn("pb", "ib")] }),
    ]);
    expect(sections).toHaveLength(1);
    expect(sections[0]?.country).toBe("XB");
    expect(sections[0]?.entries).toHaveLength(1);
    expect(sections[0]?.entries[0]?.scope).toEqual({ kind: "country", count: 2 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `export SWC_NATIVE_BINDING_CACHE='C:\Users\dagda\.swc-cache' && pnpm vitest run tests/lib/scholarships/sections.test.ts`
Expected: FAIL, "Cannot find module '@/lib/scholarships/sections'".

- [ ] **Step 3: Write the implementation**

`src/lib/scholarships/sections.ts`:

```ts
import type { CountryCode, Slug } from "@/data-schema/primitives";
import type { Institution, Program, Scholarship } from "@/data-schema/resolved";
import { appliesToProgram } from "@/domain/scholarships";

// Pure view model of the Scholarships page. One destination shard at a time is read exactly as the
// static programme page reads it (programmes of the shard's own country, `appliesToProgram`), so the
// two pages list the same scholarships for the same programme.
export type DestinationInput = {
  country: CountryCode;
  scholarships: readonly Scholarship[];
  programs: readonly Program[];
  institutions: readonly Institution[];
};

export type ProgramLink = { slug: Slug; name: string };
// `name` is null when the institution is not in the institutions shard: a slug is never shown as a name.
export type InstitutionGroup = { slug: Slug; name: string | null; programs: ProgramLink[] };
export type ProgramScope =
  | { kind: "country"; count: number }
  | { kind: "institutions"; groups: InstitutionGroup[]; without: string[] };
export type ScholarshipEntry = { scholarship: Scholarship; scope: ProgramScope };
export type CountrySection = { country: CountryCode; entries: ScholarshipEntry[] };

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

type Accumulator = {
  scholarship: Scholarship;
  country: CountryCode;
  programs: Map<Slug, Program>;
};

function scopeOf(
  scholarship: Scholarship,
  programs: readonly Program[],
  names: ReadonlyMap<Slug, string>,
): ProgramScope {
  const restricted = scholarship.institutions ?? [];
  if (restricted.length === 0) return { kind: "country", count: programs.length };

  const byInstitution = new Map<Slug, ProgramLink[]>();
  for (const p of programs) {
    byInstitution.set(p.institution, [
      ...(byInstitution.get(p.institution) ?? []),
      { slug: p.slug, name: p.name },
    ]);
  }
  const groups: InstitutionGroup[] = [...byInstitution].map(([slug, links]) => ({
    slug,
    name: names.get(slug) ?? null,
    programs: [...links].sort((a, b) => compare(a.name, b.name) || compare(a.slug, b.slug)),
  }));
  groups.sort((a, b) => compare(a.name ?? "", b.name ?? "") || compare(a.slug, b.slug));

  const without = restricted
    .filter((slug) => !byInstitution.has(slug))
    .flatMap((slug) => {
      const name = names.get(slug);
      return name === undefined ? [] : [name];
    })
    .sort(compare);
  return { kind: "institutions", groups, without };
}

export function buildSections(inputs: readonly DestinationInput[]): CountrySection[] {
  const ordered = [...inputs].sort((a, b) => compare(a.country, b.country));
  const names = new Map<Slug, string>();
  const bySlug = new Map<Slug, Accumulator>();

  for (const input of ordered) {
    for (const institution of input.institutions) names.set(institution.slug, institution.name);
    for (const scholarship of input.scholarships) {
      let acc = bySlug.get(scholarship.slug);
      if (acc === undefined) {
        acc = { scholarship, country: input.country, programs: new Map() };
        bySlug.set(scholarship.slug, acc);
      }
      for (const program of input.programs) {
        if (appliesToProgram(scholarship, program)) acc.programs.set(program.slug, program);
      }
    }
  }

  const sections = new Map<CountryCode, ScholarshipEntry[]>();
  for (const acc of bySlug.values()) {
    const entry: ScholarshipEntry = {
      scholarship: acc.scholarship,
      scope: scopeOf(acc.scholarship, [...acc.programs.values()], names),
    };
    sections.set(acc.country, [...(sections.get(acc.country) ?? []), entry]);
  }
  return [...sections]
    .sort(([a], [b]) => compare(a, b))
    .map(([country, entries]) => ({
      country,
      entries: entries.sort((a, b) => compare(a.scholarship.slug, b.scholarship.slug)),
    }));
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm vitest run tests/lib/scholarships/sections.test.ts`
Expected: PASS, 8 tests. Then `pnpm typecheck` and `pnpm lint` (Biome may reformat the long test lines: run `pnpm format` limited to the two new files with `pnpm biome format --write src/lib/scholarships tests/lib/scholarships`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/scholarships/sections.ts tests/lib/scholarships/sections.test.ts
git commit -m "feat: scholarships page sections view model

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Build-time loader

**Files:**
- Modify: `src/lib/snapshot/server.ts` (append after `loadProgramPageData`)
- Test: `tests/lib/snapshot/scholarships-page.test.ts`

**Interfaces:**
- Consumes: `buildSections`, `DestinationInput`, `CountrySection` (Task 1); in `server.ts`: `readBuildSnapshot`, `optionalShard`, `listed`, `programShardsIn`, `createTextLookup`, `shardNames`, `DEFAULT_DIR`.
- Produces:
  ```ts
  export type ScholarshipsPageData = { snapshotVersion: string; sections: CountrySection[]; core: CoreShard; text: TextLookup };
  export function loadScholarshipsPageData(locale: AppLocale, dir?: string): Promise<ScholarshipsPageData>;
  ```

- [ ] **Step 1: Write the failing test**

`tests/lib/snapshot/scholarships-page.test.ts` (same harness as `server.test.ts`):

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadProgramPageData, loadScholarshipsPageData } from "@/lib/snapshot/server";

import { E2E_SCHOLARSHIP_SLUGS, E2E_SLUGS } from "../../fixtures/e2e/profiles";
import { buildSnapshot, E2E_DATA_DIR, EMPTY_DATA_DIR, removeTempDirs } from "./fixture";

let base = "";
let empty = "";

beforeAll(() => {
  base = buildSnapshot(E2E_DATA_DIR);
  empty = buildSnapshot(EMPTY_DATA_DIR);
}, 180_000);
afterAll(removeTempDirs);

describe("loadScholarshipsPageData", () => {
  it("lists the fixture scholarships once each, by country then slug", async () => {
    const data = await loadScholarshipsPageData("fr", base);
    const slugs = data.sections.flatMap((s) => s.entries.map((e) => e.scholarship.slug));
    expect(slugs).toEqual([
      E2E_SCHOLARSHIP_SLUGS.open,
      E2E_SCHOLARSHIP_SLUGS.xaOnly,
      E2E_SCHOLARSHIP_SLUGS.xzOnly,
    ]);
    expect(data.sections.map((s) => s.country)).toEqual(["XB"]);
  });

  it("resolves the summary through the text lookup and the country name through core", async () => {
    const data = await loadScholarshipsPageData("fr", base);
    const open = data.sections[0]?.entries.find((e) => e.scholarship.slug === E2E_SCHOLARSHIP_SLUGS.open);
    expect(data.text(open?.scholarship.summary ?? "")?.text).toBe("Bourse test ouverte a tous");
    const country = data.core.countries.find((c) => c.code === "XB");
    expect(data.text(country?.name ?? "")?.text).toBeTruthy();
  });

  it("counts the same programmes as the programme pages list the scholarship for", async () => {
    const data = await loadScholarshipsPageData("fr", base);
    for (const entry of data.sections.flatMap((s) => s.entries)) {
      let onPages = 0;
      for (const slug of Object.values(E2E_SLUGS)) {
        const page = await loadProgramPageData(slug, "fr", base);
        if (page?.scholarships.some((s) => s.slug === entry.scholarship.slug)) onPages += 1;
      }
      expect(entry.scope, entry.scholarship.slug).toEqual({ kind: "country", count: onPages });
    }
  });

  it("returns no section for a snapshot without scholarships", async () => {
    const data = await loadScholarshipsPageData("fr", empty);
    expect(data.sections).toEqual([]);
  });
});
```

Note: `EMPTY_DATA_DIR` has no `core` shard in some fixtures; if `loadScholarshipsPageData` throws `SnapshotError("format", "core")` for it, change the last test to `await expect(...).rejects.toBeInstanceOf(SnapshotError)` only if `loadProgramPageData` does the same for that directory (check `tests/lib/snapshot/server.test.ts`), otherwise keep as written.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run tests/lib/snapshot/scholarships-page.test.ts`
Expected: FAIL, `loadScholarshipsPageData is not a function`.

- [ ] **Step 3: Write the implementation**

In `src/lib/snapshot/server.ts` add the imports `type CountrySection, buildSections, type DestinationInput` from `@/lib/scholarships/sections`, then append:

```ts
const SCHOLARSHIPS_SHARD = /^scholarships\.([A-Z]{2})$/;

// Everything the Scholarships page renders at build time: no clock, no student. The student's
// nationality and the freshness of a fact are client concerns (NationalityCheck, SourceBadge).
export type ScholarshipsPageData = {
  snapshotVersion: string;
  sections: CountrySection[];
  core: CoreShard;
  text: TextLookup;
};

export async function loadScholarshipsPageData(
  locale: AppLocale,
  dir: string = DEFAULT_DIR,
): Promise<ScholarshipsPageData> {
  const snapshot = await readBuildSnapshot(dir);
  const core = await optionalShard<CoreShard>(snapshot, shardNames.core());
  if (core === undefined) throw new SnapshotError("format", shardNames.core());

  const countries = Object.keys(snapshot.manifest.shards)
    .flatMap((name) => SCHOLARSHIPS_SHARD.exec(name)?.[1] ?? [])
    .sort();
  const programShardNames = programShardsIn(snapshot.manifest);

  const inputs: DestinationInput[] = [];
  const structural = [shardNames.core()];
  for (const country of countries) {
    const scholarships = await optionalShard<ScholarshipsShard>(
      snapshot,
      shardNames.scholarships(country),
    );
    const institutions = await optionalShard<InstitutionsShard>(
      snapshot,
      shardNames.institutions(country),
    );
    const programs = (
      await Promise.all(
        programShardNames
          .filter((p) => p.destination === country)
          .map(async ({ name }) => (await snapshot.shard(name)) as ProgramsShard),
      )
    ).flatMap((shard) => shard.programs);
    inputs.push({
      country,
      scholarships: scholarships?.scholarships ?? [],
      programs,
      institutions: institutions?.institutions ?? [],
    });
    structural.push(shardNames.scholarships(country));
  }

  const textShards = await Promise.all(
    structural
      .map((name) => shardNames.text(locale, name))
      .filter((name) => listed(snapshot, name))
      .map(async (name) => (await snapshot.shard(name)) as TextShard),
  );

  return {
    snapshotVersion: snapshot.manifest.snapshotVersion,
    sections: buildSections(inputs),
    core,
    text: createTextLookup(textShards, locale),
  };
}
```

If `shardNames.scholarships(country)` rejects a plain `string` (it should not: `CountryCode` is `string`), fix the type, not with a cast.

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm vitest run tests/lib/snapshot/scholarships-page.test.ts tests/lib/snapshot/server.test.ts tests/lib/snapshot/server-import-guard.test.ts tests/lib/client-imports.test.ts`
Expected: PASS (the import guard and client-imports tests prove `sections.ts` and `server.ts` respect the boundaries). Then `pnpm typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/snapshot/server.ts tests/lib/snapshot/scholarships-page.test.ts
git commit -m "feat: build-time loader for the scholarships page

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Messages (en, fr, ar)

**Files:**
- Modify: `messages/en.json`, `messages/fr.json`, `messages/ar.json` (additive)
- Create: `tests/i18n/scholarships-messages.test.ts`

**Interfaces:**
- Produces the keys used by Tasks 4 to 6: `nav.scholarships`, `home.scholarshipsCta`, and the `scholarshipsPage` namespace below. Reused existing keys (do not duplicate): `program.scholarships.{provider,noNationalityRestriction,nationals,support.*,covers,cover.*,link}`, `program.overview.institutionUnknown`, `domain.coverage.*`.

- [ ] **Step 1: Write the failing test**

Copy `tests/i18n/compare-messages.test.ts` to `tests/i18n/scholarships-messages.test.ts` and replace every `"compare"` namespace argument with `"scholarshipsPage"` (including the describe title and, if present, the `COMPARE_MESSAGE_NAMESPACES` / `pickMessages` import and its test: delete that one test, the page needs no nested provider). Keep the parity, forbidden-wording and Arabic-digit tests; delete only tests that assert compare-specific wording (the "ranks nothing" test). Add:

```ts
it("never marks a missing value as a figure: the unknown lines say it is to be checked", () => {
  const messages = namespaceMessages(locale, ["scholarshipsPage"]);
  for (const key of ["amount.unknown", "deadline.unknown", "requirements.none", "documents.none", "documents.missing", "howToApply.missing"]) {
    expect(messages.get(`scholarshipsPage.${key}`) ?? messages.get(key), key).toBeTruthy();
  }
});
```
(Adjust the key form to whatever `namespaceMessages` returns; read `tests/i18n/trust-wording.ts` first.)

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run tests/i18n/scholarships-messages.test.ts tests/i18n/messages.test.ts`
Expected: FAIL (namespace absent).

- [ ] **Step 3: Add the keys**

Use Edit with LF endings. `nav` gains `"scholarships"` after `"matches"`; `home` gains `"scholarshipsCta"` after `"matchesCta"`; add a top-level `"scholarshipsPage"` object after `"compare"` (last namespace). Placeholders must be identical in the three locales (`{count}`, `{n}`, `{country}`, `{countries}`, `{institutions}`, `{date}`).

English:

```json
"scholarshipsPage": {
  "meta": {
    "title": "Scholarships for Bachelor's studies in Europe",
    "description": "The scholarships listed on Jisr, with amounts, what they cover, deadlines and official sources."
  },
  "title": "Scholarships",
  "intro": "Scholarships we have listed for Bachelor's students, by country. Each fact shows its source and the date it was checked. Where the sources we read do not publish a value, we say so instead of guessing.",
  "jump": { "label": "Countries" },
  "sectionCount": "{count, plural, one {{n} scholarship} other {{n} scholarships}}",
  "empty": "No scholarship is listed yet.",
  "amount": { "unknown": "Amount: not published in the sources we read, to check" },
  "deadline": {
    "known": "Deadline: {date}",
    "unknown": "Deadline: not published in the sources we read, to check"
  },
  "details": {
    "summary": "Requirements, documents and how to apply",
    "requirements": "Requirements",
    "documents": "Required documents",
    "howToApply": "How to apply"
  },
  "requirements": { "none": "No requirement is published in the sources we read, to check." },
  "documents": {
    "none": "No document is listed in the source we reviewed, to check.",
    "missing": "The list of documents is not published, to check."
  },
  "howToApply": { "missing": "How to apply is not published, to check." },
  "programmes": {
    "summary": "Programmes it applies to",
    "country": "{count, plural, one {Applies to {n} programme in {country}.} other {Applies to {n} programmes in {country}.}} Conditions and participating institutions are on the official page.",
    "matchesLink": "See my matches",
    "without": "No programme is listed yet for: {institutions}",
    "none": "No programme is listed yet for this scholarship."
  },
  "nationality": {
    "open": "Open to your nationality",
    "closed": "Not open to your nationality (for nationals of: {countries})",
    "noProfile": "Create your profile to check your nationality",
    "caveat": "Based on the published nationality rule only. Check the other conditions on the official page."
  }
}
```
with `"nav.scholarships": "Scholarships"` and `"home.scholarshipsCta": "Browse scholarships"`.

French:

```json
"scholarshipsPage": {
  "meta": {
    "title": "Bourses d'études pour la licence en Europe",
    "description": "Les bourses répertoriées sur Jisr, avec montants, ce qu'elles couvrent, dates limites et sources officielles."
  },
  "title": "Bourses",
  "intro": "Les bourses que nous avons répertoriées pour les études de licence, par pays. Chaque information indique sa source et la date de sa vérification. Quand les sources que nous avons lues ne publient pas une valeur, nous l'indiquons au lieu de deviner.",
  "jump": { "label": "Pays" },
  "sectionCount": "{count, plural, one {{n} bourse} other {{n} bourses}}",
  "empty": "Aucune bourse n'est répertoriée pour le moment.",
  "amount": { "unknown": "Montant : non publié dans les sources que nous avons lues, à vérifier" },
  "deadline": {
    "known": "Date limite : {date}",
    "unknown": "Date limite : non publiée dans les sources que nous avons lues, à vérifier"
  },
  "details": {
    "summary": "Conditions, pièces et démarche",
    "requirements": "Conditions",
    "documents": "Pièces demandées",
    "howToApply": "Comment candidater"
  },
  "requirements": { "none": "Aucune condition n'est publiée dans les sources que nous avons lues, à vérifier." },
  "documents": {
    "none": "Aucune pièce n'est listée dans la source consultée, à vérifier.",
    "missing": "La liste des pièces n'est pas publiée, à vérifier."
  },
  "howToApply": { "missing": "La démarche n'est pas publiée, à vérifier." },
  "programmes": {
    "summary": "Programmes concernés",
    "country": "{count, plural, one {Concerne {n} programme en {country}.} other {Concerne {n} programmes en {country}.}} Les conditions et les établissements participants figurent sur la page officielle.",
    "matchesLink": "Voir mes résultats",
    "without": "Aucun programme n'est listé pour le moment pour : {institutions}",
    "none": "Aucun programme n'est encore listé pour cette bourse."
  },
  "nationality": {
    "open": "Ouverte à votre nationalité",
    "closed": "Non ouverte à votre nationalité (réservée aux ressortissants de : {countries})",
    "noProfile": "Créez votre profil pour vérifier votre nationalité",
    "caveat": "D'après la règle de nationalité publiée seulement. Vérifiez les autres conditions sur la page officielle."
  }
}
```
with `"nav.scholarships": "Bourses"` and `"home.scholarshipsCta": "Voir les bourses"`.

Arabic (Modern Standard Arabic, machine draft):

```json
"scholarshipsPage": {
  "meta": {
    "title": "منح دراسية لمرحلة الإجازة في أوروبا",
    "description": "المنح المدرجة في جسر، مع المبالغ وما تغطيه والمواعيد النهائية والمصادر الرسمية."
  },
  "title": "المنح",
  "intro": "المنح التي أدرجناها لطلبة الإجازة، حسب البلد. تعرض كل معلومة مصدرها وتاريخ التحقق منها. وعندما لا تنشر المصادر التي قرأناها قيمة ما، نذكر ذلك بدل التخمين.",
  "jump": { "label": "البلدان" },
  "sectionCount": "{count, plural, one {منحة واحدة} two {منحتان} few {{n} منح} many {{n} منحة} other {{n} منحة}}",
  "empty": "لا توجد منحة مدرجة حاليا.",
  "amount": { "unknown": "المبلغ: غير منشور في المصادر التي قرأناها، يجب التحقق منه" },
  "deadline": {
    "known": "الموعد النهائي: {date}",
    "unknown": "الموعد النهائي: غير منشور في المصادر التي قرأناها، يجب التحقق منه"
  },
  "details": {
    "summary": "الشروط والوثائق وطريقة التقديم",
    "requirements": "الشروط",
    "documents": "الوثائق المطلوبة",
    "howToApply": "كيفية التقديم"
  },
  "requirements": { "none": "لا يوجد شرط منشور في المصادر التي قرأناها، يجب التحقق منه." },
  "documents": {
    "none": "لا توجد وثائق مدرجة في المصدر الذي راجعناه، يجب التحقق منها.",
    "missing": "قائمة الوثائق غير منشورة، يجب التحقق منها."
  },
  "howToApply": { "missing": "طريقة التقديم غير منشورة، يجب التحقق منها." },
  "programmes": {
    "summary": "البرامج المعنية",
    "country": "{count, plural, one {تنطبق على برنامج واحد في {country}.} two {تنطبق على برنامجين في {country}.} few {تنطبق على {n} برامج في {country}.} many {تنطبق على {n} برنامجا في {country}.} other {تنطبق على {n} برنامج في {country}.}} الشروط والمؤسسات المشاركة في الصفحة الرسمية.",
    "matchesLink": "عرض نتائجي",
    "without": "لا يوجد برنامج مدرج حاليا لـ: {institutions}",
    "none": "لا يوجد برنامج مدرج لهذه المنحة بعد."
  },
  "nationality": {
    "open": "مفتوحة لجنسيتك",
    "closed": "غير مفتوحة لجنسيتك (مخصصة لمواطني: {countries})",
    "noProfile": "أنشئ ملفك الشخصي للتحقق من جنسيتك",
    "caveat": "اعتمادا على قاعدة الجنسية المنشورة فقط. تحقق من الشروط الأخرى في الصفحة الرسمية."
  }
}
```
with `"nav.scholarships": "المنح"` and `"home.scholarshipsCta": "تصفّح المنح"`.

If the forbidden-wording test rejects a phrase (for example "Open to your nationality" as a promise of eligibility), reword to a hedged form ("Matches your nationality: check the other conditions") in all three locales and keep the caveat line; do not weaken the test.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run tests/i18n && git diff --stat -- messages && git diff -- messages | grep '^-' | grep -v '^---'`
Expected: tests PASS; the last command prints nothing (additions only). If `git diff` shows whole-file changes, convert the file's line endings back to LF (`file messages/en.json` must not say "CRLF").

- [ ] **Step 5: Commit**

```bash
git add messages/en.json messages/fr.json messages/ar.json tests/i18n/scholarships-messages.test.ts
git commit -m "feat: scholarships page messages (en, fr, ar draft)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: NationalityCheck client leaf

**Files:**
- Create: `src/components/scholarships/nationality-check.tsx`
- Test: `tests/components/scholarships/nationality-check.test.tsx`

**Interfaces:**
- Consumes: `useProfile` from `@/lib/profile/use-profile` (`state.status`: `"unhydrated" | "none" | "reset" | "ok"`, with `state.profile.nationality`); locale-aware `Link` from `@/i18n/navigation`.
- Produces:
  ```ts
  export type NationalityCheckLabels = { open: string; closed: string; noProfile: string; caveat: string };
  export function NationalityCheck(props: { eligible: readonly string[]; labels: NationalityCheckLabels }): JSX.Element;
  ```
  Renders `<p data-testid="nationality-check" data-state="placeholder|open|closed|none">`. Strings arrive as props (no message provider), `closed` is already formatted with the country names.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { act, cleanup, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { NationalityCheck } from "@/components/scholarships/nationality-check";
import { profileStore } from "@/lib/profile/store";

import { profile } from "../../fixtures/domain/builders";
import { IntlWrapper, renderIntl } from "../intl";

const labels = {
  open: "Ouverte à votre nationalité",
  closed: "Non ouverte à votre nationalité (réservée aux ressortissants de : Maroc)",
  noProfile: "Créez votre profil pour vérifier votre nationalité",
  caveat: "D'après la règle de nationalité publiée seulement.",
};

afterEach(() => {
  cleanup();
  profileStore.clear();
  window.localStorage.clear();
});

describe("NationalityCheck", () => {
  it("renders only a neutral placeholder on the server", () => {
    const html = renderToString(
      <IntlWrapper locale="fr">
        <NationalityCheck eligible={["MA"]} labels={labels} />
      </IntlWrapper>,
    );
    expect(html).toContain('data-state="placeholder"');
    for (const text of Object.values(labels)) expect(html).not.toContain(text);
  });

  it("invites the student to create a profile when none is stored", async () => {
    renderIntl(<NationalityCheck eligible={["MA"]} labels={labels} />);
    const link = await screen.findByRole("link", { name: labels.noProfile });
    expect(link.getAttribute("href")).toBe("/fr/profile");
    expect(screen.getByTestId("nationality-check").getAttribute("data-state")).toBe("none");
  });

  it("says the scholarship is open when the nationality is listed", async () => {
    renderIntl(<NationalityCheck eligible={["MA"]} labels={labels} />);
    act(() => {
      profileStore.save(profile({ nationality: "MA" }));
    });
    expect(await screen.findByText(labels.open)).toBeTruthy();
    expect(screen.getByText(labels.caveat)).toBeTruthy();
    expect(screen.getByTestId("nationality-check").getAttribute("data-state")).toBe("open");
  });

  it("says it is not open when the nationality is not listed", async () => {
    renderIntl(<NationalityCheck eligible={["MA"]} labels={labels} />);
    act(() => {
      profileStore.save(profile({ nationality: "XA" }));
    });
    expect(await screen.findByText(labels.closed)).toBeTruthy();
    expect(screen.getByTestId("nationality-check").getAttribute("data-state")).toBe("closed");
  });

  it("treats a reset (invalid stored) profile like no profile", async () => {
    window.localStorage.setItem("jisr.profile", "{not json");
    renderIntl(<NationalityCheck eligible={["MA"]} labels={labels} />);
    expect(await screen.findByRole("link", { name: labels.noProfile })).toBeTruthy();
  });
});
```
If the `profile` builder does not accept `nationality`, read `tests/fixtures/domain/builders.ts` and pass the field it does accept. If `profileStore.save` rejects the builder's profile, use `E2E_PROFILE`-style `ProfileSchema.parse`.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/components/scholarships/nationality-check.test.tsx`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the implementation**

```tsx
"use client";

// Client leaf: the only profile-dependent part of the Scholarships page. The server HTML holds a
// neutral, height-reserving placeholder; the nationality is read from this device after mount.
// It judges the published nationality rule only and says so (no other eligibility claim).
import { CircleCheck, CircleHelp, CircleX } from "lucide-react";

import { Link } from "@/i18n/navigation";
import { useProfile } from "@/lib/profile/use-profile";

export type NationalityCheckLabels = {
  open: string;
  closed: string;
  noProfile: string;
  caveat: string;
};

export function NationalityCheck({
  eligible,
  labels,
}: {
  eligible: readonly string[];
  labels: NationalityCheckLabels;
}) {
  const { state } = useProfile();

  if (state.status === "unhydrated") {
    return <p data-testid="nationality-check" data-state="placeholder" className="min-h-6" />;
  }
  if (state.status !== "ok") {
    return (
      <p
        data-testid="nationality-check"
        data-state="none"
        className="flex items-start gap-2 text-base"
      >
        <CircleHelp aria-hidden="true" className="mt-[0.2rem] size-4 shrink-0" />
        <Link href="/profile" className="min-h-11 text-primary underline underline-offset-4">
          {labels.noProfile}
        </Link>
      </p>
    );
  }

  const open = eligible.includes(state.profile.nationality);
  const Icon = open ? CircleCheck : CircleX;
  return (
    <div data-testid="nationality-check" data-state={open ? "open" : "closed"} className="flex flex-col gap-1">
      <p className="flex items-start gap-2 text-base font-medium">
        <Icon aria-hidden="true" className="mt-[0.2rem] size-4 shrink-0" />
        <span>{open ? labels.open : labels.closed}</span>
      </p>
      <p className="text-sm text-muted-foreground">{labels.caveat}</p>
    </div>
  );
}
```
Make the `<Link>` meet the 44 px tap target (`inline-flex min-h-11 items-center`); refine visually in Task 5 with the `impeccable` skill.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run tests/components/scholarships/nationality-check.test.tsx tests/lib/client-imports.test.ts` then `pnpm typecheck && pnpm lint`.
Expected: PASS. (`client-imports` proves no Zod reached the leaf.)

- [ ] **Step 5: Commit**

```bash
git add src/components/scholarships/nationality-check.tsx tests/components/scholarships/nationality-check.test.tsx
git commit -m "feat: nationality check leaf for restricted scholarships

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Card, programmes block, page view and route

**Files:**
- Modify: `src/components/program/program-sections.tsx` (change `function sameSource` to `export function sameSource`, nothing else)
- Create: `src/components/scholarships/scholarship-card.tsx`, `src/components/scholarships/scholarship-programmes.tsx`, `src/components/scholarships/scholarships-page-view.tsx`, `src/app/[locale]/scholarships/page.tsx`
- Test: `tests/components/scholarships/scholarships-page-view.test.tsx`, `tests/app/scholarships-page.test.tsx`

**Interfaces:**
- Consumes: Tasks 1 to 4 (`ScholarshipsPageData`, `ScholarshipEntry`, `ProgramScope`, `NationalityCheck`, message keys), `SourceBadge`, `ExternalLink`, `LocalizedDataText`, `describeRule`, `describeCoverage`, `formatMoneyRange`, `formatDate`, `formatList`, `formatNumber`.
- Produces: `ScholarshipsPageView({ data, locale })`, the route default export, `generateMetadata`. Test ids: `scholarship-card`, `scholarship-eligibility`, `scholarship-amount`, `scholarship-deadline`, `scholarship-programmes`, `scholarship-section`.

Invoke the `impeccable` skill before writing this task's UI: phone-first (343 px), 44 px tap targets on `<summary>` and links, calm hierarchy, logical utilities only, no colour-only meaning. The code below is the structural baseline; styling may be refined, structure and test ids may not.

- [ ] **Step 1: Write the failing tests**

`tests/components/scholarships/scholarships-page-view.test.tsx` renders the view with hand-built data (no snapshot): use `scholarship`, `program`, `meta`, `fact` builders and `createTextLookup`-free stubs (`text: (key) => ({ text: key, note: "none" })`), `core: { kind: "core", countries: [{ code: "XB", name: "countries/xb#name", currency: "XTS" }], fields: [], subjects: [], languageCertificates: [], gradingScales: [], gradeConversions: [], credentialTypes: [], applicationChannels: [] }`, wrapped in `NextIntlClientProvider` with the full `fr` catalogue exactly like `tests/app/program-page.test.tsx`. Cases, each asserting visible text via `renderToString` + jsdom `container.innerHTML` or Testing Library:

```tsx
it("shows the amount through formatMoneyRange with the period, and a badge", ...)      // support.value.amount {min:30000,max:30000,currency:"EUR",per:"month"}: text contains "300", data-testid="scholarship-amount"; the card contains one [data-slot="source-badge"] per distinct source
it("says the amount is not published when amount is null, with no badge for it", ...)    // text = messages.scholarshipsPage.amount.unknown; no source-badge inside [data-testid="scholarship-amount"]
it("says the deadline is not published when the deadline is null", ...)
it("shows a published deadline as DD/MM/YYYY in a <time>", ...)                          // 2027-03-01 -> 01/03/2027
it("prints nothing for an empty covers list", ...)
it("renders the neutral nationality placeholder, no claim, for a restricted scholarship", ...) // data-state="placeholder"; absent for an unrestricted one, which shows program.scholarships.noNationalityRestriction
it("lists programmes grouped by institution with links to /fr/programs/<slug>", ...)
it("shows the count and one link to My matches for a whole-country scholarship, no programme list", ...)
it("shows the 'no programme listed yet' line for an institution without programmes", ...)
it("shows a single badge when support and deadline share a source", ...)
it("anchors each card at #scholarship-<slug> and the jump row links to each country section", ...)
it("renders the empty message when there is no section", ...)
```
Write each with concrete builder data (the first two are fully determined by the builders; assert against `catalogs.fr` strings so a copy change does not break the test, as `program-page.test.tsx` does).

`tests/app/scholarships-page.test.tsx` mocks `@/lib/snapshot/server` like `program-page.test.tsx` (build the fixture snapshot with `buildFixtureSnapshot`, redirect `loadScholarshipsPageData` to that dir), renders the page for `fr` and `ar`, and asserts the static HTML (a) contains the three fixture scholarship names, (b) contains `data-state="placeholder"` for `xx-test-schol-xa` and `xx-test-schol-xz`, (c) contains none of the three `nationality.*` strings and none of the `freshness` strings, (d) has exactly one `<h1>`, (e) `generateMetadata` returns the translated title and description.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run tests/components/scholarships tests/app/scholarships-page.test.tsx`
Expected: FAIL, modules not found.

- [ ] **Step 3: Write the implementation**

`program-sections.tsx`: change `function sameSource(` to `export function sameSource(`.

`src/components/scholarships/scholarship-programmes.tsx`:

```tsx
import "server-only";

import { useLocale, useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { formatNumber } from "@/lib/journey/reasons";
import type { ProgramScope } from "@/lib/scholarships/sections";

export function ScholarshipProgrammes({ scope, countryName }: { scope: ProgramScope; countryName: string }) {
  const locale = useLocale();
  const t = useTranslations("scholarshipsPage.programmes");
  const tProgram = useTranslations("program.overview");

  return (
    <details data-testid="scholarship-programmes" className="group border-t border-border py-1">
      <summary className="flex min-h-11 cursor-pointer items-center text-base font-medium">
        {t("summary")}
      </summary>
      <div className="flex flex-col gap-3 pb-3">
        {scope.kind === "country" ? (
          <>
            <p className="max-w-prose text-base">
              {t("country", {
                count: scope.count,
                n: formatNumber(scope.count, locale) ?? String(scope.count),
                country: countryName,
              })}
            </p>
            <Link href="/matches" prefetch={false} className="min-h-11 w-fit text-base text-primary underline underline-offset-4">
              {t("matchesLink")}
            </Link>
          </>
        ) : (
          <>
            {scope.groups.length === 0 && scope.without.length === 0 ? (
              <p className="text-base text-muted-foreground">{t("none")}</p>
            ) : null}
            {scope.groups.map((group) => (
              <div key={group.slug} className="flex flex-col gap-1">
                <p className="text-base font-medium">
                  {group.name === null ? tProgram("institutionUnknown") : <bdi>{group.name}</bdi>}
                </p>
                <ul className="flex flex-col">
                  {group.programs.map((program) => (
                    <li key={program.slug}>
                      <Link
                        href={`/programs/${program.slug}`}
                        prefetch={false}
                        className="inline-flex min-h-11 items-center text-base text-primary underline underline-offset-4"
                      >
                        <bdi>{program.name}</bdi>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {scope.without.length === 0 ? null : (
              <p className="text-base text-muted-foreground">
                {t("without", { institutions: scope.without.join(", ") })}
              </p>
            )}
          </>
        )}
      </div>
    </details>
  );
}
```
Use `formatList(scope.without, "conjunction", locale)` instead of `join(", ")` (as `program-sections.tsx` does with `formatList` from `@/lib/journey/reasons`) so Arabic gets its own conjunction; fall back to the empty string when it returns null.

`src/components/scholarships/scholarship-card.tsx`:

```tsx
import "server-only";

import { CircleHelp } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { ExternalLink } from "@/components/external-link";
import { LocalizedDataText } from "@/components/localized-data-text";
import { sameSource } from "@/components/program/program-sections";
import { SourceBadge } from "@/components/source-badge";
import type { Scholarship } from "@/data-schema/resolved";
import { formatDate, formatMoneyRange } from "@/lib/format";
import { formatList, type Params } from "@/lib/journey/reasons";
import { describeCoverage, describeRule } from "@/lib/journey/requirements";
import type { ScholarshipEntry } from "@/lib/scholarships/sections";
import type { ScholarshipsPageData } from "@/lib/snapshot/server";

import { NationalityCheck } from "./nationality-check";
import { ScholarshipProgrammes } from "./scholarship-programmes";

function ToCheck({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-base text-muted-foreground">
      <CircleHelp aria-hidden="true" className="mt-[0.2rem] size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export function ScholarshipCard({
  entry,
  data,
  countryName,
}: {
  entry: ScholarshipEntry;
  data: ScholarshipsPageData;
  countryName: string;
}) {
  const locale = useLocale();
  const t = useTranslations("scholarshipsPage");
  const tProg = useTranslations("program.scholarships");
  const tDomain = useTranslations() as unknown as (key: string, params?: Params) => string;
  const { scholarship, scope } = entry;

  const support = scholarship.support.value;
  const amount = support?.amount ?? null;
  const covers = formatList((support?.covers ?? []).map((cover) => tProg(`cover.${cover}`)), "conjunction", locale);
  const deadline = scholarship.deadline.value;
  const sharedSource = sameSource(scholarship.support, scholarship.deadline);
  const countryNames = (codes: readonly string[]) =>
    formatList(
      codes.map((code) => {
        const country = data.core.countries.find((c) => c.code === code);
        return (country === undefined ? undefined : data.text(country.name)?.text) ?? code;
      }),
      "disjunction",
      locale,
    );
  const restricted = scholarship.eligibleNationalities;
  const nationals = countryNames(restricted);
  const context = { locale, core: data.core, text: data.text };
  const { requirements, documents } = scholarship;
  const summary = data.text(scholarship.summary);
  const howTo = data.text(scholarship.howToApply);

  return (
    <li
      id={`scholarship-${scholarship.slug}`}
      data-testid="scholarship-card"
      className="flex scroll-mt-6 flex-col gap-3 py-5"
    >
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold text-balance">
          <bdi>{scholarship.name}</bdi>
        </h3>
        <p className="text-sm text-muted-foreground">{tProg("provider", { provider: scholarship.provider })}</p>
      </div>

      <div data-testid="scholarship-eligibility" className="flex flex-col gap-1.5">
        <p className="text-base font-medium">
          {nationals === null ? tProg("noNationalityRestriction") : tProg("nationals", { countries: nationals })}
        </p>
        {nationals === null ? null : (
          <NationalityCheck
            eligible={restricted}
            labels={{
              open: t("nationality.open"),
              closed: t("nationality.closed", { countries: nationals }),
              noProfile: t("nationality.noProfile"),
              caveat: t("nationality.caveat"),
            }}
          />
        )}
      </div>

      {summary === undefined ? null : (
        <p className="max-w-prose text-base">
          <LocalizedDataText value={summary} />
        </p>
      )}

      <div data-testid="scholarship-amount" className="flex flex-col gap-1.5">
        {amount === null ? (
          <ToCheck>{t("amount.unknown")}</ToCheck>
        ) : (
          <p className="text-base">
            {tProg.rich(`support.${amount.per}`, {
              amount: formatMoneyRange(amount.min, amount.max, amount.currency, locale),
              money: (chunks) => (
                <bdi dir="ltr" className="font-semibold tabular-nums">
                  {chunks}
                </bdi>
              ),
            })}
          </p>
        )}
        {covers === null ? null : <p className="text-base">{tProg("covers", { items: covers })}</p>}
        {amount === null && covers === null ? null : <SourceBadge meta={scholarship.support} />}
      </div>

      <div data-testid="scholarship-deadline" className="flex flex-col gap-1.5">
        {deadline === null ? (
          <ToCheck>{t("deadline.unknown")}</ToCheck>
        ) : (
          <>
            <p className="text-base">
              <bdi>
                <time dateTime={deadline}>{t("deadline.known", { date: formatDate(deadline, locale) })}</time>
              </bdi>
            </p>
            {sharedSource && amount !== null ? null : <SourceBadge meta={scholarship.deadline} />}
          </>
        )}
      </div>

      <ExternalLink href={scholarship.officialUrl} className="min-h-11 w-fit text-base md:min-h-8">
        {tProg("link")}
      </ExternalLink>

      <details className="group border-t border-border py-1">
        <summary className="flex min-h-11 cursor-pointer items-center text-base font-medium">
          {t("details.summary")}
        </summary>
        <div className="flex flex-col gap-5 pb-3">
          <section className="flex flex-col gap-2">
            <h4 className="text-base font-semibold">{t("details.requirements")}</h4>
            {requirements.rules.length === 0 ? (
              <ToCheck>{t("requirements.none")}</ToCheck>
            ) : (
              <>
                {requirements.coverage === "partial" ? (
                  <p className="max-w-prose text-base text-muted-foreground">{tDomain(describeCoverage(requirements).key)}</p>
                ) : null}
                <ul className="divide-y divide-border border-y border-border">
                  {requirements.rules.map((rule) => {
                    const view = describeRule(rule, context);
                    return (
                      <li key={rule.id} className="flex flex-col gap-1.5 py-3">
                        <p className="text-sm font-medium text-muted-foreground">{tDomain(view.kindKey, view.params)}</p>
                        <p className="max-w-prose text-base">{tDomain(view.key, view.params)}</p>
                        {view.details.map((detail) => (
                          <p key={detail.key} className="max-w-prose text-base">
                            {tDomain(detail.key, detail.params)}
                          </p>
                        ))}
                        {view.note === undefined ? null : (
                          <p className="max-w-prose text-base">
                            <LocalizedDataText value={{ text: view.note.text, note: view.note.textNote }} />
                          </p>
                        )}
                        <SourceBadge meta={view.fact} />
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h4 className="text-base font-semibold">{t("details.documents")}</h4>
            {documents.value === null ? (
              <ToCheck>{t("documents.missing")}</ToCheck>
            ) : documents.value.length === 0 ? (
              <ToCheck>{t("documents.none")}</ToCheck>
            ) : (
              <>
                <ul className="flex flex-col gap-1">
                  {documents.value.map((doc) => (
                    <li key={doc.slug} className="text-base">
                      <LocalizedDataText value={data.text(doc.name)} fallback={<bdi>{doc.slug}</bdi>} />
                    </li>
                  ))}
                </ul>
                <SourceBadge meta={documents} />
              </>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h4 className="text-base font-semibold">{t("details.howToApply")}</h4>
            {howTo === undefined ? (
              <ToCheck>{t("howToApply.missing")}</ToCheck>
            ) : (
              <p className="max-w-prose text-base">
                <LocalizedDataText value={howTo} />
              </p>
            )}
          </section>
        </div>
      </details>

      <ScholarshipProgrammes scope={scope} countryName={countryName} />
    </li>
  );
}
```

The `sharedSource && amount !== null` guard on the deadline badge keeps one badge when both facts share a source and the support badge was shown; if the amount block rendered no badge (null amount and no covers) the deadline badge must still show, which the guard already does (`amount === null` makes the condition false). Verify with the "single badge" and "null amount" tests.

`src/components/scholarships/scholarships-page-view.tsx`:

```tsx
import "server-only";

import { useLocale, useTranslations } from "next-intl";

import type { AppLocale } from "@/i18n/routing";
import { formatNumber } from "@/lib/journey/reasons";
import type { ScholarshipsPageData } from "@/lib/snapshot/server";

import { ScholarshipCard } from "./scholarship-card";

export function ScholarshipsPageView({ data }: { data: ScholarshipsPageData; locale: AppLocale }) {
  const locale = useLocale();
  const t = useTranslations("scholarshipsPage");
  const nameOf = (code: string) => {
    const country = data.core.countries.find((c) => c.code === code);
    return (country === undefined ? undefined : data.text(country.name)?.text) ?? code;
  };
  const countLabel = (count: number) =>
    t("sectionCount", { count, n: formatNumber(count, locale) ?? String(count) });

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-balance">{t("title")}</h1>
        <p className="max-w-prose text-base text-muted-foreground">{t("intro")}</p>
      </header>

      {data.sections.length === 0 ? (
        <p className="text-base text-muted-foreground">{t("empty")}</p>
      ) : (
        <>
          <nav aria-label={t("jump.label")}>
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {data.sections.map(({ country, entries }) => (
                <li key={country}>
                  <a href={`#country-${country}`} className="inline-flex min-h-11 items-center text-base text-primary underline underline-offset-4">
                    <bdi>{nameOf(country)}</bdi>
                    <span className="ms-2 text-sm text-muted-foreground">{countLabel(entries.length)}</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          {data.sections.map(({ country, entries }) => (
            <section key={country} id={`country-${country}`} data-testid="scholarship-section" aria-labelledby={`country-${country}-heading`} className="flex scroll-mt-6 flex-col gap-2">
              <h2 id={`country-${country}-heading`} className="flex flex-wrap items-baseline gap-x-3 text-xl font-semibold">
                <bdi>{nameOf(country)}</bdi>
                <span className="text-base font-normal text-muted-foreground">{countLabel(entries.length)}</span>
              </h2>
              <ul className="divide-y divide-border border-y border-border">
                {entries.map((entry) => (
                  <ScholarshipCard key={entry.scholarship.slug} entry={entry} data={data} countryName={nameOf(country)} />
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
```
Drop the unused `locale` prop from the signature if Biome/TS flags it (the view reads `useLocale()`); keep the route call consistent with the final signature.

`src/app/[locale]/scholarships/page.tsx`:

```tsx
import "server-only";

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ScholarshipsPageView } from "@/components/scholarships/scholarships-page-view";
import { routing } from "@/i18n/routing";
import { loadScholarshipsPageData } from "@/lib/snapshot/server";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations({ locale, namespace: "scholarshipsPage.meta" });
  return { title: t("title"), description: t("description") };
}

// Static: generated from public/snapshots at build time. The nationality line and the freshness
// marks are client leaves, so no claim about the student or the clock is in the HTML.
export default async function ScholarshipsPage({ params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const data = await loadScholarshipsPageData(locale);
  return <ScholarshipsPageView data={data} locale={locale} />;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm vitest run tests/components/scholarships tests/app tests/lib/client-imports.test.ts tests/i18n && pnpm typecheck && pnpm lint`
Expected: PASS. If `tDomain(describeCoverage(...).key)` or `tProg(\`cover.${cover}\`)` fails to type-check, route through the same `as unknown as (key, params) => string` cast used in `program-sections.tsx` (documented there).

- [ ] **Step 5: Commit**

```bash
git add src/components/program/program-sections.tsx src/components/scholarships/scholarship-card.tsx src/components/scholarships/scholarship-programmes.tsx src/components/scholarships/scholarships-page-view.tsx "src/app/[locale]/scholarships/page.tsx" tests/components/scholarships/scholarships-page-view.test.tsx tests/app/scholarships-page.test.tsx
git commit -m "feat: scholarships page (static, grouped by destination)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Navigation and home

**Files:**
- Modify: `src/components/nav-links.tsx`, `src/components/site-header.tsx`, `src/app/[locale]/page.tsx`, `tests/components/intl.tsx` (the `shellProps` helper), `tests/components/nav-links.test.tsx`
- Create (if none exists for home): `tests/app/home-page.test.tsx`

**Interfaces:**
- Consumes: message keys `nav.scholarships`, `home.scholarshipsCta` (Task 3).
- Produces: `NavItem` gains `prefetch?: false`; header item order is profile, matches, scholarships, plan.

- [ ] **Step 1: Write the failing tests**

In `tests/components/nav-links.test.tsx` add:

```tsx
it("renders the Scholarships item and never prefetches it", () => {
  navigation.pathname = "/scholarships";
  renderIntl(<NavLinks {...shellProps("fr").nav} />, "fr");
  const link = screen.getByRole("link", { name: "Bourses" });
  expect(link.getAttribute("href")).toBe("/fr/scholarships");
  expect(link.getAttribute("aria-current")).toBe("page");
});
```
and update `shellProps` in `tests/components/intl.tsx`:

```ts
items: [
  { href: "/profile", label: nav.profile },
  { href: "/matches", label: nav.matches },
  { href: "/scholarships", label: nav.scholarships, prefetch: false as const },
  { href: "/plan", label: nav.plan, savedCount: { template: nav.savedCount } },
],
```
Add a prefetch assertion by mocking `Link` is not available; instead assert in the type test that `NavItem["prefetch"]` accepts `false` (the TS compile of `shellProps` does this). For home, in `tests/app/home-page.test.tsx` render `HomePage({ params: Promise.resolve({ locale: "fr" }) })` through `renderToString` inside `IntlWrapper withMessages` (look at `tests/app/not-found.test.tsx` for the server-component pattern) and assert `<a href="/fr/scholarships">` with text `Voir les bourses`.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run tests/components/nav-links.test.tsx tests/app/home-page.test.tsx`
Expected: FAIL (TS error on `prefetch`, missing link).

- [ ] **Step 3: Write the implementation**

`nav-links.tsx`:

```tsx
export type NavItem = {
  href: string;
  label: string;
  savedCount?: { template: string };
  // false: never prefetch this page's code (the link sits on every page; the page is not the likely next step)
  prefetch?: false;
};
```
destructure `{ href, label: itemLabel, savedCount, prefetch: noPrefetch }` and set

```tsx
prefetch={noPrefetch === false || (savedCount !== undefined && count === 0) ? false : undefined}
```

`site-header.tsx`: insert `{ href: "/scholarships", label: tNav("scholarships"), prefetch: false },` between matches and plan.

`src/app/[locale]/page.tsx`: after the `ctaNote` paragraph, inside the CTA grid, add

```tsx
<p className="sm:col-span-2">
  <Link
    href="/scholarships"
    prefetch={false}
    className="inline-flex min-h-11 items-center gap-1 text-base font-medium text-primary underline underline-offset-4"
  >
    {t("scholarshipsCta")}
    <ArrowRight aria-hidden className="size-4 rtl:rotate-180" />
  </Link>
</p>
```

**Header fit at 343 px (acceptance criterion):** run the dev server's `/fr` and `/ar` at `resize_window` 343x800. Measure with `document.documentElement.scrollWidth <= 343` and each nav link's bounding box inside the viewport. The four French labels plus padding are expected to be too wide for one row. Apply, in order, stopping at the first that passes in fr and ar on every page (home, profile, matches, scholarships, plan with a saved program so the badge shows): (1) tighten phone padding `px-2` to `px-1.5` and `gap-2` to `gap-1` in `NavLinks` (keep `min-h-12`); (2) let the list wrap: change the `ul` to `flex flex-wrap gap-x-2` so the fourth item drops to a second row (the nav is already `w-full` on phone); (3) never a horizontally scrolling page. Record the chosen rule and the measured widths in the task report. This changes the shared header, so also run the existing nav and e2e specs.

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm vitest run tests/components tests/app && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/nav-links.tsx src/components/site-header.tsx "src/app/[locale]/page.tsx" tests/components/intl.tsx tests/components/nav-links.test.tsx tests/app/home-page.test.tsx
git commit -m "feat: scholarships in the header and on the home page

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: End-to-end spec, performance row and budget

**Files:**
- Create: `tests/e2e/scholarships.spec.ts`
- Modify: `tests/e2e/perf.spec.ts` (scenario), `tests/e2e/support/js-budget.ts` (two rows plus a dated comment line)

**Interfaces:**
- Consumes: `translatorFor`, `seedProfile`, `E2E_PROFILE`, `E2E_SCHOLARSHIP_SLUGS`, `expectNoSeriousViolations`, `E2E_LOCALES`, the `test` fixture from `./support/fixtures` (clock pinned to `2026-09-30`).

Work in the e2e worktree (see Environment). The fixture data has scholarships `xx-test-schol-open` (no nationality restriction, amount, deadline 2027-03-01, verified 2026-09-01), `xx-test-schol-xa` (XA only) and `xx-test-schol-xz` (XZ only); the seeded `E2E_PROFILE` has nationality `XA`.

- [ ] **Step 1: Write the failing spec**

```ts
import { expectNoSeriousViolations } from "./support/a11y";
import { E2E_PROFILE, E2E_SCHOLARSHIP_SLUGS } from "./support/fixture-data";
import { expect, test } from "./support/fixtures";
import { E2E_LOCALES } from "./support/locales";
import { translatorFor } from "./support/messages";
import { seedProfile } from "./support/seed";

const cardOf = (page: import("@playwright/test").Page, slug: string) => page.locator(`#scholarship-${slug}`);

for (const { locale } of E2E_LOCALES) {
  const t = translatorFor(locale);

  test.describe(`scholarships (${locale})`, () => {
    test("lists the scholarships under their country with one h1 and no serious a11y violation", async ({ page }, testInfo) => {
      await page.goto(`/${locale}/scholarships`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(t("scholarshipsPage.title"));
      for (const slug of Object.values(E2E_SCHOLARSHIP_SLUGS)) await expect(cardOf(page, slug)).toBeVisible();
      await expectNoSeriousViolations(page, `scholarships ${locale}`, testInfo);
    });

    test("shows no horizontal scroll and a reachable header at phone width", async ({ page }) => {
      await page.setViewportSize({ width: 343, height: 800 });
      for (const path of ["", "/profile", "/matches", "/scholarships", "/plan"]) {
        await page.goto(`/${locale}${path}`);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `${path} overflows`).toBeLessThanOrEqual(0);
      }
      await page.goto(`/${locale}/scholarships`);
      const link = page.getByRole("navigation", { name: t("nav.label") }).getByRole("link", { name: t("nav.scholarships") });
      const box = await link.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect((box?.x ?? -1) + (box?.width ?? 0)).toBeLessThanOrEqual(343);
      expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
    });

    test("the nationality line is neutral without a profile, then follows the seeded nationality", async ({ page }) => {
      await page.goto(`/${locale}/scholarships`);
      await expect(cardOf(page, E2E_SCHOLARSHIP_SLUGS.xaOnly).getByRole("link", { name: t("scholarshipsPage.nationality.noProfile") })).toBeVisible();
      await seedProfile(page, E2E_PROFILE); // nationality XA
      await page.goto(`/${locale}/scholarships`);
      await expect(cardOf(page, E2E_SCHOLARSHIP_SLUGS.xaOnly).getByTestId("nationality-check")).toHaveAttribute("data-state", "open");
      await expect(cardOf(page, E2E_SCHOLARSHIP_SLUGS.xzOnly).getByTestId("nationality-check")).toHaveAttribute("data-state", "closed");
      await expect(cardOf(page, E2E_SCHOLARSHIP_SLUGS.open).getByTestId("nationality-check")).toHaveCount(0);
    });

    test("a fact verified long ago carries the stale mark and keeps its source", async ({ page }) => {
      await page.clock.setSystemTime(new Date("2027-06-15T10:00:00.000Z")); // past the 270-day volatile limit of 2026-09-01
      await page.goto(`/${locale}/scholarships`);
      const card = cardOf(page, E2E_SCHOLARSHIP_SLUGS.open);
      await expect(card.locator('[data-freshness="stale"]').first()).toBeVisible();
      await expect(card.locator('[data-slot="source-badge"]').first()).toBeVisible();
    });

    test("opening the programmes block lists links to programme pages", async ({ page }) => {
      await page.goto(`/${locale}/scholarships`);
      const block = cardOf(page, E2E_SCHOLARSHIP_SLUGS.open).getByTestId("scholarship-programmes");
      await block.locator("summary").click();
      await expect(block.getByRole("link", { name: t("scholarshipsPage.programmes.matchesLink") })).toHaveAttribute("href", `/${locale}/matches`);
    });

    test("the card anchor scrolls to the card", async ({ page }) => {
      await page.goto(`/${locale}/scholarships#scholarship-${E2E_SCHOLARSHIP_SLUGS.xzOnly}`);
      await expect(cardOf(page, E2E_SCHOLARSHIP_SLUGS.xzOnly)).toBeInViewport();
    });
  });
}
```
`seedProfile` uses `addInitScript`; call it before the second `goto` only (already so). Fix `import("@playwright/test").Page` to a normal `import type { Page }`. If `translatorFor` cannot resolve `nav.scholarships` it throws, which is the intended strictness.

- [ ] **Step 2: Run to verify it fails**

In the worktree: `export SWC_NATIVE_BINDING_CACHE='C:\Users\dagda\.swc-cache' && pnpm test:e2e tests/e2e/scholarships.spec.ts`
Expected: before Tasks 1 to 6 are merged into the worktree branch it fails with 404; with them merged, it should already pass except where the spec found a bug. Treat any failure as a real finding: fix the cause in the source, not the assertion.

- [ ] **Step 3: Add the perf scenario and the budget rows**

`tests/e2e/perf.spec.ts`: add after the compare scenario

```ts
{
  name: "scholarships",
  route: (locale) => `/${locale}/scholarships`,
  ready: async (page) => {
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  },
},
```
(match the field names of the neighbouring scenarios; `seeded` is optional there, omit it.) Run `pnpm test:e2e tests/e2e/perf.spec.ts` once without a budget row to read the measured initial and until-idle KB for `/fr/scholarships` and `/ar/scholarships`, then add to `JS_BUDGET_KB` in `tests/e2e/support/js-budget.ts`:

```ts
"/fr/scholarships": { initial: <measured initial rounded up + 3>, untilIdle: <measured until idle rounded up + 3> },
"/ar/scholarships": { initial: <same>, untilIdle: <same> },
```
and one dated comment line above the table: `// 2026-10-07 (scholarships page): new page, <initial> KB initial, <until idle> KB until idle (fixture build); ratchet is measured rounded up plus 3 KB. The header's fourth item added <delta> KB to the other rows, all inside their existing values.` Fill the numbers from the run; if any existing row now exceeds its value, do NOT raise it: find the cause (the new nav item must have `prefetch: false`; no existing page may import new client code) and fix that.

- [ ] **Step 4: Run to verify**

Run: `pnpm test:e2e` (whole suite, in the worktree). Expected: all green, including the existing perf rows unchanged.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/scholarships.spec.ts tests/e2e/perf.spec.ts tests/e2e/support/js-budget.ts
git commit -m "test: scholarships e2e, axe, header fit and JS budget row

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Docs, real-data browser check, whole-branch review, PR

**Files:**
- Modify: `.claude/CLAUDE.md` (the architecture block line `scholarships/ (M4)`; the page list sentence), `.claude/docs/architecture.md` (the first-load JS table if it lists pages)
- Verify (no code): real snapshots, browser, gates

- [ ] **Step 1: Update docs**

In `.claude/CLAUDE.md` change `scholarships/ (M4)` in the `src/app/[locale]/` line to `scholarships/ (built)`, and in `.claude/docs/architecture.md` add the page's measured first-load JS from Task 7 to the table if one exists. Keep CLAUDE.md under ~200 lines.

- [ ] **Step 2: Gates on the real data**

In the main checkout (the owner's dev server keeps running): `export SWC_NATIVE_BINDING_CACHE='C:\Users\dagda\.swc-cache'`, then run and show the output of: `pnpm typecheck`, `pnpm lint` (2 pre-existing infos are fine), `pnpm test`, `pnpm data:check`. In the worktree: `pnpm build` then `pnpm perf:js`. After any `pnpm build` in the main checkout run `pnpm data:build`.

- [ ] **Step 3: Real-browser pass (superpowers:verification-before-completion)**

Against `pnpm dev` on port 3000 (real data), with the built-in browser: `/fr/scholarships` and `/ar/scholarships` at phone (375x812, then 343 for the header) and desktop. Verify and note: Deutschlandstipendium (amount EUR 300 per month, no deadline: "to check"), The Hague UAS (EUR 5,000 once), a null-amount Italian record, Stipendium Hungaricum with the nationality leaf in all three states (seed `jisr.profile` through `javascript_tool`: Moroccan profile, other nationality, none), the programmes `<details>` for an Italian record and for Deutschlandstipendium (count and My matches link), RTL layout (ar), tap targets, the header at 343 px on the profile, matches, plan and home pages, and a stale mark (override the browser clock past 2027-07-02 with `javascript_tool` before load, or use the e2e stale test as evidence). Screenshot or read-page evidence goes in the task report.

- [ ] **Step 4: Reviews**

Dispatch the `reviewer` subagent (Opus 5.5, medium) after each of Tasks 1 to 7 (as they finish) and once over the whole branch (`git diff main...feat/scholarships-page`) with the spec and this plan as the brief. Fix every Critical or Important finding, re-run the affected gates, and record skipped findings with the reason.

- [ ] **Step 5: Push and open a draft PR**

```bash
git push -u origin feat/scholarships-page
gh pr create --draft --title "feat: scholarships page" --body "<summary, numbers, data gaps, decisions needed>

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```
Then call `mcp__ccd_pr__get_status`; if it does not report the PR, `mcp__ccd_pr__bind_pr`. Read CI once; do not poll. Never merge, never enable auto-merge.

- [ ] **Step 6: Final report (short)**

What was built; the numbers (first-load JS for `/fr/scholarships` and `/ar/scholarships`, and the header's effect on other rows); data gaps (19 of 19 deadlines null, 17 of 19 amounts missing (7 with only a covers list, 10 with no support data at all), `howToApply` has no provenance of its own, `eligibleNationalities` has no provenance); what the owner must decide next (enrich scholarship data through `data:scholarship verify`; whether programme pages should link to this page; the header-fit rule chosen); the command to see it: `pnpm dev`, then hard refresh with Ctrl+Shift+R on `http://localhost:3000/fr/scholarships`.

---

## Self-review (against the spec)

- Routing, static generation, `server-only`, metadata: Task 5. Reader and `appliesToProgram` parity: Tasks 1 and 2 (parity test).
- Card content, amount/deadline/covers, badges and "to check" lines, shared badge, official link: Task 5. Closed `<details>` for requirements, documents, how to apply and programmes: Task 5.
- Programme grouping, whole-country count, unmatched institution: Tasks 1 and 5.
- Nationality leaf with neutral server placeholder and three states: Task 4 (unit) and Task 7 (e2e).
- Stale handling reusing `SourceBadge`/`FreshnessMark`: Task 5 (no new logic) and Task 7 (e2e with the clock moved).
- Header item, home CTA, 343 px fit, `prefetch: false`: Task 6 and Task 7.
- Messages en/fr/ar, additive, LF: Task 3.
- Tests, JS budget row, gates, real-browser pass in fr/ar at phone and desktop, reviews, draft PR, CI read once: Tasks 7 and 8.
- No placeholders remain except values that can only be read from a run (budget numbers, header-fit rule), which Tasks 7 and 6 say how to obtain; test bodies for the view tests (Task 5) are specified case by case against the builders and must be written in full by the implementer.
- Type consistency: `buildSections`/`DestinationInput`/`CountrySection`/`ScholarshipEntry`/`ProgramScope` (Task 1) are used unchanged in Tasks 2 and 5; `ScholarshipsPageData` (Task 2) in Task 5; `NationalityCheckLabels` (Task 4) matches the `labels` object built in Task 5; message keys in Task 3 match every `t(...)` call in Tasks 4 to 6.
