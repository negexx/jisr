# Health fields and English-taught health programmes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three health fields (`medicine`, `pharmacy`, `allied-health`) and make the four English-taught importers stage and enrich the health programmes of NL, DE, IT and HU.

**Architecture:** `field` is a data-driven vocabulary; the *classification* lives in per-source TypeScript classifiers (register code / branch / name regexes), never a model. This plan widens those classifiers, re-runs the importers to stage health programmes at listing tier, then enriches them with the existing pipeline. No schema change: `level` stays `bachelor`.

**Tech Stack:** TypeScript (strict) + `tsx` scripts, Vitest, Zod, YAML in `data/`, the `data:*` pipeline.

**Spec:** `docs/superpowers/specs/2026-10-12-health-fields-english-programmes-design.md`

## Global Constraints

- Official https sources only; **never invent a value**; a fact no source states stays `null`. Every staged/promoted fact keeps `source_url` + `info_kind` + `last_verified_at`.
- `level` stays `z.literal("bachelor")`; the clinical single-cycle/Staatsexamen/one-tier degrees are **excluded**.
- **English-first**: NL, DE, IT, HU only. **FR health and Spain are out of scope.**
- Field slugs are permanent once a programme references them: `medicine`, `pharmacy`, `allied-health`.
- A health name that overlaps another field ("Medical Engineering", "Health Economics") must **not** be classified as medicine/pharmacy.
- `pnpm data:check --strict` (0 errors, 0 stale) and `pnpm data:build` must pass; `pnpm typecheck`/`test`/`lint` green.
- Branch + PR only; never commit or push to `main`. Match existing patterns; no unrelated refactor.

## Review Focus

Input classes the spec implies but a per-classifier unit test does not exercise; each has a test in its owning task.

1. **Field collisions** — "Medical Engineering", "Health Economics", "Pharmaceutical Management" must resolve to engineering/business, never medicine/pharmacy (Task 4 test).
2. **Depth over breadth** — a country whose English health offer is empty (likely IT/HU) must yield **no** record, not a guessed one (Task 7 checks: 0 records is a valid outcome).
3. **Ordering** — a field record referenced by a programme but not yet created makes `data:check` fail; fields are added before any programme (Task 1 precedes Task 7).
4. **Contradiction guard** — `fieldOfClass` keeps `confidence: low` when the class and the course name disagree (Task 3 test).
5. **Idempotence** — re-running a widened importer must not duplicate an existing programme or overwrite a `data/` record (Task 7 checks `data:promote` never overwrites).

---

### Task 1: Health field vocabulary + fixture

**Files:**
- Create: `data/fields/medicine.yaml`, `data/fields/pharmacy.yaml`, `data/fields/allied-health.yaml`
- Create: `tests/fixtures/data/e2e-journey/fields/xx-test-field-health.yaml`

**Interfaces:**
- Produces: the field slugs `medicine`, `pharmacy`, `allied-health` (referenced by Tasks 3–7).

- [ ] **Step 1: Write the three field records** following `data/fields/computer-science.yaml`'s shape (`slug` + `name` as a `LocalizedText`). Use: `medicine` (fr Médecine / en Medicine / ar الطب), `pharmacy` (fr Pharmacie / en Pharmacy / ar الصيدلة), `allied-health` (fr Santé paramédicale et sciences de la santé / en Allied health / ar العلوم الصحية). Set `fr`/`en` `status: draft` (the owner flips to `reviewed` at review) and `ar` `draft`.

- [ ] **Step 2: Add a fixture field** `tests/fixtures/data/e2e-journey/fields/xx-test-field-health.yaml` copying `xx-test-field-cs.yaml` with `slug: xx-test-field-health`.

- [ ] **Step 3: Run `pnpm data:check`**

Run: `pnpm data:check`
Expected: `data:check: OK` (the three records validate; no programme references them yet).

- [ ] **Step 4: Commit**

```bash
git add data/fields/medicine.yaml data/fields/pharmacy.yaml data/fields/allied-health.yaml tests/fixtures/data/e2e-journey/fields/xx-test-field-health.yaml
git commit -m "feat(data): add the medicine, pharmacy and allied-health fields"
```

---

### Task 2: Widen `FieldSlug` and add the NL health classifier

**Files:**
- Modify: `scripts/import/fields.ts` (`FieldSlug` union; `classifyDutchProgramme`)
- Test: `tests/scripts/import/fields.test.ts` (create)

