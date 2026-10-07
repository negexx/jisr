# Audit sample

For each record: open the link, confirm the quote is there and that it supports the value (right programme, right applicant group, right year). Then set `audited = y` and `outcome = ok` (or `wrong` + a note) in `AUDIT.csv`.

## cost-profiles/de-official  _(batch b31-d48078)_

**Official cost profile de-official**

- **housing**: `410.00 to 410.00 EUR per month` (estimate; source daad-de)
  - "Rent (including utility costs): EUR 410" — https://www.daad.de/en/studying-in-germany/living-in-germany/finances/
  - date: "According to the latest social survey from 2023, students have expenses totalling an average of 876 euros per month." — https://www.daad.de/en/studying-in-germany/living-in-germany/finances/
  - formula: DAAD, from the 2023 social survey: average monthly rent (utilities included) of a student in Germany, 410 EUR. An average over all students, not only international ones; a single figure.
- **food**: `198.00 to 198.00 EUR per month` (estimate; source daad-de)
  - "Food: EUR 198 Health insurance" — https://www.daad.de/en/studying-in-germany/living-in-germany/finances/
  - date: "According to the latest social survey from 2023, students have expenses totalling an average of 876 euros per month." — https://www.daad.de/en/studying-in-germany/living-in-germany/finances/
  - formula: DAAD, from the 2023 social survey: average monthly food spending of a student in Germany, 198 EUR. An average over all students; a single figure.
- **transport**: `89.00 to 89.00 EUR per month` (estimate; source daad-de)
  - "Transportation costs (car/public transport): EUR 89" — https://www.daad.de/en/studying-in-germany/living-in-germany/finances/
  - date: "According to the latest social survey from 2023, students have expenses totalling an average of 876 euros per month." — https://www.daad.de/en/studying-in-germany/living-in-germany/finances/
  - formula: DAAD, from the 2023 social survey: average monthly transport spending (car or public transport) of a student in Germany, 89 EUR. An average over all students; a single figure.
- **insurance**: `100.00 to 100.00 EUR per month` (estimate; source daad-de)
  - "Health insurance, doctor's fees, medications: EUR 100" — https://www.daad.de/en/studying-in-germany/living-in-germany/finances/
  - date: "According to the latest social survey from 2023, students have expenses totalling an average of 876 euros per month." — https://www.daad.de/en/studying-in-germany/living-in-germany/finances/
  - formula: DAAD, from the 2023 social survey: average monthly spending of a student in Germany on health insurance, doctor's fees and medications, 100 EUR. An average over all students; a single figure.
- **page**: https://www.daad.de/en/studying-in-germany/living-in-germany/finances/
- **page check**: Confirm: the quote is on the official page and the number matches

> Preparer's caveats: Every proposed line kept. lines.housing: period not stated in quote (per month comes from the proposal) lines.food: period not stated in quote (per month comes from the proposal) lines.transport: period not stated in quote (per month comes from the proposal) lines.insurance: period not stated in quote (per month comes from the proposal)

## cost-profiles/fr-official  _(batch b31-d48078)_

**Official cost profile fr-official**

- **housing**: `350.00 to 350.00 EUR per month` (estimate; source campusfrance-org)
  - "the monthly rent is low (€450 in Paris; €350 on average elsewhere in France)" — https://www.campusfrance.org/en/student-housing-france
  - date: "Updated on 26 June 2026" — https://www.campusfrance.org/en/student-housing-france
  - formula: Campus France (page updated 26 June 2026): average monthly rent of a Crous residence outside Paris, 350 EUR (a single published figure, not a range). A private studio costs at least 400 EUR outside Paris.
- **food**: `300.00 to 300.00 EUR per month` (estimate; source campusfrance-org-2)
  - "the French dedicate about 300€/month to food expenses" — https://www.campusfrance.org/en/preparing-budget-student-France
  - date: "Updated on 07 July 2026" — https://www.campusfrance.org/en/preparing-budget-student-France
  - formula: Campus France (page updated 7 July 2026): the French spend on average about 300 EUR a month on food; it varies by city and habits (a single figure, not a range).
