# Data completeness, wave 1: national facts — design

Date: 2026-10-09. Branch: `feat/data-wave1`. Status: approved by the owner in chat on 2026-10-09 (scope and the DE decision below). Evidence base: `docs/superpowers/research/2026-10-09-data-gap-research.md` (read it first: source URLs, quotes, counts).

## Goal

Close the data gaps that one official national page can close for many programmes at once, without a model and without search credits, through the existing audited pipeline. Wave 1 covers documents and application channel only. Later waves (code-read registers, per-institution research, scholarships, costs and proof of funds) get their own specs.

## Owner decisions (2026-10-09)

1. Scope: wave 1 first, then decide wave 2.
2. National lists that are only "normally / often required" are stored with `info_kind: guidance`, the national page as source. The Campus France Maroc procedure list stays `official` (precedent: Campus France tuition, French level, calendar).
3. German `processes` universities are evidenced by a quote from the university's own page, through a small curated registry (not by the uni-assist list entry).
4. Also decided for later waves, not built here: narrow the French teaching-language guard with an audit sample (wave 2); show visa proof-of-funds as a separate line outside every cost total (own task).

## Scope

| Task | Fact | Programmes | Evidence | `info_kind` |
|---|---|---|---|---|
| A | FR documents | public Licence and BUT programmes with the Études en France channel (about 700 of 755) | Campus France Maroc, step 2 of the application procedure, plus the procedure page | official |
| B | DE application channel | about 29 by code from `UNIASSIST.csv` (processes 6 institutions, vpd_only 12 programmes, about 11 more confirmed by campus), plus about 26 own-portal programmes through the registry | vpd_only: the uni-assist VPD sentence; processes and own-portal: a quote from the university's own page | official |
| C | DE documents | programmes whose channel is `de-uni-assist` or `de-uni-assist-vpd` (about 35) | uni-assist Morocco page plus the certified-copy and translation pages | guidance |
| D | NL channel | the 13 programmes without a channel | Study in NL "how to apply" (Studielink) | official |
| E | IT channel and documents | channel 17; documents about 28 | Universitaly page (channel); the 2026-2027 ministry circular (documents) | channel official, documents guidance |

Not in wave 1: Hungarian channel (the research found no usable national statement; per-institution pages, wave 3), anything per-institution beyond the DE channel registry, language, tuition, deadlines, rules, duration, scholarships, costs.

Expected gain: about 820 programme facts. No model, no Serper credits.

## Mechanism

A new tool `pnpm data:national <registry...> [--dry-run] [--out <dir>] [--slugs <file>]`, built on the pattern of `fr-calendar.ts` and `daad-deadlines.ts`:

- A committed **registry** per country (`scripts/import/registries/national-<cc>.json`, validated by a Zod schema in the tool) lists entries. An entry has: `id`, `fact` (`documents` or `applicationChannel`), `infoKind` (`official` or `guidance`), `pages` (key -> URL), `selector` (which programmes: country, optional institution slugs, programme kinds, public/private, required existing channel), and for each fact its evidence: for `applicationChannel` the channel slug and the quote(s); for `documents` the candidate items (slug, fr/en names, `quotedAs`, translation flag) and the quotes.
- The tool fetches each page fresh (HTML, or PDF text through the existing `scripts/import/pdf.ts`; same cache as the reader), keeps only the quotes found verbatim after the project's text normalisation and only the items whose `quotedAs` appears in an accepted quote, and builds one `Proposal` per selected programme. No model is called. A programme that already holds the fact is not given a proposal (enrichment never overwrites).
- Proposals are written to `data-staging/proposals-national/<run>/<slug>.json` and consumed by the existing flow: `data:evidence restage --enrich`, `data:evidence verify --enrich` (the same verifier code that checks every other quote), `data:audit`, `data:promote`. The tool prints per entry: programmes selected, proposals written, quotes or items dropped and why.
- German channel from the sheet: a small code mapper turns `UNIASSIST.csv` rows into registry-shaped entries for the programmes whose institution matches (by code, as the sheet already does), with the row's uni-assist detail page as source. Rows where the sheet disagrees with an existing channel (3 known) and rows with mode `special` are listed for a person, never proposed. Universities with mode `processes` and all own-portal universities need a registry entry with a quote from the university's own page.
- Guidance: a registry entry with `infoKind: guidance` makes the enrichment stamp `info_kind: guidance` on that fact (first implementation step: a spike confirming the pipeline, `data:check` and the programme page support a `guidance` document or channel fact; see Risks).