**Interfaces:**
- Produces: `type FieldSlug = "computer-science" | "engineering" | "business-economics" | "medicine" | "pharmacy" | "allied-health"`; `classifyDutchProgramme(sector, name, internationalName): FieldMatch | null` returns the new fields for health names.

- [ ] **Step 1: Write the failing test** `tests/scripts/import/fields.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { classifyDutchProgramme } from "../../../scripts/import/fields";

describe("classifyDutchProgramme health names", () => {
  it("maps geneeskunde to medicine", () => {
    expect(classifyDutchProgramme("GEZONDHEIDSZORG", "Geneeskunde", "Medicine")?.field).toBe("medicine");
  });
  it("maps farmacie to pharmacy", () => {
    expect(classifyDutchProgramme("GEZONDHEIDSZORG", "Farmacie", "Pharmacy")?.field).toBe("pharmacy");
  });
  it("maps verpleegkunde and fysiotherapie to allied-health", () => {
    expect(classifyDutchProgramme("GEZONDHEIDSZORG", "Verpleegkunde", "Nursing")?.field).toBe("allied-health");
    expect(classifyDutchProgramme("GEZONDHEIDSZORG", "Fysiotherapie", "Physiotherapy")?.field).toBe("allied-health");
  });
  it("maps biomedische wetenschappen to allied-health, never medicine", () => {
    expect(classifyDutchProgramme("NATUUR", "Biomedische wetenschappen", "Biomedical Sciences")?.field).toBe("allied-health");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/scripts/import/fields.test.ts`
Expected: FAIL (`classifyDutchProgramme` returns undefined/null for the health names).

- [ ] **Step 3: Implement** — add the three slugs to `FieldSlug`, and in `classifyDutchProgramme` add, before the CS/business fallbacks:

```ts
const NL_MEDICINE = /geneeskunde|\bmedicine\b/;
const NL_PHARMACY = /farmacie|pharmacy|farmaceut/;
const NL_ALLIED = /gezondheid|verpleegkund|fysiotherap|biomedisch|biomedical|voeding|mondzorg|logopedie|\bhealth\b/;
```

