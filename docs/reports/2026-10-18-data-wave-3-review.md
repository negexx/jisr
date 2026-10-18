# Data wave 3 — review sheet (`coverage: complete` pilot)

Owner reads this before merge. Companion report: `docs/reports/2026-10-18-data-wave-3.md`.

- **Wave:** W3, the `requirements.coverage: complete` pilot.
- **Base:** `origin/main` `f0cc00ef`. Branch `data/w3-complete-pilot`.
- **Scope:** FR / DE / NL / HU. 27 sampled programmes (selection rule in the companion report).
- **Record edits committed:** **1** — `de-hochschule-fur-angewandte-wissenschaften-hrk143-international-engineerin-daad9922` (Kempten, International Engineering) → `complete`.
- **Record edits NOT made:** 26 — stay `partial`. Each reason below.
- **Date read:** 2026-10-17 (UTC; the machine clock is ahead of UTC, so `data:check` rejects 2026-10-18 as a future date).

## The one edit (what to check before merge)

### `de-hochschule-fur-angewandte-wissenschaften-hrk143-international-engineerin-daad9922` — International Engineering, Hochschule Kempten

**Decision:** `requirements.coverage: complete`. The programme's own page states exactly two
programme-level admission requirements (English B1 and German A1). The two remaining
international-admission steps are already represented elsewhere in the record and are **not**
duplicated as programme rules:

- the **HZB / university-entrance qualification** (and its uni-assist assessment) → the admission
  route `admission-routes/ma-bac-to-de` (outcome `foundation`, with a `manual_check` condition);
- the **VPD** (Vorprüfungsdokumentation, the uni-assist preliminary review) → the record's
  `applicationChannel: de-uni-assist-vpd`.

No entrance examination, no numerus clausus, no portfolio, no interview.

**Rule set written**

| id | kind | language | minCefr | certificateRequired | acceptedTests | source |
|---|---|---|---|---|---|---|
| req-1 | `language_proficiency` | en | B1 | true | toefl, ielts | `page-4` (requirements page) |
| req-2 | `language_proficiency` | de | A1 | null | — | `programme` (programme page) |

`requirements.source: programme`, `requirements.info_kind: official`.

**Removed** (previous rules, now carried by route/channel, not by the programme):
`req-3` and `req-4`, two `manual_check` notes about the uni-assist VPD and the HZB. Keeping them
would have produced `complete` + `manual_check` (a `data:check` warning) and left the match
permanently ⚠️.

**Verbatim quotes**

Programme page — <https://www.hs-kempten.de/international-engineering>
(`programme`, `last_verified_at: 2026-10-01`):

> Zugangsvoraussetzungen
> Um für das Studium zugelassen zu werden, benötigst du eine Hochschulzugangsberechtigung (HZB) und Sprachkenntnisse in Deutsch und Englisch.
> …
> Sprachkenntnisse
> Bei der Bewerbung musst du folgende Sprachkenntnisse nachweisen:
> Englisch: Niveau B1 des Gemeinsamen Europäischen Referenzrahmens für Sprachen (GER).
> Deutsch: Niveau A1 des GER (am Ende vom 1. Semester nachzuweisen)
> Du hast deine HZB im Ausland erworben? Prüfung und Anerkennung deines Zeugnisses über uni-assist (Vorprüfungsdokumentation - VPD).

Requirements page — <https://www.hs-kempten.de/studium/bewerbung/bachelor/voraussetzungen>
(`page-4`, `last_verified_at: 2026-10-17`):

> Zusätzlich zu diesem Bewerbungsprozess sind noch zwei weitere Anforderungen zu erfüllen:
> Prüfung und Anerkennung deines Zeugnisses über uni-assist
> fristgerechte Vorlage des erforderlichen Sprachnachweises
> …
> International Engineering (Sprachnachweise)
> Cambridge Preliminary Zertifikat B1,
> IELTS Academic (4,0-5,0 Punkte),
> TOEFL iBT (42-71 Punkte) – das Zertifikat ist 2 Jahre gültig,
> …
> Deutsch: Niveau A1 des Gemeinsamen Europäischen Referenzrahmens für Sprachen (GER)

