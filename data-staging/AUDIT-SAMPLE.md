# Audit sample

For each record: open the link, confirm the quote is there and that it supports the value (right programme, right applicant group, right year). Then set `audited = y` and `outcome = ok` (or `wrong` + a note) in `AUDIT.csv`.

## programs/it-perugia-perugia-engineering-management-l8  _(batch b32-114fb6)_

**Engineering management**

- **durationYears**: `3` (official; source programme) (unchanged: already in data/)
- **teachingLanguages**: `["en"]` (official; source programme) (unchanged: already in data/)
- **tuition**: `{"amountMinor":60000,"currency":"EUR","period":"year"}` (official; source page-3)
  - "First enrolment BRACKET Total (€) I installment (€) II installment (€) III installment (€) IV installment (€) 1. VERY HIGH H.D. 1.000,00 + 16,00 Stamp fee 156,00 400,00 230,00 230,00 2. HIGH H.D. 800,00 + 16,00 Stamp fee 156,00 300,00 180,00 180,00 3. MEDIUM H.D. 600,00" — https://www.unipg.it/files/pagine/1996/flattax_amount-of-fees.pdf
  - "CLASSE 3: MEDIUM HUMAN DEVELOPMENT (MEDIUM_HD) BIRMANIA BOLIVIA BOTSWANA CAPO VERDE CONGO BRAZZAVILLE EGITTO EL SALVADOR FILIPPINE GABON GHANA GUATEMALA GUAYANA=GUIANA FRANCESE GUYANA GUYANA BRITANNICA GUAYANA OLANDESE HONDURAS HONDURAS BRITANNICO INDIA INDONESIA IRAQ KENYA KIRGHIZISTAN KIRGHIZISTAN MAROCCO" — https://www.unipg.it/files/pagine/1996/elenco-paesi-fascia-flat_23_24.pdf
- **applicationChannel**: `it-universitaly` (official; source page-1) (unchanged: already in data/)
- **requirement req-1**: `{"kind":"language_proficiency","language":"en","minCefr":"B2","certificateRequired":null,"acceptedTests":[]}`
- **requirement req-2**: `{"kind":"manual_check","note":{"fr":{"text":"Un diplôme d'études secondaires et un relevé de notes sont exigés pour l'admission.","status":"draft"},"en":{"text":"A secondary school diploma and transcripts are required for admission.","status":"draft"}}}`
- **requirement req-3**: `{"kind":"manual_check","note":{"fr":{"text":"Un test d'admission obligatoire (TOLC-I ou équivalent) est requis.","status":"draft"},"en":{"text":"A valid admission test (TOLC-I or equivalent) is required.","status":"draft"}}}`
- **requirement req-4**: `{"kind":"manual_check","note":{"fr":{"text":"Un visa étudiant valide est requis selon le pays d'origine.","status":"draft"},"en":{"text":"A valid student visa is required depending on country of origin.","status":"draft"}}}`
- **requirement req-5**: `{"kind":"manual_check","note":{"fr":{"text":"Pour le cours Engineering management, les étudiants demandant un visa doivent obligatoirement passer le test CEnT-S de CISIA.","status":"draft"},"en":{"text":"For the Engineering management course, students applying for a visa must mandatorily pass the CISIA CEnT-S test.","status":"draft"}}}`

> Preparer's caveats: Perugia 'flat tax' for students whose family lives abroad, by UNDP human-development class. Amounts file (page for 2026/27): bracket 3 MEDIUM H.D. = EUR 600.00 per year (+16 stamp fee, 156 first instalment incl. regional tax: excluded); the currency sign is only in the table header '(EUR)'. Country list: Morocco (MAROCCO) is in CLASSE 3: MEDIUM HUMAN DEVELOPMENT; the list file is dated 2023/24 and is the list the 2026/27 fees page links to. The student can ask for the flat tax (request 3 Aug-20 Oct 2026) or an ISEE parificato evaluation instead.