- **transport**: `250.00 to 300.00 EUR per year` (estimate; source campusfrance-org-2)
  - "an annual transit subscription outside of Paris at the student rate: between 250 and 300 Euros" — https://www.campusfrance.org/en/preparing-budget-student-France
  - date: "Updated on 07 July 2026" — https://www.campusfrance.org/en/preparing-budget-student-France
  - formula: Campus France (page updated 7 July 2026): annual public-transport subscription at the student rate outside Paris, between 250 and 300 EUR.
- **application_visa**: `100.00 to 100.00 EUR per once` (official; source service-public-gouv-fr)
  - "Il faut payer 100 €" — https://www.service-public.gouv.fr/particuliers/vosdroits/F2231
  - formula: Service-Public: tax paid when validating the student VLS-TS visa after arriving in France. It comes on top of the visa fee, which is not included here.
- **setup**: `105.00 to 105.00 EUR per year` (official; source cvec-etudiant-gouv-fr)
  - "L'acquittement est actuellement possible pour l'année universitaire 2026-2027. Elle est de 105 € euros." — https://cvec.etudiant.gouv.fr/
  - formula: CVEC (student life and campus contribution), official Crous and ministry site: 105 EUR for the 2026-2027 academic year, paid before enrolment (an annual contribution).
- **page**: https://www.campusfrance.org/en/student-housing-france
- **page check**: Confirm: the quote is on the official page and the number matches

> Preparer's caveats: Every proposed line kept. lines.application_visa: official line, no age check was done (a rate in force is assumed) lines.application_visa: period not stated in quote (per once comes from the proposal) lines.setup: official line, no age check was done (a rate in force is assumed)

## cost-profiles/fr-paris-official  _(batch b31-d48078)_

**Official cost profile fr-paris-official**

- **housing**: `450.00 to 450.00 EUR per month` (estimate; source campusfrance-org)
  - "the monthly rent is low (€450 in Paris; €350 on average elsewhere in France)" — https://www.campusfrance.org/en/student-housing-france
  - date: "Updated on 26 June 2026" — https://www.campusfrance.org/en/student-housing-france
  - formula: Campus France (page updated 26 June 2026): monthly rent of a Crous residence in Paris, 450 EUR (a single published figure, not a range). A private studio costs at least 800 EUR in Paris.
- **transport**: `374.40 to 374.40 EUR per year` (estimate; source campusfrance-org-2)
  - "an annual transit subscription in Paris at the student rate: 374,4 Euros" — https://www.campusfrance.org/en/preparing-budget-student-France
  - date: "Updated on 07 July 2026" — https://www.campusfrance.org/en/preparing-budget-student-France
  - formula: Campus France (page updated 7 July 2026): annual public-transport subscription in Paris at the student rate, 374.40 EUR (a single figure).
- **page**: https://www.campusfrance.org/en/student-housing-france
- **page check**: Confirm: the quote is on the official page and the number matches

> Preparer's caveats: Every proposed line kept.

## cost-profiles/hu-official  _(batch b31-d48078)_

**Official cost profile hu-official**

- **insurance**: `12,300 to 12,300 HUF per month` (estimate; source nav-gov-hu)
  - "Az egészségügyi szolgáltatási járulék összege havi napi 2026. január 1-jétől 12 300 Ft 410 Ft" — https://nav.gov.hu/ado/jarulek/Fizetendo_jarulekok_2026._januar_1-jetol
  - formula: NAV (Hungarian tax authority): statutory monthly health-service contribution (egészségügyi szolgáltatási járulék) in 2026, 12,300 HUF. Whether it applies to a given student depends on their insurance situation.
- **page**: https://nav.gov.hu/ado/jarulek/Fizetendo_jarulekok_2026._januar_1-jetol
- **page check**: Confirm: the quote is on the official page and the number matches

> Preparer's caveats: Every proposed line kept.

## cost-profiles/it-official  _(batch b31-d48078)_

**Official cost profile it-official**