Return `{ field: "medicine", confidence: "high" }` for `NL_MEDICINE`, `{ field: "pharmacy", confidence: "high" }` for `NL_PHARMACY`, `{ field: "allied-health", confidence: NL_ALLIED.test(text) ? "high" : "low" }` for `NL_ALLIED` (keep the existing `ONDERWIJS`/teacher-training exclusion first).

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run tests/scripts/import/fields.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/import/fields.ts tests/scripts/import/fields.test.ts
git commit -m "feat(import): classify Dutch health programmes"
```

---

### Task 3: IT — add the health degree classes to `CLASS_FIELD`

**Files:**
- Modify: `scripts/import/sources/mur.ts` (`CLASS_FIELD`)
- Test: `tests/scripts/import/mur.test.ts`

**Interfaces:**
- Consumes: the field slugs from Task 1.
- Produces: `fieldOfClass` returns a field for the health classes.

- [ ] **Step 1: Write the failing test** (append to `mur.test.ts`)

```ts
describe("fieldOfClass health classes", () => {
  it("maps the nursing and rehabilitation classes to allied-health", () => {
    expect(fieldOfClass("L/SNT1", "Nursing")?.field).toBe("allied-health");
    expect(fieldOfClass("L/SNT2", "Physiotherapy")?.field).toBe("allied-health");
  });
  it("maps applied pharmaceutical sciences to pharmacy", () => {
    expect(fieldOfClass("L-29", "Applied Pharmaceutical Sciences")?.field).toBe("pharmacy");
  });
  it("leaves the single-cycle medicine class out", () => {
    expect(fieldOfClass("LM-13", "Medicine and Surgery")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm vitest run tests/scripts/import/mur.test.ts` → FAIL (null for the health classes).

- [ ] **Step 3: Implement** — add to `CLASS_FIELD`: `"L/SNT1"`, `"L/SNT2"`, `"L/SNT3"`, `"L/SNT4"` → `"allied-health"`; `"L-2"`, `"L-13"` → `"allied-health"`; `"L-29"` → `"pharmacy"`. Do not add `LM-13` or any `medicina` class.

- [ ] **Step 4: Run to verify it passes** — PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/import/sources/mur.ts tests/scripts/import/mur.test.ts
git commit -m "feat(import): classify Italian health degree classes"
```

---

### Task 4: DE — add health name patterns to `classifyDaad`

**Files:**
- Modify: `scripts/import/sources/daad.ts` (`classifyDaad` and its regex constants)
- Test: `tests/scripts/import/daad.test.ts`

**Interfaces:**
- Produces: `classifyDaad(name, subject)` maps the health family and keeps the existing fields for non-health names.

- [ ] **Step 1: Write the failing test** (append to `daad.test.ts`)

```ts
describe("classifyDaad health names", () => {
  it("maps medicine and pharmacy", () => {
    expect(classifyDaad("Molecular Medicine", null)?.field).toBe("medicine");
    expect(classifyDaad("Pharmaceutical Biotechnology", null)?.field).toBe("pharmacy");
  });
  it("maps nursing/health sciences to allied-health", () => {
    expect(classifyDaad("Nursing", null)?.field).toBe("allied-health");
    expect(classifyDaad("Health Sciences", null)?.field).toBe("allied-health");
  });
  it("does not read engineering or economics as medicine", () => {
    expect(classifyDaad("Medical Engineering", null)?.field).toBe("engineering");
    expect(classifyDaad("Health Economics", null)?.field).toBe("business-economics");
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm vitest run tests/scripts/import/daad.test.ts` → FAIL.

- [ ] **Step 3: Implement** — add regexes and evaluate them **before** the CS/engineering/business branches, with the collision guard: a name matching engineering/business strong words is not medicine/pharmacy.

```ts
const MED_STRONG = /\bmedizin|molecular medicine|human medicine|medical sciences?\b/i;
const PHARM_STRONG = /pharmaz|pharmaceutical|pharmatechnik|pharmacy/i;
const ALLIED_STRONG = /\bnursing\b|\bpflege|physiotherap|biomedical|biomedizin|\bhealth sciences?\b|public health|nutrition|ernährung/i;
```

Return `medicine` for `MED_STRONG`, `pharmacy` for `PHARM_STRONG`, `allied-health` for `ALLIED_STRONG`; only when `bioengineering`-style `ENG_STRONG`/`BUS_STRONG` do not match the same name first (so "Medical Engineering" and "Health Economics" keep their fields).

- [ ] **Step 4: Run to verify it passes** — PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/import/sources/daad.ts tests/scripts/import/daad.test.ts
git commit -m "feat(import): classify German health programme names"
```

---

### Task 5: HU — add the health branches to `fieldOfBranch`

**Files:**
- Modify: `scripts/import/sources/studyfinder.ts` (`BRANCH_FIELD`)
- Test: `tests/scripts/import/studyfinder.test.ts`

**Interfaces:**
- Produces: `fieldOfBranch` maps the Study Finder health branch(es) to `allied-health`.

- [ ] **Step 1: Confirm the exact branch labels.** The Study Finder's `branch` value is the site's own "branch of science" string; the importer already fetches every catalogue entry. Read the distinct `branch` values from a cached Study Finder response (`.cache/import/`) or the importer's logged output, and write down the health one(s) verbatim.

- [ ] **Step 2: Write the failing test** (append to `studyfinder.test.ts`) using the **verbatim** label found in Step 1, e.g.:

```ts
describe("fieldOfBranch health", () => {
  it("maps the health branch to allied-health", () => {
    expect(fieldOfBranch("Health Science")).toBe("allied-health");
  });
});
```

- [ ] **Step 3: Run to verify it fails** — `pnpm vitest run tests/scripts/import/studyfinder.test.ts` → FAIL.

- [ ] **Step 4: Implement** — add the verbatim label(s) to `BRANCH_FIELD` → `"allied-health"`. No `medicine`/`pharmacy` entry (HU medicine and pharmacy are one-tier and excluded).

- [ ] **Step 5: Run to verify it passes** — PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/import/sources/studyfinder.ts tests/scripts/import/studyfinder.test.ts
git commit -m "feat(import): classify Hungarian health branches"
```

---

### Task 6: Widen the Italy discovery candidate enum

**Files:**
- Modify: `scripts/import/it-stage-candidates.ts` (the `field: z.enum([...])`)
- Test: `tests/scripts/import/it-discovery.test.ts` (extend if it asserts the enum)

**Interfaces:**
- Produces: the candidate schema accepts the three new field slugs, so `data:it-stage` does not reject a health candidate.

- [ ] **Step 1: Write the failing test** — add/extend a case in `it-discovery.test.ts` that parses a candidate with `field: "allied-health"` and expects success.

- [ ] **Step 2: Run to verify it fails** — `pnpm vitest run tests/scripts/import/it-discovery.test.ts` → FAIL (enum rejects `allied-health`).

- [ ] **Step 3: Implement** — extrude the enum from the `FieldSlug` type of `scripts/import/fields.ts` (import it) or list all six slugs explicitly.

- [ ] **Step 4: Run to verify it passes** — PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/import/it-stage-candidates.ts tests/scripts/import/it-discovery.test.ts
git commit -m "feat(import): accept health fields in the Italy discovery candidates"
```

---

### Task 7: Stage, review and promote the health programmes (one country at a time)

**Files:**
- Modify/Add: `data-staging/**` (local, not committed) → promoted into `data/programs/**`, `data/institutions/**`.
- Ledgers: `data-staging/REVIEW.csv`, `PROMOTED.csv` (single writer, serialised).

**Interfaces:**
- Consumes: the widened classifiers (Tasks 2–6) and the field records (Task 1).

- [ ] **Step 1: Final gate on the code** — `pnpm typecheck && pnpm test && pnpm lint` green before touching data.

- [ ] **Step 2: Run one importer, serially, starting with NL** — `pnpm data:import netherlands` (then `daad`, `italy`, `hungary` in separate runs, never in parallel; each rewrites `REVIEW.csv`).

- [ ] **Step 3: Review the review sheet** — open `data-staging/REVIEW.csv`; for every new health row confirm the field is right (a `low` confidence row is a person's judgement) and that the programme is English-taught where the country requires it. Write `y` in `approved`. Drop any programme outside the taxonomy.

- [ ] **Step 4: Promote** — `pnpm data:promote --confirm-human-read --verified-on 2026-10-12`. A programme whose institution is not yet promoted is reported by `data:check` as a dangling reference: promote the institution too.

- [ ] **Step 5: Verify the country** — `pnpm data:check` green; `pnpm data:coverage` shows the new field's programmes; a country with **zero** health programmes listed its reason (no English offer) and adds none.

- [ ] **Step 6: Repeat Steps 2–5 for DE, IT, HU.** Commit per country (data only):

```bash
git add data/
git commit -m "feat(data): add the English-taught health programmes of <country>"
```

---

### Task 8: Enrich the health programmes and record the delta

**Files:**
- Add/Modify: `data/programs/**` facts (tuition, intakes, channel, documents, rules, teaching language).

**Interfaces:**
- Consumes: the promoted records from Task 7.

- [ ] **Step 1: Build the pages and read (English-first)** — for the new slugs: `pnpm data:pages --slugs <file> --search --topics --topic-list fees,language,deadline,documents --out <pages.json>` then `pnpm data:read --pages <pages.json> --slugs <file> --out data-staging/proposals-read/health --check qwen3.7-plus --max-usd 2`.

- [ ] **Step 2: National facts where a national page applies** — `pnpm data:national scripts/import/registries/national-<cc>*.json` if a registry covers them; otherwise skip.

- [ ] **Step 3: Enrichment apply** — `pnpm data:evidence restage --enrich <dir> --slugs <file>` → `verify --dry-run` (0 unsupported) → `verify` → `pnpm data:audit draw && pnpm data:audit sheet` → the owner reads the sample → `pnpm data:promote --confirm-human-read --verified-on 2026-10-12 --replace-revisions`.

- [ ] **Step 4: Final gates** — `pnpm data:check --strict` (0 errors, 0 stale) and `pnpm data:build` succeed; `pnpm typecheck && pnpm test && pnpm lint` green.

- [ ] **Step 5: Record the delta and open the PR** — `pnpm data:coverage` before/after for the new fields; PR `data: add English-taught health programmes and the health fields` listing each country's new records with sources. Run the `reviewer` subagent over the diff. Never push `main`.

---

## Self-review notes

- **Spec coverage:** field records → Task 1; NL/IT/DE/HU classifiers → Tasks 2–5; IT candidate enum → Task 6; import→audit→promote → Task 7; enrichment + coverage delta + done gates → Task 8. FR/ES/ba.ts are out of scope per the spec.
- **Type consistency:** the three slugs and `FieldSlug` are defined once (Tasks 1–2) and reused verbatim in Tasks 3–7; `fieldOfClass` and `classifyDaad` signatures are unchanged.
- **Review Focus** items are pinned: collision → Task 4 test; empty country → Task 7 Step 5; field-before-programme ordering → Task 1 before Task 7; contradiction guard → Task 3 test; idempotence → Task 7 Step 4.
