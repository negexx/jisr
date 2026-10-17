# Bug & correctness audit — 2026-10-17

- **Audited commit:** `f0cc00efed2f74e7e8a816ea59585d7462f4eebe` (main; PR #61 is open but docs-only). Audit window 2026-10-17 → 2026-10-18.
- **Scope:** `src/domain/**` (Part A), `src/lib/**` excluding `src/lib/server` and `src/lib/auth` (Part B), Server Actions + route handlers + `src/proxy.ts` (Part C). Audit track T1, split across three independent readers.
- **Method:** the documented invariants first (`.claude/rules/*.md`, ADR 0005/0009/0010/0013/0014), then code and existing suites; every suspected defect was reduced to a minimal Vitest reproduction run RED against the Windows-built toolchain. No fixes; existing tests untouched. Reproduction specs: `tests/audit-repro/*` on scratch branch `audit/repros-2026-10-17` (not for merge).
- **Headline:** **no S1 (trust-breaking) defect found.** 7 findings: 2 × S3, 5 × S4 — one vacuous-✅ guard gap (T1a-F1), one erasure-completeness gap (T1c-F1), one doc/code drift (T1c-F3), four robustness/edge items. The core integrity machinery — the 2,880-combination match matrix, stale-fact downgrade, cost/`budgetFit` semantics, checklist skip rules, fuzzed sanitizer/Zod parity, snapshot hash + version pinning, and the CAS/race paths enforced by CI — verified sound (each part's "Verified sound" section).

## Findings at a glance

| # | Part | Severity | Title |
|---|---|---|---|
| T1a-F1 | A — domain | S3 | `complete` coverage with zero published rules can read as `satisfied` |
| T1a-F2 | A — domain | S4 | An empty `teachingLanguages` value hides a program on a study-language preference |
| T1a-F3 | A — domain | S4 | An `undefined` route `note` leaks a `note: undefined` key onto the reason |
| T1b-F1 | B — lib | S4 | `readMatchFilters` hands out the shared mutable `EMPTY_MATCH_FILTERS` constant |
| T1c-F1 | C — server | S3 | Account erasure misses a `pending_signups` row for a differently-spelled same mailbox |
| T1c-F2 | C — server | S4 | `accountsGate` and the route handler disagree on the base path under a path-carrying `BETTER_AUTH_URL` |
| T1c-F3 | C — server | S4 | ADR 0013 §3 / D9 prose contradicts the code on refused-resend `consented_at` (doc drift) |

---

## Part A — Domain (`src/domain`)

- **Audited commit:** `f0cc00efed2f74e7e8a816ea59585d7462f4eebe` (main; PR #61 is docs-only)
- **Worktree:** `.worktrees/audit-shared` (branch `audit/scratch-shared`)
- **Scope:** `src/domain/**` and its tests `tests/domain/**`, plus `src/data-schema/staleness.ts` as consumed by the domain. Read-only: no `src/` edits, no fixes.

### Method

Read the load-bearing rules first (`.claude/rules/matching-domain.md`, `.claude/rules/reference-data.md`, ADR 0005/0009/0010/0014, `.claude/docs/conventions.md`, AGENTS.md, prelaunch checklist), then every `src/domain/*.ts` file, every `tests/domain/*.test.ts`, the domain fixtures, and the `src/data-schema` types the domain depends on (`resolved.ts`, `profile.ts`, `dates.ts`, `staleness.ts`, `rules.ts`, `snapshot.ts`, `match-filters.ts`, `records/{program,cost-profile,scholarship,admission-route}.ts`). Traced each documented invariant to the code path that implements it.

- 21 invariant probes in `tests/audit-repro/t1a-domain-probes.test.ts` (all GREEN — they encode the documented behaviour).
- 3 finding reproductions in `tests/audit-repro/t1a-findings.test.ts` (all RED — each asserts the documented behaviour and fails).
- No `Date.now()`, `new Date`, `Math.random` or timezone use in `src/domain` (grep + `tests/domain/boundary.test.ts` canary).

#### Checks run

```
# domain unit suite (subset; full suite / e2e / pipeline left alone — shared worktree)
pnpm exec vitest run tests/domain/match.test.ts tests/domain/rules.test.ts tests/domain/costs.test.ts \
  tests/domain/checklist.test.ts tests/domain/filter.test.ts tests/domain/intakes.test.ts \
  tests/domain/scholarships.test.ts tests/domain/grades.test.ts tests/domain/facts.test.ts \
  tests/domain/tuition.test.ts tests/domain/cefr.test.ts
→ 11 files passed, 422 tests passed

pnpm exec vitest run tests/audit-repro
→ tests/audit-repro/t1a-domain-probes.test.ts: 21 passed
→ tests/audit-repro/t1a-findings.test.ts: 3 failed (RED evidence below)
```

(All commands run through Windows: `cmd.exe /c "cd /d …\.worktrees\audit-shared && set SWC_NATIVE_BINDING_CACHE=…&& pnpm exec vitest run …"`.)

### Findings

#### F1 — A `complete`-coverage program with zero published rules matches as `satisfied` — Severity S3

- **Invariant (ADR 0005 item 10; `.claude/rules/matching-domain.md` line 13/20):** "`coverage: complete` with zero rules is an error … a warning is easy to ignore and would let an empty requirement set read as 'nothing required' and produce ✅" (ADR 0005, alternatives). "`satisfied` only if every published requirement was evaluated and passed"; "no evidence evaluated is never `satisfied`".
- **Evidence:** `src/domain/match.ts:58-69` returns **no** coverage reason when coverage is `complete` and the requirements fact is decisive, regardless of how many rules exist:

  ```ts
  function coverageReason(program: Program, now: IsoDate): Reason | null {
    const { coverage, fact } = program.requirements;
    if (coverage === "complete" && isDecisive(fact, now)) return null;   // <-- no rule-count guard
    …
  }
  ```

  With `rules: []` the only reason left is the route (`match.ts:86-108`), and `aggregateMatchStatus` (`match.ts:23-27`) turns `[pass]` into `satisfied`.
- **Reproduction:** `tests/audit-repro/t1a-findings.test.ts` › F1. RED:

  ```
  AssertionError: expected 'satisfied' to be 'check' // Object.is equality
  Expected: "check"
  Received: "satisfied"
   ❯ tests/audit-repro/t1a-findings.test.ts:27:27
  ```

  (The matching probe in `t1a-domain-probes.test.ts` documents the same current behaviour.)
- **Impact:** Unreachable through a valid snapshot — `data:check` errors on `complete` + zero rules (ADR 0005 item 10, `.claude/rules/reference-data.md` line 15). But the domain is the last trust boundary before the UI: a schema regression, a hand-built/stale snapshot or a future importer that bypasses `data:check` would show ✅ on a program whose requirements were never evaluated. The ADR names exactly this failure mode.
- **Proposed fix (NOT implemented):** in `coverageReason`, also return an unknown reason when `coverage === "complete"` and `program.requirements.rules.length === 0` (e.g. code `coverage_partial`, or a dedicated code), so the vacuous case is `check`.
- **Regression test idea / Effort:** assert `matchProgram` status is `check` for `complete` + `rules: []`; keep a probe that the same program with one passing rule is `satisfied`. S.

#### F2 — An empty `teachingLanguages` value hides a program on a study-language preference — Severity S4

- **Invariant (`.claude/rules/matching-domain.md` line 23):** "a program is hidden only on a definite mismatch (… study language). Unknown, stale or non-official teaching-language data never hides a program."
- **Evidence:** `src/domain/filter.ts:34-43` treats an empty array as a decisive non-match:

  ```ts
  const taught = program.teachingLanguages.value;
  if (
    filters.studyLanguages.length > 0 &&
    taught !== null &&                         // [] passes this guard
    isDecisive(program.teachingLanguages, now) &&
    !taught.some((language) => filters.studyLanguages.includes(language))  // [].some → false → mismatch
  ) {
    mismatches.push("study_language");
  }
  ```

  `null` (unpublished) and stale/non-official are handled; an empty list is not distinguished from a known mismatch.
- **Reproduction:** `tests/audit-repro/t1a-findings.test.ts` › F2. RED:

  ```
  AssertionError: expected [ 'study_language' ] to deeply equal []
  - []
  + [ "study_language" ]
  ```

- **Impact:** The program schema requires `teachingLanguages` `min(1)` (`src/data-schema/records/program.ts:89`), so a valid snapshot cannot carry `[]`; this is a defence-in-depth gap, not a live user-facing bug. It matters only if a producer ever emits an empty list (treated as "no language known" by the rule).
- **Proposed fix (NOT implemented):** require `taught.length > 0` for the mismatch (treat `[]` like `null`).
- **Regression test idea / Effort:** keep the RED test above as the regression; add a case that a decisive non-empty non-overlapping list still hides. S.

#### F3 — An `undefined` route `note` leaks a `note: undefined` key onto the reason — Severity S4

- **Invariant (`.claude/rules/matching-domain.md` line 12; `src/domain/types.ts:47`):** `Reason.note` is optional; `evaluateRule` only sets it when defined (`rules.ts:214`).
- **Evidence:** `src/domain/match.ts:54` guards on `null` instead of on `undefined`:

  ```ts
  if (route.note !== null) reason.note = route.note;
  ```

  An `undefined` note (the type is `TextKey | null`, so only reachable through an untyped caller or a malformed snapshot) sets `reason.note = undefined`, so the reason **has** a `note` key. `evaluateRule` uses `if (raw.note !== undefined)`.
- **Reproduction:** `tests/audit-repro/t1a-findings.test.ts` › F3. RED:

  ```
  AssertionError: expected { Object (ruleId, kind, ...) } to not have property "note"
  ```

- **Impact:** No user-facing effect (`JSON.stringify` drops `undefined`, and the UI reads the note as falsy), but it diverges from the `evaluateRule` guard and from the existing `not.toHaveProperty("note")` assertion intent in `tests/domain/match.test.ts`. Robustness/consistency only.
- **Proposed fix (NOT implemented):** use `if (route.note != null)` (or `!== undefined`).
- **Regression test idea / Effort:** the RED test above. S.

### Verified sound (checks that passed, with evidence)

All assertions below are in `tests/audit-repro/t1a-domain-probes.test.ts` (21 GREEN) or the existing suite (422 GREEN), cross-checked against the rules/ADRs.

- **Match semantics.** `aggregateMatchStatus([]) === "check"`; `satisfied` requires every reason to pass and every fact decisive; `not_satisfied` only from a decisive fail; a decisive fail survives stale siblings (`match.ts:23-27`; `tests/domain/match.test.ts` matrix over 2,880 combinations).
- **Eligibility routes.** `not_eligible`/`foundation` short-circuit and the result holds only the route reason; conditions/rules/coverage are not evaluated (`match.ts:82-84`; probes "short-circuits: only the route reason"). `check` and `missing` still evaluate rules/conditions (probe: route `check` + fresh failing condition ⇒ `not_satisfied`). `resolveRoute` matches origin × credential type × destination × `bachelor` and returns the first match (`route.ts`).
- **Freshness/staleness.** Thresholds from `staleness.ts` evaluated against the passed `now`; boundaries pinned (volatile 119/120/269/270; stable 269/270/544/545; future ⇒ fresh). A stale fact never yields pass/fail (`facts.ts:26-38` `downgrade`; probe: stale `direct`/`not_eligible` route ⇒ `check`). Stale reason codes follow "already-unknown keeps its code" (coverage partial, route_check, route_foundation, missing_student_value, threshold_unpublished). No clock use in `src/domain`.
- **Deadlines.** Past dated deadline ⇒ `closed`, never `upcoming`; a dated upcoming deadline wins over a recurring one; recurring-only ⇒ `recurring` carrying only `{month, day}` and no date (ADR 0009; `intakes.ts`; `tests/domain/intakes.test.ts` 22 tests; probe confirms no date leaks from a recurring status).
- **Grade rules.** Unknown/out-of-range student scale ⇒ `unknown`/`missing_student_value` before any conversion; conversion not reached; `expected` credential downgrades pass/fail to unknown; `modified_bavarian` truncation and the float guard (`grades.ts`; `rules.test.ts` grade rows).
- **`subject_taken`.** Union of listed subjects + track curriculum; pass on the student's list alone; fail only with a known curriculum (including a published-empty one); otherwise `check` (`rules.ts:108-133`; `rules.test.ts`).
- **Language rules.** Empty `acceptedTests` = any certificate; `certificateRequired` null/false/true handled; level below `minCefr` fails before certificate checks; accepted-but-unaccepted certificate ⇒ unknown (`rules.ts:135-167`).
- **Costs.** Exactly 7 `CostLine`s in fixed order (even with no profile); tuition `{min,max}` from the fee bounds with equal ends for a flat fee and `incomeBased` only with `basis: "income_based"`; semester tuition doubles both ends; per-currency totals in first-appearance order with no FX; `complete` = all 7 lines `ok`; `budgetFit` unknown on null budget / incomplete / >1 currency / currency mismatch, otherwise within/straddles/above with the 10-month year applied to monthly lines **and** a monthly budget (`costs.ts`; probes + `tests/domain/costs.test.ts`).
- **Preferences.** `filterPrograms`/`preferenceMismatches` take `MatchFilters`, never the profile; hidden only on a definite destination/field/institution-type/study-language mismatch; unknown (null or empty institution type), stale and non-official teaching language never hide; excluded returned with ordered reasons; budget never a filter (ADR 0014; `filter.ts`; probes).
- **Checklist.** Ten steps in fixed order; `language_exam` skipped only on `certificate_held`/`not_required_by_source` with decisive facts, evaluated route conditions and passing language reasons; `application_account` skipped only with a decisive matching channel; unknown/stale data never skips (probe: every fact stale ⇒ only the empty-scholarship step is skipped) (`checklist.ts`; `tests/domain/checklist.test.ts` 72 tests).
- **Scholarships.** Nationality filter applies to every result including program-linked ones; `appliesToProgram` is the shared predicate (`scholarships.ts:9-25`); a linked scholarship bypasses destination/field/institution but not nationality; results deduped and sorted (probes + `tests/domain/scholarships.test.ts`).
- **Purity.** No mutation of frozen inputs (existing `deepFreeze` tests across match/costs/filter/checklist/rules); no `Date`/`Math.random` in `src/domain`; the Biome import/Date canary (`tests/domain/boundary.test.ts`) covers the boundary.

### Open questions / owner decisions

1. **Should `budgetFit` be `unknown` when a cost line it sums is stale?** Today a stale line still counts toward `complete`, so `budgetFit` can be `within`/`above` from stale cost data. The rules define `budgetFit` only via budget/incomplete/multi-currency/currency (`.claude/rules/matching-domain.md` line 21) and do not list staleness, so this is not a violation — but it is a trust nuance worth an explicit owner ruling (the UI does surface each line's freshness).
2. **Is `satisfied` on a `complete` + zero-rule program acceptable if `data:check` already blocks it?** F1 assumes the domain should fail closed on its own (ADR 0005 item 10's stated rationale). If the owner prefers relying on the data guard alone, F1 can be closed as accepted-risk rather than fixed.
3. **`check`-route short-circuit scope.** A route whose `outcome` is `check` still evaluates its conditions; a fresh failing condition therefore yields `not_satisfied`. This matches the letter of the rule ("only `not_eligible`/`foundation` short-circuit") but is worth confirming, since `check` means the route itself is uncertain.

---

## Part B — Client / data libraries (`src/lib`, excluding `server` and `auth`)

- **Audited commit:** `f0cc00efed2f74e7e8a816ea59585d7462f4eebe` (main; PR #61 is docs-only)
- **Scope:** `src/lib/**` excluding `src/lib/server/**` and `src/lib/auth/**` (other tracks) — the browser snapshot client and build-time reader (`src/lib/snapshot/**`), match filters (`src/lib/matches/**`), profile store/migrations (`src/lib/profile/**`), saved list and plan ticks (`src/lib/saved/**`, `src/lib/plan/**`), the local JSON store, the client account-sync/import/cache layer (`src/lib/account-*`), the journey view models (`src/lib/journey/**`, `src/lib/scholarships/**`), and the Zod-free utilities (`format`, `clock`, `guards`, `constants`, `i18n`, `seo`, `site-env`, `punycode`, `numbeo-links`, `analytics`, `design`).
- **Method:** read each module and its existing tests, trace the data flows (YAML → snapshot → browser domain → view models → stores), then for every suspected defect write a minimal repro under `tests/audit-repro/t1b-*` and run it RED. Disproven suspicions were re-expressed as passing invariant probes (evidence that the documented behaviour holds).
- **Checks run:**
  - `pnpm exec vitest run tests/audit-repro` — my repros: `t1b-findings.test.ts` 1 test failing (F1, intended RED); `t1b-probe.test.ts` 12 tests passing. (The same command also runs other tracks' `t1a-*`/`t1c-*` files in the shared worktree; their failures are out of scope here.)
  - `pnpm exec vitest run tests/lib/matches tests/lib/plan tests/lib/saved tests/lib/local-store.test.ts tests/lib/local-data.test.tsx tests/lib/profile/storage.test.ts tests/lib/profile/draft.test.ts tests/lib/profile/account-profile.test.ts tests/lib/stores/two-tabs.test.ts tests/lib/snapshot/resolve-program-slug.test.ts tests/lib/snapshot/manifest.test.ts tests/lib/snapshot/plan.test.ts` — **18 files, 243 tests, all green** (baseline evidence for the areas below).

### Findings

#### F1 — `readMatchFilters` hands out the shared mutable `EMPTY_MATCH_FILTERS` constant — Severity S4

- **Invariant:** a reader returns a value the caller owns; the exported "empty filters" document is a single shared constant and must not be reachable in mutable form from a read. `MatchFilters` is a mutable shape (`fields`/`studyLanguages`/`destinations` are arrays), and `EMPTY_MATCH_FILTERS` is exported and used as a default across the app.
- **Evidence:**
  - `src/lib/matches/filter-store.ts:12,14,19,21` — every fallback returns the module constant, not a copy:
    ```ts
    if (raw === null) return EMPTY_MATCH_FILTERS;
    ...
    return parseMatchFilters(json) ?? EMPTY_MATCH_FILTERS;
    ```
  - `src/lib/matches/filters.ts:56` — the returned object is not frozen:
    ```ts
    export const EMPTY_MATCH_FILTERS: MatchFilters = {
      schemaVersion: MATCH_FILTERS_VERSION, fields: [], studyLanguages: [], destinations: [],
      institutionType: "any", budget: null,
    };
    ```
  - `seedFiltersFromLegacy` (`filter-store.ts:39-44`) and the profile migration seed read the same constant through `readMatchFilters` + `isEmptyFilters`, so a mutation would also change what counts as "empty" during the 1→2 seed.
- **Reproduction:** `tests/audit-repro/t1b-findings.test.ts` (RED):
  ```
  FAIL  tests/audit-repro/t1b-findings.test.ts > F1 — readMatchFilters returns the shared mutable EMPTY_MATCH_FILTERS constant
  AssertionError: expected [ 'xx-test-field' ] to deeply equal []
  - []
  + [ 'xx-test-field' ]
   ❯ tests/audit-repro/t1b-findings.test.ts:19:27
  ```
- **Impact:** latent. `readMatchFilters` is called by `matches-client.tsx` (state initialiser + the catalogue-sanitise effect), `compare-client.tsx`, `personal-match.tsx` and `seedFiltersFromLegacy`. None of them mutates the returned value today, so no observed wrong result. But any future in-place edit (`filters.fields.sort()`, `.push(...)`) would silently change "no filters" for the rest of the session *and* every other reader, and would make `isEmptyFilters`/the legacy seed treat an empty store as non-empty. The equivalent pattern is explicitly avoided in the shared parsers (`parseSaved`, `parsePlanProgress`, `parseMatchFilters` all return fresh copies).
- **Proposed fix (not implemented):** return a fresh copy from `readMatchFilters` (`{ ...EMPTY_MATCH_FILTERS, fields: [], studyLanguages: [], destinations: [] }`), or `Object.freeze(EMPTY_MATCH_FILTERS)` plus freezing its arrays, or make the fallback a factory `emptyMatchFilters()`. Freezing also documents the intent for the other `EMPTY_*` constants (`EMPTY_SAVED`, `EMPTY_PROGRESS`, `EMPTY_ACCOUNT_PROFILE`) which have the same shape but are not part of this finding (no reader hands them out as a shared document).
- **Regression test:** assert `readMatchFilters(storage) !== readMatchFilters(storage)` (or `Object.isFrozen`), and that mutating one read leaves a later read equal to the literal empty document. Effort: S (one line + one test).

### Verified sound (with evidence)

- **Snapshot integrity (every shard path):** `src/lib/snapshot/client.ts:191-209` checks byte length always and SHA-256 whenever `crypto.subtle` exists; `createDigest` (`:58-69`) returns `null` only where `crypto.subtle` is unavailable (documented, dev warning) — that is the only hash-skipping path. `src/lib/snapshot/server.ts:65-80` always hashes at build time. Covered by `tests/lib/snapshot/client.test.ts` (integrity block incl. same-length tamper, no-digest length-only, wrong-kind body) and `server.test.ts`.
- **No version skew / no unbounded retry:** `load` builds every bundle from a single manifest, refetches the manifest at most twice, and reports `network` or `version_changed_twice` rather than looping (`client.ts:249-284`); `adoptManifest` clears the shard cache only on a version change (`:183-188`); failed shards are never cached (`:220-223`); a failed manifest is not cached (`currentManifest`, `:161-171`). Covered by `tests/lib/snapshot/client.test.ts` (version-pinning, session-manifest and cache blocks; my `t1b-probe` adds adjacent invariants).
- **Shard identity guard:** `checkShardShape` (`manifest.ts:186-195`) rejects a shard whose kind/destination/field/locale does not match its manifest name, so a mis-pointed manifest entry cannot feed one destination's data in as another's. Covered by `client.test.ts` and the `manifest-guard.test.ts` differential fuzz.
- **Filter grammar and sanitizer:** `decodeFilters`/`encodeFilters` shape-validate every value, dedupe, and never throw on a hand-edited URL (`filter-url.ts`); `dropUnknownFilters` drops only catalogue-unknown values and returns the same object when nothing changed (`:99-114`); `parseMatchFilters` is proven equal to `MatchFiltersSchema` over a table and a seeded fuzzer (`tests/lib/matches/filters.test.ts`), including unsafe-integer budgets. My `t1b-probe` re-checks the empty-param and same-object behaviours.
- **Profile migrations:** the 1→2 strip, the one-time `jisr.matches-filters` seed, the v2 rewrite of the stored record, and "never overwrite a live choice" are covered by `tests/lib/profile/storage.test.ts`; the hand-written `parseProfile`/`parseDraft` are proven equal to their Zod twins. `applyMigrations` keeps the in-progress record when a step is missing (`storage.ts:80-86`) — pinned by a direct test.
- **Saved list / plan ticks:** bad entries are dropped, slugs deduped, caps enforced (`saved.ts`, `progress.ts`); `parseSaved`/`parsePlanProgress` are proven equal to their Zod twins and to the server's input schemas over seeded fuzz (`tests/lib/differential.test.ts`). Idempotency probes for `withStepDone` and the cap pass (`t1b-probe`).
- **Local JSON store:** unhydrated server snapshot, in-memory fallback when storage is blocked, invalid-value removal, `storage`-event sync and `reload` are covered by `tests/lib/local-store.test.ts`.
- **Account sync:** per-lane ordering, rollback of only the failed operation, compare-and-set profile revisions, conflict hold/resolve, two-tab `storage`-event reconciliation, and sign-out/reset are covered by `tests/lib/stores/server-backed.test.ts` (604 lines) and `two-tabs.test.ts`. `settle`/`reset` re-check the lane tails each round, so an op queued while waiting is not lost (`sync.ts:415-425`).
- **View models:** `groupOf` (foundation before check, satisfied first), `routeKeyOf` (never names a stale/non-official route outcome), `topReasons` (pinned route first, coverage last, no duplicates, fail→unknown→pass order, `max` respected except for the always-kept pair), and `effectiveSelection`/`toggleSelection` are covered by their test files and a 400-seed × 4-`max` fuzz in `t1b-probe.test.ts`.
- **Clock:** `todayIso()` is the **UTC** day by design and explicitly tested that way, including a non-UTC offset instant (`tests/lib/clock.test.ts`). Not a defect.
- **`isSaved` alias gap:** `useSaved().isSaved` matches the raw slug (`use-saved.ts:36`) without alias resolution, but it has no production callers (tests only); the Save button resolves aliases itself (`save-program-button.tsx:59`). No reachable impact.
- **`rehydrateOnReturn`:** the untested tab-return helper behaves as documented (rehydrate only after strictly more than `REHYDRATE_AFTER_HIDDEN_MS` hidden, cleanup detaches) — new probe in `t1b-probe.test.ts`.

### Open questions / owner decisions

1. **Account-mode `save()` reports `persisted: true` unconditionally.** `accountAwareProfileStore.save` returns `{ ok: true, persisted: true }` after handing the profile to the lazily loaded sync layer (`src/lib/profile/store.ts:266`); if that chunk fails to load, nothing is persisted locally yet the return says otherwise. This is deliberate (ADR 0013: the loader shows a "change dropped" notice; `tests/lib/stores/account-mode.test.tsx` pins it) and the only caller, the profile wizard, checks `saved.ok` not `saved.persisted`, so it is not user-visible today. Worth a decision if a future caller relies on `persisted` as documented in the type comment.
2. **`hasMatchFilterParams` treats an owned-but-empty URL param as authoritative.** `?field=` / `?type=` make `hasMatchFilterParams` true while `decodeFilters` yields empty filters, so the device's stored filters are ignored for that view (`filter-url.ts:54-56`, `matches-client.tsx:147`). This is pinned by `tests/lib/matches/filter-url.test.ts` ("says yes for any owned parameter, even one that decodes to nothing"), i.e. intended — noting it only because it is an empty-vs-absent edge.
3. **Domain findings surface through the view models.** `groupOf` returns "ok" on a `satisfied` status (`matches-view.ts:74-88`) and `routeKeyOf` falls back to the neutral "to be checked" wording when a `direct`/`not_eligible` route carries no decisive route reason (`:99-109`). T1a's F1 (satisfied with zero published rules) and F3 (note leak) are domain root causes; the lib merely reflects the match result it is given, so no separate lib finding is raised.

---

## Part C — Server Actions, route handlers, `src/proxy.ts`

- Audited commit: `f0cc00efed2f74e7e8a816ea59585d7462f4eebe` (main; PR #61 open but docs-only)
- Worktree: `/mnt/c/Users/dagda/Downloads/Nex/UniWay/.worktrees/audit-shared` (branch `audit/scratch-shared`)
- Scope: Server Actions (`src/lib/server/{account-actions,account-store,account-guard,account-inputs,consent,import,import-store,email,email-cooldown,session,account-erasure,account-export,account-export-store}.ts`), route handlers (`src/app/api/auth/[...all]/route.ts` + `src/lib/auth/handler.ts`, `src/app/api/account/export/route.ts`), `src/proxy.ts`, and the auth flows they drive (magic-link confirm, deletion, kill switch). READ-ONLY: findings and reproduction only, no fixes.
- Out of scope / other tracks: exploitability (security track), `src/domain`, the client sync/store layer.

### Scope / Method / Checks run

Method: read the sources and the existing specs first; for each suspected defect write a minimal failing probe under `tests/audit-repro/t1c-*` and run it; disproven suspicions are recorded as verified sound.

Command (Windows node_modules + WSL shell; only `tests/audit-repro` is run):

```
cmd.exe /c "cd /d C:\Users\dagda\Downloads\Nex\UniWay\.worktrees\audit-shared && set SWC_NATIVE_BINDING_CACHE=C:\Users\dagda\.swc-cache&& pnpm exec vitest run tests/audit-repro"
```

Targeted runs of the T1c probes (same harness):

| Probe file | Result |
|---|---|
| `tests/audit-repro/t1c-server-probes.test.ts` (13 tests) | **all pass** — kill-switch allow-list, off-response shape, return-path safety, link-fragment parsing, mailbox normalisation, masking, filenames |
| `tests/audit-repro/t1c-server-db-probes.test.ts` (10 tests, PGlite) | **1 fail** (F1), 9 pass — caps, feedback rolling window, import replace/auto/floor, erasure |
| `tests/audit-repro/t1c-gate-path-probe.test.ts` (1 test, PGlite) | **1 fail** (F2) |

The PGlite harness is used exactly as `tests/db/README.md` documents (`startTestDatabase({ port: 0 })`, `process.env.DATABASE_URL` set before `import("@/db")`, pool ended in `afterAll`); no `TEST_POSTGRES_URL` is needed because these are single-connection probes, not races.

Existing specs consulted and relied on as evidence: `tests/app/api/auth-lazy.test.ts`, `tests/app/api/export.test.ts`, `tests/db/{magic-link-confirm,pending-signup,email-cooldown,auth-email,admission}.test.ts`, `tests/lib/server/{account-actions,import}.test.ts`, `tests/lib/auth/{delete-account,callback-urls,log}.test.ts`, `tests/db-race/*` (skipped locally without a real Postgres — see Open questions), `tests/proxy.test.ts`.

### Findings

#### F1 — Account erasure leaves a `pending_signups` row for a different spelling of the same mailbox — Severity S3

**Invariant.** ADR 0013 decision 9: deletion "removes … the `email_cooldowns` and `pending_signups` rows for the address". `email_cooldowns` is keyed by `cooldownKey` (a `+tag` dropped and Gmail dots removed), `pending_signups` by `normalizeEmail` (dots/tags kept). The erasure sweep collapses only the cooldown key.

**Evidence.**

`src/lib/server/account-erasure.ts:40-44`:

```ts
      // Keyed by the mailbox since todo 28 (cooldownKey); the plain form covers older rows.
      await tx
        .delete(emailCooldowns)
        .where(inArray(emailCooldowns.email, [email, cooldownKey(email)]));
      await tx.delete(pendingSignups).where(eq(pendingSignups.email, email));
```

where `email = normalizeEmail(user.email)` (`account-erasure.ts:28`). The two writers that create these rows disagree on the key:

- `src/lib/auth/pending-signup.ts:29` — `values({ email: normalizeEmail(email), ... })` (dots and `+tags` kept).
- `src/lib/server/email-cooldown.ts:29` — `values({ email: cooldownKey(email), ... })` (collapsed).

`account-export-store.ts:166` reads `pending_signups` by `normalizeEmail(owner.email)` too, so the same row is neither exported nor erased.

**Reproduction.** `tests/audit-repro/t1c-server-db-probes.test.ts` → "erases a pending row for another spelling of the account's Gmail mailbox": user `a.b@gmail.com`, a pending row keyed `ab@gmail.com`, then `eraseAccountResidue`. RED:

```
FAIL tests/audit-repro/t1c-server-db-probes.test.ts > erasure of pre-account rows (no FK cascade) > erases a pending row for another spelling of the account's Gmail mailbox
AssertionError: expected [ { email: 'ab@gmail.com' } ] to deeply equal []
- []
+ [ { "email": "ab@gmail.com" } ]
```

The cooldown equivalent passes (`removes a cooldown keyed only by the collapsed mailbox key`), so the asymmetry — not the sweep mechanism — is the defect.

**Impact.** An abandoned pre-account row naming the deleted student's mailbox can survive erasure. It holds no grades/profile, only `consent_version`, `consented_at` and the age flag, and the address; `readPendingSignup` ignores it once expired (15 min), but nothing deletes an expired row until the next auth email runs the lazy purge (`email-cooldown.ts:71-85`, ADR 0013 decision 11), so it can persist for a long time. Reachability is narrow: the sign-up flow always writes the pending row under the same normalised spelling it later creates the user with, so a mismatch needs a different typed spelling (e.g. a Gmail dot/`+tag` variant, or a Google-link path) for the same mailbox.

**Proposed fix (not implemented).** Erase pending rows by the same mailbox key(s) the cooldown uses, e.g. delete both `normalizeEmail(user.email)` and any Gmail-collapsed spelling; or key `pending_signups` by `cooldownKey` like `email_cooldowns` (a schema/keying change, hence an owner call). Also widen the export lookup if the identity is meant to be the mailbox.

**Regression test.** Extend the "erasure of pre-account rows" spec with a Gmail-dot/`+tag` pending row, asserting zero rows after `eraseAccountResidue`; add a `tests/db-race/` variant only if the fix changes keying.

**Effort.** Small (one `inArray`/keying decision); the keying option needs an ADR note.

#### F2 — `accountsGate` derives its path from `context.baseURL`, the route handler from a constant; a `BETTER_AUTH_URL` with a path makes them disagree — Severity S4

**Invariant.** While `ACCOUNTS_ENABLED` is off, an exact `GET /api/auth/get-session` must answer a signed-out `200 null`, and every other `/api/auth` request `403 ACCOUNTS_DISABLED` (ADR 0013 decision 1). The route handler and the gate plugin are expected to agree.

**Evidence.**

`src/lib/auth/handler.ts:34-36` uses the constant:

```ts
async function handle(method: keyof Handlers, request: Request): Promise<Response> {
  if (!accountsEnabled()) return accountsOffResponse(request, AUTH_BASE_PATH);
```

`src/lib/auth/accounts-gate.ts:44-49` derives the base path from Better Auth's context:

```ts
    onRequest: async (request, context) => {
      if (accountsEnabled()) return;
      return {
        response: accountsOffResponse(request, new URL(context.baseURL).pathname),
      };
    },
```

`context.baseURL` is Better Auth's base URL *including* the base path (`node_modules/better-auth/dist/context/create-context.mjs:132`, `baseURL: baseURL || ""`, where `baseURL = getBaseURL(options.baseURL, options.basePath)` and `getBaseURL` appends `/api/auth` only when the given URL has no path — the append lives in `withPath` (~41-49); `getBaseURL` is at :68). With `BETTER_AUTH_URL=http://localhost:3000/app`, `context.baseURL` is `http://localhost:3000/app`, so `isSessionRead` tests against `/app/get-session` and never matches. `getAuth()` accepts such a URL (it only requires an absolute http(s) URL, `server.ts:185-192`).

**Reproduction.** `tests/audit-repro/t1c-gate-path-probe.test.ts`: `BETTER_AUTH_URL=http://localhost:3000/app`, accounts on, build the instance, flip the flag off, `auth.handler(GET /api/auth/get-session)`. RED:

```
FAIL tests/audit-repro/t1c-gate-path-probe.test.ts > the gate still answers get-session as signed-out when the base URL carries a path
AssertionError: expected 403 to be 200
- 200
+ 403
```

With the bare-origin base URL the gate is sound (`t1c-server-db-probes.test.ts` → "returns a signed-out get-session while the flag is off, without touching Better Auth").

**Impact.** Low: the route handler answers first for every HTTP `/api/auth` request (it checks `accountsEnabled()` before `enabledHandlers()`), so the mis-path only shows on a direct `auth.handler()` call or an `auth.api.*` path that reaches the plugin, and only under a mis-set base URL (the deploy checklist pins `BETTER_AUTH_URL` to the bare origin). It is a real inconsistency between the two off-path answers and a silent one — a base URL with a path is accepted at boot.

**Proposed fix (not implemented).** Pass the same constant to the plugin (`accountsOffResponse(request, AUTH_BASE_PATH)`), or reject a `BETTER_AUTH_URL` that carries a path in `getAuth()`.

**Regression test.** One assertion in `tests/proxy.test.ts`-style unit form, or keep the probe above as a spec after the fix.

**Effort.** Trivial.

#### F3 — Documented invariant "a refused resend refreshes `consented_at`" is contradicted by the code (contract/doc drift) — Severity S4

**Invariant (as written).** ADR 0013 decision 3: "A cooldown-refused request still refreshes the pending row's `consented_at` and expiry, because the row is written before the claim." `docs/ops/prelaunch-checklist.md` D9 repeats it ("a refused sign-in request still refreshes the pending row's `consented_at`").

**Evidence.** The code intentionally does the opposite, as the security pass F2 fix: `src/lib/auth/server.ts:155-157`

```ts
  await claimSendSlot("magic-link", email);
  // Only after the claim, so a refused request cannot write or refresh a planted row (todo 28, F2).
  if (isSignupFor(email)) await recordPendingSignup(email);
```

`claimSendSlot` throws `EMAIL_COOLDOWN` before `recordPendingSignup`, so a refused request writes/refreshes nothing. The behaviour is pinned by an existing spec — `tests/db/pending-signup.test.ts` "does not refresh a planted pending row when the cooldown refuses the signup" — and matches `docs/ops/security-review-accounts.md` F2 ("order claim → pending → verification → email").

**Reproduction.** No probe needed; the divergence is between prose and code, and the existing spec already asserts the code. This is a documentation defect, not a code defect: the code is correct and deliberately changed; the ADR and the checklist were not updated.

**Impact.** A future security pass re-reading ADR 0013 decision 3 or D9 would "verify" a behaviour the code no longer has and could re-open F2. This is exactly the "consented_at refresh on refused resend" item T1c was asked to check.

**Proposed fix (not implemented).** Owner updates ADR 0013 decision 3 (line 43), its decision-9 carried list (line 114), and D9 to state that a refused resend writes/refreshes nothing, with a pointer to F2/`server.ts`.

**Regression test.** None (docs).

**Effort.** Trivial.

### Verified sound (with evidence)

- **Kill switch / lazy init.** `accountsEnabled()` is an allow-list (`true`/`1`, trimmed/lowered); `tests/audit-repro/t1c-server-probes.test.ts` asserts the set. While off, `handler.ts` answers by itself (`AUTH_BASE_PATH`) and never calls `getAuth()`; while on with a missing/invalid secret or base URL it answers `500 AUTH_MISCONFIGURED` and does not memoise the failure — `tests/app/api/auth-lazy.test.ts`. My probe confirms an exact `GET get-session` is `200 null` (no-store) and everything else `403 ACCOUNTS_DISABLED`, including trailing-slash and wrong-case look-alikes.
- **Return-path / redirect safety.** `safeReturnPath` accepts only `/<known-locale>/<plain segments>` and falls back otherwise; probe covers `//host`, absolute URLs, `..`, `%2e%2e`, backslash and spaces. `signInConfirmPath`/`signInErrorPath` build fragments/query via `URLSearchParams`; the confirm path has an empty query. `readSignInLink`/`readDeletionToken` reject malformed tokens. `tests/lib/auth/callback-urls.test.ts` and the callback contract test back this.
- **Route handlers.** `src/app/api/account/export/route.ts` exports only `GET`, `dynamic="force-dynamic"`, `runtime="nodejs"`; it answers `403 ACCOUNTS_DISABLED` before any session/DB work, `401 UNAUTHENTICATED` without a session, and 200 with `no-store` + `attachment` on success — `tests/app/api/export.test.ts`. The auth route maps `GET`/`POST` to the handler and is inert while off.
- **Server Actions boundary.** Every account action runs `requireAccountReady()` inside `guarded()` before parsing input (`account-guard.ts:26-38`); `guarded` logs only the action name and SQLSTATE and throws a fixed message (`account-guard.ts:14-21`, `tests/lib/server/account-actions.test.ts` "a failing query never leaks the profile"). Input is Zod-`strictObject` validated with bounds tighter than the columns (`account-inputs.ts`).
- **Caps, idempotency, feedback.** `saveProgramFor`/`setStepDoneFor` take the user `FOR UPDATE` lock and cap at `MAX_SAVED_PROGRAMS`/`MAX_PLAN_PROGRAMS`; re-saving an existing item is accepted and unsaving frees a slot (probe passes). `createFeedbackReportFor` counts `created_at > now() - interval '24 hours'` under the lock; the probe confirms the 24h ± 1s boundary is a rolling window, not a calendar day.
- **Profile CAS.** `saveProfileFor` is a single `UPDATE … WHERE revision = expected` with `revision + 1`; a first insert reads the monotonic floor under the lock; a mismatch returns `conflict` with `current` (probe: after a clear the stale save is refused and a fresh import starts above the floor). Real-concurrency proof lives in `tests/db-race/{profile-cas,profile-revision}.test.ts` (skipped locally without `TEST_POSTGRES_URL`).
- **Import.** `auto` refuses an account that holds data (`has_server_data`), `replace` swaps profile/saved/plan, and a clear lets a later `auto` import run again; all confirmed by probes; the double-import race is in `tests/db-race/import.test.ts`.
- **Erasure.** `eraseAccountResidue` removes the three verification shapes (user-id value, magic-link JSON email, OAuth-state JSON user/email), cooldowns (cooldownKey) and pending rows (exact key), guarding the JSON cast with `pg_input_is_valid`; `tests/lib/auth/delete-account.test.ts` and my probe. The nonce row is deliberately left to expire (15 min, `account-erasure.ts:24-26`).
- **Deletion flow.** Emailed link is `/<locale>/account/delete#token=…` (fragment, no query); the GET callback is closed; completion is a POST needing the session; the session cookie is expired on success by the after hook; a lost response is handled as "probably deleted, offer erase this device" — `tests/lib/auth/delete-account.test.ts`, `docs/ops/security-review-accounts.md` F6.
- **Magic-link confirm + nonce.** `POST /api/auth/magic-link/confirm` runs `formCsrfMiddleware`, validates the token shape, consumes the nonce row, runs the plugin's verify as a plain call, and carries the inner `Set-Cookie`; the GET verify is closed — `tests/db/magic-link-confirm.test.ts` (including same-browser/mismatch marking and the csrf refusals).
- **Email throttle.** `claimEmailSendSlot` (60s, mailbox key) and `claimDailyEmailSlot` (`AUTH_EMAILS_PER_DAY` with `AUTH_EMAILS_RESERVED_FOR_DELETION`) are single `INSERT … ON CONFLICT … WHERE` statements on the DB clock; the lazy purge runs only on a granted send — `tests/db/email-cooldown.test.ts`, `tests/db-race/{email-cooldown,email-daily-cap}.test.ts`.
- **Proxy.** `createMiddleware(routing)` with `localeCookie: false`, matcher excluding `api|_next|_vercel|snapshots|<locale>` and dotted paths; `tests/proxy.test.ts` pins every skip/run case and the locale alternation. It performs no cookie/session check, so it is not authorization.
- **Timezone.** `src/db/pool.ts` pins every pooled session to UTC; app tables use `timestamptz`; the generated auth tables use zone-less `timestamp`, which is UTC on Vercel and read back as UTC by Drizzle.

### Open questions / owner decisions

1. **F1 keying.** Should `pending_signups` be erased (and exported) by the mailbox key `cooldownKey` (collapsing Gmail dots/`+tags`), or is the exact normalised address the intended identity? The answer chooses between a one-line sweep change and a keying change. Owner call.
2. **F2 base URL.** Is a `BETTER_AUTH_URL` carrying a path a configuration the project wants to reject at boot, or just to make the gate agree with the handler? ADR 0013/`prelaunch-checklist.md` D6 says the bare origin; `getAuth()` does not enforce it.
3. **Profile CAS word "conflict".** ADR 0013 decision 5 says "a stale device always gets `conflict`", but when the profile row was deleted (Clear my data) `saveProfileFor` answers `{ ok:false, error:"invalid" }` (`account-store.ts:239-250`, asserted by my probe). The client treats `invalid` as "profile reloaded" (`account-sync/sync.ts:341-348`), which looks intentional, but the ADR wording does not describe it. Confirm the contract and, if intended, record it.
4. **Real-Postgres races.** `tests/db-race/*` are skipped without `TEST_POSTGRES_URL`; this audit could not re-run the CAS/cap/import/cooldown races locally. CI's `db-race` job is the evidence.
5. **Nonce cookie on a failed confirm (hardening, not reproduced).** `src/lib/auth/magic-link-confirm.ts:87` clears `jisr.ml-nonce` before the verify call, so confirming a junk/expired link in a browser drops the browser binding for a still-valid link opened later in the same tab (the import is then withheld — fail-safe but misleading). Worth a decision; not scored as a finding because the impact is a withheld import and a warning, and no probe was written.