## programs/it-roma-biomedico-roma-biomedical-engineering-l8  _(batch b32-114fb6)_

**Biomedical Engineering**

- **durationYears**: `3` (official; source programme) (unchanged: already in data/)
- **teachingLanguages**: `["en"]` (official; source programme) (unchanged: already in data/)
- **tuition**: `{"amountMinor":657150,"currency":"EUR","period":"year"}` (official; source page-1)
  - "First year University tuition fees for the academic year 2026/2027 BACHELOR'S DEGREE 1st installation at the enrollment 2nd installment due by 01/25/2027 3rd installment due by 04/12/2027 Total contribution+ regional tax Biomedical Engineering €2.500,00 + €140,00 € 2.000,00 € 2.071,50 €6.571,50 + €140,00" — https://www.unicampus.it/en/degree-course-admissions/taxes-and-contributions/

> Preparer's caveats: Campus Bio-Medico table 'First year University tuition fees 2026/2027', Bachelor's degree, Biomedical Engineering: total contribution EUR 6,571.50 (1st instalment 2,500 + 2nd 2,000 + 3rd 2,071.50), plus EUR 140 regional tax (excluded). One table for all students: no nationality rule or country list exists on the page or in the 2026/27 call; added at the owner's request after the owner checked the call PDF. Cents amount: needs the cents-aware verifier.

## programs/it-torino-torino-business-management-l18  _(batch b32-114fb6)_

**Business & Management**

- **durationYears**: `3` (official; source programme) (unchanged: already in data/)
- **teachingLanguages**: `["en"]` (official; source programme) (unchanged: already in data/)
- **tuition**: `{"amountMinor":90000,"currency":"EUR","period":"year"}` (official; source page-5)
  - "Morocco 8.957,01 € 500,00 € 550,00 €" — https://www.unito.it/sites/default/files/2026-07/reg_tasse_2026_2027_dr_6194_2026.pdf
  - "6.1.2. Corso di laurea in Business & Management e Corso di laurea magistrale in Business Administration Fasce ISEE Importo in euro ≤ 26.000,00 € 400,00 € 26.000,01 - 30.000,00 € 800,00" — https://www.unito.it/sites/default/files/2026-07/reg_tasse_2026_2027_dr_6194_2026.pdf
  - "In caso di pagamento del contributo onnicomprensivo unico (COU) sulla base del PIL pro-capite PPA, il valore del PIL pro-capite PPA sarà utilizzato anche per determinare i Contributi aggiuntivi dei corsi di studio." — https://www.unito.it/didattica/tasse/contribuzione-studenti-internazionali
- **applicationChannel**: `it-universitaly` (official; source page-2) (unchanged: already in data/)
- **requirement req-1**: `{"kind":"manual_check","note":{"fr":{"text":"Le concours d'admission exige de passer le SAT Suite ; une note au SAT est requise pour l'admission (cours à nombre programmé).","status":"draft"},"en":{"text":"Admission requires taking the SAT Suite; a SAT score is required (programme has capped number).","status":"draft"}}}`
- **requirement req-2**: `{"kind":"prior_study_years_min","years":12}`

> Preparer's caveats: Torino, Bachelor in Business & Management, 2026/27, student resident abroad (Morocco). SUM of two quoted amounts, entered by hand: (1) the single comprehensive contribution (COU) by PPP GDP per capita: Morocco 8,957.01 -> EUR 500 (Allegato A of DR 6194/2026); (2) the additional programme contribution of Business & Management (art. 6.1.2), ISEE band up to 26,000 = EUR 400, paid in two equal instalments, because the university page says the PPP value is also used to determine the additional contributions (INFERENCE: Morocco's PPP of 8,957 falls in the lowest band; the regulation text extract does not state the PPP-to-band table). Excludes the 156 first instalment (regional tax + stamp). Owner to confirm.