- **application_visa**: `40.00 to 40.00 EUR per once` (official; source questure-poliziadistato-it)
  - "40,00 euro per i permessi di soggiorno di durata superiore a tre mesi e inferiore o pari a un anno" — https://questure.poliziadistato.it/it/Campobasso/articolo/1326593f9bac0db04322800233
  - formula: Questura (State Police, notice of 13/06/2017): contribution for an electronic residence permit of more than three months and up to one year. Other fees (card, revenue stamp) are not on this page and not included; check the amount again on the Questura site. Due for each permit issued (valid up to one year).
- **page**: https://questure.poliziadistato.it/it/Campobasso/articolo/1326593f9bac0db04322800233
- **page check**: Confirm: the quote is on the official page and the number matches

> Preparer's caveats: Every proposed line kept. lines.application_visa: official line, no age check was done (a rate in force is assumed) lines.application_visa: period not stated in quote (per once comes from the proposal; ignored duration phrase: 'di durata superiore a tre mesi e inferiore o pari a un anno')

## cost-profiles/nl-official  _(batch b31-d48078)_

**Official cost profile nl-official**

- **housing**: `561.00 to 561.00 EUR per month` (estimate; source studyinnl-org)
  - "monthly cost overview to take into account when planning to study in the Netherlands: Rent: € 561" — https://www.studyinnl.org/finances/daily-student-expenses-and-cost-of-living-in-the-netherlands
  - date: "(source: Nibud, 2024)" — https://www.studyinnl.org/finances/daily-student-expenses-and-cost-of-living-in-the-netherlands
  - formula: Study in NL (Nuffic), from Nibud 2024: average monthly rent of a student in the Netherlands, 561 EUR. A national average; a single figure.
- **food**: `244.00 to 244.00 EUR per month` (estimate; source studyinnl-org)
  - "Groceries: € 244" — https://www.studyinnl.org/finances/daily-student-expenses-and-cost-of-living-in-the-netherlands
  - date: "(source: Nibud, 2024)" — https://www.studyinnl.org/finances/daily-student-expenses-and-cost-of-living-in-the-netherlands
  - formula: Study in NL (Nuffic), from Nibud 2024: average monthly grocery spending of a student in the Netherlands, 244 EUR. A national average; a single figure.
- **transport**: `67.00 to 67.00 EUR per month` (estimate; source studyinnl-org)
  - "Transportation: € 67" — https://www.studyinnl.org/finances/daily-student-expenses-and-cost-of-living-in-the-netherlands
  - date: "(source: Nibud, 2024)" — https://www.studyinnl.org/finances/daily-student-expenses-and-cost-of-living-in-the-netherlands
  - formula: Study in NL (Nuffic), from Nibud 2024: average monthly transport spending of a student in the Netherlands, 67 EUR. A national average; a single figure.
- **insurance**: `133.00 to 133.00 EUR per month` (estimate; source studyinnl-org)
  - "Basic Dutch health insurance (when working in NL): € 133 (source: Nibud, 2024)" — https://www.studyinnl.org/finances/daily-student-expenses-and-cost-of-living-in-the-netherlands
  - formula: Study in NL (Nuffic), from Nibud 2024: basic Dutch health insurance, 133 EUR a month, listed for a student who works in the Netherlands. A single figure.
- **application_visa**: `254.00 to 254.00 EUR per once` (official; source ind-nl)
  - "Study (all education levels) First application or change in purpose of stay € 254,00" — https://ind.nl/en/fees-costs-of-an-application
  - formula: IND (Dutch immigration service): fee for a first application for a residence permit for study (all education levels).
- **page**: https://www.studyinnl.org/finances/daily-student-expenses-and-cost-of-living-in-the-netherlands
- **page check**: Confirm: the quote is on the official page and the number matches

> Preparer's caveats: Every proposed line kept. lines.food: period not stated in quote (per month comes from the proposal) lines.transport: period not stated in quote (per month comes from the proposal) lines.insurance: period not stated in quote (per month comes from the proposal) lines.application_visa: official line, no age check was done (a rate in force is assumed) lines.application_visa: period not stated in quote (per once comes from the proposal)

