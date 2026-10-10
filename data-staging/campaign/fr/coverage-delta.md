# B5 — France integration: coverage delta

Baseline (2026-10-10) → after B5.

| Fact | before | after | Δ |
| --- | ---: | ---: | ---: |
| programmes | 755 | 755 | 0 |
| teaching language | 664 | 687 | +23 |
| tuition | 731 | 734 | +3 |
| documents | 735 | 736 | +1 |
| intakes | 735 | 735 | 0 |
| application channel | 755 | 755 | 0 |
| duration | 755 | 755 | 0 |
| requirement rules | 755 | 755 | 0 |

Promoted 26 enrichment revisions (batch b35-a49ecb, owner-waived/delegated) from the reader run.

NOT promoted:
- The pre-existing fr-calendar (736) and fr-language-fiche (194) proposal sets: both were already integrated
  (FR BUT records already carry the 2026 deadline; language enrichment applied 0 new facts), so re-restaging them
  was a no-op. Ruling: skipped to avoid re-opening 900+ verified records for no gain.
- The FR scholarship `fr-excellence-major`: it is a scholarship, which is 100% audited and NEVER waivable
  (a `waived` outcome counts as still-to-read). It remains STAGED at `data-staging/scholarships/fr-excellence-major.yaml`
  and requires the owner's own read before promotion.