**Checks for the reviewer**

1. Is it right to treat the HZB/VPD as route/channel (so the programme set is only the two
   languages), rather than as programme requirements that force `partial`? (See "Decision settled"
   in the companion report; the stricter alternative would make this record `partial` too and the
   wave would report 0 complete.)
2. The English rule is sourced to `page-4` (which names IELTS/TOEFL); the programme page itself
   states only "Niveau B1". Both are official Kempten pages.
3. German A1 is a study-progress condition ("am Ende vom 1. Semester nachzuweisen"); it is kept as
   a structured rule with `certificateRequired: null` because the page's accepted German
   certificates (DSD 1/2, Goethe, telc) are not A1 and cannot be listed faithfully. `null` avoids
   the "certificate required but no acceptedTests" warning.

## The 26 records left `partial` (and why)

Every reason is "a stated requirement that the current rule vocabulary cannot express as a
structured, evaluable rule" (an entrance exam, an interview, a ranking/NC threshold, a
credential-assessment step, a Dutch-diploma equivalence, or a numeric test score with no CEFR
level). Source URLs are the page read.

| # | country | programme slug | blocker (not expressible) | source read |
|---|---|---|---|---|
| 1 | FR | `fr-esireims-0511933z-licence-sciences-pour-lingenieur-44617` | Parcoursup ranked selection; eligibility limited to French Bac/DAEU; no institution site | Parcoursup fiche |
| 2 | FR | `fr-uha-business-school-0681967u-licence-gestion-16833` | same; record's extra `manual_check` is a tuition note, not a requirement | Parcoursup fiche |
| 3 | FR | `fr-universite-cote-dazur-0062205p-licence-economie-et-gestion-2258` | ranked selection ("Résultats scolaires 45 % / Motivation 45 %"); eligibility "baccalauréat français / DAEU" | <https://dossierappel.parcoursup.fr/…g_ta_cod=2258> |
| 4 | FR | `fr-universite-de-rennes-epe-0353074b-licence-economie-et-gestion-4723` | same; Parcoursup process | Parcoursup fiche |
| 5 | FR | `fr-universite-paris-1-pantheon-sorbonne-0751717j-licence-economie-9216` | same; Parcoursup process | Parcoursup fiche |
| 6 | FR | `fr-universite-savoie-mont-blanc-annecy-le-v-0741586x-licence-economie-et-gestion-23598` | same; no institution site | Parcoursup fiche |
| 7 | DE | `de-friedrich-alexander-universitat-erlangen-hrk70-nurnberg-international-business-s-daad6913` | numerus clausus ("Admission: With NC") — ranked, threshold unpublished | <https://www.international-business-economics.wiso.rw.fau.eu/application/> |
| 8 | DE | `de-hochschule-fur-angewandte-wissenschaften-hrk143-international-engineerin-daad9922` | **COMPLETE** (see above) | — |
| 9 | DE | `de-hochschule-hannover-hrk115-biotechnology-and-enviro-daad7747` | soft German B1 ("requested… will prolong the entry phase") + individual learning path (motivation letter + CV) | <https://f2.hs-hannover.de/…/intotechnology/> |
| 10 | DE | `de-hochschule-karlsruhe-technik-und-wirtsch-hrk138-electrical-engineering-a-daad7695` | English threshold only as "TOEFL… at least ibt 83" (no CEFR); non-EU "ASK certificate" (Studienkolleg) | <https://www.h-ka.de/en/eeib/profile> |
| 11 | DE | `de-hochschule-rhein-waal-university-of-appl-hrk400-engineering-bsc-daad4220` | language requirement vague ("Proof of proficiency may be required for admission") | <https://www.hochschule-rhein-waal.de/en/…/engineering-bsc> |
| 12 | DE | `de-technische-hochschule-deggendorf-hrk284-electrical-engineering-a-daad9837` | "admission test… questions from Mathematics" + "oral online interview" | <https://www.th-deg.de/eti-b-en> |
| 13 | DE | `de-technische-hochschule-nurnberg-georg-sim-hrk200-international-business-a-daad4248` | "subject to Numerus Clausus"; own admission page is tabbed/unreadable | DAAD detail 4248 |
| 14 | DE | `de-technische-universitat-munchen-hrk184-straubing-sustainable-engineering-daad11020` | "Proof of participation in the Aptitude Recommendation procedure" + VPD; no language proof required | <https://www.tum.de/en/studies/…/sustainable-engineering…> |
| 15 | NL | `nl-breda-university-of-applied-sciences-21ui-applied-data-science-art-1001o8756` | requirements page HTTP **403** (not readable); record's `manual_check` (diploma equivalence + portfolio/interview) unverifiable | <https://www.buas.nl/…/toelatingsvoorwaarden> (403) |
| 16 | NL | `nl-fontys-hogeschool-30gb-venlo-industrieel-product-ontw-1001o3309` | "Met een havo-, vwo-, of mbo-diploma (niveau 4) ben je direct toelaatbaar" — Dutch-diploma equivalence | <https://www.fontys.nl/Opleidingen/Industrieel-Product-Ontwerpen-bachelor-voltijd.htm> |
| 17 | NL | `nl-fontys-hogeschool-30gb-venlo-informatica-1001o3903` | Dutch diploma or 21+ colloquium doctum (capacity test + English test) | <https://www.fontys.nl/Studeren/Praktische-informatie/Toelating/21-toelatingsonderzoek.htm> |
| 18 | NL | `nl-hogeschool-van-hall-larenstein-30hd-leeuwarden-voedingsmiddelentechnolo-1001o4416` | Dutch havo/vwo profile with wiskunde + scheikunde; foreign equivalence + toelatingstoetsen | <https://www.hvhl.nl/opleidingen/hbo/voedingsmiddelen-technologie/> |
| 19 | NL | `nl-hogeschool-van-hall-larenstein-30hd-voedingsmiddelentechnolo-1001o4416` | same (sibling campus record) | same |
| 20 | HU | `hu-budapest-university-of-economics-and-bus-budapest-international-business-e-sf20` | "online oral entrance examination is required" (record `req-2`) | <https://uni-bge.hu/en/international-business-economics-bsc> |
| 21 | HU | `hu-corvinus-university-of-budapest-budapest-business-administration-sf80` | mathematics entrance exam alternative + points threshold ("above the points threshold… vary") | <https://www.uni-corvinus.hu/post/landing-page/application/admissions-requirements/?lang=en> |
| 22 | HU | `hu-hungarian-university-of-agriculture-and-budapest-biochemical-engineering-sf999` | "successful completion of an online test" + "at least two of following fields" (not enumerable) | <https://foodscience.uni-mate.hu/en/bsc-in-biochemical-engineering> |
| 23 | HU | `hu-obuda-university-budapest-electrical-engineering-sf560` | oral entrance interview; English rule has no CEFR | <https://uni-obuda.hu/admission/> |
| 24 | HU | `hu-university-of-debrecen-debrecen-business-administration-sf115` | "passing entrance exams in Mathematics" + study-gap rule (≤ 4 years) | <https://www.edu.unideb.hu/p/business-administration-and-management-bsc> |
| 25 | HU | `hu-university-of-miskolc-miskolc-logistics-engineering-sf463` | 15-minute Skype entrance interview; own programme page 404 | Study Finder page |
| 26 | HU | `hu-university-of-pannonia-veszprem-international-business-e-sf584` | admission interview with a score threshold (56/100) | Study Finder page |
| 27 | HU | `hu-university-of-sopron-sopron-international-business-e-sf1042` | entrance interview; only a Stipendium-Hungaricum page found | <https://lkk.uni-sopron.hu/en_GB/admissions-1> |

## What was NOT changed

- No slugs renamed, no facts promoted, no `data:build`.
- No change to any other record. The wave adds one `complete` flag and two language rules; it removes
  two `manual_check` notes on the one edited record only.
- `pnpm data:check`: **0 errors, 32 warnings** (the same 32 unused-source warnings as the base; no
  new warning).
- `pnpm exec vitest run tests/data-schema tests/domain tests/lib`: **2989 passed / 115 files**.