## Per-task design notes

- **A, FR documents.** Selector: French programmes whose institution is public and whose programme kind is Licence or BUT (the rule `fr-calendar` uses), minus programmes that already hold documents. Items are drawn only from wording found verbatim on the page. The sentence "Tous les documents doivent être en français ou traduits en français auprès d'un traducteur assermenté" supports `translationRequired: true` for items it covers; the page says legalisation is not needed because originals are shown at the interview: that is stated in the notes, not as a document. Scope caveat shown in the review notes: the list is the platform dossier, not per-institution extras. The page lists no 2026 date in its text: the audit sheet says so.
- **B, DE channel.** `processes` -> `de-uni-assist`, `vpd_only` -> `de-uni-assist-vpd`, own portal -> `de-university-direct`. The channel verifier (`evidence.ts`) has its own wording patterns per channel: a quote must name the channel. The HSHL case (sheet says processes, page describes a VPD-style flow) shows the university page must win over the sheet: the tool records both and flags disagreement.
- **C, DE documents.** Guidance items from the uni-assist Morocco page (Baccalauréat "Relevé de Notes" and the other lines the code finds verbatim) and, where found, the certified-copy and sworn-translation statements. Attached only to uni-assist and VPD programmes (after task B has promoted their channel, or by the same selector on the sheet). Caveat in the notes: the university may require more.
- **D, NL channel.** `nl-studielink` for the 13, from the Study in NL "how to apply" page; the institution page refines later.
- **E, IT.** Channel `it-universitaly` from the Universitaly page; `it-university-direct` where the registry has a university page that says the university's own portal is used (Ca' Foscari, Padova, Udine, Bocconi, Unimi). Documents from the circular section 4 as guidance ("normalmente richiesta"), with the PDF read by `pdf.ts` and quotes matched on its text.

## Testing and verification

- Unit tests (Vitest, no network): registry schema, selectors (public/private, kind, existing-fact skip), quote and item filtering against saved page fixtures (the Campus France page text, a uni-assist detail page, the circular excerpt), the guidance stamp, the sheet mapper (including disagreement and `special` rows), proposal shape against `ProposalSchema`.
- Dry-run on the real pages before any staging; the report is attached to the PR.
- Per batch: `data:evidence verify --enrich` dry-run, then the owner reads the `data:audit` sample, then promote with the recipe in `data/README.md`; `pnpm data:check` (0 errors) and `pnpm data:coverage` before and after.
- Opus review after each task and for the whole branch; project gates (typecheck, lint, test, data:check, build, perf:js, e2e) before the PR.

## Out of scope

Anything that needs a model or search; per-institution research other than the DE channel registry; UI changes unless the spike finds the programme page cannot show a `guidance` documents or channel fact (then a small separate task); editing existing promoted values; Hungary.

## Risks

- **Guidance support in the pipeline is unproven.** Today every verified fact is stamped official. If `data:check`, `promote` or the programme page reject or mislabel `guidance` on `documents`/`applicationChannel`, fix that first (small code change) before the tool.
- **Encoding.** The Campus France page is Windows-1252 and was mis-decoded in a manual read; quotes must match after normalisation. Fixtures are saved as the fetch layer returns them.
- **Page drift.** `last_verified_at` is the date the owner reads the source (existing rule); the tool never stamps a date.
- **Identical facts at scale.** About 700 identical French documents lists: confirm the audit sample rules do not make the sample trivially large or meaningless; the owner reads the national page once plus a random sample of attachments.
- **Selector precision.** Private French schools and non-uni-assist German institutions must not receive the wrong list: selectors are explicit and unit-tested.
- **Past dates.** No deadlines are part of wave 1.
